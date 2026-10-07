// Medidores del plan de Claude (ventanas de 5 h y 7 días), siempre visibles.
import { useEffect, useState } from "react";
import { Gauge, RefreshCw } from "lucide-react";
import { useBus } from "../lib/bus";
import { getLimits, fmtReset, pct, type ClaudeLimits } from "../lib/usage";
import { refreshPlanUsage } from "../providers/claude";
import { navigate } from "./nav";

export function useLimits(): ClaudeLimits | null {
  const tick = useBus("usage");
  const [l, setL] = useState<ClaudeLimits | null>(null);
  const [, force] = useState(0);
  useEffect(() => { void getLimits().then(setL); }, [tick]);
  // refresca la cuenta regresiva cada minuto
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 60_000); return () => clearInterval(t); }, []);
  return l;
}

const tone = (u: number) => (u >= 0.9 ? "bg-red-500" : u >= 0.7 ? "bg-amber-500" : "bg-primary");

export function MiniBar({ label, u, resetsAt }: { label: string; u: number | null | undefined; resetsAt?: number }) {
  const v = Math.max(0, Math.min(1, u ?? 0));
  const expired = resetsAt && resetsAt < Date.now();
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${pct(u)} usado · se repone ${fmtReset(resetsAt)}`}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-5">{label}</span>
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full ${tone(v)}`} style={{ width: `${expired ? 0 : v * 100}%` }} /></div>
      <span className="text-[10.5px] tabular w-9 text-right">{expired ? "0 %" : pct(u, 0)}</span>
    </div>
  );
}

/** Indicador compacto para la barra superior. */
export function HeaderUsage() {
  const l = useLimits();
  return (
    <button className="flex flex-col gap-0.5 px-2 py-1 rounded-md hover:bg-accent" onClick={() => navigate({ page: "consumo" })} title="Consumo del plan de Claude">
      {l ? (<>
        <MiniBar label="5h" u={l.fiveHour?.utilization} resetsAt={l.fiveHour?.resetsAt} />
        <MiniBar label="7d" u={l.sevenDay?.utilization} resetsAt={l.sevenDay?.resetsAt} />
      </>) : <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Gauge size={12} /> Plan: —</span>}
    </button>
  );
}

/** Barra grande con cuenta regresiva. */
export function PlanBar({ title, w, est }: { title: string; w: { utilization: number; resetsAt: number } | null | undefined; est?: string }) {
  const expired = !!w && w.resetsAt < Date.now();
  const u = expired ? 0 : w?.utilization ?? 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-2xl font-bold tabular">{w ? pct(u) : "—"}</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden mt-1.5"><div className={`h-full transition-all ${tone(u)}`} style={{ width: `${u * 100}%` }} /></div>
      <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
        <span>{w ? (expired ? "Repuesta" : `Se repone ${fmtReset(w.resetsAt)}`) : "Sin datos"}</span>
        <span>{w && !expired ? `${pct(1 - u, 0)} libre` : ""}</span>
      </div>
      {est && <div className="text-[11px] text-muted-foreground mt-1">{est}</div>}
    </div>
  );
}

export function RefreshUsageButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn-ghost btn-sm" disabled={busy} title="Consulta mínima con Haiku"
      onClick={async () => { setBusy(true); try { await refreshPlanUsage(); } finally { setBusy(false); } }}>
      <RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Actualizar
    </button>
  );
}
