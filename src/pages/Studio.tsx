// Estudio en vivo: lo que la IA y el motor hacen en cada momento (búsquedas,
// lecturas, archivos encontrados, decisiones, animaciones, montaje), con la
// vista previa del último cuadro, la línea de tiempo de la edición y el
// consumo del plan, como el registro de pasos de Claude.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Globe, FileText, Brain, MessageSquare, ImageIcon, Sparkles, Film, Music2, Gavel, Gauge, AlertTriangle, CheckCircle2, Flag,
  ChevronDown, ChevronRight, MonitorPlay, Activity as ActivityIcon, type LucideIcon,
} from "lucide-react";
import { useBus } from "../lib/bus";
import { fileUrl } from "../lib/ipc";
import { listActivity, getLive, type ActivityKind } from "../lib/activity";
import { getStages, getVideo, listVideos, STAGES, type StageRow, type Video } from "../lib/repo";
import { getSettings } from "../lib/settings";
import { listRuns, totalInput, fmtK, type RunRow } from "../lib/usage";
import { runningVideoId } from "../pipeline/runner";
import { Card, Empty, Chip, Progress, PageHeader } from "../ui/kit";
import { Stepper } from "../ui/Stepper";
import { MiniBar, useLimits } from "../ui/Usage";
import { navigate } from "../ui/nav";
import type { Shot, MotionItem, SfxCue, MusicBed } from "../pipeline/types";

const KIND: Record<ActivityKind, { icon: LucideIcon; cls: string }> = {
  stage: { icon: Flag, cls: "text-primary" }, search: { icon: Search, cls: "text-sky-500" }, fetch: { icon: Globe, cls: "text-sky-500" },
  read: { icon: FileText, cls: "text-violet-500" }, think: { icon: Brain, cls: "text-primary" }, text: { icon: MessageSquare, cls: "text-muted-foreground" },
  asset: { icon: ImageIcon, cls: "text-emerald-500" }, motion: { icon: Sparkles, cls: "text-fuchsia-500" }, render: { icon: Film, cls: "text-amber-500" },
  audio: { icon: Music2, cls: "text-teal-500" }, decision: { icon: Gavel, cls: "text-primary" }, usage: { icon: Gauge, cls: "text-muted-foreground" },
  warn: { icon: AlertTriangle, cls: "text-amber-500" }, done: { icon: CheckCircle2, cls: "text-green-500" },
};

const src = (p: string | null | undefined) => (!p ? "" : /^(data:|https?:|asset:|http:\/\/asset)/.test(p) ? p : fileUrl(p));

function Feed({ videoId }: { videoId: string }) {
  const tick = useBus("activity");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listActivity>>>([]);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [follow, setFollow] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { void listActivity(videoId, 500).then(setRows); }, [videoId, tick]);
  useEffect(() => { if (follow && box.current) box.current.scrollTop = box.current.scrollHeight; }, [rows, follow]);
  if (!rows.length) return <Empty icon={ActivityIcon} title="Sin actividad todavía" />;
  return (
    <div ref={box} onScroll={(e) => { const el = e.currentTarget; setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40); }}
      className="h-[640px] overflow-y-auto pr-1 space-y-0.5">
      {rows.map((r, i) => {
        const k = KIND[r.kind] ?? KIND.text; const I = k.icon;
        const newStage = r.kind === "stage";
        const hasMore = !!r.detail && r.detail.length > 0 && r.kind !== "usage";
        return (
          <div key={r.id} className={`${newStage ? "mt-3 pt-2 border-t border-border" : ""}`}>
            <button className="w-full text-left flex items-start gap-2 rounded px-1.5 py-1 hover:bg-accent/50" onClick={() => hasMore && setOpen({ ...open, [r.id]: !open[r.id] })}>
              <I size={14} className={`${k.cls} mt-0.5 shrink-0`} />
              <div className="min-w-0 flex-1">
                <div className={`text-[12.5px] leading-snug ${newStage ? "font-semibold" : r.kind === "text" ? "text-muted-foreground italic" : ""}`}>{r.title}</div>
                {r.kind === "usage" && <UsageLine detail={r.detail} />}
                {open[r.id] && <div className="text-[11.5px] text-muted-foreground whitespace-pre-wrap mt-1 break-words">{r.detail}</div>}
              </div>
              {r.thumb && <img src={src(r.thumb)} className="w-14 h-8 object-cover rounded shrink-0 border border-border" loading="lazy" />}
              {hasMore && (open[r.id] ? <ChevronDown size={12} className="mt-1 shrink-0 text-muted-foreground" /> : <ChevronRight size={12} className="mt-1 shrink-0 text-muted-foreground" />)}
              <span className="text-[10px] text-muted-foreground tabular shrink-0 mt-0.5">{new Date(r.ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            </button>
            {i === rows.length - 1 && <div className="h-1" />}
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
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-8">
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
  source_card: "bg-slate-400/70", quote_card: "bg-slate-500/70", title_card: "bg-primary/70", text_card: "bg-slate-600/70",
};

/** Línea de tiempo: pistas de imagen, animación, efectos y música. */
function Timeline({ stages }: { stages: StageRow[] }) {
  const get = (s: string) => stages.find((x) => x.stage === s)?.output as any;
  const src0 = get("polish") ?? get("assets") ?? get("storyboard");
  const motion: MotionItem[] = (get("motion")?.items ?? get("polish")?.motion ?? []) as MotionItem[];
  if (!src0?.shots?.length) return <div className="text-xs text-muted-foreground p-3">Aparece tras el storyboard.</div>;
  const shots: Shot[] = src0.shots; const sfx: SfxCue[] = src0.sfx ?? []; const music: MusicBed[] = src0.music ?? [];
  // inicio global de cada segmento
  const segOrder = [...new Set(shots.map((s) => s.segment_id))];
  const segStart: Record<string, number> = {}; let t = 0;
  for (const id of segOrder) { segStart[id] = t; t += shots.filter((s) => s.segment_id === id).reduce((a, s) => a + (s.dur ?? 0), 0); }
  const total = Math.max(1, t);
  const x = (sec: number) => `${(sec / total) * 100}%`;
  const Track = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-2"><span className="w-16 text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span><div className="relative flex-1 h-7 rounded bg-muted/50 overflow-hidden">{children}</div></div>
  );
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2"><span className="w-16" /><div className="relative flex-1 h-4 text-[9.5px] text-muted-foreground">
        {Array.from({ length: Math.floor(total / 60) + 1 }, (_, m) => <span key={m} className="absolute -translate-x-1/2" style={{ left: x(m * 60) }}>{m}:00</span>)}
      </div></div>
      <Track label="Imagen">{shots.map((s) => (
        <div key={s.id} title={`${s.id} · ${s.visual} · ${(s.dur ?? 0).toFixed(1)} s${s.query_en ? ` · ${s.query_en}` : ""}${s.transition_in && s.transition_in !== "cut" ? ` · ${s.transition_in}` : ""}`}
          className={`absolute top-0 bottom-0 border-r border-background/80 ${VIS_COLOR[s.visual] ?? "bg-slate-500/60"}`} style={{ left: x(segStart[s.segment_id] + (s.start ?? 0)), width: x(s.dur ?? 0) }}>
          {s.path && s.media === "image" && (s.dur ?? 0) / total > 0.02 && <img src={fileUrl(s.path)} className="w-full h-full object-cover opacity-80" loading="lazy" />}
        </div>))}
      </Track>
      <Track label="Motion">{motion.map((m) => (
        <div key={m.id} title={`${m.id} · ${m.kind} · ${m.brief_en}`} className={`absolute top-1 bottom-1 rounded ${m.file ? "bg-fuchsia-500" : m.error ? "bg-red-500/70" : "bg-fuchsia-500/40 animate-pulse"}`}
          style={{ left: x((segStart[m.segment_id] ?? 0) + m.start), width: x(m.duration) }} />))}
      </Track>
      <Track label="Efectos">{sfx.map((c) => <div key={c.id} title={`${c.type} @ ${c.at.toFixed(1)} s`} className={`absolute top-1 bottom-1 w-[3px] rounded ${c.path ? "bg-teal-500" : "bg-teal-500/40"}`} style={{ left: x(c.at) }} />)}</Track>
      <Track label="Música">{music.map((b, i) => {
        const st = segStart[b.segment_ids[0]] ?? 0; const last = b.segment_ids[b.segment_ids.length - 1];
        const en = (segStart[last] ?? 0) + shots.filter((s) => s.segment_id === last).reduce((a, s) => a + (s.dur ?? 0), 0);
        return <div key={i} title={`${b.title ?? b.mood_en}`} className={`absolute top-1 bottom-1 rounded px-1.5 text-[9.5px] text-white truncate flex items-center ${b.path ? "bg-teal-700/80" : "bg-teal-700/30"}`} style={{ left: x(st), width: x(en - st) }}>{b.title ?? b.mood_en}</div>;
      })}</Track>
      <div className="flex gap-3 text-[10px] text-muted-foreground pl-[72px] flex-wrap">
        {[["photo", "Foto"], ["archival", "Archivo"], ["clip", "Clip"], ["motion", "Animación"], ["title_card", "Tarjeta"]].map(([k, l]) => <span key={k} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${VIS_COLOR[k]}`} />{l}</span>)}
        <span>· {shots.length} tomas · {Math.floor(total / 60)}:{String(Math.round(total % 60)).padStart(2, "0")}</span>
      </div>
    </div>
  );
}

function VideoUsage({ videoId }: { videoId: string }) {
  const tick = useBus("usage");
  const limits = useLimits();
  const [runs, setRuns] = useState<RunRow[]>([]);
  useEffect(() => { void listRuns({ videoId, limit: 300 }).then(setRuns); }, [videoId, tick]);
  const inp = runs.reduce((a, r) => a + totalInput(r), 0), outp = runs.reduce((a, r) => a + r.output_tokens, 0);
  const byStage = new Map<string, number>(); for (const r of runs) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + totalInput(r) + r.output_tokens * 5);
  const last = runs[0];
  return (
    <div className="flex items-center gap-5 flex-wrap text-xs">
      <div className="space-y-0.5"><MiniBar label="5h" u={limits?.fiveHour?.utilization} resetsAt={limits?.fiveHour?.resetsAt} /><MiniBar label="7d" u={limits?.sevenDay?.utilization} resetsAt={limits?.sevenDay?.resetsAt} /></div>
      <div><div className="label">Este video</div><div className="tabular">{runs.length} tareas · {fmtK(inp)} entrada · {fmtK(outp)} salida</div></div>
      {last && <div><div className="label">Última tarea</div><div className="tabular truncate max-w-[280px]">{last.label} · {fmtK(totalInput(last))}/{fmtK(last.output_tokens)}</div></div>}
      <button className="btn-ghost btn-sm ml-auto" onClick={() => navigate({ page: "consumo" })}><Gauge size={13} /> Detalle</button>
    </div>
  );
}

export function LiveStudio({ video }: { video: Video }) {
  const tick = useBus("stages");
  const [stages, setStages] = useState<StageRow[]>([]);
  useEffect(() => { void getStages(video.id).then(setStages); }, [video.id, tick]);
  const running = stages.find((s) => s.status === "running");
  return (
    <div className="space-y-4">
      <Card pad><VideoUsage videoId={video.id} /></Card>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        <div className="space-y-4">
          <Monitor video={video} stages={stages} />
          <Card title="Línea de tiempo" pad><Timeline stages={stages} /></Card>
        </div>
        <Card title={<span className="flex items-center gap-2">Paso a paso {running && <Chip tone="primary">{STAGES.find((s) => s.id === running.stage)?.label}</Chip>}</span>} pad>
          <Feed videoId={video.id} />
        </Card>
      </div>
    </div>
  );
}

/** Página global: el video en curso (o el último activo). */
export function StudioPage() {
  const tick = useBus("jobs", "videos", "stages");
  const [video, setVideo] = useState<Video | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  useEffect(() => { void (async () => {
    const id = runningVideoId();
    let v = id ? await getVideo(id) : null;
    if (!v) v = (await listVideos(getSettings().activeChannelId ?? undefined, 20)).find((x) => x.status === "active" || x.status === "approved") ?? null;
    setVideo(v); if (v) setStages(await getStages(v.id));
  })(); }, [tick]);
  return (
    <div className="space-y-4">
      <PageHeader kicker="Producción" title="Estudio en vivo" subtitle={video ? <button className="hover:underline" onClick={() => navigate({ page: "video", id: video.id })}>{video.title}</button> : "Ningún video en producción"} />
      {video ? (<>
        <Card pad><Stepper stages={stages} onSelect={() => navigate({ page: "video", id: video.id })} /></Card>
        <LiveStudio video={video} />
      </>) : <Card><Empty icon={MonitorPlay} title="Nada en producción">Inicia un video en Hoy.</Empty></Card>}
    </div>
  );
}
