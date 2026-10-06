import { useEffect, useState } from "react";
import { BarChart3, RefreshCw, Wand2, Check, X, ChevronDown } from "lucide-react";
import { useBus } from "../lib/bus";
import { activeChannel, type Channel } from "../lib/repo";
import { syncMetrics, metricsTable, proposeImprovements, listProposals, resolveProposal } from "../pipeline/extras";
import { listSkills } from "../lib/skills";
import { PageHeader, Card, Empty, Chip, AsyncButton } from "../ui/kit";
import { lineDiff, safeJson, fmtDuration, fmtDate } from "../lib/util";
import { toast, logError } from "../lib/events";

function Sparkline({ curve }: { curve: { t: number; watch: number }[] }) {
  if (!curve.length) return <span className="text-[11px] text-muted-foreground">—</span>;
  const W = 120, H = 30; const max = Math.max(1, ...curve.map((c) => c.watch));
  const d = curve.map((c, i) => `${i ? "L" : "M"}${(c.t * W).toFixed(1)},${(H - (c.watch / max) * H).toFixed(1)}`).join(" ");
  return <svg width={W} height={H} className="text-primary"><path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} /></svg>;
}

export function Metrics() {
  const tick = useBus("metrics", "channels", "settings", "skills");
  const [ch, setCh] = useState<Channel | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [props, setProps] = useState<any[]>([]);
  const [skills, setSkills] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { void (async () => {
    const c = await activeChannel(); setCh(c); if (!c) return;
    setRows(await metricsTable(c.id)); setProps(await listProposals(c.id));
    setSkills(Object.fromEntries((await listSkills(c.id)).map((s) => [s.id, s.content])));
  })(); }, [tick]);
  if (!ch) return null;

  return (
    <div className="space-y-5">
      <PageHeader kicker="Ciclo de mejora" title="Métricas del canal" subtitle="Retención y CTR de tus propios videos (solo tú los ves). Los cambios al manual se aplican solo si los apruebas."
        actions={<>
          <AsyncButton className="btn-brand" onClick={async () => { try { const r = await syncMetrics(ch.id); toast("success", `Métricas de ${r.videos} videos actualizadas`, r.reach ? `CTR disponible en ${r.reach}` : "CTR aún sin informes (tardan ~48 h)"); } catch (e) { await logError(e, null, "Métricas"); } }}><RefreshCw size={15} /> Actualizar</AsyncButton>
          <AsyncButton className="btn-primary" onClick={async () => { try { const r = await proposeImprovements(ch.id); toast("success", `${r.count} propuestas`, r.summary); } catch (e) { await logError(e, null, "Propuestas"); } }}><Wand2 size={15} /> Proponer mejoras</AsyncButton>
        </>} />
      <Card pad={false}>
        {rows.length === 0 ? <Empty icon={BarChart3} title="Aún no hay videos publicados" /> : (
          <table className="w-full text-sm">
            <thead><tr className="label text-left border-b border-border">
              <th className="px-4 py-2.5 font-medium">Video</th><th className="text-right font-medium">Vistas</th><th className="text-right font-medium">Duración media</th>
              <th className="text-right font-medium">% visto</th><th className="text-right font-medium">Impresiones</th><th className="text-right font-medium">CTR</th><th className="px-4 font-medium">Retención</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="px-4 py-2.5"><div className="truncate max-w-[340px] font-medium">{r.title}</div><div className="text-[11px] text-muted-foreground">{fmtDate(r.created_at, false)}{r.mode === "premium" ? " · premium" : ""}</div></td>
                  <td className="text-right tabular">{r.views?.toLocaleString("es-PE") ?? "—"}</td>
                  <td className="text-right tabular">{r.avg_view_s ? fmtDuration(r.avg_view_s) : "—"}</td>
                  <td className="text-right tabular">{r.avg_pct != null ? `${r.avg_pct.toFixed(0)} %` : "—"}</td>
                  <td className="text-right tabular">{r.impressions?.toLocaleString("es-PE") ?? "—"}</td>
                  <td className="text-right tabular">{r.ctr != null ? `${(r.ctr * (r.ctr < 1 ? 100 : 1)).toFixed(1)} %` : "—"}</td>
                  <td className="px-4"><Sparkline curve={safeJson(r.curve, [])} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Propuestas de cambio a las habilidades" icon={Wand2}>
        {props.length === 0 ? <div className="text-sm text-muted-foreground">Con al menos 3 videos con métricas, pulsa «Proponer mejoras».</div> : (
          <div className="space-y-2">
            {props.map((p) => (
              <div key={p.id} className="rounded-lg border border-border">
                <div className="flex items-center gap-3 p-3">
                  <button className="btn-ghost btn-sm" onClick={() => setOpen(open === p.id ? null : p.id)}><ChevronDown size={14} className={open === p.id ? "rotate-180" : ""} /></button>
                  <div className="min-w-0 flex-1"><div className="font-medium text-sm">{p.title}</div><div className="text-[11px] text-muted-foreground">{p.skill_name} · {p.rationale}</div></div>
                  {p.status === "pending" ? <>
                    <AsyncButton className="btn-primary btn-sm" onClick={() => resolveProposal(p.id, true)}><Check size={13} /> Aplicar</AsyncButton>
                    <AsyncButton className="btn-ghost btn-sm" onClick={() => resolveProposal(p.id, false)}><X size={13} /></AsyncButton>
                  </> : <Chip tone={p.status === "accepted" ? "green" : "muted"}>{p.status === "accepted" ? "aplicada" : "descartada"}</Chip>}
                </div>
                {open === p.id && (
                  <pre className="text-[11.5px] font-mono max-h-80 overflow-auto bg-secondary/60 p-3 rounded-b-lg">
                    {lineDiff(skills[p.skill_id] ?? "", p.new_content).map((d, i) => <div key={i} className={d.type === "add" ? "text-green-500" : d.type === "del" ? "text-red-500 line-through" : "text-muted-foreground"}>{d.type === "add" ? "+ " : d.type === "del" ? "- " : "  "}{d.text}</div>)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
