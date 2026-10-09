// Biblioteca de medios: todo lo descargado (imágenes, clips, efectos, música, íconos)
// con su descripción hecha por Claude, licencia y procedencia, para reutilizar.
import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { Library as LibraryIcon, Search, Eye, Upload, Globe, Star, Trash2, ExternalLink, FolderOpen, Ban, CheckCircle2, Music2, Plus, UserRound } from "lucide-react";
import { useBus } from "../lib/bus";
import { fileUrl } from "../lib/ipc";
import { listAssets, libraryStats, libraryRoot, updateAsset, deleteAsset, importLocalFile, importCandidate, getAsset, type Asset } from "../media/library";
import { searchSources, rankCandidates, SOURCE_LABEL, type AssetKind, type Candidate } from "../media/sources";
import { describeAssets, describePending } from "../media/vision";
import { searchIcons, importIcon, createIcon, type IconHit } from "../media/icons";
import { PageHeader, Card, Chip, Empty, Modal, AsyncButton, Tabs, Stat } from "../ui/kit";
import { navigate } from "../ui/nav";
import { toast, logError } from "../lib/events";
import { fmtBytes, fmtDate } from "../lib/util";

type KindTab = "all" | AssetKind;
const KIND_LABEL: Record<AssetKind, string> = { image: "Imagen", video: "Clip", sfx: "Efecto", music: "Música", icon: "Ícono" };

function Thumb({ a, className = "" }: { a: Asset; className?: string }) {
  if (a.kind === "icon") return <div className={`grid place-items-center bg-gradient-to-b from-primary/10 to-transparent ${className}`}><img src={fileUrl(a.path)} className="w-1/3 h-1/3 object-contain dark:invert opacity-90" loading="lazy" /></div>;
  if (a.thumb) return <img src={fileUrl(a.thumb)} className={`object-cover ${className}`} loading="lazy" />;
  return <div className={`flex items-center justify-center bg-muted ${className}`}><Music2 size={20} className="text-muted-foreground" /></div>;
}

export function LibraryPage() {
  const tick = useBus("assets");
  const [kind, setKind] = useState<KindTab>("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [fav, setFav] = useState(false);
  const [list, setList] = useState<Asset[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof libraryStats>>>({});
  const [sel, setSel] = useState<Asset | null>(null);
  const [web, setWeb] = useState(false);
  useEffect(() => { void (async () => {
    setList(await listAssets({ kind: kind === "all" ? null : kind, q: query, favorites: fav, limit: 240 }));
    setStats(await libraryStats());
  })(); }, [tick, kind, query, fav]);
  const undescribed = (stats.image?.undescribed ?? 0) + (stats.video?.undescribed ?? 0);
  const bytes = Object.values(stats).reduce((a, s) => a + (s?.bytes ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader kicker="Identidad" title="Biblioteca"
        actions={<>
          <button className="btn-ghost" onClick={async () => void openPath(await libraryRoot())}><FolderOpen size={15} /> Carpeta</button>
          <button className="btn-ghost" onClick={() => setWeb(true)}><Globe size={15} /> Buscar en internet</button>
          <AsyncButton className="btn-ghost" onClick={async () => {
            const sel0 = await openDialog({ multiple: true, filters: [{ name: "Medios", extensions: ["jpg", "jpeg", "png", "webp", "mp4", "mov", "webm", "mp3", "wav", "m4a", "ogg"] }] });
            const files = Array.isArray(sel0) ? sel0 : sel0 ? [sel0] : [];
            if (!files.length) return;
            const note = prompt("¿De dónde viene y con qué derecho lo usas?", "Material propio") ?? "Material propio";
            for (const f of files) {
              const ext = f.split(".").pop()!.toLowerCase();
              const k: AssetKind = ["mp4", "mov", "webm"].includes(ext) ? "video" : ["mp3", "wav", "m4a", "ogg"].includes(ext) ? "sfx" : "image";
              try { await importLocalFile(f, k, { note }); } catch (e) { await logError(e, null, "Importar a la biblioteca"); }
            }
            toast("success", `${files.length} importado(s)`);
          }}><Upload size={15} /> Importar propios</AsyncButton>
          <AsyncButton className="btn-primary" disabled={!undescribed} onClick={async () => { const n = await describePending(40); toast("success", `${n} descrito(s)`); }}>
            <Eye size={15} /> Describir ({undescribed})
          </AsyncButton>
        </>} />
      <div className="grid grid-cols-6 gap-3">
        <Card><Stat label="Imágenes" value={stats.image?.n ?? 0} /></Card>
        <Card><Stat label="Clips" value={stats.video?.n ?? 0} /></Card>
        <Card><Stat label="Efectos" value={stats.sfx?.n ?? 0} /></Card>
        <Card><Stat label="Música" value={stats.music?.n ?? 0} sub={<button className="hover:underline" onClick={() => navigate({ page: "ajustes", tab: "music" })}>+ propias</button>} /></Card>
        <Card><Stat label="Íconos" value={stats.icon?.n ?? 0} /></Card>
        <Card><Stat label="Espacio" value={fmtBytes(bytes)} sub={undescribed ? `${undescribed} sin describir` : undefined} /></Card>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={kind} onChange={setKind} tabs={[{ id: "all", label: "Todo" }, { id: "image", label: "Imágenes" }, { id: "video", label: "Clips" }, { id: "sfx", label: "Efectos" }, { id: "music", label: "Música" }, { id: "icon", label: "Íconos" }]} />
        <form className="flex-1 flex gap-2 min-w-[280px]" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
          <input className="input" placeholder="Buscar por lo que muestra" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-brand"><Search size={15} /></button>
        </form>
        <button className={`btn-ghost ${fav ? "text-amber-500" : ""}`} onClick={() => setFav(!fav)}><Star size={15} /> Favoritos</button>
      </div>
      {list.length === 0 ? <Card><Empty icon={LibraryIcon} title={query ? "Sin resultados" : "Vacía"}>{query ? "" : "Se llena sola al producir videos."}</Empty></Card> : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
          {list.map((a) => (
            <button key={a.id} onClick={() => setSel(a)} className="card card-hover overflow-hidden text-left">
              <div className="relative"><Thumb a={a} className="w-full aspect-video" />
                <span className="absolute top-1 left-1 chip bg-black/60 text-white border-transparent">{KIND_LABEL[a.kind]}{a.kind !== "image" && a.duration ? ` · ${Math.max(1, Math.round(a.duration))} s` : ""}</span>
                {a.favorite ? <Star size={14} className="absolute top-1.5 right-1.5 text-amber-400 fill-amber-400" /> : null}
                {!a.usable && <span className="absolute bottom-1 right-1 chip bg-red-600/80 text-white border-transparent">no usar</span>}
              </div>
              <div className="p-2">
                <div className="text-xs font-medium line-clamp-2 min-h-[2.2em]">{a.described_at ? (a.tags.split(",")[0] || a.title) : a.title}</div>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">{(SOURCE_LABEL as Record<string, string>)[a.source] ?? (a.source === "user" ? "Propio" : a.source === "iconify" ? "Iconify" : a.source === "generated" ? "Creado con IA" : a.source)}</span>
                  {!a.described_at && (a.kind === "image" || a.kind === "video") && <span className="text-[10px] text-amber-500">· sin describir</span>}
                  {a.real_person ? <UserRound size={10} className="text-amber-500" /> : null}
                  {a.used_count > 0 && <span className="text-[10px] text-muted-foreground">· usado {a.used_count}×</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <AssetModal asset={sel} onClose={() => setSel(null)} />
      <WebSearchModal open={web} onClose={() => setWeb(false)} />
    </div>
  );
}

function AssetModal({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const tick = useBus("assets");
  const [a, setA] = useState<Asset | null>(asset);
  useEffect(() => { if (asset) void getAsset(asset.id).then(setA); else setA(null); }, [asset, tick]);
  if (!a) return null;
  return (
    <Modal open={!!asset} onClose={onClose} title={a.described_at ? (a.tags.split(",")[0] || a.title) : a.title} wide
      footer={<>
        <button className="btn-ghost" onClick={() => void updateAsset(a.id, { favorite: a.favorite ? 0 : 1 })}><Star size={14} className={a.favorite ? "fill-amber-400 text-amber-400" : ""} /> {a.favorite ? "Quitar favorito" : "Favorito"}</button>
        <button className="btn-ghost" onClick={() => void updateAsset(a.id, { usable: a.usable ? 0 : 1 })}>{a.usable ? <><Ban size={14} /> No usar</> : <><CheckCircle2 size={14} /> Permitir</>}</button>
        {(a.kind === "image" || a.kind === "video") && <AsyncButton className="btn-ghost" onClick={async () => { await describeAssets([{ ...a, described_at: null }]); }}><Eye size={14} /> {a.described_at ? "Redescribir" : "Describir"}</AsyncButton>}
        <button className="btn-ghost text-red-500" onClick={async () => { if (confirm("¿Borrar este archivo?")) { await deleteAsset(a.id); onClose(); } }}><Trash2 size={14} /> Borrar</button>
      </>}>
      <div className="grid grid-cols-[1.3fr_1fr] gap-5">
        <div>
          {a.kind === "icon" ? <div className="rounded-lg border border-border bg-secondary/40 grid place-items-center aspect-square"><img src={fileUrl(a.path)} className="w-1/2 h-1/2 object-contain dark:invert" /></div> :
          a.kind === "image" ? <img src={fileUrl(a.path)} className="w-full rounded border border-border" /> :
            a.kind === "video" ? <video src={fileUrl(a.path)} controls className="w-full rounded border border-border" /> :
              <div className="space-y-2"><Thumb a={a} className="w-full h-24 rounded" /><audio src={fileUrl(a.path)} controls className="w-full" /></div>}
          <div className="flex gap-2 mt-2">
            <button className="btn-ghost btn-sm" onClick={() => void openPath(a.path)}><FolderOpen size={13} /> Abrir</button>
            {a.page_url && <button className="btn-ghost btn-sm" onClick={() => void openUrl(a.page_url!)}><ExternalLink size={13} /> Origen</button>}
          </div>
        </div>
        <div className="space-y-3 text-sm">
          {a.description ? <p className="leading-relaxed">{a.description}</p> : <p className="text-muted-foreground">Sin describir.</p>}
          {a.tags && <div className="flex flex-wrap gap-1">{a.tags.split(",").slice(1, 26).map((t, i) => <Chip key={i}>{t.trim()}</Chip>)}</div>}
          <table className="w-full text-xs"><tbody>
            {([
              ["Licencia", a.license_url ? <button className="text-primary hover:underline" onClick={() => void openUrl(a.license_url)}>{a.license}</button> : a.license],
              ["Autor", a.author || "—"], ["Fuente", (SOURCE_LABEL as Record<string, string>)[a.source] ?? a.source],
              ["Atribución", <span className="break-all">{a.attribution || "—"}</span>],
              ["Tamaño", `${a.kind === "sfx" || a.kind === "music" ? "audio" : `${a.width ?? "?"}×${a.height ?? "?"}`}${a.kind !== "image" && a.duration ? ` · ${a.duration.toFixed(1)} s` : ""} · ${fmtBytes(a.bytes ?? 0)}`],
              ["Calidad", a.quality ? `${a.quality}/5` : "—"], ["Ambiente", a.mood || "—"],
              ["Persona real", a.real_person ? "Sí" : "No"],
              ["Problemas", a.issues || "—"], ["Buscado como", a.query || "—"], ["Usos", `${a.used_count}${a.last_used ? ` · último ${fmtDate(a.last_used)}` : ""}`],
              ["Descargado", fmtDate(a.created_at)],
            ] as [string, React.ReactNode][]).map(([k, v]) => <tr key={k} className="border-t border-border/50"><td className="py-1 text-muted-foreground w-28 align-top">{k}</td><td className="py-1">{v}</td></tr>)}
          </tbody></table>
        </div>
      </div>
    </Modal>
  );
}

function WebSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState(""); const [kind, setKind] = useState<AssetKind>("image");
  const [res, setRes] = useState<Candidate[]>([]); const [icons, setIcons] = useState<IconHit[] | null>(null); const [errors, setErrors] = useState<string[]>([]);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  return (
    <Modal open={open} onClose={onClose} title="Buscar en internet" wide>
      <form className="flex gap-2 mb-3" onSubmit={async (e) => {
        e.preventDefault(); if (!q.trim()) return;
        if (kind === "icon") { setRes([]); setIcons(await searchIcons(q.trim(), 48)); setErrors([]); return; }
        setIcons(null);
        const r = await searchSources(q.trim(), kind, 8);
        setRes(rankCandidates(r.candidates, kind)); setErrors([...r.errors.map((x) => `${SOURCE_LABEL[x.source]}: ${x.message}`), ...r.skipped.map((x) => `${SOURCE_LABEL[x]}: cuota casi agotada`)]);
      }}>
        <select className="input w-36" value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
          <option value="image">Imágenes</option><option value="video">Clips</option><option value="sfx">Efectos</option><option value="music">Música</option><option value="icon">Íconos</option>
        </select>
        <input className="input" placeholder={kind === "icon" ? "En inglés: «police», «money», «arrow up»" : "Mejor en inglés: «foggy forest»"} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary"><Search size={15} /> Buscar</button>
      </form>
      <div className="text-[11px] text-muted-foreground mb-2">{kind === "icon" ? "Íconos de colecciones con licencia abierta (MIT, Apache, CC0, CC BY…)." : "Solo licencias aptas para monetizar."}</div>
      {errors.length > 0 && <div className="text-xs text-amber-500 mb-2">{errors.join(" · ")}</div>}
      {icons && (
        icons.length === 0 ? (
          <div className="text-sm text-muted-foreground flex items-center gap-3">Sin resultados con licencia abierta.
            <AsyncButton className="btn-brand btn-sm" onClick={async () => { await createIcon(q.trim()); toast("success", "Ícono creado", "Ya está en la biblioteca."); }}><Plus size={13} /> Crear con IA</AsyncButton>
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-2 max-h-[60vh] overflow-y-auto">
            {icons.map((h) => (
              <button key={h.id} disabled={added[h.id]} title={`${h.name} · ${h.set} · ${h.license}`}
                onClick={async () => { try { await importIcon(h, q.trim()); setAdded((x) => ({ ...x, [h.id]: true })); } catch (e) { await logError(e, null, "Ícono"); } }}
                className={`card card-hover aspect-square grid place-items-center relative ${added[h.id] ? "ring-2 ring-primary" : ""}`}>
                <img src={`https://api.iconify.design/${h.prefix}/${h.name}.svg`} className="w-9 h-9 dark:invert" loading="lazy" />
                {added[h.id] && <CheckCircle2 size={14} className="absolute top-1 right-1 text-primary" />}
              </button>
            ))}
          </div>
        )
      )}
      <div className="grid grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto">
        {res.map((c) => {
          const k = `${c.source}:${c.sourceId}`;
          return (
            <div key={k} className="card overflow-hidden">
              {c.kind === "image" || c.kind === "video" ? <img src={c.previewUrl} className="w-full aspect-video object-cover" loading="lazy" /> : <audio src={c.previewUrl} controls className="w-full" />}
              <div className="p-2 space-y-1">
                <div className="text-[11px] line-clamp-2">{c.title}</div>
                <div className="text-[10px] text-muted-foreground">{SOURCE_LABEL[c.source]} · {c.license}{c.duration ? ` · ${Math.round(c.duration)} s` : ""}</div>
                <AsyncButton className="btn-brand btn-sm w-full" disabled={added[k]} onClick={async () => {
                  const a = await importCandidate(c); setAdded({ ...added, [k]: true });
                  if (a.kind === "image" || a.kind === "video") await describeAssets([a]);
                }}>{added[k] ? <><CheckCircle2 size={13} /> Agregado</> : <><Plus size={13} /> Agregar</>}</AsyncButton>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
