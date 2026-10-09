import { useEffect, useState } from "react";
import { ExternalLink, RotateCcw, Download, MonitorPlay, ChevronDown } from "lucide-react";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { fileUrl } from "../../lib/ipc";
import { listArtifacts, type Video, type StageRow } from "../../lib/repo";
import type { ResearchOut, ScriptOut, VoiceOut, PackageOut, RenderOut, PublishOut } from "../../pipeline/types";
import { exportPackage } from "../../pipeline/stages";
import { redoVoiceSegment } from "../../pipeline/runner";
import { Card, Chip, AsyncButton, Empty } from "../../ui/kit";
import { fmtDuration, fmtBytes, wordCount, fmtDate } from "../../lib/util";
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
        <Card title="Riesgos y dudas">
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
  if (!data) return null;
  return (
    <Card title={`Narración · ${fmtDuration(data.total)} · ${data.provider}`}>
      <div className="space-y-2">
        {script.segments.map((s) => {
          const seg = data.segments.find((x) => x.segment_id === s.id);
          return (
            <div key={s.id} className="flex items-center gap-3">
              <div className="w-56 text-sm truncate">{s.title}</div>
              {seg ? <audio controls preload="none" className="h-8 flex-1" src={fileUrl(seg.path, seg.hash.slice(0, 8))} /> : <span className="flex-1 text-xs text-muted-foreground">sin audio</span>}
              <span className="text-xs tabular text-muted-foreground w-12 text-right">{seg ? fmtDuration(seg.duration) : ""}</span>
              <button className="btn-ghost btn-sm" title="Rehacer" onClick={() => void redoVoiceSegment(video.id, s.id)}><RotateCcw size={13} /></button>
            </div>
          );
        })}
      </div>
    </Card>
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
        <div className="text-xs mt-3">{data.synthetic_media ? <Chip tone="amber">Se declarará contenido sintético</Chip> : <Chip tone="green">Sin declaración de contenido sintético</Chip>} <span className="text-muted-foreground">{data.synthetic_reason_es}</span></div></Card>
    </div>
  );
}

// ---------- Montaje ----------
export function RenderPanel({ data }: { data: RenderOut }) {
  return (
    <Card title={`Video final · ${fmtDuration(data.duration)} · ${fmtBytes(data.sizeBytes)}`}>
      <video controls className="w-full rounded-lg bg-black aspect-video" src={fileUrl(data.file, data.renderedAt)} poster={data.poster ? fileUrl(data.poster, data.renderedAt) : undefined} />
      <button className="btn-ghost btn-sm mt-2" onClick={() => void openPath(data.file)}>Abrir en el reproductor del sistema</button>
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
        {out.note_es && <div className="text-xs text-amber-700 dark:text-amber-500">{out.note_es}</div>}
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
            <button className="btn-brand" onClick={() => navigate({ page: "ajustes" })}><MonitorPlay size={14} /> Conectar YouTube</button>
            <ExportButton video={video} />
          </div>
        </div>
      ) : video.status === "approved" ? <div className="text-sm text-muted-foreground">En cola para subir.</div>
        : <Empty icon={MonitorPlay} title="Falta la revisión final">Solo se publica con tu aprobación.</Empty>}
    </Card>
  );
}

export function ExportButton({ video, label = "Exportar para subir a mano" }: { video: Video; label?: string }) {
  return (
    <AsyncButton className="btn-secondary" onClick={async () => {
      const dir = await openDialog({ directory: true, title: "Carpeta donde guardar el paquete" });
      if (!dir || Array.isArray(dir)) return;
      try { const out = await exportPackage(video, dir); toast("success", "Paquete exportado", out); await openPath(out); }
      catch (e) { await logError(e, video.id, "Exportación"); }
    }}><Download size={14} /> {label}</AsyncButton>
  );
}
