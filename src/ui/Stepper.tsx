import { STAGES, type StageRow, type Video } from "../lib/repo";
import { StatusIcon } from "./kit";

/** Qué espera cada etapa del usuario (texto para «en qué estado está»). */
export function awaiting(video: Video, stages: StageRow[]): { text: string; tone: "primary" | "amber" | "red" | "green" | "muted"; action?: string } {
  if (video.status === "published") return { text: "Publicado", tone: "green" };
  if (video.status === "scheduled") return { text: `Programado${video.scheduled_at ? " para " + new Date(video.scheduled_at).toLocaleString("es-PE", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}`, tone: "green" };
  if (video.status === "rejected") return { text: "Rechazado", tone: "muted" };
  const failed = stages.find((s) => s.status === "failed");
  if (failed) return { text: `Falló «${STAGES.find((x) => x.id === failed.stage)?.label}»: revisa y reintenta`, tone: "red", action: "Ver el error" };
  const review = stages.find((s) => s.status === "review");
  if (review) {
    if (review.stage === "verify") return { text: "Te espera: revisar el guion verificado", tone: "amber", action: "Revisar guion" };
    if (review.stage === "final") return { text: "Te espera: revisión final del video", tone: "amber", action: "Revisión final" };
    if (review.stage === "voice") return { text: review.progress ?? "Te espera: grabar tu voz", tone: "amber", action: "Grabar voz" };
    return { text: review.progress ?? "Te espera una acción", tone: "amber", action: "Abrir" };
  }
  const running = stages.find((s) => s.status === "running");
  if (running) return { text: running.progress ?? `${STAGES.find((x) => x.id === running.stage)?.label}…`, tone: "primary" };
  const next = stages.find((s) => s.status === "pending");
  if (next) return { text: `En cola: ${STAGES.find((x) => x.id === next.stage)?.label}`, tone: "muted", action: "Continuar" };
  return { text: "Completo", tone: "green" };
}

export function Stepper({ stages, onSelect, selected }: { stages: StageRow[]; onSelect?: (id: string) => void; selected?: string }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto no-scrollbar">
      {STAGES.map((st, i) => {
        const row = stages.find((s) => s.stage === st.id);
        const status = row?.status ?? "pending";
        const active = selected === st.id;
        return (
          <li key={st.id} className="flex items-center gap-1 shrink-0">
            <button onClick={() => onSelect?.(st.id)} disabled={!onSelect}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-[11px] font-medium transition-colors duration-200 ${active ? "border-primary bg-primary/15 text-primary" : status === "review" ? "border-amber-500/50 bg-amber-500/10" : status === "failed" ? "border-red-500/50 bg-red-500/10" : "border-border hover:bg-accent"}`}>
              <StatusIcon status={status} size={12} />{st.short}
            </button>
            {i < STAGES.length - 1 && <span className="w-3 h-px bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}
