import { useEffect, useState } from "react";
import { Play, Lightbulb, ArrowRight, Clapperboard, Mic } from "lucide-react";
import { useBus } from "../lib/bus";
import { db } from "../lib/ipc";
import { activeChannel, getStages, listTopics, type Channel, type StageRow, type Video, type Topic } from "../lib/repo";
import { getSettings } from "../lib/settings";
import { monthSpendUsd, budgetUsd } from "../lib/costs";
import { startNextVideo, startFromPrompt, activeVideos, runVideo, isQueued } from "../pipeline/runner";
import { navigate } from "../ui/nav";
import { Card, Stat, Progress, Empty, Chip, AsyncButton } from "../ui/kit";
import { Constellation, EchoWord, Scramble } from "../ui/Constellation";
import { Stepper, awaiting } from "../ui/Stepper";
import { fmtUsd } from "../lib/util";

export function Today() {
  const tick = useBus("videos", "stages", "topics", "costs", "channels", "settings", "jobs");
  const [ch, setCh] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<{ v: Video; stages: StageRow[] }[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [spend, setSpend] = useState(0);
  const [published, setPublished] = useState(0);
  const [prompt, setPrompt] = useState("");
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
      setPublished((await db.query<{ n: number }>("SELECT COUNT(*) n FROM videos WHERE channel_id=? AND status IN ('published','scheduled') AND created_at>=?", [c.id, Date.now() - 30 * 86400000]))[0]?.n ?? 0);
    })();
  }, [tick]);

  const s = getSettings();
  const budget = budgetUsd();
  const today = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

  if (!ch) return <Empty icon={Clapperboard} title="Sin canal">Créalo en Ajustes → Canal.</Empty>;

  const seg = <T extends string>(value: T, set: (v: T) => void, opts: [T, string][]) => (
    <div className="inline-flex p-1 rounded-xl bg-background/50 border border-border/70 backdrop-blur">
      {opts.map(([id, label]) => (
        <button key={id} onClick={() => set(id)} className={`h-8 px-3 rounded-lg text-xs font-medium transition-all duration-200 ${value === id ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden">
        <Constellation density={15000} max={70} link={140} alpha={0.75} />
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <EchoWord word="IDEA" className="top-[150px] opacity-70 [mask-image:linear-gradient(90deg,transparent_30%,#000_60%,#000_85%,transparent)]" />
        <div className="relative px-8 pt-8 pb-7">
          <div className="kicker">{today} · {ch.name}</div>
          <h1 className="text-[34px] leading-tight font-bold tracking-tight mt-2"><Scramble text="¿Qué video hacemos hoy?" /></h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">Escribe la idea, el tema o instrucciones. La app hace todo y solo te pide revisar el video final.</p>
          <div className="mt-5 rounded-2xl border border-border/80 bg-background/55 backdrop-blur-md focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/15 transition-all">
            <textarea className="w-full bg-transparent outline-none resize-none px-4 pt-4 pb-2 text-[15px] min-h-28 placeholder:text-muted-foreground/70" value={prompt}
              onChange={(e) => setPrompt(e.target.value)} placeholder="Ej.: ¿Qué pasaría si 200 soldados modernos aparecieran en la antigua Roma?"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && prompt.trim()) void startFromPrompt(prompt, { mode, voiceMode }).then((id) => id && setPrompt("")); }} />
            <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
              {seg(mode, setMode, [["standard", "Estándar"], ["premium", "Premium"]])}
              {seg(voiceMode, setVoiceMode, [["ai", "Voz de IA"], ["own", "Mi voz"]])}
              <div className="flex-1" />
              {topics.length > 0 && <button className="btn-ghost btn-sm" onClick={() => void startNextVideo({ mode, voiceMode })}><Lightbulb size={14} /> Usar el próximo tema</button>}
              <AsyncButton className="btn-primary h-10 px-5" disabled={!prompt.trim()} onClick={async () => { const id = await startFromPrompt(prompt, { mode, voiceMode }); if (id) setPrompt(""); }}>
                Crear video <ArrowRight size={15} />
              </AsyncButton>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-4">
        <Card><Stat label="Gasto del mes" value={fmtUsd(spend)} sub={`Tope: ${fmtUsd(budget)}`} tone={spend > budget ? "red" : spend > budget * s.budget.warnAtPct / 100 ? "amber" : undefined} /><Progress className="mt-3" value={(spend / Math.max(0.01, budget)) * 100} /></Card>
        <Card><Stat label="Temas guardados" value={topics.length} /></Card>
        <Card><Stat label="Publicados (30 días)" value={published} /></Card>
      </div>

      <Card title="En curso" icon={Clapperboard}>
        {videos.length === 0 ? (
          <Empty icon={Play} title="Nada en curso">Escribe una idea arriba y pulsa «Crear video».</Empty>
        ) : (
          <div className="space-y-3">
            {videos.map(({ v, stages }) => {
              const a = awaiting(v, stages);
              return (
                <div key={v.id} className="rounded-xl border border-border/80 bg-background/30 p-4 hover:border-primary/40 transition-colors">
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

{topics.length > 0 && (
            <Card title="Próximos temas" icon={Lightbulb} actions={<button className="btn-ghost btn-sm" onClick={() => navigate({ page: "produccion", tab: "temas" })}>Ver todos</button>}>
        {topics.length === 0 ? null : (
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
      )}
    </div>
  );
}
