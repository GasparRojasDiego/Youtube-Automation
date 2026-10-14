// Cola de producción en Inicio: tarjetas apiladas (Automatización o Personal, según el modo activo) que
// ATRIL produce una tras otra, hasta 50, y deja cada video en tu revisión final.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ListOrdered, Plus, Play, Pause, Square, RotateCcw, Trash2, Copy, ChevronUp, ChevronDown, ArrowRight, Bot, UserRound, Image as ImageIcon, Smartphone, X,
  FolderOpen, FileText, Film, Music2, Clock, AlertTriangle, CheckCircle2, SkipForward, Wand2, Library } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useBus } from "../lib/bus";
import { fileUrl } from "../lib/ipc";
import { getStages, listTopics, getVideo, STAGES, type Topic, type StageRow, type Video } from "../lib/repo";
import { listAssets, type Asset } from "../media/library";
import { FONT_FAMILIES } from "../motion/page";
import { TONES, ACCEPT, SCRIPT_EXT, kindOf, AESTHETIC_EXAMPLE, type ToneId } from "../pipeline/personal";
import { FORMATS, type VideoFormat } from "../pipeline/format";
import { COVER_EXT } from "../pipeline/covers";
import type { CoverKind } from "../pipeline/covers";
import { listQueue, addItem, saveCfg, removeItem, duplicateItem, moveItem, retryItem, skipItem, clearFinished, storeFile, checkItem, getQueueState,
  startQueue, pauseQueue, retryNow, isAuto, isActive, QUEUE_MAX, type QueueItem, type QueueMode, type AutoCfg, type PersonalCfg, type QueueState } from "../pipeline/queue";
import { navigate } from "../ui/nav";
import { Card, Chip, Modal, Field, Toggle, AsyncButton } from "../ui/kit";
import { askConfirm } from "../ui/Ask";
import { toast } from "../lib/events";

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const fmtMin = (m: number) => (m < 1 ? `${Math.round(m * 60)} s` : `${Math.round(m * 100) / 100} min`);
const range = (r: [number, number]) => (r[0] === r[1] ? fmtMin(r[0]) : `${fmtMin(r[0])}–${fmtMin(r[1])}`);
const clock = (t: number) => new Date(t).toLocaleString("es-PE", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });

function statusChip(it: QueueItem, stage: string | null) {
  switch (it.status) {
    case "running": return <Chip tone="primary">En curso{stage ? `: ${stage}` : ""}</Chip>;
    case "waiting": return <Chip tone="amber"><Clock size={11} /> Espera hasta {it.wait_until ? clock(it.wait_until) : "—"}</Chip>;
    case "done": return <Chip tone="green"><CheckCircle2 size={11} /> Lista para tu revisión</Chip>;
    case "attention": return <Chip tone="amber"><AlertTriangle size={11} /> Necesita tu atención</Chip>;
    case "failed": return <Chip tone="red">Falló</Chip>;
    case "skipped": return <Chip>Omitida</Chip>;
    default: return <Chip>Pendiente</Chip>;
  }
}

export function titleOf(it: QueueItem, topics: Topic[]): string {
  if (isAuto(it)) {
    const c = it.cfg;
    if (c.title.trim()) return c.title.trim();
    if (c.topic.kind === "topic") { const id = c.topic.id; return topics.find((t) => t.id === id)?.title ?? c.topic.title; }
    if (c.topic.kind === "idea") return c.topic.text.trim().split("\n")[0] || "Idea sin escribir";
    return "Siguiente tema aprobado";
  }
  const p = it.cfg as PersonalCfg;
  return p.title.trim() || p.about.trim().split("\n")[0] || (p.script.trim() || p.scriptFile ? "Video con guion propio" : "Video personal sin título");
}

/** Recuadro de la cola (entre «¿Qué video hacemos hoy?» y «En curso»). */
export function QueuePanel({ mode, channelId }: { mode: QueueMode; channelId: string }) {
  const tick = useBus("queue", "topics", "stages", "jobs", "videos");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [state, setState] = useState<QueueState | null>(null);
  const [stageOf, setStageOf] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void (async () => {
      const list = await listQueue(channelId);
      setItems(list); setTopics(await listTopics(channelId)); setState({ ...(await getQueueState()) });
      const st: Record<string, string> = {};
      for (const it of list.filter((x) => x.status === "running" && x.video_id)) {
        const rows: StageRow[] = await getStages(it.video_id!);
        const r = rows.find((s) => s.status === "running");
        if (r) st[it.id] = `${STAGES.find((s) => s.id === r.stage)?.label ?? r.stage}${r.progress ? ` · ${r.progress}` : ""}`;
      }
      setStageOf(st);
    })();
  }, [tick, channelId]);
  const waiting = items.some((i) => i.status === "waiting");
  useEffect(() => { if (!waiting) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [waiting]);

  const mine = items.filter((i) => i.mode === mode);
  const others = items.filter((i) => i.mode !== mode && isActive(i)).length;
  const active = items.filter(isActive).length;
  const running = !!state?.running && state.channelId === channelId;
  const nextWait = items.filter((i) => i.status === "waiting" && i.wait_until).sort((a, b) => a.wait_until! - b.wait_until!)[0];
  const ready = items.filter((i) => isActive(i) && !checkItem(i, { topics, items }).problems.length).length;
  const editing = items.find((i) => i.id === edit) ?? null;
  const add = async () => { const it = await addItem(channelId, mode); setEdit(it.id); };
  const left = nextWait?.wait_until ? Math.max(0, nextWait.wait_until - now) : 0;

  return (
    <Card title={<span className="flex items-center gap-2">Cola de producción <Chip tone="primary">{mode === "auto" ? <><Bot size={11} /> Automatización</> : <><UserRound size={11} /> Personal</>}</Chip></span>} icon={ListOrdered}
      actions={<span className="text-[11px] text-muted-foreground tabular">{active}/{QUEUE_MAX} en cola</span>}>
      <p className="text-[12.5px] text-muted-foreground -mt-1 mb-3">
        {mode === "auto" ? "Cada tarjeta es un video del canal: elige el tema, la duración, el formato y tus portadas." : "Cada tarjeta es un video a tu medida: título, modo, estética, guion, recursos y portadas."}
        {" "}La cola los produce uno tras otro y deja cada uno en tu revisión final: nada se publica sin tu aprobación.
      </p>
      {state?.note && !running && <div className="mb-3 text-[12.5px] rounded-md border border-border bg-secondary/40 px-3 py-2">{state.note}</div>}
      {running && nextWait && (
        <div className="mb-3 text-[12.5px] rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 flex items-center justify-between gap-3">
          <span><Clock size={13} className="inline -mt-0.5 mr-1" />{nextWait.error ?? "En espera"} Faltan <b className="tabular">{Math.floor(left / 3600_000)} h {String(Math.floor((left % 3600_000) / 60_000)).padStart(2, "0")} min {String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")} s</b>.</span>
          <AsyncButton className="btn-ghost btn-sm shrink-0" onClick={retryNow}>Probar ahora</AsyncButton>
        </div>
      )}
      {mine.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Sin tarjetas {mode === "auto" ? "de Automatización" : "personales"}. Añade una por video (hasta {QUEUE_MAX}).
        </div>
      ) : (
        <div className="space-y-2">
          {mine.map((it) => {
            const chk = checkItem(it, { topics, items });
            const pos = items.filter(isActive).findIndex((x) => x.id === it.id);
            const covers = (["youtube", "tiktok"] as CoverKind[]).filter((k) => it.cfg.covers[k]);
            return (
              <div key={it.id} role="button" tabIndex={0} onClick={() => setEdit(it.id)} onKeyDown={(e) => { if (e.key === "Enter") setEdit(it.id); }}
                className={`group rounded-lg border bg-background/30 p-3 flex items-center gap-3 cursor-pointer transition-colors hover:border-primary/50 ${it.status === "running" ? "border-primary/60" : "border-border/80"}`}>
                <span className="w-7 h-7 shrink-0 rounded-md border border-border grid place-items-center text-[12px] font-semibold tabular text-muted-foreground">{pos >= 0 ? pos + 1 : "·"}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate text-[14px]">{titleOf(it, topics)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {statusChip(it, stageOf[it.id] ?? null)}
                    <Chip>{it.cfg.format === "9:16" ? "Vertical 9:16" : "Horizontal 16:9"}</Chip>
                    <Chip>{range(it.cfg.minutes)}</Chip>
                    {chk.problems.length > 0 && isActive(it) && <Chip tone="red">Falta completar</Chip>}
                    {!chk.problems.length && chk.warnings.length > 0 && isActive(it) && <Chip tone="amber">{chk.warnings.length} aviso(s)</Chip>}
                    {(it.status === "failed" || it.status === "attention") && it.error && <span className="text-[11px] text-muted-foreground truncate max-w-[340px]" title={it.error}>{it.error}</span>}
                  </div>
                </div>
                {covers.map((k) => <img key={k} src={fileUrl(it.cfg.covers[k]!)} alt={k} className={`shrink-0 rounded border border-border object-cover ${k === "tiktok" ? "h-11 w-[25px]" : "h-11 w-[78px]"}`} />)}
                <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                  {it.video_id && <button className="btn-ghost btn-sm" title="Abrir el video" onClick={() => navigate({ page: "video", id: it.video_id! })}><ArrowRight size={13} /></button>}
                  {(it.status === "failed" || it.status === "skipped" || it.status === "attention") && <button className="btn-ghost btn-sm" title="Volver a la cola" onClick={() => void retryItem(it.id)}><RotateCcw size={13} /></button>}
                  {(it.status === "pending" || it.status === "waiting") && <button className="btn-ghost btn-sm" title="Omitir" onClick={() => void skipItem(it.id)}><SkipForward size={13} /></button>}
                  <button className="btn-ghost btn-sm" title="Subir" onClick={() => void moveItem(it.id, -1)}><ChevronUp size={13} /></button>
                  <button className="btn-ghost btn-sm" title="Bajar" onClick={() => void moveItem(it.id, 1)}><ChevronDown size={13} /></button>
                  <button className="btn-ghost btn-sm" title="Duplicar" onClick={() => void duplicateItem(it.id).catch((e) => toast("warn", e?.userMessage ?? String(e)))}><Copy size={13} /></button>
                  {it.status !== "running" && <button className="btn-ghost btn-sm text-red-600 dark:text-red-500" title="Quitar" onClick={async () => { if (await askConfirm("¿Quitar esta tarjeta?", { body: it.video_id ? "El video ya creado se conserva en Videos." : "Se borran su configuración y sus portadas.", confirm: "Quitar" })) await removeItem(it.id); }}><Trash2 size={13} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AsyncButton className="btn-ghost btn-sm" disabled={active >= QUEUE_MAX} onClick={() => add().catch((e) => toast("warn", e?.userMessage ?? String(e)))}><Plus size={14} /> Añadir tarjeta</AsyncButton>
        {items.some((i) => !isActive(i) && i.status !== "attention") && <button className="btn-ghost btn-sm" onClick={() => void clearFinished(channelId)}>Limpiar terminadas</button>}
        {others > 0 && <span className="text-[11.5px] text-muted-foreground">También hay {others} tarjeta(s) {mode === "auto" ? "personales" : "de Automatización"} en la cola (se producen en el mismo orden).</span>}
        <div className="flex-1" />
        {running ? (<>
          <AsyncButton className="btn-ghost btn-sm" title="Termina el video en curso y se detiene" onClick={() => pauseQueue(false)}><Pause size={14} /> Pausar</AsyncButton>
          <AsyncButton className="btn-ghost btn-sm text-red-600 dark:text-red-500" title="Cancela el video en curso (queda guardado para retomarlo)" onClick={async () => { if (await askConfirm("¿Detener la cola ahora?", { body: "El video en curso se detiene y se retoma donde quedó cuando reanudes.", confirm: "Detener" })) await pauseQueue(true); }}><Square size={13} /> Detener</AsyncButton>
        </>) : (
          <AsyncButton className="btn-primary btn-sm" disabled={!ready} title={ready ? "" : "No hay tarjetas listas"} onClick={() => startQueue(channelId)}>
            <Play size={14} /> {items.some((i) => i.started_at && isActive(i)) ? "Reanudar" : "Iniciar"} cola ({ready})
          </AsyncButton>
        )}
      </div>
      <QueueEditor item={editing} topics={topics} items={items} onClose={() => setEdit(null)} />
    </Card>
  );
}

// ---------- Editor de una tarjeta ----------
/** Como Field, pero sin <label>: para grupos de botones (una etiqueta reenviaría el clic al primer botón). */
function Group({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5" role="group" aria-label={label}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground leading-snug">{hint}</span>}
    </div>
  );
}

function CoverPicker({ item, kind, value, disabled, onChange }: { item: QueueItem; kind: CoverKind; value: string | null | undefined; disabled: boolean; onChange: (p: string | null) => void }) {
  const tall = kind === "tiktok";
  const pick = async () => {
    const f = await openDialog({ multiple: false, filters: [{ name: "Imagen", extensions: COVER_EXT }] });
    if (typeof f !== "string") return;
    try { onChange(await storeFile(item.id, f, kind)); } catch (e: any) { toast("warn", e?.userMessage ?? String(e)); }
  };
  return (
    <div className="flex items-center gap-3">
      <button type="button" disabled={disabled} onClick={() => void pick()} className={`shrink-0 rounded-md border border-dashed border-border bg-secondary/30 grid place-items-center overflow-hidden hover:border-primary/50 ${tall ? "w-[54px] h-24" : "w-[171px] h-24"}`}>
        {value ? <img src={fileUrl(value)} className="w-full h-full object-cover" /> : (tall ? <Smartphone size={18} className="text-muted-foreground" /> : <ImageIcon size={18} className="text-muted-foreground" />)}
      </button>
      <div className="text-[12px] text-muted-foreground space-y-1.5">
        <div className="font-medium text-foreground">{tall ? "Portada de TikTok / Shorts (9:16)" : "Portada de YouTube (16:9)"}</div>
        <div>{tall ? "Ideal 1080×1920. Va incrustada en el video vertical y en cada parte para TikTok, y en sus primeros cuadros." : "Ideal 1280×720 (JPG o PNG de hasta 2 MB: así YouTube la recibe tal cual). Es la miniatura y la portada del archivo descargado."}</div>
        {!disabled && <div className="flex gap-1.5"><button className="btn-ghost btn-sm" onClick={() => void pick()}><FolderOpen size={12} /> {value ? "Cambiar" : "Elegir imagen"}</button>{value && <button className="btn-ghost btn-sm" onClick={() => onChange(null)}><X size={12} /> Quitar</button>}</div>}
      </div>
    </div>
  );
}

function MinutesRange({ value, onChange, disabled }: { value: [number, number]; onChange: (v: [number, number]) => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <input type="number" className="input w-24 h-9" min={0.25} max={60} step={0.25} value={value[0]} disabled={disabled} onChange={(e) => onChange([Number(e.target.value), value[1]])} aria-label="Mínimo (minutos)" />
      <span className="text-muted-foreground">a</span>
      <input type="number" className="input w-24 h-9" min={0.25} max={60} step={0.25} value={value[1]} disabled={disabled} onChange={(e) => onChange([value[0], Number(e.target.value)])} aria-label="Máximo (minutos)" />
      <span className="text-[12px] text-muted-foreground">minutos</span>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex h-9 p-0.5 rounded-md border border-border bg-background/60">
      {options.map((o) => <button key={o.id} type="button" disabled={disabled} onClick={() => onChange(o.id)} className={`px-3 rounded text-[13px] font-medium whitespace-nowrap ${value === o.id ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground"}`}>{o.label}</button>)}
    </div>
  );
}

function LibraryPicker({ open, ids, onClose, onChange }: { open: boolean; ids: string[]; onClose: () => void; onChange: (ids: string[]) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => { if (open) void listAssets({ scope: "all", limit: 3000 }).then((a) => setAssets(a.filter((x) => x.kind === "image" || x.kind === "video"))); }, [open]);
  const shown = assets.filter((a) => !q.trim() || `${a.title} ${a.tags} ${a.description}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open={open} onClose={onClose} title={`Recursos de la biblioteca (${ids.length} elegidos)`} wide footer={<button className="btn-primary" onClick={onClose}>Listo</button>}>
      <input className="input mb-3" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!assets.length ? <div className="text-sm text-muted-foreground">La biblioteca está vacía: sube archivos en Biblioteca o en la tarjeta.</div> : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 max-h-[55vh] overflow-auto">
          {shown.map((a) => { const on = ids.includes(a.id); return (
            <button key={a.id} type="button" onClick={() => onChange(on ? ids.filter((x) => x !== a.id) : [...ids, a.id])} className={`relative rounded-md overflow-hidden border-2 text-left ${on ? "border-primary" : "border-transparent opacity-80 hover:opacity-100"}`}>
              {a.thumb ? <img src={fileUrl(a.thumb)} className="w-full aspect-video object-cover" /> : <div className="w-full aspect-video bg-secondary grid place-items-center"><Film size={16} /></div>}
              <div className="text-[10.5px] px-1 py-0.5 truncate" title={a.path}>{a.source === "personal" ? "● " : ""}{a.title}</div>
              {on && <CheckCircle2 size={16} className="absolute top-1 right-1 text-primary bg-background rounded-full" />}
            </button>
          ); })}
        </div>
      )}
    </Modal>
  );
}

function QueueEditor({ item, topics, items, onClose }: { item: QueueItem | null; topics: Topic[]; items: QueueItem[]; onClose: () => void }) {
  const [cfg, setCfg] = useState<AutoCfg | PersonalCfg | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [lib, setLib] = useState(false);
  const dirty = useRef(false);
  const id = item?.id;
  useEffect(() => { setCfg(item ? structuredClone(item.cfg) : null); dirty.current = false; void (item?.video_id ? getVideo(item.video_id).then(setVideo) : Promise.resolve(setVideo(null))); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Se guarda solo, medio segundo después de cada cambio
  useEffect(() => {
    if (!cfg || !id || !dirty.current) return;
    const t = setTimeout(() => { void saveCfg(id, cfg); dirty.current = false; }, 500);
    return () => clearTimeout(t);
  }, [cfg, id]);
  const close = async () => { if (cfg && id && dirty.current) await saveCfg(id, cfg); dirty.current = false; onClose(); };
  const chk = useMemo(() => (item && cfg ? checkItem({ ...item, cfg }, { topics, items }) : { problems: [], warnings: [] }), [item, cfg, topics, items]);
  if (!item || !cfg) return null;
  const locked = !!item.video_id || item.status === "running";
  const set = (p: Partial<AutoCfg & PersonalCfg>) => { dirty.current = true; setCfg((c) => ({ ...(c as object), ...p }) as AutoCfg | PersonalCfg); };
  const setCover = (k: CoverKind, v: string | null) => set({ covers: { ...cfg.covers, [k]: v } });
  const usable = topics.filter((t) => t.status === "approved" || t.status === "candidate" || (isAuto(item) && (item.cfg as AutoCfg).topic.kind === "topic" && (item.cfg.topic as { id: string }).id === t.id));

  const common = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Group label="Formato"><Segmented value={cfg.format} disabled={locked} options={FORMATS.map((f) => ({ id: f.id, label: f.label }))} onChange={(v: VideoFormat) => set({ format: v })} /></Group>
        <Group label="Duración" hint={cfg.format === "9:16" ? "Vertical (TikTok y Shorts): para Shorts, hasta 3 min." : "Horizontal (YouTube). La narración se ajusta a este rango."}><MinutesRange value={cfg.minutes} disabled={locked} onChange={(v) => set({ minutes: v })} /></Group>
      </div>
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-3">
        <CoverPicker item={item} kind="youtube" value={cfg.covers.youtube} disabled={locked} onChange={(p) => setCover("youtube", p)} />
        <CoverPicker item={item} kind="tiktok" value={cfg.covers.tiktok} disabled={locked} onChange={(p) => setCover("tiktok", p)} />
      </div>
    </>
  );

  let body: ReactNode;
  if (isAuto(item)) {
    const c = cfg as AutoCfg;
    body = (
      <div className="space-y-4">
        <Group label="Tema">
          <div className="space-y-2">
            <Segmented value={c.topic.kind} disabled={locked} options={[{ id: "next", label: "Siguiente aprobado" }, { id: "topic", label: "Elegir un tema propuesto" }, { id: "idea", label: "Mi propia idea" }]}
              onChange={(k) => set({ topic: k === "topic" ? { kind: "topic", id: usable[0]?.id ?? "", title: usable[0]?.title ?? "" } : k === "idea" ? { kind: "idea", text: "" } : { kind: "next" } })} />
            {c.topic.kind === "topic" && (
              <select className="input" disabled={locked} value={c.topic.id} onChange={(e) => { const t = usable.find((x) => x.id === e.target.value); if (t) set({ topic: { kind: "topic", id: t.id, title: t.title } }); }}>
                {!usable.length && <option value="">No hay temas: pide propuestas en Temas</option>}
                {usable.map((t) => <option key={t.id} value={t.id}>{t.status === "approved" ? "✓ " : ""}{t.title}{t.score ? ` · ${t.score}` : ""}</option>)}
              </select>
            )}
            {c.topic.kind === "idea" && <textarea className="input min-h-[70px]" disabled={locked} value={c.topic.text} onChange={(e) => set({ topic: { kind: "idea", text: e.target.value } })} placeholder="La idea, la pregunta o las instrucciones del video" />}
            {c.topic.kind === "next" && <div className="text-[12px] text-muted-foreground">Usa el primer tema aprobado en Temas cuando le llegue el turno.</div>}
          </div>
        </Group>
        <Field label="Título (opcional)" hint="Si lo escribes, se usa tal cual; si no, la IA propone y elige uno."><input className="input" maxLength={100} disabled={locked} value={c.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Enfoque o indicaciones (opcional)" hint="Ángulo, público, qué destacar o evitar."><textarea className="input min-h-[60px]" disabled={locked} value={c.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        {common}
      </div>
    );
  } else {
    const p = cfg as PersonalCfg;
    const pickFiles = async () => {
      const sel = await openDialog({ multiple: true, filters: [{ name: "Imágenes, videos, audio y documentos", extensions: Object.values(ACCEPT).flat() }] });
      const list = (Array.isArray(sel) ? sel : sel ? [sel] : []).filter((x) => kindOf(x));
      const stored = await Promise.all(list.map((f) => storeFile(item.id, f)));
      set({ files: [...p.files, ...stored] });
    };
    const pickScript = async () => {
      const sel = await openDialog({ multiple: false, filters: [{ name: "Guion", extensions: SCRIPT_EXT }] });
      if (typeof sel === "string") set({ scriptFile: await storeFile(item.id, sel) });
    };
    const KIND_ICON = { image: ImageIcon, video: Film, audio: Music2, document: FileText } as const;
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Título del video"><input className="input" maxLength={100} disabled={locked} value={p.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Modo">
              <select className="input" disabled={locked} value={p.tone ?? ""} onChange={(e) => set({ tone: (e.target.value || null) as ToneId | null, toneCustom: e.target.value === "custom" ? p.toneCustom ?? { name: "", description: "" } : p.toneCustom })}>
                <option value="">Sin modo (estilo del canal)</option>
                {(Object.keys(TONES) as (keyof typeof TONES)[]).map((k) => <option key={k} value={k}>{TONES[k].label} — {TONES[k].hint}</option>)}
                <option value="custom">Escribir mi propio modo…</option>
              </select>
            </Field>
            <Group label="Idioma"><Segmented value={p.language} disabled={locked} options={[{ id: "es", label: "Español" }, { id: "en", label: "Inglés" }]} onChange={(v) => set({ language: v })} /></Group>
          </div>
        </div>
        {p.tone === "custom" && (
          <div className="grid grid-cols-[220px_1fr] gap-3">
            <Field label="Nombre del modo"><input className="input" disabled={locked} value={p.toneCustom?.name ?? ""} onChange={(e) => set({ toneCustom: { name: e.target.value, description: p.toneCustom?.description ?? "" } })} placeholder="Ej.: Inspirador" /></Field>
            <Field label="Descripción del modo"><input className="input" disabled={locked} value={p.toneCustom?.description ?? ""} onChange={(e) => set({ toneCustom: { name: p.toneCustom?.name ?? "", description: e.target.value } })} placeholder="Cómo debe sonar y verse: ritmo, voz, emociones, tipo de música" /></Field>
          </div>
        )}
        <Field label="De qué trata el video"><textarea className="input min-h-[70px]" disabled={locked} value={p.about} onChange={(e) => set({ about: e.target.value })} placeholder="El tema, el mensaje principal y los puntos que no pueden faltar" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Para qué es (opcional)"><input className="input" disabled={locked} value={p.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ej.: lanzamiento de la app" /></Field>
          <Field label="Público (opcional)"><input className="input" disabled={locked} value={p.audience} onChange={(e) => set({ audience: e.target.value })} placeholder="Ej.: universitarios de 18–24" /></Field>
          <Field label="Llamado a la acción (opcional)"><input className="input" disabled={locked} value={p.cta} onChange={(e) => set({ cta: e.target.value })} placeholder="Ej.: descarga la app" /></Field>
        </div>
        <Group label="Estética del video" hint={<>Describe con detalle cómo debe verse y sonar: fondo, colores (con código si lo tienes), tipografía, ritmo, transiciones, animaciones, imágenes, subtítulos, música y qué evitar. Manda sobre el estilo del canal. {!locked && <button type="button" className="text-primary hover:underline" onClick={() => set({ aesthetic: p.aesthetic.trim() ? `${p.aesthetic.trim()}\n\n${AESTHETIC_EXAMPLE}` : AESTHETIC_EXAMPLE })}><Wand2 size={11} className="inline -mt-0.5" /> Insertar ejemplo</button>}</>}>
          <textarea className="input min-h-[140px] text-[13px]" aria-label="Estética del video" disabled={locked} value={p.aesthetic} onChange={(e) => set({ aesthetic: e.target.value })} />
        </Group>
        <div className="grid grid-cols-[auto_auto_auto_1fr] items-end gap-3">
          {(["background", "foreground", "accent"] as const).map((k) => (
            <Group key={k} label={{ background: "Fondo", foreground: "Texto", accent: "Acento" }[k]}>
              <div className="flex items-center gap-1">
                <input type="color" title={p.palette?.[k] ? p.palette[k] : "Sin elegir: el del canal"} className={`h-9 w-10 rounded border bg-transparent ${p.palette?.[k] ? "border-border" : "border-dashed border-border opacity-40"}`} disabled={locked}
                  value={p.palette?.[k] ?? { background: "#0b0d12", foreground: "#f2f2f0", accent: "#4c7dff" }[k]} onChange={(e) => set({ palette: { ...(p.palette ?? {}), [k]: e.target.value } })} />
                {!p.palette?.[k] && <span className="text-[10.5px] text-muted-foreground">canal</span>}
                {p.palette?.[k] && !locked && <button className="btn-ghost btn-sm" title="Quitar" onClick={() => { const pal = { ...(p.palette ?? {}) }; delete pal[k]; set({ palette: Object.keys(pal).length ? pal : null }); }}><X size={12} /></button>}
              </div>
            </Group>
          ))}
          <Field label="Tipografía de títulos (opcional)">
            <select className="input" disabled={locked} value={p.font ?? ""} onChange={(e) => set({ font: e.target.value || null })}>
              <option value="">La del canal</option>
              {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        </div>
        <Group label="Guion (opcional)" hint="Si lo escribes o subes, se respeta tal cual (la IA solo lo divide en partes). Sin guion, la IA lo escribe con lo de arriba.">
          <textarea className="input min-h-[110px] text-[13px]" disabled={locked || (!!p.scriptFile && !p.script)} value={p.script} onChange={(e) => set({ script: e.target.value })} placeholder={p.scriptFile ? `Se usará el archivo ${fileName(p.scriptFile)}` : "Escribe o pega el guion"} />
          {!locked && <div className="flex items-center gap-2 mt-1.5">
            <button type="button" className="btn-ghost btn-sm" onClick={() => void pickScript()}><FileText size={12} /> {p.scriptFile ? "Cambiar archivo" : "Subir archivo de guion"}</button>
            {p.scriptFile && <span className="chip text-primary border-primary/40 bg-primary/10">{fileName(p.scriptFile)}<button aria-label="Quitar" onClick={() => set({ scriptFile: null })}><X size={11} /></button></span>}
          </div>}
        </Group>
        <div className="rounded-lg border border-border p-3 space-y-2.5">
          <div className="text-[13px] font-medium flex items-center gap-1.5"><Library size={14} /> Recursos</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted-foreground" title="Completa: toda la biblioteca (personal y de automatización)">Biblioteca:</span>
            <Segmented value={p.library.mode} disabled={locked} options={[{ id: "all", label: "Completa" }, { id: "pick", label: "Solo algunos" }, { id: "none", label: "Ninguna" }]} onChange={(m) => set({ library: { ...p.library, mode: m } })} />
            {p.library.mode === "pick" && <button className="btn-ghost btn-sm" disabled={locked} onClick={() => setLib(true)}>Elegir ({p.library.ids.length})</button>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!locked && <button className="btn-ghost btn-sm" onClick={() => void pickFiles()}><Plus size={12} /> Archivos solo para este video</button>}
            {p.files.map((f) => { const I = KIND_ICON[kindOf(f) ?? "document"]; return <span key={f} className="chip text-muted-foreground border-border"><I size={11} /> {fileName(f).replace(/^[a-z0-9]+-/, "")}{!locked && <button aria-label="Quitar" onClick={() => set({ files: p.files.filter((x) => x !== f) })}><X size={11} /></button>}</span>; })}
          </div>
          <Toggle checked={p.web} onChange={(v) => !locked && set({ web: v })} label="Buscar material en internet y crear imágenes con IA (además de tus recursos)" />
        </div>
        {common}
        <LibraryPicker open={lib} ids={p.library.ids} onClose={() => setLib(false)} onChange={(ids) => set({ library: { mode: "pick", ids } })} />
      </div>
    );
  }

  return (
    <Modal open onClose={() => void close()} wide title={`${isAuto(item) ? "Automatización" : "Personal"} · ${titleOf({ ...item, cfg }, topics)}`}
      footer={<><span className="flex-1 text-[11.5px] text-muted-foreground">{locked ? "El video de esta tarjeta ya se creó: su configuración ya no cambia." : "Los cambios se guardan solos."}</span><button className="btn-primary" onClick={() => void close()}>Listo</button></>}>
      {video && <div className="mb-3 text-[12.5px] flex items-center gap-2"><span className="text-muted-foreground">Video:</span><button className="text-primary hover:underline" onClick={() => { void close(); navigate({ page: "video", id: video.id }); }}>{video.title}</button></div>}
      {body}
      {(chk.problems.length > 0 || chk.warnings.length > 0) && (
        <div className="mt-4 space-y-1 text-[12.5px]">
          {chk.problems.map((x) => <div key={x} className="text-red-600 dark:text-red-500 flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {x}</div>)}
          {chk.warnings.map((x) => <div key={x} className="text-amber-700 dark:text-amber-500 flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {x}</div>)}
        </div>
      )}
    </Modal>
  );
}
