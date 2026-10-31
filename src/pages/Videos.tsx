// Videos: los ya terminados (montados), publicados o no, con filtros por plataforma, modo y estado.
import { useEffect, useMemo, useState } from "react";
import { Clapperboard, ExternalLink, Film, Trash2, Search, Monitor, Smartphone } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useBus } from "../lib/bus";
import { fileUrl } from "../lib/ipc";
import { activeChannel, stagesByVideo, type StageRow, type Video, listVideos, deleteVideo, videoNumbers } from "../lib/repo";
import { askText } from "../ui/Ask";
import { toast } from "../lib/events";
import { navigate } from "../ui/nav";
import { Card, Empty, Chip } from "../ui/kit";
import { awaiting } from "../ui/Steps";
import { fmtDate, fmtDuration } from "../lib/util";
import { formatOf } from "../pipeline/format";
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

type Row = { v: Video; stages: StageRow[]; render: RenderOut };
interface Filters { platform: "" | "16:9" | "9:16"; mode: "" | "auto" | "personal"; status: "" | "review" | "ready" | "published" | "other"; q: string; sort: "new" | "old" | "long" }
const DEFAULT_FILTERS: Filters = { platform: "", mode: "", status: "", q: "", sort: "new" };
const loadFilters = (): Filters => { try { return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem("atril.videos.filters") ?? "{}"), q: "" }; } catch { return DEFAULT_FILTERS; } };

function statusOf(r: Row): Filters["status"] {
  const st = r.v.status;
  if (st === "published" || st === "scheduled") return "published";
  if (st === "ready") return "ready";
  if (r.stages.some((s) => s.stage === "final" && s.status === "review")) return "review";
  return "other";
}

/** Filtro de la lista: plataforma, modo, estado, texto y orden (función pura). */
export function filterVideos(rows: Row[], f: Filters): Row[] {
  const q = f.q.trim().toLowerCase();
  const out = rows.filter((r) => (!f.platform || formatOf(r.v) === f.platform)
    && (!f.mode || (f.mode === "personal") === !!r.v.data?.personal)
    && (!f.status || statusOf(r) === f.status)
    && (!q || r.v.title.toLowerCase().includes(q)));
  if (f.sort === "old") out.sort((a, b) => a.v.created_at - b.v.created_at);
  else if (f.sort === "long") out.sort((a, b) => (b.render.duration ?? 0) - (a.render.duration ?? 0));
  else out.sort((a, b) => b.v.created_at - a.v.created_at);
  return out;
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex h-8 p-0.5 rounded-md border border-border bg-background/60" role="group" aria-label={label}>
      {options.map(([id, l]) => <button key={id} type="button" onClick={() => onChange(id)} className={`px-2.5 rounded text-[12.5px] font-medium whitespace-nowrap ${value === id ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>)}
    </div>
  );
}

export function VideosPage() {
  const tick = useBus("videos", "stages", "channels");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [nums, setNums] = useState<Map<string, number>>(new Map());
  const [f, setF] = useState<Filters>(loadFilters);
  const set = (p: Partial<Filters>) => setF((x) => { const n = { ...x, ...p }; try { localStorage.setItem("atril.videos.filters", JSON.stringify({ ...n, q: "" })); } catch { /* sin almacenamiento */ } return n; });

  useEffect(() => {
    void (async () => {
      const ch = await activeChannel(); if (!ch) return;
      const [list, stages, n] = await Promise.all([listVideos(ch.id, 500), stagesByVideo(ch.id, ["render"]), videoNumbers(ch.id)]);
      setNums(n);
      const out: Row[] = [];
      for (const v of list) {
        if (v.status === "rejected" || v.status === "archived") continue;
        const st = stages.get(v.id) ?? [];
        const r = st.find((s) => s.stage === "render");
        if (r?.output && (r.status === "done" || r.status === "approved")) out.push({ v, stages: st, render: r.output as RenderOut });
      }
      setRows(out);
    })();
  }, [tick]);
  const shown = useMemo(() => filterVideos(rows ?? [], f), [rows, f]);

  if (rows === null) return null;
  if (!rows.length) return <Card><Empty icon={Clapperboard} title="Aún no hay videos terminados">Aparecen aquí cuando termina su montaje.</Empty></Card>;
  const vertical = rows.filter((r) => formatOf(r.v) === "9:16").length;
  const filtered = f.platform || f.mode || f.status || f.q.trim();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="input h-8 pl-8" placeholder="Buscar por título…" value={f.q} onChange={(e) => set({ q: e.target.value })} aria-label="Buscar videos" />
        </div>
        <Seg label="Plataforma" value={f.platform} onChange={(v) => set({ platform: v })} options={[["", "Todas"], ["16:9", "YouTube"], ["9:16", "TikTok"]]} />
        <Seg label="Modo" value={f.mode} onChange={(v) => set({ mode: v })} options={[["", "Todos"], ["auto", "Automatización"], ["personal", "Personal"]]} />
        <select className="input h-8 w-auto text-[12.5px]" value={f.status} onChange={(e) => set({ status: e.target.value as Filters["status"] })} aria-label="Estado">
          <option value="">Cualquier estado</option><option value="review">Por revisar</option><option value="ready">Aceptados</option><option value="published">Publicados o programados</option><option value="other">En otro paso</option>
        </select>
        <select className="input h-8 w-auto text-[12.5px]" value={f.sort} onChange={(e) => set({ sort: e.target.value as Filters["sort"] })} aria-label="Orden">
          <option value="new">Más recientes</option><option value="old">Más antiguos</option><option value="long">Más largos</option>
        </select>
      </div>
      <div className="text-[12px] text-muted-foreground flex items-center gap-2">
        <span>{filtered ? `${shown.length} de ${rows.length}` : rows.length} video(s) · {rows.length - vertical} YouTube · {vertical} TikTok</span>
        {filtered && <button className="text-primary hover:underline" onClick={() => set(DEFAULT_FILTERS)}>Quitar filtros</button>}
      </div>
      {!shown.length && <Card><Empty icon={Search} title="Ningún video con esos filtros" /></Card>}
      <div className="space-y-2.5">
        {shown.map(({ v, stages, render }) => {
          const a = awaiting(v, stages);
          const tall = formatOf(v) === "9:16";
          return (
            <div key={v.id} onClick={() => navigate({ page: "video", id: v.id })} className="card card-hover cursor-pointer p-3 pr-12 flex items-center gap-4 relative overflow-hidden">
              <div className="w-40 aspect-video shrink-0 rounded-lg overflow-hidden bg-black ring-1 ring-border grid place-items-center">
                {render.poster ? <img src={fileUrl(render.poster, render.renderedAt)} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} className={`h-full ${tall ? "object-contain" : "w-full object-cover"}`} /> : <Film size={20} className="text-muted-foreground/60" />}
              </div>
              <NumberCorner n={nums.get(v.id)} />
              <button className="absolute top-2 right-2 w-8 h-8 rounded-md grid place-items-center text-red-800 dark:text-red-700 hover:bg-red-800/10" title="Eliminar video" aria-label="Eliminar video"
                onClick={(e) => { e.stopPropagation(); void confirmDelete(v); }}><Trash2 size={16} /></button>
              <div className="flex-1 min-w-0">
                <div className="font-medium tracking-tight truncate">{v.title}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <Chip tone={a.tone === "muted" ? "muted" : a.tone}>{a.text.length > 48 ? a.text.slice(0, 47) + "…" : a.text}</Chip>
                  <Chip>{tall ? <><Smartphone size={11} /> TikTok</> : <><Monitor size={11} /> YouTube</>}</Chip>
                  {v.data?.personal && <Chip>Personal</Chip>}
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
    </div>
  );
}
