// Revisión final: el video completo con su miniatura y metadatos. Se puede
// aprobar, rechazar o pedir cambios puntuales sin rehacer todo.
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, RotateCcw, CalendarClock, Image as ImageIcon, Mic, Wand2, Sparkles } from "lucide-react";
import { db, fileUrl } from "../../lib/ipc";
import { openPath } from "@tauri-apps/plugin-opener";
import { emit } from "../../lib/bus";
import { addReview, type Video, type StageRow } from "../../lib/repo";
import { getSettings } from "../../lib/settings";
import { skillParams, THUMBNAIL_DEFAULTS, VISUAL_DEFAULTS } from "../../lib/skills";
import type { PackageOut, RenderOut, ScriptOut, VoiceOut, PolishOut, MotionOut, Shot } from "../../pipeline/types";
import { approveFinal, rejectVideo, redoVoiceSegment } from "../../pipeline/runner";
import { renderThumbnail } from "../../pipeline/cards";
import { Card, Chip, Field, Toggle, ReviewTimer, AsyncButton, Modal, Tabs } from "../../ui/kit";
import { ExportButton } from "./Panels";
import { ShotThumb, ShotEditorV2, MusicBeds, MotionPanel } from "./EditPanels";
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
  const render = get<RenderOut>("render"); const script = get<ScriptOut>("script"); const voice = get<VoiceOut>("voice");
  const polish = get<PolishOut>("polish"); const motion = get<MotionOut>("motion");
  const shots: Shot[] = polish?.shots ?? [];
  const [pkg, setPkg] = useState<PackageOut>(get<PackageOut>("package"));
  const [tab, setTab] = useState<"video" | "shots" | "motion" | "voice">("video");
  const [slot, setSlot] = useState<{ date: string; time: string } | null>(null);
  const [now, setNow] = useState(false);
  const [edit, setEdit] = useState<Shot | null>(null);
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState("");
  const [thumbText, setThumbText] = useState(pkg.thumbnails[pkg.chosen_thumbnail]?.text ?? "");
  const [bust, setBust] = useState(Date.now());
  const secs = useRef(0);
  const editable = stages.find((s) => s.stage === "final")?.status === "review";
  const p = getSettings().publishing;

  useEffect(() => { void nextSlot().then(setSlot); }, []);
  useEffect(() => { setThumbText(pkg.thumbnails[pkg.chosen_thumbnail]?.text ?? ""); }, [pkg.chosen_thumbnail]);

  const save = async (next: PackageOut) => {
    setPkg(next);
    await db.execute("UPDATE stages SET output=? WHERE video_id=? AND stage='package'", [JSON.stringify(next), video.id]);
    emit("stages");
  };
  const scheduledUtc = useMemo(() => slot ? zonedTimeToUtc(slot.date, slot.time, p.timeZone) : null, [slot, p.timeZone]);

  if (!render || !pkg) return null;
  const motionShots = new Set((motion?.items ?? []).filter((m) => m.file).flatMap((m) => m.shot_ids));

  return (
    <div className="grid grid-cols-[1fr_420px] gap-4 items-start">
      <div className="space-y-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: "video", label: "Video" }, { id: "shots", label: `Tomas (${shots.length})`, icon: ImageIcon }, { id: "motion", label: `Animaciones (${motion?.items.length ?? 0})`, icon: Sparkles }, { id: "voice", label: "Voz", icon: Mic }]} />
        {polish?.verify_es?.length ? (
          <div className="card border-amber-500/50 bg-amber-500/5 p-3 text-sm">
            <div className="font-semibold text-amber-700 dark:text-amber-500 mb-1">Comprueba antes de publicar</div>
            <ul className="list-disc pl-5 space-y-0.5 text-xs">{polish.verify_es.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        ) : null}
        {tab === "video" && (
          <Card>
            <video controls className="w-full rounded-lg bg-black aspect-video" src={fileUrl(render.file, render.renderedAt)} poster={render.poster ? fileUrl(render.poster, render.renderedAt) : undefined} />
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>{fmtDuration(render.duration)} · capítulos: {pkg.chapters.length} · <button className="text-primary hover:underline" onClick={() => void openPath(render.file)}>Abrir en el reproductor del sistema</button></span>
              {editable && <ReviewTimer onTick={(s) => (secs.current = s)} />}
            </div>
          </Card>
        )}
        {tab === "shots" && (
          <div className="space-y-3">
            {!polish && <Card><div className="text-sm text-muted-foreground">Video de la v1: rehazlo desde Storyboard para editarlo aquí.</div></Card>}
            {script.segments.map((sg) => (
              <Card key={sg.id} title={sg.title}>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                  {shots.filter((s) => s.segment_id === sg.id).map((s) => <ShotThumb key={s.id} s={s} motion={motionShots.has(s.id)} onClick={editable ? () => setEdit(s) : undefined} />)}
                </div>
              </Card>
            ))}
          </div>
        )}
        {tab === "motion" && motion && <MotionPanel video={video} data={motion} />}
        {tab === "voice" && (
          <Card title="Narración por segmento">
            <div className="space-y-2">
              {script.segments.map((sg) => {
                const seg = voice.segments.find((x) => x.segment_id === sg.id);
                return (
                  <div key={sg.id} className="flex items-center gap-3">
                    <div className="w-52 text-sm truncate">{sg.title}</div>
                    {seg && <audio controls preload="none" className="h-8 flex-1" src={fileUrl(seg.path, seg.hash.slice(0, 8))} />}
                    {video.voice_mode !== "own" && <button className="btn-ghost btn-sm" onClick={() => { if (confirm("¿Rehacer esta voz?")) void redoVoiceSegment(video.id, sg.id); }}><RotateCcw size={13} /> Rehacer</button>}
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
            <Toggle checked={pkg.synthetic_media} onChange={(v) => editable && void save({ ...pkg, synthetic_media: v })} label="Contenido sintético" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">{pkg.synthetic_reason_es}</div>
        </Card>
        {polish && <MusicBeds video={video} beds={polish.music} editable={editable} />}
        {editable && (
          <Card title="Publicación" icon={CalendarClock}>
            <div className="space-y-2">
              <Toggle checked={now} onChange={setNow} label="Publicar al subir" />
              {!now && slot && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Fecha (Nueva York)"><input type="date" className="input" value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} /></Field>
                  <Field label="Hora (Nueva York)"><input type="time" className="input" value={slot.time} onChange={(e) => setSlot({ ...slot, time: e.target.value })} /></Field>
                </div>
              )}
              {!now && scheduledUtc && <div className="text-[11px] text-muted-foreground">En tu hora: {scheduledUtc.toLocaleString("es-PE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</div>}
              <AsyncButton className="btn-primary w-full" onClick={async () => {
                const when = now ? null : scheduledUtc?.getTime() ?? null;
                if (when && when < Date.now() + 20 * 60_000) { toast("warn", "Elige una hora con 20 min de margen."); return; }
                await addReview(video.id, "final", "approved", "", secs.current);
                await approveFinal(video.id, when);
                toast("success", "Aprobado");
              }}><CheckCircle2 size={15} /> Aprobar y {now ? "publicar" : "programar"}</AsyncButton>
              <div className="flex gap-2">
                <ExportButton video={video} label="Exportar" />
                <button className="btn-ghost flex-1 text-red-600 dark:text-red-500" onClick={() => setReject(true)}><XCircle size={14} /> Rechazar</button>
              </div>
              <div className="flex gap-1.5 flex-wrap pt-1">{pkg.synthetic_media ? <Chip tone="amber">Con declaración de IA</Chip> : <Chip>Sin declaración de IA</Chip>}<Chip>Categoría {p.categoryId}</Chip></div>
            </div>
          </Card>
        )}
      </div>
      <ShotEditorV2 video={video} shot={edit} onClose={() => setEdit(null)} />
      <Modal open={reject} onClose={() => setReject(false)} title="Rechazar video" echo="rechazar"
        footer={<><button className="btn-ghost" onClick={() => setReject(false)}>Cancelar</button>
          <button className="btn-danger" onClick={async () => { await addReview(video.id, "final", "rejected", reason, secs.current); await rejectVideo(video.id, reason); setReject(false); }}>Rechazar</button></>}>
        <Field label="Motivo"><textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
