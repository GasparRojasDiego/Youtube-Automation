import { useEffect, useState } from "react";
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";
import { onToast, type Toast } from "../lib/events";

const ICON = { success: CheckCircle2, warn: AlertTriangle, error: XCircle, info: Info };
const TONE = { success: "text-green-700 dark:text-green-500", warn: "text-amber-700 dark:text-amber-500", error: "text-red-600 dark:text-red-500", info: "text-primary" };

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => onToast((t) => {
    setItems((x) => [...x.slice(-3), t]);
    setTimeout(() => setItems((x) => x.filter((y) => y.id !== t.id)), t.level === "error" ? 12000 : 6000);
  }), []);
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[380px]">
      {items.map((t) => {
        const I = ICON[t.level];
        return (
          <div key={t.id} className="card shadow-xl p-3 flex gap-3 animate-fade-up">
            <I size={18} className={`${TONE[t.level]} shrink-0 mt-0.5`} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-snug">{t.title}</div>
              {t.detail && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-3 whitespace-pre-line">{t.detail}</div>}
              {t.action && <button className="btn-brand btn-sm mt-2" onClick={t.action.run}>{t.action.label}</button>}
            </div>
            <button className="btn-ghost btn-sm h-6 px-1" onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))} aria-label="Cerrar"><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
