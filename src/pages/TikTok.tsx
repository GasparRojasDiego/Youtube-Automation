// TikTok: partes de 1:30 de cada video terminado, en vertical, listas en Descargas.
import { useEffect, useState } from "react";
import { Smartphone, Scissors, Download, Copy, FolderOpen, Hash, Check } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { useBus } from "../lib/bus";
import { fileUrl } from "../lib/ipc";
import { activeChannel, listVideos, getStages, type Video } from "../lib/repo";
import { planParts, suggestHashtags, saveTikTok, exportParts, partName, type TikTokData } from "../pipeline/tiktok";
import type { RenderOut } from "../pipeline/types";
import { PageHeader, Card, Empty, Toggle, AsyncButton, Chip } from "../ui/kit";
import { fmtDuration } from "../lib/util";
import { toast, logError } from "../lib/events";

interface Row { v: Video; render: RenderOut }

export function TikTokPage() {
  const tick = useBus("videos", "stages", "tiktok");
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    void (async () => {
      const ch = await activeChannel();
      if (!ch) return;
      const vids = await listVideos(ch.id, 100);
      const out: Row[] = [];
      for (const v of vids) {
        const r = (await getStages(v.id)).find((s) => s.stage === "render");
        if (r?.status === "done" || r?.status === "approved") out.push({ v, render: r.output as RenderOut });
      }
      setRows(out);
    })();
  }, [tick]);

  return (
    <div>
      <PageHeader kicker="Producción" title="TikTok" subtitle="Cada video en partes de 1:30, en vertical, listas para subir." />
      {rows.length === 0 ? (
        <Card><Empty icon={Smartphone} title="Aún no hay videos terminados">Cuando un video llegue a la revisión final aparecerá aquí.</Empty></Card>
      ) : (
        <div className="space-y-4">{rows.map((r) => <VideoRow key={r.v.id} row={r} />)}</div>
      )}
    </div>
  );
}

function VideoRow({ row }: { row: Row }) {
  const { v, render } = row;
  const saved = v.data.tiktok as TikTokData | undefined;
  const [data, setData] = useState<TikTokData | null>(saved ?? null);
  const [progress, setProgress] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (saved) setData(saved); }, [saved?.exportedAt]);

  const split = async () => {
    const parts = await planParts(v);
    const tags = data?.hashtags?.length ? { hashtags: data.hashtags, caption: data.caption } : await suggestHashtags(v);
    const next: TikTokData = { parts, hashtags: tags.hashtags, caption: tags.caption, vertical: data?.vertical ?? true, label: data?.label ?? true };
    setData(next); await saveTikTok(v, next);
  };
  const download = async () => {
    if (!data) return;
    try {
      const dir = await exportParts(v, data, setProgress);
      setProgress("");
      toast("success", "Partes listas en Descargas", dir, { label: "Abrir carpeta", run: () => void openPath(dir) });
    } catch (e) { setProgress(""); await logError(e, v.id, "TikTok"); }
  };
  const update = async (p: Partial<TikTokData>) => { if (!data) return; const n = { ...data, ...p }; setData(n); await saveTikTok(v, n); };
  const copyTags = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(`${data.caption}\n\n${data.hashtags.join(" ")}`);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Card>
      <div className="flex gap-5">
        <div className="w-56 shrink-0">
          <div className="aspect-video rounded-lg overflow-hidden bg-black ring-1 ring-border">
            {render.poster ? <img src={fileUrl(render.poster, render.renderedAt)} className="w-full h-full object-cover" /> : null}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Chip>{fmtDuration(render.duration)}</Chip>{data && <Chip tone="primary">{data.parts.length} partes</Chip>}</div>
        </div>
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold tracking-tight leading-snug">{v.title}</div>
            <div className="flex gap-2 shrink-0">
              <AsyncButton className="btn-brand" onClick={split}><Scissors size={15} /> {data ? "Volver a dividir" : "Dividir en partes"}</AsyncButton>
              <AsyncButton className="btn-primary" disabled={!data || !!progress} onClick={download}><Download size={15} /> Descargar</AsyncButton>
            </div>
          </div>
          {progress && <div className="text-xs text-primary font-medium">{progress}</div>}
          {data && (<>
            <div className="flex flex-wrap gap-1.5">
              {data.parts.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs">
                  <span className="font-semibold">{partName(i, data.parts.length)}</span>
                  <span className="font-mono text-muted-foreground tabular">{fmtDuration(p.start)}–{fmtDuration(p.end)}</span>
                  <span className="font-mono text-primary tabular">{fmtDuration(p.end - p.start)}</span>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-5 text-sm">
              <Toggle checked={data.vertical} onChange={(x) => void update({ vertical: x })} label="Vertical 9:16" />
              <Toggle checked={data.label} onChange={(x) => void update({ label: x })} label="Texto «Parte N»" />
              {data.exportedTo && <button className="btn-ghost btn-sm" onClick={() => void openPath(data.exportedTo!)}><FolderOpen size={14} /> Abrir carpeta</button>}
            </div>
            <div className="rounded-xl border border-border/80 bg-secondary/40 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="label flex items-center gap-1.5"><Hash size={12} /> Texto y hashtags para TikTok</span>
                <button className="btn-ghost btn-sm" onClick={() => void copyTags()}>{copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar"}</button>
              </div>
              <div className="text-sm">{data.caption}</div>
              <div className="flex flex-wrap gap-1.5 mt-2">{data.hashtags.map((h) => <Chip key={h} tone="primary">{h}</Chip>)}</div>
            </div>
          </>)}
        </div>
      </div>
    </Card>
  );
}
