// Secciones del estudio TikTok: «Listos para publicar» (verticales aceptados, con sus textos para copiar,
// descarga y marca de publicado) y «Recortar en partes» (horizontales partidos en piezas de ~1:30 dentro
// de Descargas, en segundos y sin recodificar). Publicar en TikTok o Shorts lo haces tú: ATRIL no sube nada.
import { useEffect, useState } from "react";
import { Smartphone, Scissors, Check, Copy, Download, ArrowRight, Send, CheckCircle2, Eye } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { useBus } from "../lib/bus";
import { fileUrl } from "../lib/ipc";
import { activeChannel, listVideos, stagesByVideo, videoNumbers, updateVideo, type Video, type StageRow } from "../lib/repo";
import { NumberCorner } from "./Videos";
import { cutParts, tiktokText, downloadVideo, type TikTokData } from "../pipeline/tiktok";
import { formatOf } from "../pipeline/format";
import type { RenderOut, PackageOut } from "../pipeline/types";
import type { PublishPack } from "../pipeline/queue";
import { navigate } from "../ui/nav";
import { Card, Empty, Chip, Spinner, AsyncButton } from "../ui/kit";
import { fmtDuration } from "../lib/util";
import { toast, logError } from "../lib/events";

interface Row { v: Video; stages: StageRow[]; render: RenderOut; pkg: PackageOut | null }
type Posted = { tiktok?: number | null; shorts?: number | null };

/** Videos terminados del canal (montaje hecho), en una sola consulta. */
function useFinished(): Row[] | null {
  const tick = useBus("videos", "stages");
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    void (async () => {
      const ch = await activeChannel();
      if (!ch) return;
      const [list, stages] = await Promise.all([listVideos(ch.id, 300), stagesByVideo(ch.id, ["render", "package"])]);
      const out: Row[] = [];
      for (const v of list) {
        if (v.status === "rejected" || v.status === "archived") continue;
        const st = stages.get(v.id) ?? [];
        const r = st.find((s) => s.stage === "render");
        if (r?.output && (r.status === "done" || r.status === "approved")) out.push({ v, stages: st, render: r.output as RenderOut, pkg: (st.find((s) => s.stage === "package")?.output as PackageOut) ?? null });
      }
      setRows(out);
    })();
  }, [tick]);
  return rows;
}

function useNumbers() {
  const [nums, setNums] = useState<Map<string, number>>(new Map());
  useEffect(() => { void activeChannel().then((ch) => ch && videoNumbers(ch.id).then(setNums)); }, []);
  return nums;
}

/** Aceptado en la revisión final (o ya publicado): solo esos se ofrecen para publicar. */
const accepted = (r: Row) => ["ready", "published", "scheduled"].includes(r.v.status) || r.stages.some((s) => s.stage === "final" && (s.status === "approved" || s.status === "done"));

function CopyLine({ label, text }: { label: string; text: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { toast("warn", "No se pudo copiar"); } };
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-background/60 p-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-medium text-muted-foreground mb-0.5">{label}</div>
        <p className="text-[13px] leading-relaxed select-text whitespace-pre-wrap break-words">{text || <span className="text-muted-foreground">—</span>}</p>
      </div>
      <button className="btn-ghost btn-sm shrink-0" title={`Copiar ${label.toLowerCase()}`} aria-label={`Copiar ${label}`} disabled={!text} onClick={() => void copy()}>{ok ? <Check size={14} className="text-primary" /> : <Copy size={14} />}</button>
    </div>
  );
}

/** Verticales aceptados: textos para TikTok y Shorts, descarga y marca de publicado. */
export function TikTokReady() {
  const rows = useFinished();
  const nums = useNumbers();
  const [showPosted, setShowPosted] = useState(false);
  if (!rows) return null;
  const vertical = rows.filter((r) => formatOf(r.v) === "9:16");
  const pendingReview = vertical.filter((r) => !accepted(r));
  const ready = vertical.filter(accepted);
  const posted = (r: Row) => { const p = (r.v.data?.posted ?? {}) as Posted; return !!p.tiktok && !!p.shorts; };
  const shown = ready.filter((r) => showPosted || !posted(r));
  return (
    <Card title="Listos para publicar" icon={Send}
      actions={ready.some(posted) && <button className="btn-ghost btn-sm" onClick={() => setShowPosted(!showPosted)}>{showPosted ? "Ocultar publicados" : `Ver publicados (${ready.filter(posted).length})`}</button>}>
      <p className="text-[12.5px] text-muted-foreground -mt-1 mb-3">Los verticales que aceptaste en la revisión final. Descarga el video, copia sus textos, publícalo en TikTok o Shorts y márcalo: ATRIL no sube nada por su cuenta.</p>
      {pendingReview.length > 0 && (
        <div className="mb-3 text-[12.5px] rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 flex flex-wrap items-center gap-2">
          <Eye size={13} /> {pendingReview.length} vertical(es) esperan tu revisión final:
          {pendingReview.slice(0, 4).map((r) => <button key={r.v.id} className="text-primary hover:underline truncate max-w-[220px]" onClick={() => navigate({ page: "video", id: r.v.id })}>{r.v.title}</button>)}
        </div>
      )}
      {!shown.length ? <Empty icon={Smartphone} title={ready.length ? "Todo publicado" : "Aún no hay verticales aceptados"}>{ready.length ? "Pulsa «Ver publicados» para verlos." : "Aparecen aquí cuando apruebas un video vertical en su revisión final."}</Empty>
        : <div className="space-y-3">{shown.map((r) => <ReadyRow key={r.v.id} row={r} n={nums.get(r.v.id)} />)}</div>}
    </Card>
  );
}

function ReadyRow({ row, n }: { row: Row; n?: number }) {
  const { v, render, pkg } = row;
  const pack = (v.data?.publish ?? {}) as PublishPack;
  const p = (v.data?.posted ?? {}) as Posted;
  const tiktok = tiktokText(v, pkg).text;
  const shortsTitle = pack.shortsTitle?.trim() || pkg?.chosen_title || v.title;
  const shortsDesc = pack.shortsDescription?.trim() || [tiktokText(v, pkg).caption, "#Shorts"].join(" ");
  const mark = async (k: keyof Posted) => { await updateVideo(v.id, { data: { posted: { ...p, [k]: p[k] ? null : Date.now() } } }); };
  const download = async () => {
    try { const f = await downloadVideo(v); toast("success", "Video en Descargas", f, { label: "Abrir carpeta", run: () => void openPath(f.replace(/[\\/][^\\/]+$/, "")) }); }
    catch (e) { await logError(e, v.id, "Descargar"); }
  };
  return (
    <div className="rounded-lg border border-border/80 bg-background/30 p-3 flex gap-4">
      <div className="w-[88px] shrink-0 aspect-[9/16] rounded-md overflow-hidden bg-black ring-1 ring-border relative self-start">
        {(pkg?.tiktok_cover || render.poster) && <img src={fileUrl(pkg?.tiktok_cover || render.poster!, render.renderedAt)} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="w-full h-full object-cover" />}
        <NumberCorner n={n} />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button className="font-semibold leading-snug text-left hover:text-primary" onClick={() => navigate({ page: "video", id: v.id })}>{pkg?.chosen_title || v.title}</button>
            <div className="mt-1 flex flex-wrap gap-1.5"><Chip>{fmtDuration(render.duration)}</Chip>{p.tiktok && <Chip tone="green"><CheckCircle2 size={11} /> En TikTok</Chip>}{p.shorts && <Chip tone="green"><CheckCircle2 size={11} /> En Shorts</Chip>}</div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <AsyncButton className="btn-primary btn-sm" onClick={download}><Download size={13} /> Descargar</AsyncButton>
            <button className="btn-ghost btn-sm" title="Abrir el video" onClick={() => navigate({ page: "video", id: v.id })}><ArrowRight size={13} /></button>
          </div>
        </div>
        <CopyLine label="Texto de TikTok" text={tiktok} />
        <div className="grid grid-cols-2 gap-2">
          <CopyLine label="Título de Shorts" text={shortsTitle} />
          <CopyLine label="Descripción de Shorts" text={shortsDesc} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className={p.tiktok ? "btn-ghost btn-sm text-green-700 dark:text-green-500" : "btn-ghost btn-sm"} onClick={() => void mark("tiktok")}>{p.tiktok ? <><Check size={13} /> Publicado en TikTok</> : "Marcar publicado en TikTok"}</button>
          <button className={p.shorts ? "btn-ghost btn-sm text-green-700 dark:text-green-500" : "btn-ghost btn-sm"} onClick={() => void mark("shorts")}>{p.shorts ? <><Check size={13} /> Publicado en Shorts</> : "Marcar publicado en Shorts"}</button>
        </div>
      </div>
    </div>
  );
}

/** Horizontales terminados: «Recortar» los parte en piezas de ~1:30 para TikTok. */
export function TikTokParts() {
  const rows = useFinished();
  const nums = useNumbers();
  if (!rows) return null;
  const horizontal = rows.filter((r) => formatOf(r.v) === "16:9");
  if (!horizontal.length) return null;
  return (
    <Card title="Recortar videos de YouTube en partes" icon={Scissors}>
      <p className="text-[12.5px] text-muted-foreground -mt-1 mb-3">Un video horizontal se parte en piezas de ~1:30 (cada corte cae en una pausa entre frases) dentro de Descargas, con su texto y hashtags.</p>
      <div className="space-y-3">{horizontal.map((r) => <PartsRow key={r.v.id} row={r} n={nums.get(r.v.id)} />)}</div>
    </Card>
  );
}

function PartsRow({ row, n }: { row: Row; n?: number }) {
  const { v, render, pkg } = row;
  const done = v.data.tiktok as TikTokData | undefined;
  const [progress, setProgress] = useState("");
  const { text } = tiktokText(v, pkg);
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
    <div className="rounded-lg border border-border/80 bg-background/30 p-3 flex gap-4">
      <div className="w-44 shrink-0 aspect-video rounded-md overflow-hidden bg-black ring-1 ring-border relative self-start">
        {(pkg?.tiktok_cover || render.poster) && <img src={fileUrl(pkg?.tiktok_cover || render.poster!, render.renderedAt)} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className="w-full h-full object-cover" />}
        <NumberCorner n={n} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="font-semibold leading-snug">{pkg?.chosen_title || v.title}</div>
          <button onClick={() => void cut()} disabled={!!progress} title={done ? `Ya se recortó (${done.parts.length} partes). Vuelve a pulsar para recortar de nuevo.` : "Recortar en partes de 1:30"}
            className={`btn btn-sm shrink-0 ${done ? "bg-secondary text-muted-foreground border border-border hover:text-foreground" : "btn-primary"}`}>
            {progress ? <Spinner size={14} /> : done ? <Check size={14} /> : <Scissors size={14} />} {done ? "Recortado" : "Recortar"}
          </button>
        </div>
        <div className="mt-2"><CopyLine label="Texto para cada parte" text={text} /></div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <Chip>{fmtDuration(render.duration)}</Chip>
          {progress ? <span className="text-primary font-medium">{progress}</span> : done && <span className="text-muted-foreground">{done.parts.length} partes · {done.parts.map((p) => fmtDuration(p.end - p.start)).join(" · ")}</span>}
        </div>
      </div>
    </div>
  );
}
