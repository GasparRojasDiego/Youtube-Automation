import { useEffect, useState } from "react";
import { Play, Lightbulb, ArrowRight, Clapperboard } from "lucide-react";
import { useBus } from "../lib/bus";
import { db } from "../lib/ipc";
import { activeChannel, getStages, listTopics, type Channel, type StageRow, type Video } from "../lib/repo";
import { startNextVideo, startFromPrompt, activeVideos, runVideo, isQueued } from "../pipeline/runner";
import { navigate } from "../ui/nav";
import { Card, Empty, Chip, AsyncButton } from "../ui/kit";
import { Constellation } from "../ui/Constellation";
import { StepStrip, awaiting } from "../ui/Steps";
import { TopicsPanel } from "./Topics";

export function Today() {
  const tick = useBus("videos", "stages", "topics", "channels", "jobs");
  const [ch, setCh] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<{ v: Video; stages: StageRow[] }[]>([]);
  const [hasTopics, setHasTopics] = useState(false);
  const [published, setPublished] = useState(0);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    void (async () => {
      const c = await activeChannel(); setCh(c);
      if (!c) return;
      const act = await activeVideos(c.id);
      setVideos(await Promise.all(act.map(async (v) => ({ v, stages: await getStages(v.id) }))));
      setHasTopics((await listTopics(c.id, "approved")).length > 0);
      setPublished((await db.query<{ n: number }>("SELECT COUNT(*) n FROM videos WHERE channel_id=? AND status IN ('published','scheduled') AND created_at>=?", [c.id, Date.now() - 30 * 86400000]))[0]?.n ?? 0);
    })();
  }, [tick]);

  if (!ch) return <Empty icon={Clapperboard} title="Sin canal">Vuelve a abrir ATRIL para crearlo.</Empty>;
  const create = async () => { const id = await startFromPrompt(prompt); if (id) setPrompt(""); };

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden">
        <Constellation density={15000} max={70} link={140} alpha={0.75} />
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="relative px-8 pt-8 pb-7">
          <h1 className="text-[34px] leading-tight font-bold tracking-tight">¿Qué video hacemos hoy?</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">Escribe la idea, el tema o instrucciones. La app hace todo y solo te pide revisar el video final.</p>
          <div className="mt-5 rounded-2xl border border-border/80 bg-background/55 backdrop-blur-md focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/15 transition-all">
            <textarea className="w-full bg-transparent outline-none resize-none px-4 pt-4 pb-2 text-[15px] min-h-28 placeholder:text-muted-foreground/70" value={prompt}
              onChange={(e) => setPrompt(e.target.value)} placeholder="Ej.: ¿Qué pasaría si 200 soldados modernos aparecieran en la antigua Roma?"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && prompt.trim()) void create(); }} />
            <div className="flex items-center gap-2 px-3 pb-3">
              <div className="flex-1" />
              {hasTopics && <button className="btn-ghost btn-sm" onClick={() => void startNextVideo()}><Lightbulb size={14} /> Usar el próximo tema</button>}
              <AsyncButton className="btn-primary h-10 px-5" disabled={!prompt.trim()} onClick={create}>Crear video <ArrowRight size={15} /></AsyncButton>
            </div>
          </div>
        </div>
      </section>

      <Card title="En curso" icon={Clapperboard} actions={<span className="text-[11px] text-muted-foreground tabular">Publicados en 30 días: <b className="text-foreground">{published}</b></span>}>
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
                      <div className="mt-1"><Chip tone={a.tone === "muted" ? "muted" : a.tone}>{a.text.length > 70 ? `${a.text.slice(0, 69)}…` : a.text}</Chip></div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {a.action === "Continuar" && !isQueued(v.id) && <button className="btn-brand btn-sm" onClick={() => runVideo(v.id)}><Play size={13} /> Continuar</button>}
                      <button className={a.tone === "amber" || a.tone === "red" ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => navigate({ page: "video", id: v.id })}>
                        {a.action && a.action !== "Continuar" ? a.action : "Abrir"} <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3.5"><StepStrip stages={stages} /></div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <section>
        <h2 className="text-lg font-bold tracking-tight mb-3 flex items-center gap-2"><Lightbulb size={18} className="text-primary" /> Temas</h2>
        <TopicsPanel />
      </section>
    </div>
  );
}
