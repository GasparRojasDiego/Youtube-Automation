// Paneles de la revisión final: miniaturas de tomas, animaciones, editor de una toma y camas musicales.
import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Image as ImageIcon, Film, Sparkles, RotateCcw, Search, Type, Music2, AlertTriangle, ExternalLink } from "lucide-react";
import { fileUrl } from "../../lib/ipc";
import { listMusic, type Video, type Track } from "../../lib/repo";
import { getAssets, searchLibrary, type Asset } from "../../media/library";
import { replaceShotAsset, shotToCard, setBedTrack, redoMotionItem } from "../../pipeline/edit";
import { rerenderFrom } from "../../pipeline/runner";
import { Card, Chip, Modal, AsyncButton, Field, Empty } from "../../ui/kit";
import { toast } from "../../lib/events";
import type { MotionOut, Shot, MusicBed } from "../../pipeline/types";

const VIS_LABEL: Record<string, string> = {
  photo: "Foto", archival: "Archivo", clip: "Clip", meme: "Meme", motion: "Animación", map: "Mapa",
  source_card: "Fuente", quote_card: "Cita", title_card: "Título", text_card: "Texto",
};

export function ShotThumb({ s, onClick, motion }: { s: Shot; onClick?: () => void; motion?: boolean }) {
  return (
    <button onClick={onClick} className="card overflow-hidden text-left hover:border-primary/50 transition-colors" title={s.cast_note_es ?? s.query_en ?? s.card_text}>
      <div className="aspect-video bg-secondary relative">
        {s.path ? (s.media === "video" ? <video src={fileUrl(s.path)} muted preload="metadata" className="w-full h-full object-cover" /> : <img loading="lazy" src={fileUrl(s.path)} className="w-full h-full object-cover" />)
          : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon size={18} /></div>}
        <span className="absolute top-1 left-1 chip bg-black/60 border-white/20 text-white">{s.media === "video" ? <Film size={10} /> : null}{VIS_LABEL[s.visual] ?? s.visual}</span>
        {motion && <span className="absolute top-1 right-1 chip bg-fuchsia-600/80 border-transparent text-white"><Sparkles size={10} /></span>}
        {s.dur != null && <span className="absolute bottom-1 right-1 chip bg-black/60 border-white/20 text-white tabular">{s.dur.toFixed(1)} s</span>}
        {s.transition_in && s.transition_in !== "cut" && <span className="absolute bottom-1 left-1 chip bg-black/60 border-white/20 text-white">{s.transition_in}</span>}
      </div>
      <div className="p-1.5 text-[10.5px] text-muted-foreground line-clamp-2">{s.error ? <span className="text-amber-600">{s.error}</span> : s.query_en ?? s.card_text ?? s.motion_brief_en ?? s.source_id}</div>
    </button>
  );
}


export function MotionPanel({ video, data }: { video: Video; data: MotionOut }) {
  if (!data.items.length) return <Card><Empty icon={Sparkles} title="Sin animaciones" /></Card>;
  return (
    <div className="grid grid-cols-2 gap-3">
      {data.items.map((m) => (
        <Card key={m.id} title={<span className="flex items-center gap-2">{m.id} <Chip>{m.kind === "overlay" ? "capa con alfa" : "pantalla completa"}</Chip> <span className="text-xs text-muted-foreground tabular">{m.duration.toFixed(1)} s</span></span>}
          actions={<AsyncButton className="btn-ghost btn-sm" onClick={async () => { await redoMotionItem(video.id, m.id); await rerenderFrom(video.id, "motion"); toast("info", `La animación ${m.id} se rehará.`); }}><RotateCcw size={13} /> Rehacer</AsyncButton>}>
          {m.file ? <video src={fileUrl(m.file)} poster={m.poster ? fileUrl(m.poster) : undefined} controls loop className="w-full rounded bg-[repeating-conic-gradient(#555_0%_25%,#333_0%_50%)] [background-size:24px_24px] aspect-video" />
            : <div className="aspect-video rounded bg-secondary flex items-center justify-center text-xs text-amber-600 p-4 text-center"><AlertTriangle size={14} className="mr-1" />{m.error ?? "Pendiente"}</div>}
          <details className="text-xs mt-2"><summary className="cursor-pointer line-clamp-2">{m.brief_en}</summary><div className="mt-1 text-muted-foreground">{m.brief_en}</div></details>
          {m.text && <div className="text-xs text-muted-foreground">Texto: «{m.text}»</div>}
          {m.critique_es && <div className="text-[11px] text-muted-foreground mt-1">Revisión: {m.critique_es}</div>}
          {m.attempts && m.attempts > 1 ? <div className="text-[11px] text-muted-foreground">{m.attempts} intentos</div> : null}
        </Card>
      ))}
    </div>
  );
}

/** Cambiar el material de una toma: candidatos, búsqueda en la biblioteca o tarjeta de texto. */
export function ShotEditorV2({ video, shot, onClose }: { video: Video; shot: Shot | null; onClose: () => void }) {
  const [cands, setCands] = useState<Asset[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Asset[]>([]);
  const [text, setText] = useState("");
  useEffect(() => {
    if (!shot) return;
    setQ(shot.query_en ?? ""); setText(shot.card_text ?? ""); setHits([]);
    void getAssets(shot.candidates ?? []).then((m) => setCands([...m.values()]));
  }, [shot]);
  if (!shot) return null;
  const apply = async (assetId: string | null) => {
    await replaceShotAsset(video.id, shot.id, assetId);
    await rerenderFrom(video.id, "package");
    toast("info", "Toma cambiada");
    onClose();
  };
  const p = shot.provenance;
  const Pick = ({ a }: { a: Asset }) => (
    <button onClick={() => void apply(a.id)} className={`card overflow-hidden text-left hover:border-primary/60 ${a.id === shot.asset_id ? "border-primary" : ""}`} title={a.description}>
      {a.thumb ? <img src={fileUrl(a.thumb)} className="aspect-video object-cover w-full" /> : <div className="aspect-video bg-secondary" />}
      <div className="p-1 text-[10px] line-clamp-2">{a.tags.split(",")[0] || a.title}</div>
    </button>
  );
  return (
    <Modal open={!!shot} onClose={onClose} title={`Toma ${shot.id} · ${VIS_LABEL[shot.visual] ?? shot.visual}`} wide>
      <div className="grid grid-cols-[1.2fr_1fr] gap-5">
        <div>
          {shot.path && (shot.media === "video" ? <video src={fileUrl(shot.path)} controls className="rounded-lg border border-border w-full" /> : <img src={fileUrl(shot.path)} className="rounded-lg border border-border w-full" />)}
          {p && <div className="text-[11px] text-muted-foreground mt-2 space-y-0.5">
            <div><b>Procedencia:</b> {p.provider}{p.license ? ` · ${p.license}` : ""}</div>
            {p.attribution && <div className="break-all">{p.attribution}</div>}
            {p.sourceUrl && <button className="text-primary hover:underline inline-flex items-center gap-1" onClick={() => void openUrl(p.sourceUrl!)}>Página de origen <ExternalLink size={10} /></button>}
          </div>}
          {shot.cast_note_es && <div className="text-xs mt-2">{shot.cast_note_es}</div>}
          {shot.must_show_es && <div className="text-xs text-muted-foreground">Debe mostrar: {shot.must_show_es}</div>}
        </div>
        <div className="space-y-4">
          {cands.length > 0 && <div><div className="label mb-1.5">Candidatos</div><div className="grid grid-cols-3 gap-2">{cands.map((a) => <Pick key={a.id} a={a} />)}</div></div>}
          <div>
            <div className="label mb-1.5">Biblioteca</div>
            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); setHits(await searchLibrary(q, shot.media === "video" ? "video" : null, 12)); }}>
              <input className="input text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qué debe verse" />
              <button className="btn-brand"><Search size={14} /></button>
            </form>
            {hits.length > 0 && <div className="grid grid-cols-3 gap-2 mt-2 max-h-64 overflow-y-auto">{hits.filter((a) => a.kind === "image" || a.kind === "video").map((a) => <Pick key={a.id} a={a} />)}</div>}
          </div>
          <Field label="Tarjeta de texto">
            <div className="flex gap-2">
              <input className="input text-sm" value={text} onChange={(e) => setText(e.target.value)} />
              <AsyncButton className="btn-brand" disabled={!text.trim()} onClick={async () => { await shotToCard(video, shot.id, text.trim()); await rerenderFrom(video.id, "package"); onClose(); }}><Type size={14} /></AsyncButton>
            </div>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/** Camas musicales del video, con cambio de pista. */
export function MusicBeds({ video, beds, editable }: { video: Video; beds: MusicBed[]; editable: boolean }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [lib, setLib] = useState<Asset[]>([]);
  useEffect(() => { void listMusic().then(setTracks); void searchLibrary("music ambient piano cinematic dark soft", "music", 30).then(setLib); }, []);
  return (
    <Card title="Música" icon={Music2}>
      <div className="space-y-2">
        {beds.map((b, i) => (
          <div key={i} className="space-y-1">
            <div className="text-[11px] text-muted-foreground">{b.mood_en} · {b.segment_ids.length} segmento(s)</div>
            <select className="input text-xs" disabled={!editable} value={b.path ?? ""} onChange={async (e) => {
              const v = e.target.value;
              const t = tracks.find((x) => x.path === v); const a = lib.find((x) => x.path === v);
              await setBedTrack(video.id, i, v ? { path: v, title: t?.title ?? a?.title ?? "", asset_id: a?.id ?? null } : null);
              await rerenderFrom(video.id, "package");
              toast("info", "Música cambiada");
            }}>
              <option value="">Sin música</option>
              {b.path && !tracks.some((t) => t.path === b.path) && !lib.some((a) => a.path === b.path) && <option value={b.path}>{b.title ?? "Pista actual"}</option>}
              {tracks.filter((t) => t.enabled).map((t) => <option key={t.id} value={t.path}>Propia · {t.title}</option>)}
              {lib.map((a) => <option key={a.id} value={a.path}>Biblioteca · {a.title.slice(0, 60)} ({a.license})</option>)}
            </select>
          </div>
        ))}
        {beds.length === 0 && <div className="text-xs text-muted-foreground">Sin camas musicales.</div>}
      </div>
    </Card>
  );
}
