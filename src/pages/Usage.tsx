// Consumo: plan de Claude (5 h / 7 días, con hora de reposición), tokens y
// porcentaje del plan de cada tarea, cuota gratuita de voz y llamadas a las
// API de medios.
import { useEffect, useState } from "react";
import { Gauge, Bot, Mic, Image as ImageIcon, Info } from "lucide-react";
import { useBus } from "../lib/bus";
import { db } from "../lib/ipc";
import { getSettings } from "../lib/settings";
import { monthUnits } from "../lib/costs";
import { listRuns, calibration, totalInput, fmtK, pct, fmtReset, STAGE_NAMES, API_LIMITS, apiCount, type RunRow, type Calibration } from "../lib/usage";
import { PageHeader, Card, Stat, Progress, Chip, Tabs } from "../ui/kit";
import { PlanBar, RefreshUsageButton, useLimits } from "../ui/Usage";
import { navigate } from "../ui/nav";
import { fmtDate, fmtUsd } from "../lib/util";
import { Costs } from "./Costs";

const DAY = 86_400_000;

export function delta(r: Pick<RunRow, "five_hour" | "five_hour_before" | "seven_day" | "seven_day_before">) {
  const d = (a: number | null, b: number | null) => (a != null && b != null && a >= b ? a - b : null);
  return { d5: d(r.five_hour, r.five_hour_before), d7: d(r.seven_day, r.seven_day_before) };
}

/** Porcentaje del plan de una tarea: medido (Δ de la ventana) y estimado (calibrado por tokens). */
export function RunShare({ r, cal }: { r: RunRow; cal: Calibration | null }) {
  const { d5, d7 } = delta(r);
  const e5 = cal?.per5h != null ? r.api_equiv * cal.per5h : null;
  const e7 = cal?.per7d != null ? r.api_equiv * cal.per7d : null;
  return (
    <span className="tabular text-xs" title="Medido: diferencia de la utilización oficial antes y después de la tarea (incluye cualquier otro uso simultáneo del plan). Estimado: según los tokens de la tarea y tu historial.">
      {e5 != null ? `≈${pct(e5, 2)}` : d5 != null ? pct(d5, 0) : "—"} <span className="text-muted-foreground">/ 5 h</span>
      {" · "}{e7 != null ? `≈${pct(e7, 2)}` : d7 != null ? pct(d7, 0) : "—"} <span className="text-muted-foreground">/ 7 d</span>
    </span>
  );
}

export function UsagePage() {
  const tick = useBus("usage", "costs");
  const limits = useLimits();
  const [tab, setTab] = useState<"claude" | "otros" | "costos">("claude");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [cal, setCal] = useState<Calibration | null>(null);
  const [byStage, setByStage] = useState<any[]>([]);
  const [byVideo, setByVideo] = useState<any[]>([]);
  const [tts, setTts] = useState(0);
  const [apis, setApis] = useState<Record<string, Record<string, number>>>({});
  const [paid, setPaid] = useState<any[]>([]);

  useEffect(() => { void (async () => {
    setRuns(await listRuns({ limit: 120 }));
    setCal(await calibration());
    setByStage(await db.query(`SELECT stage, COUNT(*) n, SUM(input_tokens+cache_read+cache_write) inp, SUM(cache_read) cr, SUM(output_tokens) outp, SUM(web_searches) ws, SUM(api_equiv) eq
      FROM claude_runs WHERE ts>=? GROUP BY stage ORDER BY eq DESC`, [Date.now() - 7 * DAY]));
    setByVideo(await db.query(`SELECT r.video_id, v.title, COUNT(*) n, SUM(r.input_tokens+r.cache_read+r.cache_write) inp, SUM(r.output_tokens) outp, SUM(r.api_equiv) eq, MAX(r.ts) last
      FROM claude_runs r LEFT JOIN videos v ON v.id=r.video_id WHERE r.video_id IS NOT NULL GROUP BY r.video_id ORDER BY last DESC LIMIT 20`));
    setTts(await monthUnits("google-tts", "caracteres"));
    const a: Record<string, Record<string, number>> = {};
    for (const p of Object.keys(API_LIMITS)) a[p] = { min: await apiCount(p, 60_000), hour: await apiCount(p, 3_600_000), day: await apiCount(p, DAY), month: await apiCount(p, 30 * DAY) };
    setApis(a);
    setPaid(await db.query("SELECT provider, SUM(usd) usd, SUM(units) units, COUNT(*) n FROM costs WHERE usd>0 AND created_at>=? GROUP BY provider", [new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()]));
  })(); }, [tick]);

  const s = getSettings();
  const free = s.tts.google.freeCharsPerMonth;
  const perVideo = byVideo.length ? byVideo.reduce((x, v) => x + v.eq, 0) / byVideo.length : 0;
  const est5 = cal?.per5h != null && perVideo ? `Un video completo usa ≈ ${pct(perVideo * cal.per5h, 1)} de esta ventana (estimado con tu historial).` : undefined;
  const est7 = cal?.per7d != null && perVideo ? `Un video completo usa ≈ ${pct(perVideo * cal.per7d, 1)} de la semana.` : undefined;

  return (
    <div className="space-y-5">
      <PageHeader kicker="Control" title="Consumo" subtitle="Lo que gasta cada tarea de tu plan de Claude y de las cuotas gratuitas, y cuándo se repone."
        actions={<RefreshUsageButton />} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "claude", label: "Plan de Claude", icon: Bot }, { id: "otros", label: "Voz y API de medios", icon: Mic }, { id: "costos", label: "Gastos en dinero", icon: Gauge }]} />

      {tab === "claude" && (<>
        <div className="grid grid-cols-2 gap-4">
          <Card><PlanBar title="Ventana de 5 horas" w={limits?.fiveHour} est={est5} /></Card>
          <Card><PlanBar title="Límite semanal (7 días)" w={limits?.sevenDay} est={est7} /></Card>
        </div>
        {limits && Object.keys(limits.extra ?? {}).length > 0 && (
          <div className="grid grid-cols-3 gap-4">{Object.entries(limits.extra!).map(([k, w]) => <Card key={k}><PlanBar title={k.replace(/_/g, " ")} w={w} /></Card>)}</div>
        )}
        <div className="card p-3 text-xs text-muted-foreground flex gap-2">
          <Info size={14} className="shrink-0 mt-0.5 text-primary" />
          <div>
            Datos oficiales: cada vez que ATRIL usa Claude Code, el propio CLI informa la utilización de tus ventanas (evento <code>rate_limit_event</code>). Última lectura: {limits ? fmtDate(limits.updatedAt) : "—"}{limits?.status ? ` · estado «${limits.status}»` : ""}.
            El % de cada tarea se mide como la diferencia antes/después (con la resolución que da Claude) y, cuando hay historial suficiente ({cal?.samples ?? 0} tareas medidas), se estima con precisión según sus tokens. Los tokens leídos de caché pesan mucho menos que los nuevos. El uso que hagas de Claude fuera de ATRIL (chat, Claude Code) comparte las mismas ventanas.
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card title="Por etapa (últimos 7 días)">
            <table className="w-full text-xs">
              <thead><tr className="text-muted-foreground text-left"><th className="py-1">Etapa</th><th className="text-right">Tareas</th><th className="text-right">Entrada</th><th className="text-right">Salida</th><th className="text-right">≈ % 5 h</th></tr></thead>
              <tbody>{byStage.map((r) => (
                <tr key={r.stage} className="border-t border-border/50"><td className="py-1.5">{STAGE_NAMES[r.stage] ?? r.stage}</td><td className="text-right tabular">{r.n}</td>
                  <td className="text-right tabular" title={`${fmtK(r.cr)} desde caché`}>{fmtK(r.inp)}</td><td className="text-right tabular">{fmtK(r.outp)}</td>
                  <td className="text-right tabular">{cal?.per5h != null ? pct(r.eq * cal.per5h, 1) : "—"}</td></tr>))}</tbody>
            </table>
          </Card>
          <Card title="Por video">
            <table className="w-full text-xs"><tbody>{byVideo.map((v) => (
              <tr key={v.video_id} className="border-t border-border/50 hover:bg-accent/40 cursor-pointer" onClick={() => navigate({ page: "video", id: v.video_id })}>
                <td className="py-1.5 truncate max-w-[260px]">{v.title ?? v.video_id}</td><td className="text-right tabular">{v.n} tareas</td>
                <td className="text-right tabular">{fmtK(v.inp)} / {fmtK(v.outp)}</td>
                <td className="text-right tabular">{cal?.per7d != null ? `≈${pct(v.eq * cal.per7d, 1)} sem.` : fmtUsd(v.eq)}</td></tr>))}</tbody></table>
          </Card>
        </div>
        <Card title="Cada tarea de Claude" pad={false}>
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground text-left border-b border-border"><th className="px-4 py-2">Cuándo</th><th>Tarea</th><th>Modelo</th><th className="text-right">Entrada (caché)</th><th className="text-right">Salida</th><th className="text-right">Búsq.</th><th className="text-right">Duración</th><th className="text-right px-4">Plan</th></tr></thead>
            <tbody>{runs.map((r) => (
              <tr key={r.id} className="border-b border-border/50">
                <td className="px-4 py-1.5 text-muted-foreground whitespace-nowrap">{fmtDate(r.ts)}</td>
                <td className="truncate max-w-[260px]">{!r.ok && <Chip tone="red">falló</Chip>} {r.label} <span className="text-muted-foreground">· {STAGE_NAMES[r.stage] ?? r.stage}</span></td>
                <td className="text-muted-foreground">{r.model.replace(/^claude-/, "").replace(/-\d{8}$/, "")}</td>
                <td className="text-right tabular">{fmtK(totalInput(r))} <span className="text-muted-foreground">({fmtK(r.cache_read)})</span></td>
                <td className="text-right tabular">{fmtK(r.output_tokens)}</td>
                <td className="text-right tabular">{r.web_searches || ""}</td>
                <td className="text-right tabular">{Math.round(r.duration_ms / 1000)} s</td>
                <td className="text-right px-4 whitespace-nowrap"><RunShare r={r} cal={cal} /></td>
              </tr>))}</tbody>
          </table>
        </Card>
      </>)}

      {tab === "otros" && (<>
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <Stat label="Google TTS · este mes" value={`${fmtK(tts)} / ${fmtK(free)}`} sub={`caracteres gratis (${s.tts.google.voice.split("-").slice(2).join("-")}) · se repone el día 1`} tone={tts > free ? "red" : tts > free * 0.8 ? "amber" : undefined} />
            <Progress className="mt-3" value={(tts / Math.max(1, free)) * 100} />
            <div className="text-[11px] text-muted-foreground mt-2">≈ {Math.max(0, Math.floor((free - tts) / 11000))} videos más sin costo (≈11 000 caracteres por video de 12 min). Después: {fmtUsd(s.tts.google.priceUsdPerMChars)} por millón.</div>
          </Card>
          <Card title="Gastos en dinero este mes">
            {paid.length === 0 ? <div className="text-sm text-muted-foreground">Nada: todo lo usado fue gratuito o del plan.</div> :
              <table className="w-full text-xs"><tbody>{paid.map((p) => <tr key={p.provider} className="border-t border-border/50"><td className="py-1">{p.provider}</td><td className="text-right tabular">{p.n}×</td><td className="text-right tabular font-medium">{fmtUsd(p.usd, 3)}</td></tr>)}</tbody></table>}
          </Card>
          <Card><Stat label="Reposición de la voz" value={fmtReset(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime())} sub="La cuota gratuita de Google es mensual" /></Card>
        </div>
        <Card title="API de medios libres (llamadas y límites oficiales)" icon={ImageIcon} pad={false}>
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground text-left border-b border-border"><th className="px-4 py-2">Fuente</th><th className="text-right">Último minuto</th><th className="text-right">Última hora</th><th className="text-right">Últimas 24 h</th><th className="text-right px-4">Últimos 30 días</th></tr></thead>
            <tbody>{Object.entries(API_LIMITS).map(([k, lim]) => {
              const c = apis[k] ?? {};
              const cell = (n: number | undefined, max?: number) => <span className={max && (n ?? 0) > max * 0.8 ? "text-amber-500 font-semibold" : ""}>{n ?? 0}{max ? ` / ${max}` : ""}</span>;
              return (<tr key={k} className="border-b border-border/50"><td className="px-4 py-1.5">{lim.label}</td><td className="text-right tabular">{cell(c.min, lim.perMinute)}</td><td className="text-right tabular">{cell(c.hour, lim.perHour)}</td><td className="text-right tabular">{cell(c.day, lim.perDay)}</td><td className="text-right tabular px-4">{cell(c.month, lim.perMonth)}</td></tr>);
            })}</tbody>
          </table>
          <div className="px-4 py-2 text-[11px] text-muted-foreground">ATRIL deja de llamar a una fuente al llegar al 90 % de su límite y usa las demás o la biblioteca. Openverse sin registrar tiene un límite muy bajo: regístralo en Ajustes → Medios.</div>
        </Card>
      </>)}

      {tab === "costos" && <Costs />}
    </div>
  );
}
