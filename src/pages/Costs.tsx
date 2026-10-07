import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { db } from "../lib/ipc";
import { useBus } from "../lib/bus";
import { getSettings } from "../lib/settings";
import { monthStart, budgetUsd } from "../lib/costs";
import { navigate } from "../ui/nav";
import { PageHeader, Card, Stat, Progress, Empty } from "../ui/kit";
import { fmtUsd, fmtDate } from "../lib/util";

export function Costs({ embedded = true }: { embedded?: boolean } = {}) {
  const tick = useBus("costs");
  const [byProv, setByProv] = useState<any[]>([]);
  const [byVideo, setByVideo] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [month, setMonth] = useState({ usd: 0, equiv: 0 });
  const [months, setMonths] = useState<any[]>([]);
  useEffect(() => { void (async () => {
    const m = monthStart();
    setByProv(await db.query("SELECT provider, SUM(usd) usd, SUM(api_equiv_usd) eq, SUM(units) units, COUNT(*) n FROM costs WHERE created_at>=? GROUP BY provider ORDER BY usd DESC", [m]));
    const t = await db.query<{ usd: number; eq: number }>("SELECT COALESCE(SUM(usd),0) usd, COALESCE(SUM(api_equiv_usd),0) eq FROM costs WHERE created_at>=?", [m]);
    setMonth({ usd: t[0]?.usd ?? 0, equiv: t[0]?.eq ?? 0 });
    setByVideo(await db.query("SELECT v.id, v.title, v.created_at, SUM(c.usd) usd, SUM(c.api_equiv_usd) eq FROM costs c JOIN videos v ON v.id=c.video_id GROUP BY v.id ORDER BY v.created_at DESC LIMIT 60"));
    setRecent(await db.query("SELECT * FROM costs ORDER BY created_at DESC LIMIT 40"));
    setMonths(await db.query("SELECT strftime('%Y-%m', created_at/1000, 'unixepoch', 'localtime') ym, SUM(usd) usd, COUNT(DISTINCT video_id) vids FROM costs GROUP BY ym ORDER BY ym DESC LIMIT 12"));
  })(); }, [tick]);
  const s = getSettings(); const budget = budgetUsd();
  const avg = byVideo.length ? byVideo.reduce((a, v) => a + v.usd, 0) / byVideo.length : 0;
  return (
    <div className="space-y-5">
      {!embedded && <PageHeader title="Costos"
        actions={<button className="btn-ghost" onClick={() => navigate({ page: "ajustes", tab: "budget" })}>Presupuesto y precios</button>} />}
      <div className="grid grid-cols-4 gap-4">
        <Card><Stat label="Este mes" value={fmtUsd(month.usd)} sub={`S/ ${(month.usd * s.budget.penPerUsd).toFixed(2)}`} tone={month.usd > budget ? "red" : undefined} /><Progress className="mt-3" value={(month.usd / Math.max(0.01, budget)) * 100} /></Card>
        <Card><Stat label="Presupuesto" value={fmtUsd(budget)} sub={`S/ ${s.budget.monthlyPen}`} /></Card>
        <Card><Stat label="Costo medio por video" value={fmtUsd(avg)} sub={`${byVideo.length} videos con costo`} /></Card>
        <Card><Stat label="Claude (precio API)" value={fmtUsd(month.equiv)} sub="Lo cubre tu plan" /></Card>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card title="Por servicio (mes)">
          {byProv.length === 0 ? <div className="text-sm text-muted-foreground">Sin gastos este mes.</div> :
            <table className="w-full text-sm"><tbody>{byProv.map((p) => <tr key={p.provider} className="border-b border-border/50"><td className="py-1.5">{p.provider}</td><td className="text-right text-muted-foreground tabular text-xs">{p.n} llamadas</td><td className="text-right tabular font-medium">{fmtUsd(p.usd)}</td></tr>)}</tbody></table>}
        </Card>
        <Card title="Por mes">
          <table className="w-full text-sm"><tbody>{months.map((m) => <tr key={m.ym} className="border-b border-border/50"><td className="py-1.5">{m.ym}</td><td className="text-right text-muted-foreground text-xs">{m.vids} videos</td><td className="text-right tabular font-medium">{fmtUsd(m.usd)}</td></tr>)}</tbody></table>
        </Card>
      </div>
      <Card title="Por video" pad={false}>
        {byVideo.length === 0 ? <Empty icon={Wallet} title="Sin datos" /> :
          <table className="w-full text-sm"><tbody>{byVideo.map((v) => <tr key={v.id} className="border-b border-border/50 hover:bg-accent/40 cursor-pointer" onClick={() => navigate({ page: "video", id: v.id })}><td className="px-4 py-2 truncate max-w-[520px]">{v.title}</td><td className="text-muted-foreground text-xs">{fmtDate(v.created_at)}</td><td className="text-right tabular px-4 font-medium">{fmtUsd(v.usd)}</td></tr>)}</tbody></table>}
      </Card>
      <Card title="Últimos asientos" pad={false}>
        <table className="w-full text-xs"><tbody>{recent.map((r) => <tr key={r.id} className="border-b border-border/50"><td className="px-4 py-1.5 text-muted-foreground">{fmtDate(r.created_at)}</td><td>{r.provider}</td><td className="truncate max-w-[300px]">{r.item}</td><td className="text-right tabular">{r.units ? Math.round(r.units).toLocaleString("es-PE") : ""}</td><td className="text-right tabular px-4">{fmtUsd(r.usd, 3)}</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}
