import { useEffect, useState } from "react";
import { X, CheckCheck, AlertTriangle, XCircle, Info, CheckCircle2 } from "lucide-react";
import { db } from "../lib/ipc";
import { useBus } from "../lib/bus";
import { markAllRead } from "../lib/events";
import { fmtDate } from "../lib/util";
import { navigate } from "../ui/nav";

const ICON: Record<string, { i: typeof Info; c: string }> = {
  error: { i: XCircle, c: "bg-red-500/15 text-red-500" }, warn: { i: AlertTriangle, c: "bg-amber-500/15 text-amber-500" },
  success: { i: CheckCircle2, c: "bg-green-500/15 text-green-500" }, info: { i: Info, c: "bg-primary/15 text-primary" },
};

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const tick = useBus("events");
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void db.query("SELECT * FROM events WHERE level!='info' OR read=0 ORDER BY ts DESC LIMIT 60").then(setRows); }, [tick]);
  return (
    <div className="fixed inset-0 z-40" onMouseDown={onClose}>
      <div className="absolute right-4 top-16 w-[420px] max-h-[75vh] card shadow-2xl flex flex-col animate-fade-up" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold text-primary">Avisos</div>
          <div className="flex gap-1">
            <button className="btn-ghost btn-sm" onClick={() => void markAllRead()}><CheckCheck size={14} /> Marcar leídos</button>
            <button className="btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
          </div>
        </div>
        <div className="overflow-y-auto divide-y divide-border">
          {rows.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">Estás al día.</div>}
          {rows.map((r) => {
            const k = ICON[r.level] ?? ICON.info; const I = k.i;
            return (
              <button key={r.id} className={`w-full text-left flex gap-3 px-4 py-3 hover:bg-accent/50 ${r.read ? "opacity-70" : ""}`}
                onClick={() => { if (r.video_id) { navigate({ page: "video", id: r.video_id }); onClose(); } }}>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${k.c}`}><I size={14} /></span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold leading-snug">{r.message}</div>
                  {r.detail && <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-line">{r.detail}</div>}
                  <div className="text-[10px] text-muted-foreground mt-1">{fmtDate(r.ts)} · {r.source}</div>
                </div>
              </button>
            );
          })}
        </div>
        <button className="text-xs text-primary py-2 border-t border-border hover:bg-accent/40" onClick={() => { navigate({ page: "diagnostico" }); onClose(); }}>Ver registro completo</button>
      </div>
    </div>
  );
}
