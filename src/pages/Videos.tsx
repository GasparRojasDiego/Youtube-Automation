// Videos: solo los ya terminados (montados), publicados o no.
import { useEffect, useState } from "react";
import { Clapperboard, ExternalLink, Film, Trash2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useBus } from "../lib/bus";
import { fileUrl } from "../lib/ipc";
import { activeChannel, getStages, type StageRow, type Video, listVideos, deleteVideo, videoNumbers } from "../lib/repo";
import { askText } from "../ui/Ask";
import { toast } from "../lib/events";
import { navigate } from "../ui/nav";
import { Card, Empty, Chip } from "../ui/kit";
import { awaiting } from "../ui/Steps";
import { fmtDate, fmtDuration } from "../lib/util";
import type { RenderOut } from "../pipeline/types";

/** Número del video en una esquina recortada en diagonal (triángulo pequeño). */
export function NumberCorner({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span aria-label={`Video n.º ${n}`} className="absolute left-0 bottom-0 w-9 h-9 bg-primary text-primary-foreground pointer-events-none" style={{ clipPath: "polygon(0 0, 0 100%, 100% 100%)" }}>
      <span className="absolute left-1 bottom-0.5 text-[11px] font-bold tabular leading-none">{n}</span>
    </span>
  );
}

const CONFIRM_WORD = "ELIMINAR";
async function confirmDelete(v: Video) {
  const typed = await askText(`¿Eliminar «${v.title}»?`, { body: `Escribe ${CONFIRM_WORD} para confirmar. Se quita de la app; los archivos usados para crearlo (biblioteca, voz, el video en su carpeta y en Descargas) se conservan.`, value: "", confirm: "Eliminar" });
  if (typed === null) return;
  if (typed.trim().toUpperCase() !== CONFIRM_WORD) { toast("warn", "No se eliminó", `Escribe ${CONFIRM_WORD} exactamente.`); return; }
  await deleteVideo(v.id);
  toast("success", "Video eliminado");
}

export function VideosPage() {
  const tick = useBus("videos", "stages", "channels");
  const [rows, setRows] = useState<{ v: Video; stages: StageRow[]; render: RenderOut }[]>([]);
  const [nums, setNums] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    void (async () => {
      const ch = await activeChannel(); if (!ch) return;
      setNums(await videoNumbers(ch.id));
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
          <div key={v.id} onClick={() => navigate({ page: "video", id: v.id })} className="card card-hover cursor-pointer p-3 pr-12 flex items-center gap-4 relative overflow-hidden">
            <div className="w-40 aspect-video shrink-0 rounded-lg overflow-hidden bg-secondary ring-1 ring-border grid place-items-center">
              {render.poster ? <img src={fileUrl(render.poster, render.renderedAt)} className="w-full h-full object-cover" /> : <Film size={20} className="text-muted-foreground/60" />}
            </div>
            <NumberCorner n={nums.get(v.id)} />
            <button className="absolute top-2 right-2 w-8 h-8 rounded-md grid place-items-center text-red-800 dark:text-red-700 hover:bg-red-800/10" title="Eliminar video" aria-label="Eliminar video"
              onClick={(e) => { e.stopPropagation(); void confirmDelete(v); }}><Trash2 size={16} /></button>
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
