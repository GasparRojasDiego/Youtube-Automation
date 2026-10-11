// TikTok: cada video terminado con su texto y hashtags; «Recortar» lo parte en
// piezas de ~1:30 dentro de Descargas en segundos (copia directa, sin recodificar).
import { useEffect, useState } from "react";
import { Smartphone, Scissors, Check, Copy } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { useBus } from "../lib/bus";
import { fileUrl } from "../lib/ipc";
import { activeChannel, listVideos, getStages, videoNumbers, type Video } from "../lib/repo";
import { NumberCorner } from "./Videos";
import { cutParts, tiktokText, type TikTokData } from "../pipeline/tiktok";
import type { RenderOut, PackageOut } from "../pipeline/types";
import { Card, Empty, Chip, Spinner } from "../ui/kit";
import { fmtDuration } from "../lib/util";
import { toast, logError } from "../lib/events";

interface Row { v: Video; render: RenderOut; pkg: PackageOut | null }

export function TikTokPage() {
  const tick = useBus("videos", "stages");
  const [rows, setRows] = useState<Row[]>([]);
  const [nums, setNums] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    void (async () => {
      const ch = await activeChannel();
      if (!ch) return;
      setNums(await videoNumbers(ch.id));
      const out: Row[] = [];
      for (const v of await listVideos(ch.id, 100)) {
        if (v.status === "rejected" || v.status === "archived") continue;
        const st = await getStages(v.id);
        const r = st.find((s) => s.stage === "render");
        if (r?.output && (r.status === "done" || r.status === "approved")) out.push({ v, render: r.output as RenderOut, pkg: (st.find((s) => s.stage === "package")?.output as PackageOut) ?? null });
      }
      setRows(out);
    })();
  }, [tick]);

  return rows.length === 0
    ? <Card><Empty icon={Smartphone} title="Aún no hay videos terminados">Aparecen aquí cuando termina su montaje.</Empty></Card>
    : <div className="space-y-4">{rows.map((r) => <VideoRow key={r.v.id} row={r} n={nums.get(r.v.id)} />)}</div>;
}

function VideoRow({ row, n }: { row: Row; n?: number }) {
  const { v, render, pkg } = row;
  const done = v.data.tiktok as TikTokData | undefined;
  const [progress, setProgress] = useState("");
  const [copied, setCopied] = useState(false);
  const { text } = tiktokText(v, pkg);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { toast("warn", "No se pudo copiar"); } };
  const cut = async () => {
    if (progress) return;
    setProgress("Preparando…");
    try {
      const dir = await cutParts(v, setProgress);
      toast("success", "Partes listas en Descargas", dir, { label: "Abrir carpeta", run: () => void openPath(dir) });
    } catch (e) { await logError(e, v.id, "TikTok"); }
    finally { setProgress(""); }
  };
  return (
    <Card>
      <div className="flex gap-5">
        <div className="w-56 shrink-0 aspect-video rounded-lg overflow-hidden bg-black ring-1 ring-border relative">
          {(pkg?.tiktok_cover || render.poster) && <img src={fileUrl(pkg?.tiktok_cover || render.poster!, render.renderedAt)} className="w-full h-full object-cover" />}
          <NumberCorner n={n} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold tracking-tight leading-snug">{pkg?.chosen_title || v.title}</div>
            <button onClick={() => void cut()} disabled={!!progress} title={done ? `Ya se recortó (${done.parts.length} partes). Vuelve a pulsar para recortar de nuevo.` : "Recortar en partes de 1:30"}
              className={`btn shrink-0 ${done ? "bg-secondary text-muted-foreground border border-border hover:text-foreground" : "btn-primary"}`}>
              {progress ? <Spinner size={14} /> : done ? <Check size={15} /> : <Scissors size={15} />} {done ? "Recortado" : "Recortar"}
            </button>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-background/60 p-2.5">
            <p className="flex-1 text-sm leading-relaxed select-text">{text}</p>
            <button className="btn-ghost btn-sm shrink-0" title="Copiar descripción y hashtags" aria-label="Copiar" onClick={() => void copy()}>{copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}</button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <Chip>{fmtDuration(render.duration)}</Chip>
            {progress ? <span className="text-primary font-medium">{progress}</span> : done && <span className="text-muted-foreground">{done.parts.length} partes · {done.parts.map((p) => fmtDuration(p.end - p.start)).join(" · ")}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}
