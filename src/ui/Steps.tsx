// Los 12 pasos internos agrupados en 7 visibles: Investigar, Guion, Voz,
// Medios, Motion, Montaje y Publicación.
import { Check, Loader2, AlertTriangle, Eye, type LucideIcon } from "lucide-react";
import { STAGES, type StageRow, type StageId, type StageStatus, type Video } from "../lib/repo";

export const GROUPS: { id: string; label: string; stages: StageId[] }[] = [
  { id: "investigar", label: "Investigar", stages: ["research"] },
  { id: "guion", label: "Guion", stages: ["script", "verify"] },
  { id: "voz", label: "Voz", stages: ["voice"] },
  { id: "medios", label: "Medios", stages: ["storyboard", "assets"] },
  { id: "motion", label: "Motion", stages: ["polish", "motion"] },
  { id: "montaje", label: "Montaje", stages: ["render"] },
  { id: "publicacion", label: "Publicación", stages: ["package", "final", "publish"] },
];

export const groupOf = (stage: StageId | string) => GROUPS.find((g) => g.stages.includes(stage as StageId)) ?? GROUPS[0];

/** Estado de un paso agrupado a partir de sus etapas. */
export function groupStatus(stages: StageRow[], g: (typeof GROUPS)[number]): StageStatus {
  const st = g.stages.map((id) => stages.find((s) => s.stage === id)?.status ?? "pending");
  if (st.includes("failed")) return "failed";
  if (st.includes("running")) return "running";
  if (st.includes("review")) return "review";
  if (st.every((x) => x === "done" || x === "approved" || x === "skipped")) return "done";
  // La publicación espera a que apruebes el video: no está «en curso» hasta entonces
  return "pending";
}

/** Qué espera cada video del usuario (texto para «en qué estado está»). */
export function awaiting(video: Video, stages: StageRow[]): { text: string; tone: "primary" | "amber" | "red" | "green" | "muted"; action?: string } {
  if (video.status === "published") return { text: "Publicado", tone: "green" };
  if (video.status === "scheduled") return { text: `Programado${video.scheduled_at ? " para " + new Date(video.scheduled_at).toLocaleString("es-PE", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}`, tone: "green" };
  if (video.status === "rejected") return { text: "Rechazado", tone: "muted" };
  const label = (id: string) => STAGES.find((x) => x.id === id)?.label;
  const failed = stages.find((s) => s.status === "failed");
  if (failed) return { text: `Falló: ${label(failed.stage)}`, tone: "red", action: "Ver error" };
  const review = stages.find((s) => s.status === "review");
  if (review) return review.stage === "final" ? { text: "Revisión final", tone: "amber", action: "Revisión final" } : { text: review.progress ?? "Te espera", tone: "amber", action: "Abrir" };
  const running = stages.find((s) => s.status === "running");
  if (running) return { text: running.progress ?? `${label(running.stage)}…`, tone: "primary" };
  const next = stages.find((s) => s.status === "pending");
  if (next) return { text: `En cola: ${groupOf(next.stage).label}`, tone: "muted", action: "Continuar" };
  return { text: "Completo", tone: "green" };
}

const ICON: Partial<Record<StageStatus, LucideIcon>> = { done: Check, running: Loader2, failed: AlertTriangle, review: Eye };
export const STATUS_DOT: Record<string, string> = {
  done: "bg-primary text-primary-foreground border-primary", running: "bg-primary/15 text-primary border-primary",
  review: "bg-amber-500/15 text-amber-600 dark:text-amber-500 border-amber-500", failed: "bg-red-500/15 text-red-600 dark:text-red-500 border-red-500",
  pending: "bg-card text-muted-foreground border-border",
};

export function StepIcon({ status, size = 11 }: { status: StageStatus; size?: number }) {
  const I = ICON[status === "approved" ? "done" : status];
  return I ? <I size={size} strokeWidth={2.6} className={status === "running" ? "animate-spin" : ""} /> : null;
}

/** Tira compacta de los 7 pasos (para listas). */
export function StepStrip({ stages }: { stages: StageRow[] }) {
  return (
    <ol className="flex items-center">
      {GROUPS.map((g, i) => {
        const st = groupStatus(stages, g);
        return (
          <li key={g.id} className="flex items-center min-w-0 flex-1 last:flex-none">
            <span title={g.label} className="flex items-center gap-1.5 shrink-0">
              <span className={`w-5 h-5 rounded-full border grid place-items-center ${STATUS_DOT[st]}`}><StepIcon status={st} size={10} /></span>
              <span className={`text-[11px] ${st === "pending" ? "text-muted-foreground" : "text-foreground"}`}>{g.label}</span>
            </span>
            {i < GROUPS.length - 1 && <span className={`mx-2 h-px flex-1 min-w-3 ${st === "done" ? "bg-primary/50" : "bg-border"}`} />}
          </li>
        );
      })}
    </ol>
  );
}
