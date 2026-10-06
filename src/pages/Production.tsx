import { useEffect, useState } from "react";
import { Clapperboard, Plus, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useBus } from "../lib/bus";
import { db } from "../lib/ipc";
import { activeChannel, createVideo, getStages, type StageRow, type Video, listVideos } from "../lib/repo";
import { runVideo } from "../pipeline/runner";
import { navigate } from "../ui/nav";
import { PageHeader, Card, Empty, Chip, Modal, Field } from "../ui/kit";
import { awaiting } from "../ui/Stepper";
import { fmtDate, fmtUsd } from "../lib/util";

type Filter = "all" | "active" | "published" | "rejected";

export function Production() {
  const tick = useBus("videos", "stages", "costs", "channels", "settings");
  const [rows, setRows] = useState<{ v: Video; stages: StageRow[]; cost: number; review: number }[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [adhoc, setAdhoc] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    void (async () => {
      const ch = await activeChannel(); if (!ch) return;
      const vids = await listVideos(ch.id, 300);
      const costs = await db.query<{ video_id: string; s: number }>("SELECT video_id, SUM(usd) s FROM costs WHERE video_id IS NOT NULL GROUP BY video_id");
      const reviews = await db.query<{ video_id: string; s: number }>("SELECT video_id, SUM(seconds) s FROM reviews GROUP BY video_id");
      setRows(await Promise.all(vids.map(async (v) => ({ v, stages: await getStages(v.id), cost: costs.find((c) => c.video_id === v.id)?.s ?? 0, review: reviews.find((r) => r.video_id === v.id)?.s ?? 0 }))));
    })();
  }, [tick]);

  const shown = rows.filter(({ v }) => filter === "all" || (filter === "active" ? ["active", "approved"].includes(v.status) : filter === "published" ? ["published", "scheduled"].includes(v.status) : v.status === "rejected"));

  return (
    <div>
      <PageHeader kicker="Historial" title="Videos" subtitle="Todos los videos con sus fuentes, guiones, versiones, decisiones, costos y métricas."
        actions={<button className="btn-brand" onClick={() => setAdhoc(true)}><Plus size={15} /> Video con tema libre</button>} />
      <div className="flex gap-1.5 mb-4">
        {(["all", "active", "published", "rejected"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`btn btn-sm rounded-full ${filter === f ? "bg-primary text-white" : "bg-secondary"}`}>
            {{ all: "Todos", active: "En curso", published: "Publicados", rejected: "Rechazados" }[f]}
          </button>
        ))}
      </div>
      <Card pad={false}>
        {shown.length === 0 ? <Empty icon={Clapperboard} title="Sin videos" /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left label border-b border-border">
              <th className="px-4 py-2.5 font-medium">Video</th><th className="px-2 font-medium">Estado</th><th className="px-2 font-medium">Creado</th>
              <th className="px-2 font-medium text-right">Costo</th><th className="px-2 font-medium text-right">Revisión</th><th className="px-4" />
            </tr></thead>
            <tbody>
              {shown.map(({ v, stages, cost, review }) => {
                const a = awaiting(v, stages);
                return (
                  <tr key={v.id} className="border-b border-border/60 hover:bg-accent/40 cursor-pointer" onClick={() => navigate({ page: "video", id: v.id })}>
                    <td className="px-4 py-3"><div className="font-medium truncate max-w-[440px]">{v.title}</div>
                      <div className="flex gap-1 mt-1">{v.mode === "premium" && <Chip tone="primary">Premium</Chip>}{v.voice_mode === "own" && <Chip tone="primary">Voz propia</Chip>}</div></td>
                    <td className="px-2"><Chip tone={a.tone === "muted" ? "muted" : a.tone}>{a.text.length > 48 ? a.text.slice(0, 47) + "…" : a.text}</Chip></td>
                    <td className="px-2 text-muted-foreground text-xs">{fmtDate(v.created_at)}</td>
                    <td className="px-2 text-right tabular">{fmtUsd(cost)}</td>
                    <td className="px-2 text-right tabular text-muted-foreground">{Math.round(review / 60)} min</td>
                    <td className="px-4 text-right">{v.youtube_id && <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); void openUrl(`https://youtu.be/${v.youtube_id}`); }}><ExternalLink size={14} /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <Modal open={adhoc} onClose={() => setAdhoc(false)} title="Video con tema libre" echo="crear"
        footer={<><button className="btn-ghost" onClick={() => setAdhoc(false)}>Cancelar</button>
          <button className="btn-primary" disabled={!title.trim()} onClick={async () => {
            const ch = await activeChannel(); if (!ch) return;
            const v = await createVideo(ch.id, { id: "", channel_id: ch.id, title: title.trim(), angle: "", notes, potential: {}, risk: {}, score: 0, status: "approved", origin: "user", position: 0, sources: [], created_at: Date.now(), used_video_id: null }, {});
            await db.execute("UPDATE videos SET topic_id=NULL WHERE id=?", [v.id]);
            setAdhoc(false); setTitle(""); setNotes(""); runVideo(v.id); navigate({ page: "video", id: v.id });
          }}>Crear e iniciar</button></>}>
        <div className="space-y-3">
          <Field label="Tema"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Harvard's 2022 report on its ties to slavery" /></Field>
          <Field label="Notas para la investigación (opcional)"><textarea className="input min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}
