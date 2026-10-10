// Resultados concisos de cada paso (lo esencial; el detalle completo sigue en
// la revisión final) y el panel de mejora continua de los videos personales.
import { useState } from "react";
import { CheckCircle2, FolderOpen, Send, Repeat, Image as ImageIcon, Film, Sparkles, Type, Music2, AudioLines, Bot, UserRound } from "lucide-react";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { fileUrl } from "../../lib/ipc";
import { addReview, type Video, type StageRow } from "../../lib/repo";
import type { ResearchOut, ScriptOut, VerifyOut, PolishOut, MotionOut, RenderOut, PackageOut } from "../../pipeline/types";
import { approveFinal, runVideo } from "../../pipeline/runner";
import { requestImprovement, revisionsOf } from "../../pipeline/improve";
import { personalOf } from "../../pipeline/personal";
import { Card, Chip, AsyncButton, Spinner } from "../../ui/kit";
import { fmtDuration, fmtBytes, wordCount } from "../../lib/util";
import { toast } from "../../lib/events";

export function ResearchSummary({ data }: { data: ResearchOut }) {
  return (
    <div className="space-y-4">
      <Card title="Resumen"><p className="text-sm leading-relaxed">{data.summary_es}</p></Card>
      {data.sources.length > 0 && (
        <Card title={`Fuentes (${data.sources.length})`}>
          <ol className="space-y-1.5 text-sm list-decimal pl-5">
            {data.sources.map((s) => <li key={s.id}><button className="text-left hover:underline" onClick={() => void openUrl(s.url)}>{s.title}</button> <span className="text-xs text-muted-foreground">· {s.publisher}{s.date ? ` · ${s.date}` : ""}</span></li>)}
          </ol>
        </Card>
      )}
    </div>
  );
}

export function ScriptFinal({ data, verify }: { data: ScriptOut; verify?: VerifyOut | null }) {
  const words = data.segments.reduce((a, s) => a + wordCount(s.text_en), 0);
  return (
    <Card title={`Guion final · ${words} palabras · ~${Math.max(1, Math.round(words / 150))} min`}>
      {verify?.overall_es && <div className="text-xs text-muted-foreground mb-3">{verify.overall_es}</div>}
      <div className="space-y-4">
        {data.segments.map((s) => (
          <section key={s.id}>
            <h4 className="text-[13px] font-semibold mb-1">{s.title}</h4>
            <p className="text-[14.5px] leading-7 select-text">{s.text_en}</p>
          </section>
        ))}
      </div>
    </Card>
  );
}

function Stat({ icon: I, label, value, note }: { icon: typeof ImageIcon; label: string; value: number | string; note?: string }) {
  return (
    <div className="rounded-md border border-border/80 bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><I size={13} /> {label}</div>
      <div className="text-2xl font-bold tabular mt-1">{value}</div>
      {note && <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{note}</div>}
    </div>
  );
}

/** Medios: cuántos recursos de cada tipo usa el video (sin listar cada uno). */
export function MediaSummary({ polish, motion }: { polish: PolishOut; motion?: MotionOut | null }) {
  const anim = new Set((motion?.items ?? []).filter((m) => m.kind === "fullscreen").flatMap((m) => m.shot_ids));
  const shots = polish.shots.filter((s) => !anim.has(s.id));
  const n = (f: (s: (typeof shots)[number]) => boolean) => shots.filter(f).length;
  const kind = (k: string) => (s: (typeof shots)[number]) => s.provenance?.kind === k;
  const sfx = [...polish.sfx, ...(motion?.items ?? []).flatMap((m) => m.sfx ?? [])];
  const music = [...new Set(polish.music.map((b) => b.title).filter(Boolean))];
  return (
    <Card title={`Medios · ${polish.shots.length} tomas`}>
      <div className="grid grid-cols-4 gap-3">
        <Stat icon={ImageIcon} label="Imágenes" value={n((s) => s.media === "image" && (s.provenance?.kind === "stock" || s.provenance?.kind === "archival"))} />
        <Stat icon={Film} label="Clips" value={n((s) => s.media === "video" && s.provenance?.kind !== "user")} />
        <Stat icon={Bot} label="Con IA" value={n(kind("generated"))} />
        <Stat icon={UserRound} label="Tus archivos" value={n(kind("user"))} />
        <Stat icon={Sparkles} label="Animaciones" value={(motion?.items ?? polish.motion).length} />
        <Stat icon={Type} label="Tarjetas" value={n(kind("card"))} />
        <Stat icon={AudioLines} label="Efectos" value={sfx.length} />
        <Stat icon={Music2} label="Música" value={music.length} note={music.join(" · ")} />
      </div>
    </Card>
  );
}

/** Motion: una línea por animación. */
export function MotionSummary({ data }: { data: MotionOut }) {
  return (
    <Card title={`Animaciones · ${data.items.filter((m) => m.file).length}/${data.items.length} listas`}>
      <div className="divide-y divide-border/60">
        {data.items.map((m) => (
          <div key={m.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="w-24 aspect-video rounded overflow-hidden bg-black shrink-0">{m.poster && <img src={fileUrl(m.poster)} className="w-full h-full object-cover" />}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">{m.id.toUpperCase()} <span className="text-xs text-muted-foreground font-normal">{m.kind === "overlay" ? "Capa" : "Pantalla completa"} · {fmtDuration(m.code?.duration ?? m.duration)}{(m.attempts ?? 1) > 1 ? ` · ${(m.attempts ?? 1) - 1} corrección(es)` : ""}</span></div>
              <div className="text-xs text-muted-foreground truncate">{m.text || m.brief_en}</div>
              {!m.file && m.error && <div className="text-xs text-red-600 dark:text-red-500 mt-0.5 line-clamp-2 select-text" title={m.error}>{m.error}</div>}
            </div>
            {m.file ? <Chip tone="green">Lista</Chip> : m.error ? <Chip tone="red">Falló</Chip> : <Chip>Pendiente</Chip>}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function RenderSummary({ data }: { data: RenderOut }) {
  return (
    <Card title={`Video final · ${fmtDuration(data.duration)} · ${fmtBytes(data.sizeBytes)}`} actions={<span className="text-[11px] text-muted-foreground">{data.encoder}</span>}>
      <video controls className="w-full rounded-md bg-black aspect-video" src={fileUrl(data.file, data.renderedAt)} poster={data.poster ? fileUrl(data.poster, data.renderedAt) : undefined} />
      <div className="flex gap-2 mt-2">
        <button className="btn-ghost btn-sm" onClick={() => void openPath(data.file)}>Abrir en el reproductor</button>
        <button className="btn-ghost btn-sm" onClick={() => void openPath(data.file.replace(/[\\/][^\\/]+$/, ""))}><FolderOpen size={13} /> Carpeta</button>
      </div>
    </Card>
  );
}

export function PackageSummary({ data }: { data: PackageOut }) {
  const thumb = data.thumbnails[data.chosen_thumbnail]?.path;
  return (
    <Card title="Título y miniatura">
      <div className="flex gap-4">
        {thumb && <img src={fileUrl(thumb)} className="w-48 aspect-video object-cover rounded-md border border-border" />}
        <div className="min-w-0">
          <div className="font-semibold">{data.chosen_title}</div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{data.description_body_en}</p>
          <div className="text-[11px] text-muted-foreground mt-2">{data.tags.length} etiquetas · {data.chapters.length} capítulos</div>
        </div>
      </div>
    </Card>
  );
}

/** Revisión final de un video personal: verlo, aprobarlo o pedir mejoras (no se publica en YouTube). */
export function PersonalFinal({ video, stages }: { video: Video; stages: StageRow[] }) {
  const render = stages.find((s) => s.stage === "render")?.output as RenderOut | undefined;
  const final = stages.find((s) => s.stage === "final");
  const p = personalOf(video)!;
  if (!render) return null;
  return (
    <div className="space-y-4">
      <RenderSummary data={render} />
      {final?.status === "review" && (
        <Card>
          <div className="flex items-center gap-3">
            <div className="text-sm flex-1">{p.iterate ? "Revisa esta versión: pide cambios abajo o apruébala." : "Revisa el video. Ya está guardado en Descargas."}</div>
            <AsyncButton className="btn-primary" onClick={async () => { await addReview(video.id, "final", "approved", "", 0); await approveFinal(video.id, null); toast("success", "Video aprobado"); }}><CheckCircle2 size={15} /> Aprobar</AsyncButton>
          </div>
        </Card>
      )}
      {final?.status === "approved" && <Card><div className="text-sm flex items-center gap-2"><CheckCircle2 size={16} className="text-green-600" /> Aprobado. El video está en Descargas.</div></Card>}
    </div>
  );
}

/** Mejora continua: pides un cambio, ATRIL lo planea con Claude, lo aplica y vuelve a montar solo lo afectado. */
export function ImprovePanel({ video, stages }: { video: Video; stages: StageRow[] }) {
  const [text, setText] = useState("");
  const revs = revisionsOf(video.data);
  const busy = revs.some((r) => r.status === "planning" || r.status === "applying" || r.status === "rendering");
  const finalRow = stages.find((s) => s.stage === "final");
  const ready = finalRow?.status === "review" || finalRow?.status === "approved";
  const STATUS = { planning: "Planeando…", applying: "Aplicando cambios…", rendering: "Volviendo a montar…", done: "Hecho", failed: "No se pudo" } as const;
  const send = async () => {
    const t = text.trim();
    if (!t || busy || !ready) return;
    setText("");
    await requestImprovement(video.id, t, runVideo);
  };
  return (
    <Card title="Mejora continua" icon={Repeat}>
      {revs.length > 0 && (
        <div className="space-y-3 mb-3 max-h-[420px] overflow-y-auto pr-1">
          {revs.map((r) => (
            <div key={r.id} className="space-y-1.5">
              <div className="ml-auto max-w-[85%] w-fit rounded-md bg-primary/10 border border-primary/30 px-3 py-2 text-sm select-text">{r.request}</div>
              <div className="max-w-[90%] rounded-md bg-secondary/60 border border-border px-3 py-2 text-sm">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground mb-0.5">{r.status !== "done" && r.status !== "failed" && <Spinner size={11} />} ATRIL · {STATUS[r.status]}</div>
                {r.reply_es && <div className="select-text">{r.reply_es}</div>}
                {r.changes_es?.length ? <ul className="text-xs text-muted-foreground mt-1 list-disc pl-4">{r.changes_es.map((c, i) => <li key={i}>{c}</li>)}</ul> : null}
                {r.error && <div className="text-xs text-red-600 dark:text-red-500 mt-1">{r.error}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <textarea className="input min-h-[44px] max-h-40 resize-none text-sm" value={text} disabled={!ready || busy} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder={!ready ? "Disponible cuando termine la primera versión" : busy ? "Aplicando el pedido anterior…" : "Ej.: en el minuto 0:40 usa una imagen de un laboratorio; la animación m2 más lenta y con el título en amarillo"} />
        <button className="btn-primary w-11 shrink-0 grid place-items-center" disabled={!text.trim() || !ready || busy} onClick={() => void send()} aria-label="Enviar pedido"><Send size={15} /></button>
      </div>
    </Card>
  );
}
