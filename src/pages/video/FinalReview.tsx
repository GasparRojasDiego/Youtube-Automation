// Revisión final: el video completo con su miniatura y metadatos. Se puede
// aprobar, rechazar o pedir cambios puntuales sin rehacer todo.
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, RotateCcw, Music2, CalendarClock, Image as ImageIcon, Mic, Wand2 } from "lucide-react";
import { db, fileUrl } from "../../lib/ipc";
import { emit } from "../../lib/bus";
import { addReview, listMusic, updateVideo, type Video, type StageRow, type Track } from "../../lib/repo";
import { getSettings } from "../../lib/settings";
import { skillParams, THUMBNAIL_DEFAULTS, VISUAL_DEFAULTS } from "../../lib/skills";
import type { PackageOut, RenderOut, VisualsOut, ScriptOut, VoiceOut, PlannedShot } from "../../pipeline/types";
import { approveFinal, rejectVideo, rerenderFrom, redoVoiceSegment } from "../../pipeline/runner";
import { renderThumbnail } from "../../pipeline/cards";
import { Card, Chip, Field, Toggle, ReviewTimer, AsyncButton, Modal, Tabs } from "../../ui/kit";
import { ShotEditor, ExportButton } from "./Panels";
import { fmtDuration, zonedTimeToUtc, ymdInZone, joinPath } from "../../lib/util";
import { toast } from "../../lib/events";

async function nextSlot(): Promise<{ date: string; time: string }> {
  const p = getSettings().publishing;
  const rows = await db.query<{ t: number }>("SELECT MAX(scheduled_at) t FROM videos WHERE scheduled_at IS NOT NULL AND status IN ('approved','scheduled')");
  let base = new Date(Math.max(Date.now() + 2 * 3600_000, (rows[0]?.t ?? 0) + 20 * 3600_000));
  let date = ymdInZone(base, p.timeZone);
  if (zonedTimeToUtc(date, p.time, p.timeZone).getTime() < base.getTime()) { base = new Date(base.getTime() + 86400_000); date = ymdInZone(base, p.timeZone); }
  return { date, time: p.time };
}

export function FinalReview({ video, stages }: { video: Video; stages: StageRow[] }) {
  const get = <T,>(s: string) => stages.find((x) => x.stage === s)?.output as T;
  const render = get<RenderOut>("render"); const visuals = get<VisualsOut>("visuals"); const script = get<ScriptOut>("script"); const voice = get<VoiceOut>("voice");
  const [pkg, setPkg] = useState<PackageOut>(get<PackageOut>("package"));
  const [tab, setTab] = useState<"video" | "shots" | "voice">("video");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [slot, setSlot] = useState<{ date: string; time: string } | null>(null);
  const [now, setNow] = useState(false);
  const [edit, setEdit] = useState<PlannedShot | null>(null);
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState("");
  const [thumbText, setThumbText] = useState(pkg.thumbnails[pkg.chosen_thumbnail]?.text ?? "");
  const [bust, setBust] = useState(Date.now());
  const secs = useRef(0);
  const editable = stages.find((s) => s.stage === "final")?.status === "review";
  const p = getSettings().publishing;

  useEffect(() => { void listMusic().then(setTracks); void nextSlot().then(setSlot); }, []);
  useEffect(() => { setThumbText(pkg.thumbnails[pkg.chosen_thumbnail]?.text ?? ""); }, [pkg.chosen_thumbnail]);

  const save = async (next: PackageOut) => {
    setPkg(next);
    await db.execute("UPDATE stages SET output=? WHERE video_id=? AND stage='package'", [JSON.stringify(next), video.id]);
    emit("stages");
  };
  const scheduledUtc = useMemo(() => slot ? zonedTimeToUtc(slot.date, slot.time, p.timeZone) : null, [slot, p.timeZone]);

  if (!render || !pkg) return null;
  const music = tracks.find((t) => t.id === video.data.music_id);

  return (
    <div className="grid grid-cols-[1fr_420px] gap-4 items-start">
      <div className="space-y-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: "video", label: "Video" }, { id: "shots", label: `Tomas (${visuals.shots.length})`, icon: ImageIcon }, { id: "voice", label: "Voz", icon: Mic }]} />
        {tab === "video" && (
          <Card>
            <video controls className="w-full rounded-lg bg-black aspect-video" src={fileUrl(render.file, render.renderedAt)} />
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>{fmtDuration(render.duration)} · capítulos: {pkg.chapters.length}</span>
              {editable && <ReviewTimer onTick={(s) => (secs.current = s)} />}
            </div>
          </Card>
        )}
        {tab === "shots" && (
          <div className="space-y-3">
            {script.segments.map((sg) => (
              <Card key={sg.id} title={sg.title}>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {visuals.shots.filter((s) => s.segment_id === sg.id).map((s) => (
                    <button key={s.id} onClick={() => setEdit(s)} className="shrink-0 w-40 rounded-md overflow-hidden border border-border hover:border-primary/60 relative" title="Cambiar esta toma">
                      {s.image && <img loading="lazy" src={fileUrl(s.image, s.hash?.slice(0, 8))} className="aspect-video object-cover w-full" />}
                      <span className="absolute bottom-1 right-1 chip bg-black/60 border-white/20 text-white">{s.dur?.toFixed(1)} s</span>
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
        {tab === "voice" && (
          <Card title="Narración por segmento">
            <div className="space-y-2">
              {script.segments.map((sg) => {
                const seg = voice.segments.find((x) => x.segment_id === sg.id);
                return (
                  <div key={sg.id} className="flex items-center gap-3">
                    <div className="w-52 text-sm truncate">{sg.title}</div>
                    {seg && <audio controls preload="none" className="h-8 flex-1" src={fileUrl(seg.path, seg.hash.slice(0, 8))} />}
                    {video.voice_mode !== "own" && <button className="btn-ghost btn-sm" onClick={() => { if (confirm("¿Rehacer la voz de este segmento y volver a montar?")) void redoVoiceSegment(video.id, sg.id); }}><RotateCcw size={13} /> Rehacer</button>}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-3 sticky top-2">
        <Card title="Título">
          <div className="space-y-1.5">
            {pkg.titles.map((t) => (
              <label key={t.title} className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" className="mt-1 accent-[hsl(var(--primary))]" checked={pkg.chosen_title === t.title} disabled={!editable} onChange={() => void save({ ...pkg, chosen_title: t.title })} />
                <span><b>{t.title}</b><span className="block text-[11px] text-muted-foreground">{t.note_es}</span></span>
              </label>
            ))}
            <input className="input text-sm mt-1" value={pkg.chosen_title} disabled={!editable} maxLength={100} onChange={(e) => setPkg({ ...pkg, chosen_title: e.target.value })} onBlur={() => void save(pkg)} />
            <div className="text-[10px] text-muted-foreground text-right tabular">{pkg.chosen_title.length}/100</div>
          </div>
        </Card>
        <Card title="Miniatura">
          <div className="grid grid-cols-3 gap-2">
            {pkg.thumbnails.map((t, i) => t.path && (
              <button key={i} disabled={!editable} onClick={() => void save({ ...pkg, chosen_thumbnail: i })} className={`rounded-md overflow-hidden border-2 ${i === pkg.chosen_thumbnail ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}>
                <img src={fileUrl(t.path, bust)} className="aspect-video object-cover" />
              </button>
            ))}
          </div>
          {editable && (
            <div className="flex gap-2 mt-2">
              <input className="input text-xs" value={thumbText} onChange={(e) => setThumbText(e.target.value)} placeholder="Texto de la miniatura" />
              <AsyncButton className="btn-brand btn-sm" onClick={async () => {
                const t = pkg.thumbnails[pkg.chosen_thumbnail]; if (!t) return;
                const [tp, vp] = await Promise.all([skillParams(video.channel_id, "miniatura", THUMBNAIL_DEFAULTS), skillParams(video.channel_id, "visual", VISUAL_DEFAULTS)]);
                const path = await renderThumbnail({ background: t.image, text: thumbText, highlight: t.highlight, layout: t.layout }, tp, vp, t.path ?? joinPath(video.dir, "thumbs", `thumb${pkg.chosen_thumbnail}.jpg`));
                await save({ ...pkg, thumbnails: pkg.thumbnails.map((x, i) => (i === pkg.chosen_thumbnail ? { ...x, text: thumbText, path } : x)) });
                setBust(Date.now());
              }}><Wand2 size={13} /> Recomponer</AsyncButton>
            </div>
          )}
        </Card>
        <Card title="Descripción y etiquetas">
          <textarea className="input text-xs min-h-40 font-sans" value={pkg.description} disabled={!editable} onChange={(e) => setPkg({ ...pkg, description: e.target.value })} onBlur={() => void save(pkg)} />
          <input className="input text-xs mt-2" value={pkg.tags.join(", ")} disabled={!editable} onChange={(e) => setPkg({ ...pkg, tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} onBlur={() => void save(pkg)} />
          <div className="mt-3 flex items-center justify-between">
            <Toggle checked={pkg.synthetic_media} onChange={(v) => editable && void save({ ...pkg, synthetic_media: v })} label="Declarar contenido alterado o sintético" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">{pkg.synthetic_reason_es}</div>
        </Card>
        <Card title="Música" icon={Music2}>
          <div className="flex gap-2">
            <select className="input text-sm" disabled={!editable} value={video.data.music_id ?? ""} onChange={(e) => void updateVideo(video.id, { data: { music_id: e.target.value || "none" } })}>
              <option value="none">Sin música</option>
              {tracks.filter((t) => t.enabled).map((t) => <option key={t.id} value={t.id}>{t.title} — {t.artist}</option>)}
            </select>
            <AsyncButton className="btn-brand btn-sm" disabled={!editable} onClick={async () => { await rerenderFrom(video.id, "package"); toast("info", "Volviendo a montar", "Solo se rehace la mezcla; los segmentos ya montados se reutilizan."); }}><RotateCcw size={13} /> Aplicar</AsyncButton>
          </div>
          {music && <div className="text-[11px] text-muted-foreground mt-1">{music.license} · {music.attribution}</div>}
        </Card>
        {editable && (
          <Card title="Publicación" icon={CalendarClock}>
            <div className="space-y-2">
              <Toggle checked={now} onChange={setNow} label="Publicar en cuanto termine la subida" />
              {!now && slot && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Fecha (Nueva York)"><input type="date" className="input" value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} /></Field>
                  <Field label="Hora (Nueva York)"><input type="time" className="input" value={slot.time} onChange={(e) => setSlot({ ...slot, time: e.target.value })} /></Field>
                </div>
              )}
              {!now && scheduledUtc && <div className="text-[11px] text-muted-foreground">En tu hora: {scheduledUtc.toLocaleString("es-PE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</div>}
              <AsyncButton className="btn-primary w-full" onClick={async () => {
                const when = now ? null : scheduledUtc?.getTime() ?? null;
                if (when && when < Date.now() + 20 * 60_000) { toast("warn", "Elige una hora al menos 20 minutos en el futuro."); return; }
                await addReview(video.id, "final", "approved", "", secs.current);
                await approveFinal(video.id, when);
                toast("success", "Aprobado", when ? "Se subirá y quedará programado." : "Se subirá y publicará.");
              }}><CheckCircle2 size={15} /> Aprobar y {now ? "publicar" : "programar"}</AsyncButton>
              <div className="flex gap-2">
                <ExportButton video={video} label="Exportar" />
                <button className="btn-ghost flex-1 text-red-500" onClick={() => setReject(true)}><XCircle size={14} /> Rechazar</button>
              </div>
              <div className="flex gap-1.5 flex-wrap pt-1">{pkg.synthetic_media ? <Chip tone="amber">Con declaración de IA</Chip> : <Chip>Sin declaración de IA</Chip>}<Chip>Categoría {p.categoryId}</Chip></div>
            </div>
          </Card>
        )}
      </div>
      <ShotEditor video={video} shot={edit} onClose={() => setEdit(null)} />
      <Modal open={reject} onClose={() => setReject(false)} title="Rechazar video" echo="rechazar"
        footer={<><button className="btn-ghost" onClick={() => setReject(false)}>Cancelar</button>
          <button className="btn-danger" onClick={async () => { await addReview(video.id, "final", "rejected", reason, secs.current); await rejectVideo(video.id, reason); setReject(false); }}>Rechazar</button></>}>
        <Field label="Motivo (sirve para mejorar las habilidades)"><textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
