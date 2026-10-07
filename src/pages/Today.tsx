import { useEffect, useState } from "react";
import { Play, Lightbulb, ArrowRight, Clapperboard, Mic } from "lucide-react";
import { useBus } from "../lib/bus";
import { db } from "../lib/ipc";
import { activeChannel, getStages, listTopics, reviewSecondsSince, type Channel, type StageRow, type Video, type Topic } from "../lib/repo";
import { getSettings } from "../lib/settings";
import { monthSpendUsd, budgetUsd } from "../lib/costs";
import { startNextVideo, activeVideos, runVideo, isQueued } from "../pipeline/runner";
import { navigate } from "../ui/nav";
import { PageHeader, Card, Stat, Progress, Empty, Chip } from "../ui/kit";
import { Stepper, awaiting } from "../ui/Stepper";
import { fmtUsd } from "../lib/util";

export function Today() {
  const tick = useBus("videos", "stages", "topics", "costs", "channels", "settings", "jobs");
  const [ch, setCh] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<{ v: Video; stages: StageRow[] }[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [spend, setSpend] = useState(0);
  const [reviewSec, setReviewSec] = useState(0);
  const [published, setPublished] = useState(0);
  const [mode, setMode] = useState<"standard" | "premium">("standard");
  const [voiceMode, setVoiceMode] = useState<"ai" | "own">("ai");

  useEffect(() => {
    void (async () => {
      const c = await activeChannel(); setCh(c);
      if (!c) return;
      const act = await activeVideos(c.id);
      setVideos(await Promise.all(act.map(async (v) => ({ v, stages: await getStages(v.id) }))));
      setTopics(await listTopics(c.id, "approved"));
      setSpend(await monthSpendUsd());
      const d = new Date(); d.setHours(0, 0, 0, 0);
      setReviewSec(await reviewSecondsSince(d.getTime()));
      setPublished((await db.query<{ n: number }>("SELECT COUNT(*) n FROM videos WHERE channel_id=? AND status IN ('published','scheduled') AND created_at>=?", [c.id, Date.now() - 30 * 86400000]))[0]?.n ?? 0);
    })();
  }, [tick]);

  const s = getSettings();
  const budget = budgetUsd();
  const goal = s.review.dailyMinutesGoal * 60;
  const today = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

  if (!ch) return <Empty icon={Clapperboard} title="Sin canal">Créalo en Ajustes → Canal.</Empty>;

  return (
    <div className="space-y-6">
      <PageHeader kicker={today} title={ch.name} />

      <div className="grid grid-cols-4 gap-4">
        <Card><Stat label="Revisión hoy" value={`${Math.round(reviewSec / 60)} min`} sub={`Meta: ${s.review.dailyMinutesGoal} min`} tone={reviewSec > goal ? "amber" : undefined} /><Progress className="mt-3" value={(reviewSec / goal) * 100} /></Card>
        <Card><Stat label="Gasto del mes" value={fmtUsd(spend)} sub={`Tope: ${fmtUsd(budget)}`} tone={spend > budget ? "red" : spend > budget * s.budget.warnAtPct / 100 ? "amber" : undefined} /><Progress className="mt-3" value={(spend / Math.max(0.01, budget)) * 100} /></Card>
        <Card><Stat label="Temas listos" value={topics.length} tone={topics.length === 0 ? "red" : topics.length < 3 ? "amber" : "green"} /></Card>
        <Card><Stat label="Publicados (30 días)" value={published} /></Card>
      </div>

      <Card title="En curso" icon={Clapperboard} actions={
        <div className="flex items-center gap-2">
          <select className="input h-8 py-0 w-32 text-xs" value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="standard">Estándar</option><option value="premium">Premium</option>
          </select>
          <select className="input h-8 py-0 w-32 text-xs" value={voiceMode} onChange={(e) => setVoiceMode(e.target.value as any)}>
            <option value="ai">Voz de IA</option><option value="own">Mi voz</option>
          </select>
          <button className="btn-primary btn-sm" disabled={!topics.length} onClick={() => void startNextVideo({ mode, voiceMode })}><Play size={14} /> Nuevo video</button>
        </div>
      }>
        {videos.length === 0 ? (
          <Empty icon={Play} title="Nada en curso">
            {topics.length ? <>Próximo tema: «{topics[0].title}».</> : <>Aprueba un tema en <button className="text-primary underline" onClick={() => navigate({ page: "produccion", tab: "temas" })}>Videos → Temas</button>.</>}
          </Empty>
        ) : (
          <div className="space-y-3">
            {videos.map(({ v, stages }) => {
              const a = awaiting(v, stages);
              return (
                <div key={v.id} className="rounded-lg border border-border p-4 hover:border-primary/45 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{v.title}</div>
                      <div className="flex gap-1.5 mt-1">
                        {v.mode === "premium" && <Chip tone="primary">Premium</Chip>}
                        {v.voice_mode === "own" && <Chip tone="primary"><Mic size={10} /> Mi voz</Chip>}
                        <Chip tone={a.tone === "muted" ? "muted" : a.tone}>{a.text}</Chip>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {a.action === "Continuar" && !isQueued(v.id) && <button className="btn-brand btn-sm" onClick={() => runVideo(v.id)}><Play size={13} /> Continuar</button>}
                      <button className={a.tone === "amber" || a.tone === "red" ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => navigate({ page: "video", id: v.id })}>
                        {a.action && a.action !== "Continuar" ? a.action : "Abrir"} <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3"><Stepper stages={stages} /></div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Próximos temas" icon={Lightbulb} actions={<button className="btn-ghost btn-sm" onClick={() => navigate({ page: "produccion", tab: "temas" })}>Ver todos</button>}>
        {topics.length === 0 ? <div className="text-sm text-muted-foreground">Ninguno aprobado.</div> : (
          <ol className="space-y-2">
            {topics.slice(0, 5).map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-primary/60 tabular w-5">{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate flex-1">{t.title}</span>
                <Chip tone={t.score >= 5 ? "green" : t.score >= 3 ? "primary" : "amber"}>{t.score.toFixed(1)}</Chip>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
