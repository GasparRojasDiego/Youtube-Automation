import { useEffect, useState } from "react";
import { ArrowLeft, Play, Square, FolderOpen, RotateCcw, AlertTriangle, Mic } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { useBus } from "../lib/bus";
import { getVideo, getStages, STAGES, type StageRow, type Video, type StageId } from "../lib/repo";
import { db } from "../lib/ipc";
import { videoCost } from "../lib/costs";
import { runVideo, cancelCurrent, runningVideoId, retryStage, rerenderFrom, isQueued } from "../pipeline/runner";
import { navigate } from "../ui/nav";
import { PageHeader, Card, Chip, StatusChip, Spinner } from "../ui/kit";
import { Stepper, awaiting } from "../ui/Stepper";
import { fmtUsd, fmtDate } from "../lib/util";
import { VerifyReview } from "./video/VerifyReview";
import { FinalReview } from "./video/FinalReview";
import { ResearchPanel, ScriptPanel, VoicePanel, PackagePanel, RenderPanel, PublishPanel } from "./video/Panels";
import { StoryboardPanel, AssetsPanel, PolishPanel, MotionPanel } from "./video/EditPanels";
import { LiveStudio } from "./Studio";
import { Tabs } from "../ui/kit";
import { MonitorPlay, ListChecks } from "lucide-react";

export function VideoDetail({ id }: { id: string }) {
  const tick = useBus("videos", "stages", "costs", "jobs");
  const [video, setVideo] = useState<Video | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [cost, setCost] = useState({ usd: 0, apiEquiv: 0 });
  const [sel, setSel] = useState<StageId | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [view, setView] = useState<"live" | "stages" | null>(null);

  useEffect(() => {
    void (async () => {
      setVideo(await getVideo(id)); const st = await getStages(id); setStages(st); setCost(await videoCost(id));
      setReviews(await db.query("SELECT * FROM reviews WHERE video_id=? ORDER BY created_at DESC", [id]));
    })();
  }, [id, tick]);

  // Selección automática: lo que espera al usuario, lo que corre o lo último hecho
  const focus = (stages.find((s) => s.status === "review") ?? stages.find((s) => s.status === "running") ?? stages.find((s) => s.status === "failed") ?? [...stages].reverse().find((s) => s.status === "done" || s.status === "approved"))?.stage ?? "research";
  const current = sel ?? focus;
  const row = stages.find((s) => s.stage === current);

  if (!video) return <div className="flex justify-center py-20"><Spinner size={22} /></div>;
  const a = awaiting(video, stages);
  const isRunning = runningVideoId() === video.id;
  const canContinue = !isQueued(video.id) && stages.some((s) => s.status === "pending") && !stages.some((s) => s.status === "review");
  // Mientras trabaja, se muestra el estudio en vivo; si algo espera al usuario, sus resultados.
  const mode = view ?? (stages.some((s) => s.status === "review" || s.status === "failed") ? "stages" : "live");

  return (
    <div className="space-y-5">
      <button className="btn-ghost btn-sm -ml-2" onClick={() => navigate({ page: "produccion" })}><ArrowLeft size={14} /> Videos</button>
      <PageHeader kicker={`${video.mode === "premium" ? "Premium · " : ""}${fmtDate(video.created_at)}`} title={video.title}
        subtitle={<span className="flex items-center gap-2 flex-wrap">
          <Chip tone={a.tone === "muted" ? "muted" : a.tone}>{a.text}</Chip>
          {video.voice_mode === "own" && <Chip tone="primary"><Mic size={10} /> Voz propia</Chip>}
          <span className="text-xs">Costo: <b className="tabular">{fmtUsd(cost.usd)}</b>{cost.apiEquiv > 0 && <span className="text-muted-foreground"> · equivalente API {fmtUsd(cost.apiEquiv)} (cubierto por el plan)</span>}</span>
        </span>}
        actions={<>
          <button className="btn-ghost" onClick={() => void openPath(video.dir)}><FolderOpen size={15} /> Carpeta</button>
          {isRunning ? <button className="btn-danger" onClick={() => void cancelCurrent()}><Square size={14} /> Detener</button>
            : canContinue && <button className="btn-primary" onClick={() => runVideo(video.id)}><Play size={15} /> Continuar</button>}
        </>} />
      <Card pad><Stepper stages={stages} selected={current} onSelect={(s) => { setSel(s as StageId); setView("stages"); }} /></Card>
      <Tabs value={mode} onChange={setView} tabs={[{ id: "live", label: "Estudio en vivo", icon: MonitorPlay }, { id: "stages", label: "Resultados por etapa", icon: ListChecks }]} />
      {mode === "live" && <LiveStudio video={video} />}

      {mode === "stages" && row && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold">{STAGES.find((s) => s.id === current)?.label}</h2>
              <StatusChip status={row.status} />
              {row.attempt > 1 && <span className="text-xs text-muted-foreground">intento {row.attempt}</span>}
            </div>
            {(row.status === "done" || row.status === "approved" || row.status === "failed") && current !== "publish" && (
              <button className="btn-ghost btn-sm" title="Vuelve a ejecutar esta etapa y las siguientes (reutiliza lo ya generado si no cambió)"
                onClick={() => { if (confirm("¿Rehacer esta etapa y las siguientes? Lo ya generado que no cambie se reutiliza sin volver a pagar.")) void rerenderFrom(video.id, current); }}>
                <RotateCcw size={13} /> Rehacer desde aquí
              </button>
            )}
          </div>
          {row.status === "running" && <div className="card p-4 flex items-center gap-3 text-sm"><Spinner /> {row.progress ?? "Trabajando…"}</div>}
          {row.status === "failed" && (
            <div className="card border-red-500/50 p-4">
              <div className="flex items-center gap-2 font-semibold text-red-600 dark:text-red-500"><AlertTriangle size={16} /> La etapa falló</div>
              <pre className="text-xs whitespace-pre-wrap mt-2 text-muted-foreground max-h-64 overflow-y-auto">{row.error}</pre>
              <div className="text-xs mt-2">El trabajo hecho quedó guardado; al reintentar se reanuda desde aquí sin volver a pagar lo generado.</div>
              <button className="btn-primary btn-sm mt-3" onClick={() => void retryStage(video.id, current)}><RotateCcw size={13} /> Reintentar</button>
            </div>
          )}
          {row.status === "pending" && row.error && <div className="card p-3 text-xs text-muted-foreground">{row.error}</div>}
          <StagePanel video={video} stages={stages} stage={current} row={row} />
        </div>
      )}
      {reviews.length > 0 && (
        <Card title="Decisiones de revisión">
          <div className="space-y-1.5">
            {reviews.map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground w-28 shrink-0">{fmtDate(r.created_at)}</span>
                <Chip tone={r.decision === "approved" ? "green" : r.decision === "rejected" ? "red" : "amber"}>{r.stage === "verify" ? "Guion" : "Final"} · {r.decision === "approved" ? "aprobado" : r.decision === "rejected" ? "rechazado" : "correcciones"}</Chip>
                <span className="tabular text-muted-foreground">{Math.round(r.seconds / 60)} min</span>
                <span className="truncate">{r.notes}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function StagePanel({ video, stages, stage, row }: { video: Video; stages: StageRow[]; stage: StageId; row: StageRow }) {
  const get = (s: StageId) => stages.find((x) => x.stage === s)?.output;
  switch (stage) {
    case "research": return row.output ? <ResearchPanel data={row.output} /> : null;
    case "script": return row.output ? <ScriptPanel video={video} data={row.output} /> : null;
    case "verify": return row.output && get("script") ? <VerifyReview video={video} row={row} script={get("script")} research={get("research")} /> : null;
    case "voice": return <VoicePanel video={video} row={row} script={get("script")} />;
    case "storyboard": return row.output ? <StoryboardPanel data={row.output} /> : null;
    case "assets": return row.output ? <AssetsPanel video={video} data={row.output} /> : null;
    case "polish": return row.output ? <PolishPanel video={video} data={row.output} /> : null;
    case "motion": return row.output ? <MotionPanel video={video} data={row.output} /> : null;
    case "package": return row.output ? <PackagePanel data={row.output} /> : null;
    case "render": return row.output ? <RenderPanel data={row.output} /> : null;
    case "final": return row.status === "review" || row.status === "approved" ? <FinalReview video={video} stages={stages} /> : <Card><div className="text-sm text-muted-foreground">Se habilita cuando termine el montaje.</div></Card>;
    case "publish": return <PublishPanel video={video} row={row} />;
  }
}
