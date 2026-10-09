// Actualización con el estilo de la app: confirmación con peso y tiempo estimado
// medido en el momento, y avance real (descarga, verificación, instalación).
import { useEffect, useState } from "react";
import { Download, ShieldCheck, Loader2, ExternalLink, RotateCcw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useBus } from "../lib/bus";
import { updateState, estimate, installUpdate, installSeconds, RELEASES_URL } from "../lib/updater";
import { Modal, Markdown } from "./kit";

const mb = (b: number) => `${(b / 1e6).toLocaleString("es-PE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
const secs = (s: number) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`);

/** Anillo de avance para el botón circular del perfil. */
export function UpdateRing() {
  useBus("update");
  const u = updateState();
  const k = u.phase === "download" && u.total ? u.done / u.total : u.phase === "verify" || u.phase === "install" ? 1 : 0;
  const C = 2 * Math.PI * 11;
  return (
    <svg viewBox="0 0 28 28" className="w-7 h-7 -rotate-90">
      <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
      <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - k)} className="transition-[stroke-dashoffset] duration-300" />
    </svg>
  );
}

export function UpdateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useBus("update");
  const u = updateState();
  const [est, setEst] = useState<{ speed: number; seconds: number } | null>(null);
  const [inst, setInst] = useState(10);
  const [probeErr, setProbeErr] = useState(false);
  useEffect(() => {
    if (!open || u.busy || u.portable) return;
    setEst(null); setProbeErr(false);
    void installSeconds().then(setInst);
    estimate().then(setEst).catch(() => setProbeErr(true));
  }, [open, u.version]);

  const pct = u.total ? Math.min(100, (u.done / u.total) * 100) : 0;
  const left = u.speed > 0 ? (u.total - u.done) / u.speed + inst : null;
  const step = (n: number, label: string, on: boolean, done: boolean) => (
    <div className={`flex items-center gap-2 text-xs ${on ? "text-foreground font-medium" : done ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
      <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-semibold ${done ? "bg-primary text-primary-foreground" : on ? "bg-primary/20 text-primary ring-1 ring-primary/50" : "bg-secondary"}`}>{n}</span>{label}
    </div>
  );
  const ph = u.phase;

  return (
    <Modal open={open} onClose={onClose} title={u.busy ? "Actualizando ATRIL" : `ATRIL ${u.version ?? ""}`}
      footer={u.portable ? (<>
        <button className="btn-ghost" onClick={onClose}>Cerrar</button>
        <button className="btn-primary" onClick={() => void openUrl(RELEASES_URL)}><ExternalLink size={14} /> Descargar</button>
      </>) : u.busy ? (
        <button className="btn-ghost" onClick={onClose}>Seguir trabajando</button>
      ) : (<>
        <button className="btn-ghost" onClick={onClose}>Ahora no</button>
        <button className="btn-primary" onClick={() => void installUpdate()}>{ph === "error" ? <RotateCcw size={14} /> : <Download size={14} />} {ph === "error" ? "Reintentar" : "Actualizar ahora"}</button>
      </>)}>
      {u.portable ? (
        <p className="text-sm text-muted-foreground">Esta copia es portátil. Descarga la versión {u.version} y reemplaza la carpeta: tus datos se conservan.</p>
      ) : !u.busy ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/80 bg-secondary/40 px-4 py-3">
              <div className="label">Peso</div>
              <div className="text-xl font-bold tabular mt-0.5">{u.size ? mb(u.size) : "—"}</div>
            </div>
            <div className="rounded-xl border border-border/80 bg-secondary/40 px-4 py-3">
              <div className="label">Tiempo estimado</div>
              <div className="text-xl font-bold tabular mt-0.5 flex items-center gap-2">
                {est ? `≈ ${secs(est.seconds)}` : probeErr ? "—" : <><Loader2 size={16} className="animate-spin text-primary" /><span className="text-sm font-medium text-muted-foreground">midiendo…</span></>}
              </div>
              {est && <div className="text-[11px] text-muted-foreground mt-0.5">Tu conexión ahora: {mb(est.speed)}/s</div>}
            </div>
          </div>
          {ph === "error" && u.error && <div className="text-xs text-red-600 dark:text-red-500 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2">{u.error}</div>}
          <div className="text-xs text-muted-foreground flex items-start gap-2"><ShieldCheck size={14} className="text-primary shrink-0 mt-0.5" />Se verifica la huella del instalador con la publicada en GitHub. ATRIL sigue abierta durante la descarga y se reabre sola al terminar. Tus datos y claves se conservan.</div>
          {u.notes && <details className="text-sm"><summary className="cursor-pointer text-primary text-xs font-medium">Novedades</summary><div className="mt-2 max-h-56 overflow-y-auto pr-1"><Markdown text={u.notes.replace(/^# .*\n/, "").replace(/## Descargar[\s\S]*?(?=\n## )/, "")} /></div></details>}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{ph === "download" ? "Descargando" : ph === "verify" ? "Verificando integridad" : "Instalando"}</span>
              <span className="tabular text-muted-foreground">{ph === "download" ? `${mb(u.done)} de ${mb(u.total)}` : ""}</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden mt-2">
              <div className={`h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-300 ${ph !== "download" ? "animate-pulse" : ""}`} style={{ width: `${ph === "download" ? pct : 100}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5 tabular">
              <span>{ph === "download" && u.speed > 0 ? `${mb(u.speed)}/s` : ph === "install" ? "ATRIL se cerrará y se volverá a abrir sola" : ""}</span>
              <span>{ph === "download" && left != null ? `quedan ≈ ${secs(left)}` : ph === "install" ? `≈ ${secs(inst)}` : ""}</span>
            </div>
          </div>
          <div className="flex gap-5">{step(1, "Descarga", ph === "download", ph !== "download")}{step(2, "Verificación", ph === "verify", ph === "install")}{step(3, "Instalación", ph === "install", false)}</div>
        </div>
      )}
    </Modal>
  );
}
