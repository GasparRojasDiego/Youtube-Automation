// Videos: solo los ya terminados (montados), publicados o no.
import { useEffect, useState } from "react";
import { Clapperboard, ExternalLink, Film } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useBus } from "../lib/bus";
import { fileUrl } from "../lib/ipc";
import { activeChannel, getStages, type StageRow, type Video, listVideos } from "../lib/repo";
import { navigate } from "../ui/nav";
import { Card, Empty, Chip } from "../ui/kit";
import { awaiting } from "../ui/Steps";
import { fmtDate, fmtDuration } from "../lib/util";
import type { RenderOut } from "../pipeline/types";

export function VideosPage() {
  const tick = useBus("videos", "stages", "channels");
  const [rows, setRows] = useState<{ v: Video; stages: StageRow[]; render: RenderOut }[]>([]);

  useEffect(() => {
    void (async () => {
      const ch = await activeChannel(); if (!ch) return;
      const out: typeof rows = [];
      for (const v of await listVideos(ch.id, 300)) {
        if (v.status === "rejected" || v.status === "archived") continue;
        const stages = await getStages(v.id);
        const r = stages.find((s) => s.stage === "render");
        if (r?.output && (r.status === "done" || r.status === "approved")) out.push({ v, stages, render: r.output as RenderOut });
      }
      setRows(out);
    })();
  }, [tick]);

  if (!rows.length) return <Card><Empty icon={Clapperboard} title="Aún no hay videos terminados">Aparecen aquí cuando termina su montaje.</Empty></Card>;
  return (
    <div className="space-y-2.5">
      {rows.map(({ v, stages, render }) => {
        const a = awaiting(v, stages);
        return (
          <div key={v.id} onClick={() => navigate({ page: "video", id: v.id })} className="card card-hover cursor-pointer p-3 flex items-center gap-4">
            <div className="w-40 aspect-video shrink-0 rounded-lg overflow-hidden bg-secondary ring-1 ring-border grid place-items-center">
              {render.poster ? <img src={fileUrl(render.poster, render.renderedAt)} className="w-full h-full object-cover" /> : <Film size={20} className="text-muted-foreground/60" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium tracking-tight truncate">{v.title}</div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <Chip tone={a.tone === "muted" ? "muted" : a.tone}>{a.text.length > 48 ? a.text.slice(0, 47) + "…" : a.text}</Chip>
                <Chip>{fmtDuration(render.duration)}</Chip>
              </div>
            </div>
            <div className="text-right shrink-0 space-y-1">
              <div className="text-[11px] text-muted-foreground">{fmtDate(v.created_at)}</div>
              {v.youtube_id && <button className="btn-ghost btn-sm" title="Ver en YouTube" onClick={(e) => { e.stopPropagation(); void openUrl(`https://youtu.be/${v.youtube_id}`); }}><ExternalLink size={14} /></button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
