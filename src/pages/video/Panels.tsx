import { useEffect, useRef, useState } from "react";
import { ExternalLink, Mic, Square, RotateCcw, Image as ImageIcon, Download, MonitorPlay, Check, Play, ChevronDown } from "lucide-react";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { fileUrl, fs } from "../../lib/ipc";
import { listArtifacts, setStage, resetFrom, type Video, type StageRow } from "../../lib/repo";
import type { ResearchOut, ScriptOut, VoiceOut, VisualsOut, PackageOut, RenderOut, PlannedShot, PublishOut } from "../../pipeline/types";
import { ownVoiceDir, redoShot, exportPackage } from "../../pipeline/stages";
import { runVideo, redoVoiceSegment, rerenderFrom } from "../../pipeline/runner";
import { Card, Chip, Modal, Field, AsyncButton, Empty } from "../../ui/kit";
import { joinPath, fmtDuration, fmtBytes, wordCount, fmtDate } from "../../lib/util";
import { toast, logError } from "../../lib/events";
import { navigate } from "../../ui/nav";

// ---------- Investigación ----------
export function ResearchPanel({ data }: { data: ResearchOut }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <Card title="Resumen"><div className="text-sm">{data.summary_es}</div><div className="text-xs text-muted-foreground mt-2"><b>Ángulo:</b> {data.angle_en}</div></Card>
      <Card title={`Fuentes (${data.sources.length})`} pad={false}>
        <table className="w-full text-sm">
          <tbody>
            {data.sources.map((s) => (
              <tr key={s.id} className="border-t border-border/60">
                <td className="px-4 py-2 font-mono text-xs text-primary">{s.id}</td>
                <td className="py-2 pr-2"><button className="text-left hover:underline" onClick={() => void openUrl(s.url)}>{s.title}</button><div className="text-[11px] text-muted-foreground">{s.publisher} · {s.date} — {s.why_es}</div></td>
                <td className="px-2"><Chip tone={s.type === "primary" ? "green" : s.type === "secondary" ? "primary" : "muted"}>{s.type === "primary" ? "primaria" : s.type === "secondary" ? "secundaria" : "terciaria"}</Chip></td>
                <td className="px-4"><Chip tone={s.reliability === "high" ? "green" : s.reliability === "medium" ? "amber" : "red"}>{s.reliability === "high" ? "alta" : s.reliability === "medium" ? "media" : "baja"}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title={`Hechos (${data.facts.length})`} actions={<button className="btn-ghost btn-sm" onClick={() => setOpen(!open)}><ChevronDown size={14} className={open ? "rotate-180" : ""} /> {open ? "Ocultar" : "Ver todos"}</button>}>
        <div className="space-y-2">
          {(open ? data.facts : data.facts.slice(0, 6)).map((f) => (
            <div key={f.id} className="text-sm border-l-2 border-primary/40 pl-3">
              <div><span className="font-mono text-xs text-primary mr-2">{f.id}</span>{f.text_en} {f.about_real_person && <Chip tone="amber">persona real</Chip>}</div>
              <div className="text-xs italic text-muted-foreground mt-0.5">“{f.quote}” — {f.source_ids.join(", ")}</div>
            </div>
          ))}
        </div>
      </Card>
      {(data.risks.length > 0 || data.open_questions_es.length > 0) && (
        <Card title="Riesgos y preguntas abiertas">
          <ul className="text-sm space-y-1 list-disc pl-5">
            {data.risks.map((r, i) => <li key={i}><Chip tone="amber">{r.kind === "legal" ? "legal" : r.kind === "policy" ? "políticas" : "verificación"}</Chip> {r.note_es}</li>)}
            {data.open_questions_es.map((q, i) => <li key={`q${i}`} className="text-muted-foreground">{q}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---------- Guion ----------
export function ScriptPanel({ video, data }: { video: Video; data: ScriptOut }) {
  const [versions, setVersions] = useState<any[]>([]);
  useEffect(() => { void listArtifacts(video.id, "script").then(setVersions); }, [video.id, data]);
  const words = data.segments.reduce((a, s) => a + wordCount(s.text_en), 0);
  return (
    <div className="space-y-4">
      <Card title={`Versión ${data.version ?? 1} · ${words} palabras · ~${Math.round(words / 150)} min`}>
        <div className="space-y-1">{data.title_options.map((t, i) => <div key={i} className="text-sm"><b>{t.title}</b> <span className="text-muted-foreground text-xs">— {t.promise_es}</span></div>)}</div>
        <div className="text-xs text-muted-foreground mt-3"><b>Aporte propio:</b> {data.originality_note_es}</div>
      </Card>
      {data.segments.map((s) => (
        <Card key={s.id} title={s.title}>
          <div className="text-xs text-muted-foreground mb-2">{s.purpose_es}</div>
          <p className="text-[15px] leading-7" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>{s.text_en}</p>
        </Card>
      ))}
      {versions.length > 1 && <Card title="Historial de versiones"><ul className="text-xs space-y-1">{versions.map((v) => <li key={v.id}>v{v.version} · {v.note} · {fmtDate(v.created_at)}</li>)}</ul></Card>}
    </div>
  );
}

// ---------- Voz ----------
export function VoicePanel({ video, row, script }: { video: Video; row: StageRow; script?: ScriptOut }) {
  const data = row.output as VoiceOut | null;
  if (!script) return <Card><div className="text-sm text-muted-foreground">Primero se necesita el guion aprobado.</div></Card>;
  if (video.voice_mode === "own" && (row.status === "review" || row.status === "pending" || row.status === "failed")) return <OwnVoiceRecorder video={video} script={script} />;
  if (!data) return null;
  return (
    <Card title={`Narración · ${fmtDuration(data.total)} · ${data.provider}`}
      actions={video.voice_mode === "own" && <button className="btn-brand btn-sm" onClick={async () => { await resetFrom(video.id, "voice"); await setStage(video.id, "voice", { status: "review", progress: "Regraba los segmentos que quieras y continúa." }); }}><Mic size={13} /> Regrabar</button>}>
      <div className="space-y-2">
        {script.segments.map((s) => {
          const seg = data.segments.find((x) => x.segment_id === s.id);
          return (
            <div key={s.id} className="flex items-center gap-3">
              <div className="w-56 text-sm truncate">{s.title}</div>
              {seg ? <audio controls preload="none" className="h-8 flex-1" src={fileUrl(seg.path, seg.hash.slice(0, 8))} /> : <span className="flex-1 text-xs text-muted-foreground">sin audio</span>}
              <span className="text-xs tabular text-muted-foreground w-12 text-right">{seg ? fmtDuration(seg.duration) : ""}</span>
              {video.voice_mode !== "own" && <button className="btn-ghost btn-sm" title="Rehacer la voz de este segmento" onClick={() => void redoVoiceSegment(video.id, s.id)}><RotateCcw size={13} /></button>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Teleprónter + grabación por segmento (modo de alta calidad con tu voz). */
function OwnVoiceRecorder({ video, script }: { video: Video; script: ScriptOut }) {
  const [idx, setIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [done, setDone] = useState<Record<string, string>>({});
  const [fontPx, setFontPx] = useState(30);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const dir = ownVoiceDir(video);
  const seg = script.segments[idx];

  useEffect(() => { void fs.list(dir).then((l) => setDone(Object.fromEntries(l.map((f) => [f.name.split(".")[0], f.path])))); }, [dir]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "" });
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
        const path = joinPath(dir, `${seg.id}.webm`);
        await fs.writeB64(path, b64);
        setDone((d) => ({ ...d, [seg.id]: path }));
        if (idx < script.segments.length - 1) setIdx(idx + 1);
      };
      mr.start(); rec.current = mr; setRecording(true);
    } catch (e) { void logError(e, video.id, "No se pudo acceder al micrófono"); }
  };
  const stop = () => { rec.current?.stop(); setRecording(false); };
  const all = script.segments.every((s) => done[s.id]);

  return (
    <Card title={`Grabación con tu voz · segmento ${idx + 1}/${script.segments.length}`} icon={Mic}
      actions={<div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Tamaño</span><input type="range" min={20} max={48} value={fontPx} onChange={(e) => setFontPx(+e.target.value)} /></div>}>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {script.segments.map((s, i) => <button key={s.id} onClick={() => !recording && setIdx(i)} className={`chip ${i === idx ? "border-primary text-primary bg-primary/10" : done[s.id] ? "border-green-500/50 text-green-500" : "border-border"}`}>{done[s.id] && <Check size={10} />}{i + 1}</button>)}
      </div>
      <div className="rounded-lg bg-[#111113] text-[#F2EFE9] p-8 max-h-[46vh] overflow-y-auto leading-relaxed" style={{ fontSize: fontPx, fontFamily: '"Source Serif 4", Georgia, serif' }}>
        <div className="text-xs uppercase tracking-[0.3em] text-[#9DB0F1] mb-4" style={{ fontFamily: "Poppins" }}>{seg.title}</div>
        {seg.text_en}
      </div>
      <div className="flex items-center gap-3 mt-4">
        {!recording ? <button className="btn-primary" onClick={() => void start()}><Mic size={15} /> {done[seg.id] ? "Volver a grabar" : "Grabar"}</button>
          : <button className="btn-danger animate-glow" onClick={stop}><Square size={14} /> Terminar segmento</button>}
        {done[seg.id] && !recording && <audio controls className="h-8" src={fileUrl(done[seg.id], Date.now())} />}
        <div className="flex-1" />
        <button className="btn-brand" disabled={!all || recording} onClick={async () => { await setStage(video.id, "voice", { status: "pending", progress: null }); runVideo(video.id); }}>
          <Play size={14} /> Procesar grabaciones y continuar
        </button>
      </div>
      <div className="text-[11px] text-muted-foreground mt-2">Consejo: lee con calma; los silencios del inicio y del final se recortan solos y se reduce el ruido de fondo.</div>
    </Card>
  );
}

// ---------- Imágenes ----------
const KIND: Record<string, string> = { generated: "IA", archival: "Archivo libre", source_card: "Fuente", title_card: "Título", quote_card: "Cita", text_card: "Texto" };

export function VisualsPanel({ video, data }: { video: Video; data: VisualsOut }) {
  const [edit, setEdit] = useState<PlannedShot | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs">
        <Chip>{data.shots.length} tomas</Chip><Chip tone="primary">{data.generated} generadas</Chip><Chip tone="green">{data.archival} de archivo libre</Chip><Chip>{data.cards} tarjetas</Chip>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {data.shots.map((s) => (
          <button key={s.id} onClick={() => setEdit(s)} className="card overflow-hidden text-left hover:border-primary/45 transition-colors group">
            <div className="aspect-video bg-secondary relative">
              {s.image ? <img loading="lazy" src={fileUrl(s.image, s.hash?.slice(0, 8))} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon size={20} /></div>}
              <span className="absolute top-1.5 left-1.5 chip bg-black/60 border-white/20 text-white">{KIND[s.kind]}</span>
              {s.dur && <span className="absolute bottom-1.5 right-1.5 chip bg-black/60 border-white/20 text-white tabular">{s.dur.toFixed(1)} s</span>}
            </div>
            <div className="p-2 text-[11px] text-muted-foreground line-clamp-2">{s.error ? <span className="text-amber-500">{s.error}</span> : s.prompt_en || s.archival_query || s.card_text || s.source_id}</div>
          </button>
        ))}
      </div>
      <ShotEditor video={video} shot={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

export function ShotEditor({ video, shot, onClose }: { video: Video; shot: PlannedShot | null; onClose: () => void }) {
  const [kind, setKind] = useState<PlannedShot["kind"]>("generated");
  const [text, setText] = useState("");
  const [overlay, setOverlay] = useState("");
  useEffect(() => {
    if (!shot) return;
    setKind(shot.kind); setOverlay(shot.overlay_text ?? "");
    setText(shot.kind === "generated" ? shot.prompt_en ?? "" : shot.kind === "archival" ? shot.archival_query ?? "" : shot.kind === "source_card" ? shot.source_id ?? "" : shot.card_text ?? "");
  }, [shot]);
  if (!shot) return null;
  const p = shot.provenance;
  return (
    <Modal open={!!shot} onClose={onClose} title={`Toma ${shot.id}`} echo="toma" wide
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cerrar</button>
        <AsyncButton className="btn-primary" onClick={async () => {
          const patch: Partial<PlannedShot> = { kind, overlay_text: overlay };
          if (kind === "generated") patch.prompt_en = text; else if (kind === "archival") patch.archival_query = text; else if (kind === "source_card") patch.source_id = text; else patch.card_text = text;
          await redoShot(video, shot.id, patch);
          await rerenderFrom(video.id, "visuals");
          toast("info", "Toma en cola", "Solo se regenera esta toma y se vuelve a montar su segmento.");
          onClose();
        }}><RotateCcw size={14} /> Rehacer esta toma</AsyncButton>
      </>}>
      <div className="grid grid-cols-[1.3fr_1fr] gap-5">
        <div>
          {shot.image && <img src={fileUrl(shot.image, shot.hash?.slice(0, 8))} className="rounded-lg border border-border w-full" />}
          {p && <div className="text-[11px] text-muted-foreground mt-2 space-y-0.5">
            <div><b>Procedencia:</b> {p.provider}{p.license ? ` · ${p.license}` : ""}{p.attribution ? ` · ${p.attribution}` : ""}</div>
            {p.sourceUrl && <button className="text-primary hover:underline" onClick={() => void openUrl(p.sourceUrl!)}>{p.sourceUrl}</button>}
          </div>}
        </div>
        <div className="space-y-3">
          <Field label="Tipo">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as any)}>
              {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label={kind === "generated" ? "Descripción de la imagen (inglés)" : kind === "archival" ? "Búsqueda en Wikimedia Commons" : kind === "source_card" ? "ID de la fuente (S1, S2…)" : "Texto de la tarjeta"}>
            <textarea className="input min-h-28 text-xs" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Field label="Rótulo inferior (opcional)"><input className="input" value={overlay} onChange={(e) => setOverlay(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Metadatos ----------
export function PackagePanel({ data }: { data: PackageOut }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title="Títulos"><div className="space-y-1.5">{data.titles.map((t, i) => <div key={i} className="text-sm"><b className={t.title === data.chosen_title ? "text-primary" : ""}>{t.title}</b><div className="text-[11px] text-muted-foreground">{t.note_es}</div></div>)}</div></Card>
      <Card title="Miniaturas"><div className="grid grid-cols-2 gap-2">{data.thumbnails.map((t, i) => t.path && <img key={i} src={fileUrl(t.path, Date.now())} className={`rounded-md border ${i === data.chosen_thumbnail ? "border-primary ring-2 ring-primary/40" : "border-border"}`} />)}</div></Card>
      <Card title="Descripción" className="col-span-2"><pre className="text-xs whitespace-pre-wrap font-sans">{data.description}</pre></Card>
      <Card title="Etiquetas" className="col-span-2"><div className="flex flex-wrap gap-1.5">{data.tags.map((t) => <Chip key={t}>{t}</Chip>)}</div>
        <div className="text-xs mt-3">{data.synthetic_media ? <Chip tone="amber">Se declarará contenido alterado o sintético</Chip> : <Chip tone="green">No requiere declaración de contenido sintético</Chip>} <span className="text-muted-foreground">{data.synthetic_reason_es}</span></div></Card>
    </div>
  );
}

// ---------- Montaje ----------
export function RenderPanel({ data }: { data: RenderOut }) {
  return (
    <Card title={`Video final · ${fmtDuration(data.duration)} · ${fmtBytes(data.sizeBytes)} · codificador ${data.encoder}`}>
      <video controls className="w-full rounded-lg bg-black aspect-video" src={fileUrl(data.file, data.renderedAt)} />
    </Card>
  );
}

// ---------- Publicación ----------
export function PublishPanel({ video, row }: { video: Video; row: StageRow }) {
  const out = row.output as PublishOut | null;
  if (out) return (
    <Card title="Publicado en YouTube" icon={MonitorPlay}>
      <div className="space-y-2 text-sm">
        <div><button className="text-primary hover:underline inline-flex items-center gap-1" onClick={() => void openUrl(out.url)}>{out.url} <ExternalLink size={12} /></button></div>
        <div className="flex gap-2"><Chip tone="green">{out.publish_at ? `Programado: ${new Date(out.publish_at).toLocaleString("es-PE")}` : `Estado: ${out.privacy}`}</Chip>{!out.thumbnail_ok && <Chip tone="amber">Miniatura pendiente (súbela en Studio)</Chip>}</div>
        {out.note_es && <div className="text-xs text-amber-500">{out.note_es}</div>}
        <button className="btn-ghost btn-sm" onClick={() => void openUrl(`https://studio.youtube.com/video/${out.youtube_id}/edit`)}>Abrir en YouTube Studio</button>
      </div>
    </Card>
  );
  return (
    <Card title="Publicación">
      {row.status === "review" ? (
        <div className="space-y-3 text-sm">
          <div>{row.progress}</div>
          <div className="flex gap-2">
            <button className="btn-brand" onClick={() => navigate({ page: "ajustes", tab: "youtube" })}><MonitorPlay size={14} /> Conectar YouTube</button>
            <ExportButton video={video} />
          </div>
        </div>
      ) : video.status === "approved" ? <div className="text-sm text-muted-foreground">En cola para subir.</div>
        : <Empty icon={MonitorPlay} title="Pendiente de la revisión final">Solo se publica tras tu aprobación explícita.</Empty>}
    </Card>
  );
}

export function ExportButton({ video, label = "Exportar paquete para subir a mano" }: { video: Video; label?: string }) {
  return (
    <AsyncButton className="btn-secondary" onClick={async () => {
      const dir = await openDialog({ directory: true, title: "Carpeta donde guardar el paquete" });
      if (!dir || Array.isArray(dir)) return;
      try { const out = await exportPackage(video, dir); toast("success", "Paquete exportado", out); await openPath(out); }
      catch (e) { await logError(e, video.id, "Exportación"); }
    }}><Download size={14} /> {label}</AsyncButton>
  );
}
