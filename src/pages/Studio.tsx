// Producción: el video en curso (o el que abras) con sus 7 pasos en columna, la
// vista previa y la línea de tiempo; al elegir un paso, debajo aparecen su
// resultado y el registro solo de ese paso. Arriba, el consumo: % del límite de
// 5 horas (dato oficial de Claude Code), tokens y la cuota mensual de la voz.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Globe, FileText, Brain, MessageSquare, ImageIcon, Sparkles, Film, Music2, Gavel, Gauge, AlertTriangle, CheckCircle2, Flag,
  ChevronDown, ChevronRight, MonitorPlay, Activity as ActivityIcon, Play, Square, FolderOpen, RotateCcw, ArrowLeft, RefreshCw, type LucideIcon,
} from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { useBus } from "../lib/bus";
import { fileUrl } from "../lib/ipc";
import { listActivity, getLive, type ActivityKind } from "../lib/activity";
import { getStages, getVideo, listVideos, STAGES, type StageRow, type Video, type StageId } from "../lib/repo";
import { getSettings } from "../lib/settings";
import { listRuns, stepUsage, fmtK, fmtReset, type RunRow } from "../lib/usage";
import { monthUnits } from "../lib/costs";
import { refreshPlanUsage } from "../providers/claude";
import { runningVideoId, runVideo, cancelCurrent, isQueued, retryStage, rerenderFrom } from "../pipeline/runner";
import { Card, Empty, Chip, Progress, Spinner } from "../ui/kit";
import { GROUPS, groupStatus, awaiting, STATUS_DOT, StepIcon } from "../ui/Steps";
import { useLimits } from "../ui/Usage";
import { navigate } from "../ui/nav";
import { VoicePanel, PublishPanel } from "./video/Panels";
import { FinalReview } from "./video/FinalReview";
import { ResearchSummary, ScriptFinal, MediaSummary, MotionSummary, RenderSummary, PackageSummary, PersonalFinal, ImprovePanel } from "./video/Summaries";
import { personalOf } from "../pipeline/personal";
import type { Shot, MotionItem, SfxCue, MusicBed } from "../pipeline/types";

const KIND: Record<ActivityKind, { icon: LucideIcon; cls: string }> = {
  stage: { icon: Flag, cls: "text-primary" }, search: { icon: Search, cls: "text-sky-500" }, fetch: { icon: Globe, cls: "text-sky-500" },
  read: { icon: FileText, cls: "text-violet-500" }, think: { icon: Brain, cls: "text-primary" }, text: { icon: MessageSquare, cls: "text-muted-foreground" },
  asset: { icon: ImageIcon, cls: "text-emerald-500" }, motion: { icon: Sparkles, cls: "text-fuchsia-500" }, render: { icon: Film, cls: "text-amber-500" },
  audio: { icon: Music2, cls: "text-teal-500" }, decision: { icon: Gavel, cls: "text-primary" }, usage: { icon: Gauge, cls: "text-muted-foreground" },
  warn: { icon: AlertTriangle, cls: "text-amber-500" }, done: { icon: CheckCircle2, cls: "text-green-500" },
};

const src = (p: string | null | undefined) => (!p ? "" : /^(data:|https?:|asset:|http:\/\/asset|\/__file)/.test(p) ? p : fileUrl(p));
const pctText = (p: number | null, any: boolean) => (p == null ? "—" : p >= 0.005 ? `${Math.round(p * 100)} %` : any ? "<1 %" : "0 %");

/** Registro de un paso (solo sus etapas), del más antiguo al más nuevo. */
function Feed({ videoId, stages }: { videoId: string; stages: StageId[] }) {
  const tick = useBus("activity");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listActivity>>>([]);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [follow, setFollow] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { void listActivity(videoId, 1500).then((r) => setRows(r.filter((x) => stages.includes(x.stage as StageId)))); }, [videoId, tick, stages.join()]);
  useEffect(() => { if (follow && box.current) box.current.scrollTop = box.current.scrollHeight; }, [rows, follow]);
  if (!rows.length) return <Empty icon={ActivityIcon} title="Sin actividad en este paso" />;
  return (
    <div ref={box} onScroll={(e) => { const el = e.currentTarget; setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40); }} className="max-h-[560px] overflow-y-auto pr-1 space-y-0.5">
      {rows.map((r) => {
        const k = KIND[r.kind] ?? KIND.text; const I = k.icon;
        const head = r.kind === "stage";
        const more = !!r.detail && r.kind !== "usage";
        return (
          <div key={r.id} className={head ? "mt-3 pt-2 border-t border-border first:mt-0 first:pt-0 first:border-0" : ""}>
            <button className="w-full text-left flex items-start gap-2 rounded px-1.5 py-1 hover:bg-accent/50" onClick={() => more && setOpen({ ...open, [r.id]: !open[r.id] })}>
              <I size={14} className={`${k.cls} mt-0.5 shrink-0`} />
              <div className="min-w-0 flex-1">
                <div className={`text-[12.5px] leading-snug ${head ? "font-semibold" : r.kind === "text" ? "text-muted-foreground italic" : ""}`}>{r.title}</div>
                {r.kind === "usage" && <UsageLine detail={r.detail} />}
                {open[r.id] && <div className="text-[11.5px] text-muted-foreground whitespace-pre-wrap mt-1 break-words">{r.detail}</div>}
              </div>
              {r.thumb && <img src={src(r.thumb)} className="w-14 h-8 object-cover rounded shrink-0 border border-border" loading="lazy" />}
              {more && (open[r.id] ? <ChevronDown size={12} className="mt-1 shrink-0 text-muted-foreground" /> : <ChevronRight size={12} className="mt-1 shrink-0 text-muted-foreground" />)}
              <span className="text-[10px] text-muted-foreground tabular shrink-0 mt-0.5">{new Date(r.ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function UsageLine({ detail }: { detail: string }) {
  try {
    const d = JSON.parse(detail);
    return <div className="text-[10.5px] text-muted-foreground tabular">{d.model?.replace(/^claude-/, "")} · entrada {fmtK(d.input + d.cacheRead + d.cacheWrite)} ({fmtK(d.cacheRead)} caché) · salida {fmtK(d.output)}{d.webSearches ? ` · ${d.webSearches} búsquedas` : ""}</div>;
  } catch { return null; }
}

function Monitor({ video, stages }: { video: Video; stages: StageRow[] }) {
  const tick = useBus("live");
  const live = useMemo(() => getLive(video.id), [video.id, tick]);
  const running = stages.find((s) => s.status === "running");
  const render = stages.find((s) => s.stage === "render")?.output as { file?: string; poster?: string; renderedAt?: number } | null;
  const showFinal = !running && render?.file;
  return (
    <div className="rounded-lg overflow-hidden border border-border bg-black relative aspect-video">
      {showFinal ? <video key={render!.file} src={fileUrl(render!.file!, render!.renderedAt)} poster={render!.poster ? fileUrl(render!.poster, render!.renderedAt) : undefined} controls className="w-full h-full" /> :
        live?.frame ? <img src={src(live.frame)} className="w-full h-full object-contain" /> :
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60 gap-2"><MonitorPlay size={34} /><span className="text-sm">{running ? "Preparando…" : "Sin vista previa"}</span></div>}
      {!showFinal && (live?.caption || running?.progress) && (
        <div className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2">
          <div className="text-white text-[13px] font-medium">{live?.caption || running?.progress}</div>
          {running?.progress && live?.caption !== running.progress && <div className="text-white/70 text-[11.5px]">{running.progress}</div>}
          {live?.progress != null && <Progress className="mt-2 bg-white/20" value={live.progress * 100} />}
        </div>
      )}
    </div>
  );
}

const VIS_COLOR: Record<string, string> = {
  photo: "bg-emerald-500/70", archival: "bg-amber-600/70", clip: "bg-sky-500/70", meme: "bg-pink-500/70", motion: "bg-fuchsia-500/70", map: "bg-fuchsia-500/70",
  source_card: "bg-slate-400/70", quote_card: "bg-slate-500/70", title_card: "bg-primary/70", text_card: "bg-slate-600/70", ai_image: "bg-violet-500/70",
};

/** Línea de tiempo: pistas de imagen, animación, efectos y música. */
function Timeline({ stages }: { stages: StageRow[] }) {
  const get = (s: string) => stages.find((x) => x.stage === s)?.output as any;
  const src0 = get("polish") ?? get("assets") ?? get("storyboard");
  const motion: MotionItem[] = (get("motion")?.items ?? get("polish")?.motion ?? []) as MotionItem[];
  if (!src0?.shots?.length) return <div className="text-xs text-muted-foreground p-3">Aparece tras el storyboard.</div>;
  const shots: Shot[] = src0.shots; const sfx: SfxCue[] = src0.sfx ?? []; const music: MusicBed[] = src0.music ?? [];
  const segOrder = [...new Set(shots.map((s) => s.segment_id))];
  const segStart: Record<string, number> = {}; let t = 0;
  for (const id of segOrder) { segStart[id] = t; t += shots.filter((s) => s.segment_id === id).reduce((a, s) => a + (s.dur ?? 0), 0); }
  const total = Math.max(1, t);
  const x = (sec: number) => `${(sec / total) * 100}%`;
  const motionSfx = motion.flatMap((m) => (m.sfx ?? []).map((c) => ({ ...c, at: (segStart[m.segment_id] ?? 0) + m.start + c.at })));
  const Track = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-2"><span className="w-16 text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span><div className="relative flex-1 h-7 rounded bg-muted/50 overflow-hidden">{children}</div></div>
  );
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2"><span className="w-16" /><div className="relative flex-1 h-4 text-[9.5px] text-muted-foreground">
        {Array.from({ length: Math.floor(total / 60) + 1 }, (_, m) => <span key={m} className="absolute -translate-x-1/2" style={{ left: x(m * 60) }}>{m}:00</span>)}
      </div></div>
      <Track label="Imagen">{shots.map((s) => (
        <div key={s.id} title={`${s.id} · ${s.visual} · ${(s.dur ?? 0).toFixed(1)} s${s.query_en ? ` · ${s.query_en}` : ""}`}
          className={`absolute top-0 bottom-0 border-r border-background/80 ${VIS_COLOR[s.visual] ?? "bg-slate-500/60"}`} style={{ left: x(segStart[s.segment_id] + (s.start ?? 0)), width: x(s.dur ?? 0) }}>
          {s.path && s.media === "image" && (s.dur ?? 0) / total > 0.02 && <img src={fileUrl(s.path)} className="w-full h-full object-cover opacity-80" loading="lazy" />}
        </div>))}
      </Track>
      <Track label="Motion">{motion.map((m) => (
        <div key={m.id} title={`${m.id} · ${m.kind} · ${m.brief_en}`} className={`absolute top-1 bottom-1 rounded ${m.file ? "bg-fuchsia-500" : m.error ? "bg-red-500/70" : "bg-fuchsia-500/40 animate-pulse"}`}
          style={{ left: x((segStart[m.segment_id] ?? 0) + m.start), width: x(m.duration) }} />))}
      </Track>
      <Track label="Efectos">{[...sfx, ...motionSfx].map((c, i) => <div key={`${c.id}-${i}`} title={`${c.type} @ ${c.at.toFixed(1)} s`} className={`absolute top-1 bottom-1 w-[3px] rounded ${c.path ? "bg-teal-500" : "bg-teal-500/40"}`} style={{ left: x(c.at) }} />)}</Track>
      <Track label="Música">{music.map((b, i) => {
        const st = segStart[b.segment_ids[0]] ?? 0; const last = b.segment_ids[b.segment_ids.length - 1];
        const en = (segStart[last] ?? 0) + shots.filter((s) => s.segment_id === last).reduce((a, s) => a + (s.dur ?? 0), 0);
        return <div key={i} title={`${b.title ?? b.mood_en}`} className={`absolute top-1 bottom-1 rounded px-1.5 text-[9.5px] text-white truncate flex items-center ${b.path ? "bg-teal-700/80" : "bg-teal-700/30"}`} style={{ left: x(st), width: x(en - st) }}>{b.title ?? b.mood_en}</div>;
      })}</Track>
      <div className="flex gap-3 text-[10px] text-muted-foreground pl-[72px] flex-wrap">
        {[["photo", "Foto"], ["archival", "Archivo"], ["clip", "Clip"], ["ai_image", "IA"], ["motion", "Animación"]].map(([k, l]) => <span key={k} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${VIS_COLOR[k]}`} />{l}</span>)}
        <span>· {shots.length} tomas · {Math.floor(total / 60)}:{String(Math.round(total % 60)).padStart(2, "0")}</span>
      </div>
    </div>
  );
}

/** Recuadro de consumo: % del límite de 5 h (oficial), tokens del video y del paso elegido, y la voz del mes. */
function UsageMeter({ videoId, group }: { videoId: string; group: (typeof GROUPS)[number] }) {
  const tick = useBus("usage", "costs");
  const limits = useLimits();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [voice, setVoice] = useState(0);
  const [busy, setBusy] = useState(false);
  const tts = getSettings().tts;
  useEffect(() => { void listRuns({ videoId, limit: 1000 }).then(setRuns); }, [videoId, tick]);
  useEffect(() => { void monthUnits(tts.provider === "google" ? "google-tts" : tts.provider === "gemini" ? "gemini-tts" : "elevenlabs", tts.provider === "gemini" ? "tokens de audio" : "caracteres").then(setVoice); }, [tick, tts.provider]);
  const all = stepUsage(runs), step = stepUsage(runs.filter((r) => group.stages.includes(r.stage as StageId)));
  const w = limits?.fiveHour; const expired = !!w && w.resetsAt < Date.now(); const u = expired ? 0 : w?.utilization ?? 0;
  const free = tts.provider === "google" ? tts.google.freeCharsPerMonth : 0;
  const Cell = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="min-w-0"><div className="label mb-1">{label}</div>{children}</div>;
  const Tok = ({ s }: { s: ReturnType<typeof stepUsage> }) => (
    <div className="flex items-baseline gap-2.5 tabular">
      <span className="text-[22px] font-bold tracking-tight leading-none">{pctText(s.pct, s.runs > 0)}</span>
      <span className="text-[11px] text-muted-foreground leading-tight">entrada {fmtK(s.input)}<br />salida {fmtK(s.output)}</span>
    </div>
  );
  return (
    <Card pad>
      <div className="grid grid-cols-[1.25fr_1fr_1fr_1.25fr] gap-6 items-center">
        <Cell label="Límite de 5 horas">
          <div className="flex items-baseline justify-between gap-2"><span className="text-[22px] font-bold tabular leading-none">{w ? `${Math.round(u * 100)} %` : "—"}</span>
            <button className="text-[10.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1" disabled={busy} title="Consulta mínima a Claude para actualizar el dato"
              onClick={async () => { setBusy(true); try { await refreshPlanUsage(); } finally { setBusy(false); } }}><RefreshCw size={11} className={busy ? "animate-spin" : ""} />{w ? (expired ? "repuesto" : `se repone ${fmtReset(w.resetsAt)}`) : "consultar"}</button></div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2"><div className={`h-full rounded-full ${u >= 0.9 ? "bg-red-500" : u >= 0.7 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${u * 100}%` }} /></div>
        </Cell>
        <Cell label="Este video"><Tok s={all} /></Cell>
        <Cell label={`Paso · ${group.label}`}><Tok s={step} /></Cell>
        <Cell label={`Voz del mes · ${tts.provider === "google" ? "Google (gratis)" : tts.provider === "gemini" ? "Gemini" : "ElevenLabs"}`}>
          <div className="flex items-baseline justify-between gap-2 tabular"><span className="text-[22px] font-bold leading-none">{fmtK(voice)}</span><span className="text-[11px] text-muted-foreground">{free ? `de ${fmtK(free)} caracteres` : tts.provider === "gemini" ? "tokens de audio" : "caracteres"}</span></div>
          {free > 0 && <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2"><div className={`h-full rounded-full ${voice / free >= 0.9 ? "bg-red-500" : voice / free >= 0.7 ? "bg-amber-500" : "bg-teal-500"}`} style={{ width: `${Math.min(100, (voice / free) * 100)}%` }} /></div>}
        </Cell>
      </div>
    </Card>
  );
}

/** Resultado del paso elegido (los paneles de sus etapas). */
function StepResult({ video, stages, group }: { video: Video; stages: StageRow[]; group: (typeof GROUPS)[number] }) {
  const get = (s: StageId) => stages.find((x) => x.stage === s);
  const out = (s: StageId) => get(s)?.output;
  // Lo esencial de cada paso; el detalle completo (tomas, animaciones, voz) está en la revisión final
  const personal = !!personalOf(video);
  const finalRow = get("final");
  const reviewing = finalRow?.status === "review" || finalRow?.status === "approved";
  const panels = group.stages.map((id) => {
    const row = get(id); if (!row) return null;
    switch (id) {
      case "research": return row.output ? <ResearchSummary key={id} data={row.output} /> : null;
      case "script": return row.output ? <ScriptFinal key={id} data={row.output} verify={out("verify")} /> : null;
      case "voice": return row.output ? <VoicePanel key={id} video={video} row={row} script={out("script")} /> : null;
      case "assets": return out("polish") ? <MediaSummary key={id} polish={out("polish")} motion={out("motion")} /> : null;
      case "motion": return row.output ? <MotionSummary key={id} data={row.output} /> : null;
      case "render": return row.output ? <RenderSummary key={id} data={row.output} /> : null;
      case "package": return row.output && !reviewing ? <PackageSummary key={id} data={row.output} /> : null;
      case "final": return reviewing ? (personal ? <PersonalFinal key={id} video={video} stages={stages} /> : <FinalReview key={id} video={video} stages={stages} />) : null;
      case "publish": return !personal && (row.status !== "pending" || video.status === "approved") ? <PublishPanel key={id} video={video} row={row} /> : null;
      default: return null;
    }
  }).filter(Boolean);
  if (group.id === "publicacion" && personalOf(video)?.iterate) panels.push(<ImprovePanel key="mejora" video={video} stages={stages} />);
  const failed = group.stages.map(get).find((r) => r?.status === "failed");
  const running = group.stages.map(get).find((r) => r?.status === "running");
  return (
    <div className="space-y-4">
      {running && <div className="card p-4 flex items-center gap-3 text-sm"><Spinner /> {running.progress ?? "Trabajando…"}</div>}
      {failed && (
        <div className="card border-red-500/50 p-4">
          <div className="flex items-center gap-2 font-semibold text-red-600 dark:text-red-500"><AlertTriangle size={16} /> Falló: {STAGES.find((x) => x.id === failed.stage)?.label}</div>
          <pre className="text-xs whitespace-pre-wrap mt-2 text-muted-foreground max-h-64 overflow-y-auto">{failed.error}</pre>
          <div className="text-xs mt-2">Lo hecho quedó guardado. El informe completo está en Ajustes.</div>
          <button className="btn-primary btn-sm mt-3" onClick={() => void retryStage(video.id, failed.stage)}><RotateCcw size={13} /> Reintentar</button>
        </div>
      )}
      {panels.length ? panels : !running && !failed && <Card><Empty icon={Flag} title="Este paso aún no tiene resultado" /></Card>}
    </div>
  );
}

/** Vista completa de producción de un video. */
export function ProductionView({ video, back }: { video: Video; back?: boolean }) {
  const tick = useBus("stages", "jobs", "videos");
  const [stages, setStages] = useState<StageRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { void getStages(video.id).then(setStages); }, [video.id, tick]);

  // Paso enfocado por defecto: lo que espera al usuario, lo que corre, lo que falló o lo último hecho
  const auto = GROUPS.find((g) => groupStatus(stages, g) === "review") ?? GROUPS.find((g) => groupStatus(stages, g) === "running")
    ?? GROUPS.find((g) => groupStatus(stages, g) === "failed") ?? [...GROUPS].reverse().find((g) => groupStatus(stages, g) === "done") ?? GROUPS[0];
  const group = GROUPS.find((g) => g.id === sel) ?? auto;
  const isRunning = runningVideoId() === video.id;
  const canContinue = !isQueued(video.id) && stages.some((s) => s.status === "pending") && !stages.some((s) => s.status === "review" || s.status === "running");
  const a = awaiting(video, stages);
  const gst = groupStatus(stages, group);
  const redoable = (gst === "done" || gst === "failed") && group.id !== "publicacion";

  return (
    <div className="space-y-4">
      {back && <button className="btn-ghost btn-sm -ml-2" onClick={() => navigate({ page: "videos" })}><ArrowLeft size={14} /> Videos</button>}
      <UsageMeter videoId={video.id} group={group} />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4 items-start">
        <Card pad={false}>
          <div className="px-5 pt-4 pb-3 border-b border-border/60">
            <div className="font-semibold tracking-tight leading-snug line-clamp-2">{video.title}</div>
            <div className="flex items-center gap-2 mt-2">
              <Chip tone={a.tone === "muted" ? "muted" : a.tone}>{a.text.length > 40 ? `${a.text.slice(0, 39)}…` : a.text}</Chip>
              <div className="flex-1" />
              <button className="btn-ghost btn-sm px-2" title="Carpeta del video" onClick={() => void openPath(video.dir)}><FolderOpen size={14} /></button>
              {isRunning ? <button className="btn-ghost btn-sm text-red-600 dark:text-red-500" onClick={() => void cancelCurrent()}><Square size={12} /> Detener</button>
                : canContinue && <button className="btn-brand btn-sm" onClick={() => runVideo(video.id)}><Play size={13} /> Continuar</button>}
            </div>
          </div>
          <ol className="relative px-3 py-3">
            <span aria-hidden className="absolute left-[29px] top-7 bottom-7 w-px bg-border" />
            {GROUPS.map((g) => {
              const st = groupStatus(stages, g);
              const on = g.id === group.id;
              const rows = g.stages.map((id) => stages.find((s) => s.stage === id));
              const run = rows.find((r) => r?.status === "running");
              const sub = run?.progress ?? (st === "done" ? "Hecho" : st === "review" ? "Te espera" : st === "failed" ? "Falló" : rows.some((r) => r?.status === "done") ? "En parte" : "Pendiente");
              return (
                <li key={g.id}>
                  <button onClick={() => setSel(g.id)} className={`relative w-full flex items-center gap-3 rounded-lg pl-2.5 pr-3 py-2.5 text-left transition-colors ${on ? "bg-primary/10" : "hover:bg-accent/50"}`}>
                    <span className={`relative z-10 w-[18px] h-[18px] rounded-full border-2 grid place-items-center shrink-0 ${STATUS_DOT[st]} ${on ? "ring-4 ring-primary/15" : ""}`}><StepIcon status={st} size={9} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13.5px] ${on ? "font-semibold text-foreground" : "font-medium"}`}>{g.label}</span>
                      <span className={`block text-[11px] truncate ${st === "failed" ? "text-red-600 dark:text-red-500" : st === "review" ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`}>{sub}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>
        <div className="space-y-4">
          <Monitor video={video} stages={stages} />
          <Card title="Línea de tiempo" pad><Timeline stages={stages} /></Card>
        </div>
      </div>
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-lg font-bold tracking-tight">{group.label}</h2>
        {redoable && <button className="btn-ghost btn-sm" title="Reutiliza lo que no cambió" onClick={() => { if (confirm(`¿Rehacer «${group.label}» y lo que sigue?`)) void rerenderFrom(video.id, group.stages[0]); }}><RotateCcw size={13} /> Rehacer</button>}
      </div>
      <StepResult video={video} stages={stages} group={group} />
      <Card title="Paso a paso" icon={ActivityIcon}><Feed videoId={video.id} stages={group.stages} /></Card>
    </div>
  );
}

/** Página global: el video en curso (o el último activo). */
export function StudioPage() {
  const tick = useBus("jobs", "videos");
  const [video, setVideo] = useState<Video | null | undefined>(undefined);
  useEffect(() => { void (async () => {
    const id = runningVideoId();
    let v = id ? await getVideo(id) : null;
    if (!v) v = (await listVideos(getSettings().activeChannelId ?? undefined, 20)).find((x) => x.status === "active" || x.status === "approved") ?? null;
    setVideo(v);
  })(); }, [tick]);
  if (video === undefined) return <div className="flex justify-center py-20"><Spinner size={22} /></div>;
  return video ? <ProductionView key={video.id} video={video} /> : <Card><Empty icon={MonitorPlay} title="Nada en producción">Inicia un video en Inicio.</Empty></Card>;
}
