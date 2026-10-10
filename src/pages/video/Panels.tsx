import { ExternalLink, RotateCcw, Download, MonitorPlay } from "lucide-react";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { fileUrl } from "../../lib/ipc";
import type { Video, StageRow } from "../../lib/repo";
import type { ScriptOut, VoiceOut, PublishOut } from "../../pipeline/types";
import { exportPackage } from "../../pipeline/stages";
import { redoVoiceSegment } from "../../pipeline/runner";
import { Card, Chip, AsyncButton, Empty } from "../../ui/kit";
import { fmtDuration } from "../../lib/util";
import { toast, logError } from "../../lib/events";
import { navigate } from "../../ui/nav";

// ---------- Voz ----------
export function VoicePanel({ video, row, script }: { video: Video; row: StageRow; script?: ScriptOut }) {
  const data = row.output as VoiceOut | null;
  if (!script) return <Card><div className="text-sm text-muted-foreground">Primero se necesita el guion aprobado.</div></Card>;
  if (!data) return null;
  return (
    <Card title={`Narración · ${fmtDuration(data.total)} · ${data.provider}`}>
      <div className="space-y-2">
        {script.segments.map((s) => {
          const seg = data.segments.find((x) => x.segment_id === s.id);
          return (
            <div key={s.id} className="flex items-center gap-3">
              <div className="w-56 text-sm truncate">{s.title}</div>
              {seg ? <audio controls preload="none" className="h-8 flex-1" src={fileUrl(seg.path, seg.hash.slice(0, 8))} /> : <span className="flex-1 text-xs text-muted-foreground">sin audio</span>}
              <span className="text-xs tabular text-muted-foreground w-12 text-right">{seg ? fmtDuration(seg.duration) : ""}</span>
              <button className="btn-ghost btn-sm" title="Rehacer" onClick={() => void redoVoiceSegment(video.id, s.id)}><RotateCcw size={13} /></button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- Publicación ----------
export function PublishPanel({ video, row }: { video: Video; row: StageRow }) {
  const out = row.output as PublishOut | null;
  if (out) return (
    <Card title="Publicado en YouTube" icon={MonitorPlay}>
      <div className="space-y-2 text-sm">
        <div><button className="text-primary hover:underline inline-flex items-center gap-1" onClick={() => void openUrl(out.url)}>{out.url} <ExternalLink size={12} /></button></div>
        <div className="flex gap-2"><Chip tone="green">{out.publish_at ? `Programado: ${new Date(out.publish_at).toLocaleString("es-PE")}` : `Estado: ${out.privacy}`}</Chip>{!out.thumbnail_ok && <Chip tone="amber">Miniatura pendiente (súbela en Studio)</Chip>}</div>
        {out.note_es && <div className="text-xs text-amber-700 dark:text-amber-500">{out.note_es}</div>}
        <button className="btn-ghost btn-sm" onClick={() => void openUrl(`https://studio.youtube.com/video/${out.youtube_id}/edit`)}>Abrir en YouTube Studio</button>
      </div>
    </Card>
  );
  return (
    <Card title="Publicación">
      {row.status === "review" ? (
        <div className="space-y-3 text-sm">
          <div>{row.progress}</div>
          <div className="flex gap-2">
            <button className="btn-brand" onClick={() => navigate({ page: "ajustes" })}><MonitorPlay size={14} /> Conectar YouTube</button>
            <ExportButton video={video} />
          </div>
        </div>
      ) : video.status === "approved" ? <div className="text-sm text-muted-foreground">En cola para subir.</div>
        : <Empty icon={MonitorPlay} title="Falta la revisión final">Solo se publica con tu aprobación.</Empty>}
    </Card>
  );
}

export function ExportButton({ video, label = "Exportar para subir a mano" }: { video: Video; label?: string }) {
  return (
    <AsyncButton className="btn-secondary" onClick={async () => {
      const dir = await openDialog({ directory: true, title: "Carpeta donde guardar el paquete" });
      if (!dir || Array.isArray(dir)) return;
      try { const out = await exportPackage(video, dir); toast("success", "Paquete exportado", out); await openPath(out); }
      catch (e) { await logError(e, video.id, "Exportación"); }
    }}><Download size={14} /> {label}</AsyncButton>
  );
}
