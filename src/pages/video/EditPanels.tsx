// Paneles de la edición v2: storyboard, medios y casting, retoques de Opus y
// animaciones; editor de una toma y camas musicales.
import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Image as ImageIcon, Film, Sparkles, RotateCcw, Search, Type, Music2, Wand2, AlertTriangle, ExternalLink } from "lucide-react";
import { fileUrl } from "../../lib/ipc";
import { listMusic, type Video, type Track } from "../../lib/repo";
import { getAssets, searchLibrary, type Asset } from "../../media/library";
import { replaceShotAsset, shotToCard, setBedTrack, redoMotionItem } from "../../pipeline/edit";
import { rerenderFrom } from "../../pipeline/runner";
import { Card, Chip, Modal, AsyncButton, Field, Empty } from "../../ui/kit";
import { toast } from "../../lib/events";
import type { StoryboardOut, AssetsOut, PolishOut, MotionOut, Shot, MusicBed } from "../../pipeline/types";

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

function bySegment(shots: Shot[]) {
  const ids = [...new Set(shots.map((s) => s.segment_id))];
  return ids.map((id) => ({ id, shots: shots.filter((s) => s.segment_id === id) }));
}

export function StoryboardPanel({ data }: { data: StoryboardOut }) {
  const c = (k: string[]) => data.shots.filter((s) => k.includes(s.visual)).length;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap text-xs">
        <Chip>{data.shots.length} tomas</Chip><Chip tone="green">{c(["photo", "archival"])} imágenes</Chip><Chip tone="primary">{c(["clip", "meme"])} clips</Chip>
        <Chip tone="amber">{c(["motion", "map"])} animaciones</Chip><Chip>{c(["source_card", "quote_card", "title_card", "text_card"])} tarjetas</Chip><Chip>{data.sfx.length} efectos</Chip><Chip>{data.music.length} camas musicales</Chip>
      </div>
      {data.notes_es && <Card><div className="text-sm">{data.notes_es}</div></Card>}
      <Card title="Plan por tomas" pad={false}>
        <table className="w-full text-xs">
          <thead><tr className="text-muted-foreground text-left border-b border-border"><th className="px-3 py-2">Toma</th><th>Tiempo</th><th>Tipo</th><th>Qué se busca / muestra</th><th className="px-3">Debe verse</th></tr></thead>
          <tbody>{data.shots.map((s) => (
            <tr key={s.id} className="border-b border-border/50 align-top">
              <td className="px-3 py-1.5 tabular">{s.id}</td><td className="tabular whitespace-nowrap">{(s.start ?? 0).toFixed(1)}–{((s.start ?? 0) + (s.dur ?? 0)).toFixed(1)} s</td>
              <td><Chip>{VIS_LABEL[s.visual]}</Chip></td>
              <td>{s.query_en ?? s.card_text ?? s.motion_brief_en ?? s.source_id}{s.alt_queries_en?.length ? <div className="text-muted-foreground">alt: {s.alt_queries_en.join(" · ")}</div> : null}</td>
              <td className="px-3 text-muted-foreground">{s.must_show_es}{s.avoid_es ? <div className="text-amber-600">evitar: {s.avoid_es}</div> : null}</td>
            </tr>))}</tbody>
        </table>
      </Card>
      <Card title="Música y efectos">
        <div className="text-xs space-y-1">
          {data.music.map((b, i) => <div key={i}><Music2 size={11} className="inline mr-1 text-teal-500" />{b.mood_en} <span className="text-muted-foreground">({b.segment_ids.join(", ")})</span></div>)}
          <div className="text-muted-foreground pt-1">{data.sfx.map((x) => `${x.type} @ ${x.at.toFixed(1)} s`).join(" · ")}</div>
        </div>
      </Card>
    </div>
  );
}

export function AssetsPanel({ video, data, editable = true }: { video: Video; data: AssetsOut; editable?: boolean }) {
  const [edit, setEdit] = useState<Shot | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs flex-wrap">
        <Chip tone="green">{data.reused} reutilizados de la biblioteca</Chip><Chip tone="primary">{data.downloaded} descargados</Chip>
        <Chip>{data.described} descritos por Claude</Chip>{data.fallbacks > 0 && <Chip tone="amber">{data.fallbacks} sin material (tarjeta)</Chip>}
      </div>
      {bySegment(data.shots).map((g) => (
        <div key={g.id} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          {g.shots.map((s) => <ShotThumb key={s.id} s={s} onClick={editable ? () => setEdit(s) : undefined} />)}
        </div>
      ))}
      <ShotEditorV2 video={video} shot={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

export function PolishPanel({ video, data }: { video: Video; data: PolishOut }) {
  const [edit, setEdit] = useState<Shot | null>(null);
  const motionShots = new Set(data.motion.flatMap((m) => m.shot_ids));
  return (
    <div className="space-y-3">
      <Card title="Qué mejoró Opus" icon={Wand2}><div className="text-sm whitespace-pre-wrap">{data.notes_es || "—"}</div>
        <div className="flex gap-2 mt-2 text-xs flex-wrap"><Chip>Etalonaje: {data.grade}</Chip><Chip>{data.shots.filter((s) => s.transition_in && s.transition_in !== "cut").length} transiciones</Chip>
          <Chip>{data.shots.filter((s) => s.punch_at != null).length} golpes de zoom</Chip><Chip>{data.sfx.length} efectos</Chip><Chip tone="primary">{data.motion.length} animaciones</Chip></div>
      </Card>
      {data.motion.length > 0 && <Card title="Animaciones encargadas">
        <div className="space-y-2 text-xs">{data.motion.map((m) => <div key={m.id}><b>{m.id}</b> · {m.kind === "overlay" ? "capa" : "pantalla completa"} · {m.duration.toFixed(1)} s — {m.brief_en}{m.text ? <span className="text-muted-foreground"> · «{m.text}»</span> : null}</div>)}</div>
      </Card>}
      {bySegment(data.shots).map((g) => (
        <div key={g.id} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          {g.shots.map((s) => <ShotThumb key={s.id} s={s} motion={motionShots.has(s.id)} onClick={() => setEdit(s)} />)}
        </div>
      ))}
      <ShotEditorV2 video={video} shot={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

export function MotionPanel({ video, data }: { video: Video; data: MotionOut }) {
  if (!data.items.length) return <Card><Empty icon={Sparkles} title="Sin animaciones">Opus no encargó animaciones para este video, o el motor está desactivado en Ajustes → Motion.</Empty></Card>;
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
          {m.attempts && m.attempts > 1 && <div className="text-[11px] text-muted-foreground">{m.attempts} intentos</div>}
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
    toast("info", "Toma cambiada", "Solo se vuelve a montar el segmento afectado; las decisiones de Opus se conservan.");
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
          {shot.cast_note_es && <div className="text-xs mt-2">Por qué se eligió: {shot.cast_note_es}</div>}
          {shot.must_show_es && <div className="text-xs text-muted-foreground">Debe mostrar: {shot.must_show_es}</div>}
        </div>
        <div className="space-y-4">
          {cands.length > 0 && <div><div className="label mb-1.5">Otros candidatos</div><div className="grid grid-cols-3 gap-2">{cands.map((a) => <Pick key={a.id} a={a} />)}</div></div>}
          <div>
            <div className="label mb-1.5">Buscar en la biblioteca</div>
            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); setHits(await searchLibrary(q, shot.media === "video" ? "video" : null, 12)); }}>
              <input className="input text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qué debe verse" />
              <button className="btn-brand"><Search size={14} /></button>
            </form>
            {hits.length > 0 && <div className="grid grid-cols-3 gap-2 mt-2 max-h-64 overflow-y-auto">{hits.filter((a) => a.kind === "image" || a.kind === "video").map((a) => <Pick key={a.id} a={a} />)}</div>}
          </div>
          <Field label="O usar una tarjeta de texto">
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
              toast("info", "Música cambiada", "Se rehace solo la mezcla final.");
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
