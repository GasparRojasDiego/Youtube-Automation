// Componentes base con la identidad visual de VT Asvent.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Check, AlertTriangle, CircleDashed, Clock, Eye, Ban, type LucideIcon } from "lucide-react";
import type { StageStatus } from "../lib/repo";
import { Scramble, EchoWord } from "./Constellation";

export function PageHeader({ kicker, title, subtitle, actions, echo }: { kicker?: string; title: string; subtitle?: ReactNode; actions?: ReactNode; echo?: string | false }) {
  return (
    <div className="relative flex items-end justify-between gap-4 mb-7 pt-2">
      {echo !== false && <EchoWord word={echo || title} className="-top-3 opacity-90 [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_70%,transparent)]" />}
      <div className="relative min-w-0">
        {kicker && <div className="kicker mb-1.5">{kicker}</div>}
        <h1 className="text-[28px] leading-tight font-bold tracking-tight truncate"><Scramble text={title} /></h1>
        {subtitle && <div className="text-sm text-muted-foreground mt-1.5">{subtitle}</div>}
      </div>
      {actions && <div className="relative flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({ title, icon: Icon, actions, children, className = "", pad = true }: { title?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && <span className="icon-box w-8 h-8"><Icon size={15} /></span>}
            {title && <h2 className="font-semibold text-[13.5px] tracking-tight truncate">{title}</h2>}
          </div>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground leading-snug">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm">
      <span className={`relative w-9 h-5 rounded-full border transition-colors duration-200 ${checked ? "bg-primary border-primary shadow-[0_0_12px_-2px_hsl(var(--primary)/.7)]" : "bg-secondary border-border"}`}>
        <span className={`absolute left-0 top-[1px] w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ease-frame ${checked ? "translate-x-[17px]" : "translate-x-[1px]"}`} />
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <span className="relative mb-4">
        <span className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl" />
        <span className="icon-box relative w-12 h-12 rounded-2xl"><Icon size={22} /></span>
      </span>
      <div className="font-semibold tracking-tight">{title}</div>
      {children && <div className="text-sm text-muted-foreground mt-1.5 max-w-md leading-relaxed">{children}</div>}
    </div>
  );
}

export function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 rounded-full bg-secondary overflow-hidden ${className}`}>
      <div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary shadow-[0_0_10px_hsl(var(--primary)/.6)] transition-[width] duration-500 ease-frame" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

const STATUS: Record<StageStatus, { label: string; cls: string; icon: LucideIcon }> = {
  pending: { label: "Pendiente", cls: "text-muted-foreground border-border", icon: CircleDashed },
  running: { label: "En curso", cls: "text-primary border-primary/40 bg-primary/10", icon: Loader2 },
  done: { label: "Hecho", cls: "text-green-700 dark:text-green-500 border-green-500/40 bg-green-500/10", icon: Check },
  approved: { label: "Aprobado", cls: "text-green-700 dark:text-green-500 border-green-500/40 bg-green-500/10", icon: Check },
  review: { label: "Te espera", cls: "text-amber-700 dark:text-amber-500 border-amber-500/50 bg-amber-500/10", icon: Eye },
  failed: { label: "Falló", cls: "text-red-600 dark:text-red-500 border-red-500/50 bg-red-500/10", icon: AlertTriangle },
  skipped: { label: "Omitido", cls: "text-muted-foreground border-border", icon: Ban },
};

export function StatusChip({ status }: { status: StageStatus }) {
  const s = STATUS[status] ?? STATUS.pending; const I = s.icon;
  return <span className={`chip ${s.cls}`}><I size={11} className={status === "running" ? "animate-spin" : ""} />{s.label}</span>;
}

export function StatusIcon({ status, size = 14 }: { status: StageStatus; size?: number }) {
  const s = STATUS[status] ?? STATUS.pending; const I = s.icon;
  return <I size={size} className={`${s.cls.split(" ").filter((c) => c.startsWith("text-") || c.startsWith("dark:text-")).join(" ")} ${status === "running" ? "animate-spin" : ""}`} />;
}

export function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "primary" | "green" | "amber" | "red" }) {
  const cls = { muted: "text-muted-foreground border-border", primary: "text-primary border-primary/40 bg-primary/10", green: "text-green-700 dark:text-green-500 border-green-500/40 bg-green-500/10", amber: "text-amber-700 dark:text-amber-500 border-amber-500/50 bg-amber-500/10", red: "text-red-600 dark:text-red-500 border-red-500/50 bg-red-500/10" }[tone];
  return <span className={`chip ${cls}`}>{children}</span>;
}

export function Modal({ open, onClose, title, echo, children, wide = false, footer }: { open: boolean; onClose: () => void; title: string; echo?: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  // Portal: los modales no dependen del contenedor (tarjetas con desenfoque crean otro contexto)
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-6 animate-fade-up" onMouseDown={onClose}>
      <div className={`relative card bg-card w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-pop-in`} onMouseDown={(e) => e.stopPropagation()}>
        {echo && <EchoWord word={echo} className="top-1 opacity-70" />}
        <div className="relative px-6 pt-5 pb-3">
          <h3 className="text-lg font-bold tracking-tight">{title}</h3>
          <button className="btn-ghost btn-sm absolute right-3 top-3.5" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="relative px-6 pb-5 overflow-y-auto">{children}</div>
        {footer && <div className="relative px-6 py-3 border-t border-border/80 bg-secondary/30 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Botón que muestra carga mientras su acción asíncrona corre. */
export function AsyncButton({ onClick, children, className = "btn-brand", disabled, title }: { onClick: () => Promise<unknown> | unknown; children: ReactNode; className?: string; disabled?: boolean; title?: string }) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  return (
    <button className={className} disabled={disabled || busy} title={title}
      onClick={async () => { setBusy(true); try { await onClick(); } finally { if (mounted.current) setBusy(false); } }}>
      {busy && <Spinner size={14} />}{children}
    </button>
  );
}

/** Control segmentado: el activo se eleva sobre un riel. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: LucideIcon }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-secondary/60 border border-border/70">
      {tabs.map((t) => {
        const I = t.icon; const on = value === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all duration-200 ease-frame ${on ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>
            {I && <I size={14} className={on ? "text-primary" : ""} />}{t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Markdown mínimo y seguro (títulos, listas, negritas, código, citas). */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s).replace(/`([^`]+)`/g, '<code class="font-mono text-[12px] bg-secondary px-1 rounded">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const html: string[] = []; let inCode = false; let list = false;
  for (const raw of text.split("\n")) {
    if (raw.trim().startsWith("```")) { if (list) { html.push("</ul>"); list = false; } html.push(inCode ? "</pre>" : '<pre class="font-mono text-[12px] bg-secondary rounded-md p-3 overflow-x-auto my-2">'); inCode = !inCode; continue; }
    if (inCode) { html.push(esc(raw) + "\n"); continue; }
    const li = raw.match(/^\s*[-*]\s+(.*)$/) ?? raw.match(/^\s*\d+[.)]\s+(.*)$/);
    if (li) { if (!list) { html.push('<ul class="list-disc pl-5 space-y-0.5 my-1">'); list = true; } html.push(`<li>${inline(li[1])}</li>`); continue; }
    if (list) { html.push("</ul>"); list = false; }
    const h = raw.match(/^(#{1,4})\s+(.*)$/);
    if (h) { const lvl = h[1].length; html.push(`<div class="${lvl <= 2 ? "text-base font-bold text-primary mt-3" : "font-semibold mt-2"}">${inline(h[2])}</div>`); continue; }
    if (raw.startsWith(">")) { html.push(`<div class="border-l-2 border-primary/50 pl-3 text-muted-foreground italic">${inline(raw.replace(/^>\s?/, ""))}</div>`); continue; }
    html.push(raw.trim() ? `<p class="my-1">${inline(raw)}</p>` : "");
  }
  if (list) html.push("</ul>");
  if (inCode) html.push("</pre>");
  return <div className={`text-sm leading-relaxed ${className}`} dangerouslySetInnerHTML={{ __html: html.join("") }} />;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "amber" | "red" | "green" }) {
  const c = tone === "red" ? "text-red-600 dark:text-red-500" : tone === "amber" ? "text-amber-700 dark:text-amber-500" : tone === "green" ? "text-green-700 dark:text-green-500" : "text-foreground";
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`text-[26px] leading-tight font-bold tracking-tight tabular mt-1 ${c}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export function ReviewTimer({ onTick }: { onTick?: (s: number) => void }) {
  // Cuenta solo el tiempo con la ventana visible
  const [s, setS] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") setS((x) => { onTick?.(x + 1); return x + 1; }); }, 1000);
    return () => clearInterval(id);
  }, [onTick]);
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular"><Clock size={12} />{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}
