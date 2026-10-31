// Componentes base con la identidad visual de VT Asvent.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, type LucideIcon } from "lucide-react";
import { getSettings } from "../lib/settings";
import { fileUrl } from "../lib/ipc";

export function PageHeader({ kicker, title, subtitle, actions }: { kicker?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="relative flex items-end justify-between gap-4 mb-7">
      <div className="relative min-w-0">
        {kicker && <div className="kicker mb-1.5">{kicker}</div>}
        <h1 className="text-[26px] leading-tight font-bold truncate">{title}</h1>
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
        <>
          <header className="flex items-center justify-between gap-3 px-5 pt-4">
            <div className="flex items-center gap-2.5 min-w-0">
              {Icon && <span className="icon-box w-8 h-8"><Icon size={15} /></span>}
              {title && <h2 className="font-semibold text-[15px] truncate">{title}</h2>}
            </div>
            {actions && <div className="flex items-center gap-1.5">{actions}</div>}
          </header>
          {/* Divisoria fina con aire a los lados, como en Frame y Wire */}
          <div className="mx-5 mt-3.5 h-px bg-border" />
        </>
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
      <span className={`relative w-9 h-5 rounded-full border transition-colors duration-200 ${checked ? "bg-primary border-primary" : "bg-accent border-border"}`}>
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
      <span className="icon-box w-12 h-12 mb-4"><Icon size={22} /></span>
      <div className="font-semibold">{title}</div>
      {children && <div className="text-sm text-muted-foreground mt-1.5 max-w-md leading-relaxed">{children}</div>}
    </div>
  );
}

export function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 rounded-full bg-accent overflow-hidden ${className}`}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-frame" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "primary" | "green" | "amber" | "red" }) {
  const cls = { muted: "text-muted-foreground border-border", primary: "text-primary border-primary/40 bg-primary/10", green: "text-green-700 dark:text-green-500 border-green-500/40 bg-green-500/10", amber: "text-amber-700 dark:text-amber-500 border-amber-500/50 bg-amber-500/10", red: "text-red-600 dark:text-red-500 border-red-500/50 bg-red-500/10" }[tone];
  return <span className={`chip ${cls}`}>{children}</span>;
}

/** Eco de palabras (Frame y Wire): la primera palabra del título en dos filas escalonadas, quieta y casi transparente. Solo en emergentes. */
export function Echo({ word }: { word: string }) {
  const w = word.trim().split(/\s+/)[0]?.replace(/[«»"¿?¡!:.,]/g, "") ?? "";
  if (!w) return null;
  const row = Array.from({ length: 10 }, (_, i) => <span key={i}>{w}</span>);
  return <div className="echo" aria-hidden><div>{row}</div><div>{row}</div></div>;
}

// Modales abiertos, en orden: Escape cierra solo el de arriba (p. ej., el selector de voz y no la tarjeta debajo)
const modalStack: number[] = [];
let modalSeq = 0;

export function Modal({ open, onClose, title, children, wide = false, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const [id] = useState(() => ++modalSeq);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    modalStack.push(id);
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && modalStack[modalStack.length - 1] === id) close.current(); };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); const i = modalStack.lastIndexOf(id); if (i >= 0) modalStack.splice(i, 1); };
  }, [open, id]);
  if (!open) return null;
  // Portal: los modales no dependen del contenedor (tarjetas con desenfoque crean otro contexto)
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 animate-fade-in" onMouseDown={onClose}>
      <div role="dialog" aria-modal aria-label={title} className={`relative w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[88vh] flex flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-2xl animate-pop-in`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative shrink-0 min-h-[68px] px-14 pt-5 text-center">
          <Echo word={title} />
          <h3 className="relative text-lg font-bold text-primary leading-snug">{title}</h3>
          <button className="btn-ghost btn-sm absolute right-3 top-3.5 w-8 px-0" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="mx-6 mt-3 h-px bg-border shrink-0" />
        <div className="relative px-6 pt-4 pb-5 overflow-y-auto">{children}</div>
        {footer && <div className="relative shrink-0 px-6 pb-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Botón que muestra carga mientras su acción asíncrona corre. */
export function AsyncButton({ onClick, children, className = "btn-brand", disabled, title }: { onClick: () => Promise<unknown> | unknown; children: ReactNode; className?: string; disabled?: boolean; title?: string }) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  // En desarrollo, StrictMode monta, desmonta y vuelve a montar: la marca se repone al montar
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
    <div className="inline-flex flex-wrap gap-0.5 p-[3px] rounded-lg bg-secondary/70 border border-border">
      {tabs.map((t) => {
        const I = t.icon; const on = value === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs transition-colors duration-200 ease-frame ${on ? "bg-card text-foreground font-semibold shadow-sm ring-1 ring-border" : "text-muted-foreground font-medium hover:text-foreground"}`}>
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
      <div className={`text-[26px] leading-tight font-semibold tabular mt-1 ${c}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

/** Foto de perfil (o iniciales sobre el color de la marca). */
export function Avatar({ size = 32, className = "" }: { size?: number; className?: string }) {
  const p = getSettings().profile;
  const initials = (p.name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return p.avatar
    ? <img src={fileUrl(p.avatar.split("?")[0], p.avatar.split("?")[1])} alt="" style={{ width: size, height: size }} className={`rounded-full object-cover ring-1 ring-border shrink-0 ${className}`} />
    : <span style={{ width: size, height: size, fontSize: size * 0.38 }} className={`rounded-full grid place-items-center font-semibold text-white shrink-0 bg-primary-strong ${className}`}>{initials}</span>;
}
