import { useEffect, useState } from "react";
import { Clapperboard, ExternalLink, Lightbulb, Film } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useBus } from "../lib/bus";
import { db, fileUrl } from "../lib/ipc";
import { activeChannel, getStages, type StageRow, type Video, listVideos } from "../lib/repo";
import { navigate } from "../ui/nav";
import { PageHeader, Card, Empty, Chip, Tabs } from "../ui/kit";
import { TopicsPanel } from "./Topics";
import { awaiting, Stepper } from "../ui/Stepper";
import { fmtDate, fmtUsd, fmtDuration } from "../lib/util";
import type { RenderOut } from "../pipeline/types";

type Filter = "all" | "active" | "published" | "rejected";

export function Production({ tab: initial }: { tab?: string }) {
  const [tab, setTab] = useState<"videos" | "temas">(initial === "temas" ? "temas" : "videos");
  useEffect(() => { if (initial === "temas" || initial === "videos") setTab(initial); }, [initial]);
  const tick = useBus("videos", "stages", "costs", "channels", "settings");
  const [rows, setRows] = useState<{ v: Video; stages: StageRow[]; cost: number }[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    void (async () => {
      const ch = await activeChannel(); if (!ch) return;
      const vids = await listVideos(ch.id, 300);
      const costs = await db.query<{ video_id: string; s: number }>("SELECT video_id, SUM(usd) s FROM costs WHERE video_id IS NOT NULL GROUP BY video_id");
      setRows(await Promise.all(vids.map(async (v) => ({ v, stages: await getStages(v.id), cost: costs.find((c) => c.video_id === v.id)?.s ?? 0 }))));
    })();
  }, [tick]);

  const shown = rows.filter(({ v }) => filter === "all" || (filter === "active" ? ["active", "approved"].includes(v.status) : filter === "published" ? ["published", "scheduled"].includes(v.status) : v.status === "rejected"));

  return (
    <div>
      <PageHeader kicker="Producción" title="Videos" actions={<Tabs value={tab} onChange={setTab} tabs={[{ id: "videos", label: "Videos", icon: Clapperboard }, { id: "temas", label: "Temas", icon: Lightbulb }]} />} />
      {tab === "temas" ? <TopicsPanel /> : (<>
        <div className="mb-4">
          <Tabs value={filter} onChange={setFilter} tabs={[{ id: "all", label: `Todos · ${rows.length}` }, { id: "active", label: "En curso" }, { id: "published", label: "Publicados" }, { id: "rejected", label: "Rechazados" }]} />
        </div>
        {shown.length === 0 ? <Card><Empty icon={Clapperboard} title="Sin videos">Crea uno desde «Hoy».</Empty></Card> : (
          <div className="space-y-2.5">
            {shown.map(({ v, stages, cost }) => {
              const a = awaiting(v, stages);
              const render = stages.find((s) => s.stage === "render" && s.output)?.output as RenderOut | undefined;
              return (
                <div key={v.id} onClick={() => navigate({ page: "video", id: v.id })} className="card card-hover cursor-pointer p-3 flex items-center gap-4">
                  <div className="w-36 aspect-video shrink-0 rounded-lg overflow-hidden bg-secondary ring-1 ring-border grid place-items-center">
                    {render?.poster ? <img src={fileUrl(render.poster, render.renderedAt)} className="w-full h-full object-cover" /> : <Film size={20} className="text-muted-foreground/60" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium tracking-tight truncate">{v.title}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <Chip tone={a.tone === "muted" ? "muted" : a.tone}>{a.text.length > 48 ? a.text.slice(0, 47) + "…" : a.text}</Chip>
                      {v.mode === "premium" && <Chip tone="primary">Premium</Chip>}
                      {v.voice_mode === "own" && <Chip tone="primary">Mi voz</Chip>}
                      {render && <Chip>{fmtDuration(render.duration)}</Chip>}
                    </div>
                    {["active", "approved"].includes(v.status) && <div className="mt-2.5"><Stepper stages={stages} /></div>}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <div className="font-mono text-xs tabular">{fmtUsd(cost)}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtDate(v.created_at)}</div>
                    {v.youtube_id && <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); void openUrl(`https://youtu.be/${v.youtube_id}`); }}><ExternalLink size={14} /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>)}
    </div>
  );
}
