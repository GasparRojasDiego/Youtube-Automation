// Cola de producción de cada estudio (YouTube 16:9 o TikTok 9:16): tarjetas sueltas o agrupadas en
// campañas (una plantilla común y, en cada tarjeta, solo lo que cambia), que ATRIL produce una tras
// otra, hasta 50, y deja en tu revisión final.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ListOrdered, Plus, Play, Pause, Square, RotateCcw, Trash2, Copy, ChevronUp, ChevronDown, ArrowRight, Bot, UserRound, Image as ImageIcon, Smartphone, X,
  FolderOpen, FileText, Film, Music2, Clock, AlertTriangle, CheckCircle2, SkipForward, Wand2, Library, Layers, Upload, Pencil, Settings2, Send, ClipboardCopy } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useBus } from "../lib/bus";
import { fileUrl } from "../lib/ipc";
import { getSettings } from "../lib/settings";
import { getStages, listTopics, getVideo, STAGES, type Topic, type StageRow, type Video } from "../lib/repo";
import { listAssets, type Asset } from "../media/library";
import { FONT_FAMILIES } from "../motion/page";
import { TONES, ACCEPT, SCRIPT_EXT, kindOf, AESTHETIC_EXAMPLE, type ToneId } from "../pipeline/personal";
import type { VideoFormat } from "../pipeline/format";
import { COVER_EXT } from "../pipeline/covers";
import type { CoverKind } from "../pipeline/covers";
import { listQueue, listCampaigns, addItem, saveCfg, removeItem, duplicateItem, moveItem, retryItem, skipItem, clearFinished, storeFile, checkItem, getQueueState,
  startQueue, pauseQueue, retryNow, isAuto, isActive, runningFormats, createCampaign, saveCampaign, deleteCampaign, campaignFromItem, campaignBase,
  QUEUE_MAX, type QueueItem, type QueueMode, type AutoCfg, type PersonalCfg, type QueueState, type Campaign } from "../pipeline/queue";
import { parseCardsJson, importCards, IMPORT_EXAMPLE } from "../pipeline/importCards";
import { GOOGLE_LANG, type VoiceLang } from "../providers/voices";
import { navigate } from "../ui/nav";
import { Card, Chip, Modal, Toggle, AsyncButton } from "../ui/kit";
import { VoiceField } from "../ui/VoicePicker";
import { askConfirm, askText } from "../ui/Ask";
import { toast } from "../lib/events";

type Cfg = AutoCfg | PersonalCfg;
const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const fmtMin = (m: number) => (m < 1 ? `${Math.round(m * 60)} s` : `${Math.round(m * 100) / 100} min`);
const range = (r: [number, number]) => (r[0] === r[1] ? fmtMin(r[0]) : r[1] < 1 ? `${Math.round(r[0] * 60)}–${Math.round(r[1] * 60)} s` : r[0] >= 1 ? `${Math.round(r[0] * 100) / 100}–${Math.round(r[1] * 100) / 100} min` : `${fmtMin(r[0])}–${fmtMin(r[1])}`);
const clock = (t: number) => new Date(t).toLocaleString("es-PE", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const channelLang = (): VoiceLang => ((getSettings().publishing.defaultLanguage || "en").slice(0, 2) === "es" ? "es" : "en");
const warnErr = (e: any) => toast("warn", e?.userMessage ?? e?.message ?? String(e), e?.hint);

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

/** Resumen de una plantilla en una línea («30–45 s · Llamativo · voz Kore · 1 archivo»). */
function templateSummary(c: Campaign): string {
  const cfg = c.cfg as Partial<PersonalCfg & AutoCfg>;
  const bits = [range(cfg.minutes ?? [1, 1])];
  if (cfg.tone) bits.push(cfg.tone === "custom" ? cfg.toneCustom?.name || "Modo propio" : TONES[cfg.tone as keyof typeof TONES]?.label ?? cfg.tone);
  if (cfg.voice) bits.push(`voz ${cfg.voice.replace(/^[a-z]{2,3}-[A-Z]{2}-(Chirp3-HD-)?/, "")}`);
  if (cfg.aesthetic?.trim()) bits.push("estética propia");
  if (cfg.files?.length) bits.push(`${cfg.files.length} archivo(s)`);
  if (cfg.notes?.trim()) bits.push("con indicaciones");
  return bits.join(" · ");
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`h-7 px-2.5 rounded-full border text-[12px] font-medium inline-flex items-center gap-1 transition-colors ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{children}</button>;
}

/** Recuadro de la cola de un estudio. Solo muestra y arranca las tarjetas de su formato. */
export function QueuePanel({ mode, format, channelId }: { mode: QueueMode; format: VideoFormat; channelId: string }) {
  const tick = useBus("queue", "topics", "stages", "jobs", "videos");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [camps, setCamps] = useState<Campaign[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [state, setState] = useState<QueueState | null>(null);
  const [stageOf, setStageOf] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<string | null>(null);
  const [tpl, setTpl] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void (async () => {
      const list = await listQueue(channelId);
      setItems(list); setCamps(await listCampaigns(channelId)); setTopics(await listTopics(channelId)); setState({ ...(await getQueueState()) });
      const st: Record<string, string> = {};
      for (const it of list.filter((x) => x.status === "running" && x.video_id)) {
        const rows: StageRow[] = await getStages(it.video_id!);
        const r = rows.find((s) => s.status === "running");
        if (r) st[it.id] = `${STAGES.find((s) => s.id === r.stage)?.label ?? r.stage}${r.progress ? ` · ${r.progress}` : ""}`;
      }
      setStageOf(st);
    })();
  }, [tick, channelId]);
  const myCamps = camps.filter((c) => c.mode === mode && c.format === format);
  useEffect(() => { if (filter !== "all" && filter !== "loose" && camps.length && !myCamps.some((c) => c.id === filter)) setFilter("all"); }, [camps, mode, format]); // eslint-disable-line react-hooks/exhaustive-deps
  const waiting = items.some((i) => i.status === "waiting");
  useEffect(() => { if (!waiting) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [waiting]);

  const sameFormat = items.filter((i) => i.cfg.format === format);
  const scope = sameFormat.filter((i) => i.mode === mode);
  const camp = myCamps.find((c) => c.id === filter) ?? null;
  const mine = scope.filter((i) => (filter === "all" ? true : filter === "loose" ? !i.campaign_id : i.campaign_id === filter));
  const others = sameFormat.filter((i) => i.mode !== mode && isActive(i)).length;
  const active = items.filter(isActive).length;
  const running = !!state?.running && state.channelId === channelId && runningFormats(state).includes(format);
  const nextWait = sameFormat.filter((i) => i.status === "waiting" && i.wait_until).sort((a, b) => a.wait_until! - b.wait_until!)[0];
  const ready = sameFormat.filter((i) => isActive(i) && !checkItem(i, { topics, items }).problems.length).length;
  const editing = items.find((i) => i.id === edit) ?? null;
  const tplCamp = camps.find((c) => c.id === tpl) ?? null;
  const left = nextWait?.wait_until ? Math.max(0, nextWait.wait_until - now) : 0;
  const campName = (id: string | null) => camps.find((c) => c.id === id)?.name ?? "";
  const platform = format === "9:16" ? "TikTok" : "YouTube";

  const add = async () => { const it = await addItem(channelId, mode, camp ? {} : { format }, camp?.id ?? null); setEdit(it.id); };
  const newCampaign = async () => {
    const name = await askText("Nueva campaña", { body: "Configura una sola vez lo que comparten sus videos (duración, modo, estética, voz, recursos…); en cada tarjeta solo cambias lo propio.", confirm: "Crear" });
    if (!name?.trim()) return;
    const c = await createCampaign(channelId, name, mode, format);
    setFilter(c.id); setTpl(c.id);
  };
  const renameCampaign = async (c: Campaign) => { const name = await askText("Nombre de la campaña", { value: c.name, confirm: "Guardar" }); if (name?.trim()) await saveCampaign(c.id, { name }); };
  const removeCampaign = async (c: Campaign) => {
    const n = items.filter((i) => i.campaign_id === c.id).length;
    if (!(await askConfirm(`¿Borrar la campaña «${c.name}»?`, { body: n ? `Sus ${n} tarjeta(s) quedan sueltas con la configuración que tenían: no se pierde nada.` : "No tiene tarjetas.", confirm: "Borrar", danger: true }))) return;
    await deleteCampaign(c.id); setFilter("all");
  };

  return (
    <Card title={<span className="flex items-center gap-2">Cola de {platform} <Chip tone="primary">{mode === "auto" ? <><Bot size={11} /> Automatización</> : <><UserRound size={11} /> Personal</>}</Chip></span>} icon={ListOrdered}
      actions={<span className="text-[11px] text-muted-foreground tabular">{active}/{QUEUE_MAX} en cola</span>}>
      <p className="text-[12.5px] text-muted-foreground -mt-1 mb-3">
        Cada tarjeta es un video {format === "9:16" ? "vertical" : "horizontal"}. Si varios comparten formato, agrúpalos en una <b className="text-foreground font-medium">campaña</b>: la plantilla se configura una vez y cada tarjeta guarda solo lo que cambia.
        {" "}La cola los produce uno tras otro y deja cada uno en tu revisión final: nada se publica sin tu aprobación.
      </p>
      {state?.note && !running && <div className="mb-3 text-[12.5px] rounded-md border border-border bg-secondary/40 px-3 py-2">{state.note}</div>}
      {running && nextWait && (
        <div className="mb-3 text-[12.5px] rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 flex items-center justify-between gap-3">
          <span><Clock size={13} className="inline -mt-0.5 mr-1" />{nextWait.error ?? "En espera"} Faltan <b className="tabular">{Math.floor(left / 3600_000)} h {String(Math.floor((left % 3600_000) / 60_000)).padStart(2, "0")} min {String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")} s</b>.</span>
          <AsyncButton className="btn-ghost btn-sm shrink-0" onClick={retryNow}>Probar ahora</AsyncButton>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <FilterChip on={filter === "all"} onClick={() => setFilter("all")}>Todas · {scope.length}</FilterChip>
        {myCamps.length > 0 && <FilterChip on={filter === "loose"} onClick={() => setFilter("loose")}>Sueltas · {scope.filter((i) => !i.campaign_id).length}</FilterChip>}
        {myCamps.map((c) => <FilterChip key={c.id} on={filter === c.id} onClick={() => setFilter(c.id)}><Layers size={12} /> {c.name} · {scope.filter((i) => i.campaign_id === c.id).length}</FilterChip>)}
        <div className="flex-1" />
        <button className="btn-ghost btn-sm" onClick={() => void newCampaign().catch(warnErr)}><Plus size={13} /> Campaña</button>
        <button className="btn-ghost btn-sm" onClick={() => setImporting(true)} title="Crea muchas tarjetas (y su campaña) pegando un bloque JSON, por ejemplo el que te da tu chat de marketing"><Upload size={13} /> Importar</button>
      </div>
      {camp && (
        <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 flex flex-wrap items-center gap-2 text-[12.5px]">
          <Layers size={14} className="text-primary" /><b>{camp.name}</b>
          <span className="text-muted-foreground truncate">Plantilla: {templateSummary(camp)}</span>
          <div className="flex-1" />
          <button className="btn-primary btn-sm" onClick={() => setTpl(camp.id)}><Settings2 size={13} /> Editar plantilla</button>
          <button className="btn-ghost btn-sm" title="Renombrar" onClick={() => void renameCampaign(camp)}><Pencil size={13} /></button>
          <button className="btn-ghost btn-sm text-red-600 dark:text-red-500" title="Borrar campaña" onClick={() => void removeCampaign(camp)}><Trash2 size={13} /></button>
        </div>
      )}
      {mine.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {camp ? `La campaña «${camp.name}» aún no tiene tarjetas: añade una por video o impórtalas.` : `Sin tarjetas ${mode === "auto" ? "de Automatización" : "personales"} para ${platform}. Añade una por video (hasta ${QUEUE_MAX}) o impórtalas.`}
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
                    <Chip>{range(it.cfg.minutes)}</Chip>
                    {it.campaign_id && filter === "all" && <Chip><Layers size={11} /> {campName(it.campaign_id)}</Chip>}
                    {it.campaign_id && <span className="text-[11px] text-muted-foreground">{it.overrides.length ? `${it.overrides.length} cambio(s) propio(s)` : "igual a la plantilla"}</span>}
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
                  <button className="btn-ghost btn-sm" title="Duplicar" onClick={() => void duplicateItem(it.id).catch(warnErr)}><Copy size={13} /></button>
                  {it.status !== "running" && <button className="btn-ghost btn-sm text-red-600 dark:text-red-500" title="Quitar" onClick={async () => { if (await askConfirm("¿Quitar esta tarjeta?", { body: it.video_id ? "El video ya creado se conserva en Videos." : "Se borran su configuración y sus portadas.", confirm: "Quitar" })) await removeItem(it.id); }}><Trash2 size={13} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AsyncButton className="btn-ghost btn-sm" disabled={active >= QUEUE_MAX} onClick={() => add().catch(warnErr)}><Plus size={14} /> {camp ? `Añadir a «${camp.name.length > 24 ? `${camp.name.slice(0, 23)}…` : camp.name}»` : "Añadir tarjeta"}</AsyncButton>
        {sameFormat.some((i) => !isActive(i) && i.status !== "attention") && <button className="btn-ghost btn-sm" onClick={() => void clearFinished(channelId, format)}>Limpiar terminadas</button>}
        {others > 0 && <span className="text-[11.5px] text-muted-foreground">También hay {others} tarjeta(s) {mode === "auto" ? "personales" : "de Automatización"} de {platform} en la cola.</span>}
        <div className="flex-1" />
        {running ? (<>
          <AsyncButton className="btn-ghost btn-sm" title="Termina el video en curso y se detiene" onClick={() => pauseQueue(false, format)}><Pause size={14} /> Pausar</AsyncButton>
          <AsyncButton className="btn-ghost btn-sm text-red-600 dark:text-red-500" title="Cancela el video en curso (queda guardado para retomarlo)" onClick={async () => { if (await askConfirm(`¿Detener la cola de ${platform} ahora?`, { body: "El video en curso se detiene y se retoma donde quedó cuando reanudes.", confirm: "Detener" })) await pauseQueue(true, format); }}><Square size={13} /> Detener</AsyncButton>
        </>) : (
          <AsyncButton className="btn-primary btn-sm" disabled={!ready} title={ready ? "" : "No hay tarjetas listas"} onClick={() => startQueue(channelId, format)}>
            <Play size={14} /> {sameFormat.some((i) => i.started_at && isActive(i)) ? "Reanudar" : "Iniciar"} cola ({ready})
          </AsyncButton>
        )}
      </div>
      {editing && <QueueEditor key={editing.id} target={{ kind: "item", item: editing, campaign: camps.find((c) => c.id === editing.campaign_id) ?? null }} topics={topics} items={items} onClose={() => setEdit(null)} onCampaign={(id) => setFilter(id)} />}
      {tplCamp && <QueueEditor key={tplCamp.id} target={{ kind: "template", campaign: tplCamp, count: items.filter((i) => i.campaign_id === tplCamp.id && !i.video_id).length }} topics={topics} items={items} onClose={() => setTpl(null)} />}
      <ImportDialog open={importing} channelId={channelId} mode={mode} format={format} campaigns={myCamps} current={camp?.id ?? null} onClose={(id) => { setImporting(false); if (id) setFilter(id); }} />
    </Card>
  );
}

// ---------- Importar tarjetas ----------
function ImportDialog({ open, channelId, mode, format, campaigns, current, onClose }: { open: boolean; channelId: string; mode: QueueMode; format: VideoFormat; campaigns: Campaign[]; current: string | null; onClose: (campaignId: string | null) => void }) {
  const [text, setText] = useState("");
  const [dir, setDir] = useState<string | null>(null);
  const [target, setTarget] = useState<string>("json");
  useEffect(() => { if (open) setTarget(current ?? "json"); }, [open, current]);
  const parsed = useMemo(() => (text.trim() ? parseCardsJson(text, mode) : null), [text, mode]);
  const copyFormat = async () => {
    try { await navigator.clipboard.writeText(IMPORT_EXAMPLE); toast("success", "Formato copiado", "Pégalo en tu chat de marketing y pídele las tarjetas con esa forma."); } catch { toast("warn", "No se pudo copiar"); }
  };
  const pickDir = async () => { const d = await openDialog({ directory: true, multiple: false }); if (typeof d === "string") setDir(d); };
  const run = async () => {
    const r = await importCards(channelId, text, { mode, format, campaignId: target === "json" ? null : target, baseDir: dir });
    toast(r.warnings.length ? "warn" : "success", `${r.created} tarjeta(s) importada(s)${r.campaign ? ` en «${r.campaign.name}»` : ""}`, r.warnings.length ? `${r.warnings.slice(0, 6).join("\n")}${r.warnings.length > 6 ? `\n…y ${r.warnings.length - 6} aviso(s) más.` : ""}` : undefined);
    setText(""); onClose(r.campaign?.id ?? null);
  };
  return (
    <Modal open={open} onClose={() => onClose(null)} wide title={`Importar tarjetas · ${format === "9:16" ? "TikTok" : "YouTube"} · ${mode === "auto" ? "Automatización" : "Personal"}`}
      footer={<>
        <button className="btn-ghost mr-auto" onClick={() => void copyFormat()}><ClipboardCopy size={14} /> Copiar formato de ejemplo</button>
        <button className="btn-ghost" onClick={() => onClose(null)}>Cancelar</button>
        <AsyncButton className="btn-primary" disabled={!parsed || parsed.errors.length > 0 || !parsed.cards.length} onClick={() => run().catch(warnErr)}><Upload size={14} /> Importar {parsed?.cards.length ? `${parsed.cards.length} tarjeta(s)` : ""}</AsyncButton>
      </>}>
      <p className="text-[12.5px] text-muted-foreground mb-3">
        Pega un bloque JSON con una <b className="text-foreground font-medium">plantilla</b> (lo común) y sus <b className="text-foreground font-medium">tarjetas</b> (solo lo que cambia en cada video). Las claves van en español: titulo, de_que_trata, guion, duracion_s, voz, estetica, colores, portada_tiktok, publicacion… «Copiar formato de ejemplo» te da uno completo para pasárselo a tu chat de marketing.
      </p>
      <textarea className="input min-h-[220px] font-mono text-[12px]" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder={'{\n  "campaña": "Nombre",\n  "plantilla": { "duracion_s": [30, 45], "voz": "Kore" },\n  "tarjetas": [ { "titulo": "…", "guion": "…" } ]\n}'} aria-label="JSON de las tarjetas" />
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Group label="Dónde crearlas">
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="json">Según el JSON (campaña nueva si trae una; si no, sueltas)</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>En la campaña «{c.name}»</option>)}
          </select>
        </Group>
        <Group label="Carpeta de portadas y archivos" hint="Las rutas relativas del JSON (portadas/01.png) se buscan aquí.">
          <div className="flex items-center gap-2">
            <button className="btn-ghost btn-sm" onClick={() => void pickDir()}><FolderOpen size={13} /> {dir ? "Cambiar" : "Elegir carpeta"}</button>
            {dir && <span className="text-[12px] text-muted-foreground truncate" title={dir}>{dir}</span>}
          </div>
        </Group>
      </div>
      {parsed && (
        <div className="mt-3 rounded-lg border border-border p-3 text-[12.5px] space-y-1 max-h-48 overflow-auto">
          {!parsed.errors.length && <div className="flex items-center gap-1.5 text-green-700 dark:text-green-500"><CheckCircle2 size={13} /> {parsed.cards.length} tarjeta(s){parsed.campaign && target === "json" ? ` en la campaña nueva «${parsed.campaign.name}»` : ""}.</div>}
          {parsed.errors.map((x) => <div key={x} className="text-red-600 dark:text-red-500 flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {x}</div>)}
          {parsed.warnings.slice(0, 12).map((x) => <div key={x} className="text-amber-700 dark:text-amber-500 flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {x}</div>)}
          {parsed.warnings.length > 12 && <div className="text-muted-foreground">…y {parsed.warnings.length - 12} aviso(s) más.</div>}
        </div>
      )}
    </Modal>
  );
}

// ---------- Editor de una tarjeta o de la plantilla de una campaña ----------
type Target = { kind: "item"; item: QueueItem; campaign: Campaign | null } | { kind: "template"; campaign: Campaign; count: number };

/** Herencia: en una tarjeta de campaña, cada campo dice si es «de la campaña» o «propio» (con ↺ para volver). */
const Inherit = createContext<{ base: Record<string, unknown> | null; cfg: Record<string, unknown>; set: (p: Partial<AutoCfg & PersonalCfg>) => void; locked: boolean }>({ base: null, cfg: {}, set: () => undefined, locked: true });

function Own({ k }: { k: string | string[] }) {
  const c = useContext(Inherit);
  if (!c.base) return null;
  const keys = Array.isArray(k) ? k : [k];
  if (!keys.some((x) => !same(c.cfg[x], c.base![x]))) return <span className="ml-1.5 text-[10.5px] font-normal normal-case tracking-normal text-muted-foreground">· de la campaña</span>;
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 text-[10.5px] font-medium normal-case tracking-normal text-primary">· propio
      {!c.locked && <button type="button" className="hover:underline inline-flex items-center gap-0.5" title="Volver al valor de la plantilla" onClick={() => c.set(Object.fromEntries(keys.map((x) => [x, structuredClone(c.base![x])])) as Partial<AutoCfg & PersonalCfg>)}><RotateCcw size={10} /> plantilla</button>}
    </span>
  );
}

/** Etiqueta y contenido (sin <label>: en grupos de botones reenviaría el clic al primero). */
function Group({ label, k, hint, children }: { label: string; k?: string | string[]; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5" role="group" aria-label={label}>
      <span className="label flex items-center">{label}{k && <Own k={k} />}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground leading-snug">{hint}</span>}
    </div>
  );
}

function CoverPicker({ owner, kind, value, disabled, onChange }: { owner: string; kind: CoverKind; value: string | null | undefined; disabled: boolean; onChange: (p: string | null) => void }) {
  const tall = kind === "tiktok";
  const pick = async () => {
    const f = await openDialog({ multiple: false, filters: [{ name: "Imagen", extensions: COVER_EXT }] });
    if (typeof f !== "string") return;
    try { onChange(await storeFile(owner, f, kind)); } catch (e: any) { warnErr(e); }
  };
  return (
    <div className="flex items-center gap-3">
      <button type="button" disabled={disabled} onClick={() => void pick()} className={`shrink-0 rounded-md border border-dashed border-border bg-secondary/30 grid place-items-center overflow-hidden hover:border-primary/50 ${tall ? "w-[54px] h-24" : "w-[171px] h-24"}`}>
        {value ? <img src={fileUrl(value)} className="w-full h-full object-cover" /> : (tall ? <Smartphone size={18} className="text-muted-foreground" /> : <ImageIcon size={18} className="text-muted-foreground" />)}
      </button>
      <div className="text-[12px] text-muted-foreground space-y-1.5">
        <div className="font-medium text-foreground">{tall ? "Portada de TikTok / Shorts (9:16)" : "Portada de YouTube (16:9)"}</div>
        <div>{tall ? "Ideal 1080×1920. Va incrustada en el video vertical (y en cada parte para TikTok) y en sus primeros cuadros." : "Ideal 1280×720 (JPG o PNG de hasta 2 MB: así YouTube la recibe tal cual). Es la miniatura y la portada del archivo descargado."}</div>
        {!disabled && <div className="flex gap-1.5"><button className="btn-ghost btn-sm" onClick={() => void pick()}><FolderOpen size={12} /> {value ? "Cambiar" : "Elegir imagen"}</button>{value && <button className="btn-ghost btn-sm" onClick={() => onChange(null)}><X size={12} /> Quitar</button>}</div>}
      </div>
    </div>
  );
}

function MinutesRange({ value, onChange, disabled, vertical }: { value: [number, number]; onChange: (v: [number, number]) => void; disabled: boolean; vertical: boolean }) {
  // En vertical se piensa en segundos (15–60 s); en horizontal, en minutos
  const k = vertical ? 60 : 1;
  const r = (x: number) => Math.round(x * k * 100) / 100;
  return (
    <div className="flex items-center gap-2">
      <input type="number" className="input w-24 h-9" min={vertical ? 5 : 0.25} max={vertical ? 600 : 60} step={vertical ? 5 : 0.25} value={r(value[0])} disabled={disabled} onChange={(e) => onChange([Number(e.target.value) / k, value[1]])} aria-label="Mínimo" />
      <span className="text-muted-foreground">a</span>
      <input type="number" className="input w-24 h-9" min={vertical ? 5 : 0.25} max={vertical ? 600 : 60} step={vertical ? 5 : 0.25} value={r(value[1])} disabled={disabled} onChange={(e) => onChange([value[0], Number(e.target.value) / k])} aria-label="Máximo" />
      <span className="text-[12px] text-muted-foreground">{vertical ? "segundos" : "minutos"}</span>
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

function QueueEditor({ target, topics, items, onClose, onCampaign }: { target: Target; topics: Topic[]; items: QueueItem[]; onClose: () => void; onCampaign?: (id: string) => void }) {
  const isTpl = target.kind === "template";
  const item = target.kind === "item" ? target.item : null;
  const campaign = target.campaign;
  const [cfg, setCfg] = useState<Cfg>(() => structuredClone(item ? item.cfg : campaignBase(campaign!)));
  const [video, setVideo] = useState<Video | null>(null);
  const [lib, setLib] = useState(false);
  const dirty = useRef(false);
  const owner = item?.id ?? campaign!.id;
  const mode: QueueMode = item?.mode ?? campaign!.mode;
  useEffect(() => { if (item?.video_id) void getVideo(item.video_id).then(setVideo); }, [item?.video_id]);
  const persist = async (c: Cfg) => { if (isTpl) await saveCampaign(campaign!.id, { cfg: c }); else await saveCfg(item!.id, c); };
  // Se guarda solo, medio segundo después de cada cambio
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => { void persist(cfg); dirty.current = false; }, 500);
    return () => clearTimeout(t);
  }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = async () => { if (dirty.current) await persist(cfg); dirty.current = false; onClose(); };
  const chk = useMemo(() => (item ? checkItem({ ...item, cfg }, { topics, items }) : { problems: [], warnings: [] }), [item, cfg, topics, items]);
  const locked = !!item && (!!item.video_id || item.status === "running");
  const set = (p: Partial<AutoCfg & PersonalCfg>) => { dirty.current = true; setCfg((c) => ({ ...(c as object), ...p }) as Cfg); };
  const setCover = (k: CoverKind, v: string | null) => set({ covers: { ...cfg.covers, [k]: v } });
  const vertical = cfg.format === "9:16";
  const base = item && campaign ? (campaignBase(campaign) as unknown as Record<string, unknown>) : null;
  const lang: VoiceLang = mode === "auto" ? channelLang() : (cfg as PersonalCfg).language;
  const usable = topics.filter((t) => t.status === "approved" || t.status === "candidate" || (item && isAuto(item) && (item.cfg as AutoCfg).topic.kind === "topic" && (item.cfg.topic as { id: string }).id === t.id));
  const toCampaign = async () => {
    const name = await askText("Crear campaña con esta tarjeta", { body: "Su configuración (salvo título, tema, guion, portadas y textos) será la plantilla; las tarjetas que añadas a la campaña la heredan y solo guardan lo que cambian.", confirm: "Crear campaña" });
    if (!name?.trim() || !item) return;
    if (dirty.current) { await persist(cfg); dirty.current = false; }
    const c = await campaignFromItem(item.id, name);
    if (c) { toast("success", `Campaña «${c.name}» creada`, "Edita su plantilla o añade tarjetas desde la cola."); onCampaign?.(c.id); onClose(); }
  };

  const common = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Group label="Duración" k="minutes" hint={vertical ? "Vertical (TikTok y Shorts; Shorts admite hasta 3 min). El video dura al menos el mínimo aunque el guion sea corto." : "Horizontal (YouTube). El video dura al menos el mínimo aunque el guion sea corto."}>
          <MinutesRange value={cfg.minutes} disabled={locked} vertical={vertical} onChange={(v) => set({ minutes: v })} />
        </Group>
        <Group label="Voz" k="voice" hint="«Elegir…» te deja escuchar cada voz. Sin elegir, usa la de Ajustes para ese idioma.">
          <VoiceField lang={lang} value={cfg.voice} disabled={locked} onChange={(v) => set({ voice: v })} />
        </Group>
      </div>
      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="label flex items-center">Portadas<Own k="covers" /></div>
        <div className="grid grid-cols-2 gap-4">
          <CoverPicker owner={owner} kind="youtube" value={cfg.covers.youtube} disabled={locked} onChange={(p) => setCover("youtube", p)} />
          <CoverPicker owner={owner} kind="tiktok" value={cfg.covers.tiktok} disabled={locked} onChange={(p) => setCover("tiktok", p)} />
        </div>
      </div>
      {vertical && !isTpl && (
        <div className="rounded-lg border border-border p-3 space-y-2.5">
          <div className="text-[13px] font-medium flex items-center gap-1.5"><Send size={14} /> Textos para publicar <span className="font-normal text-muted-foreground">(opcional)</span></div>
          <p className="text-[11.5px] text-muted-foreground -mt-1">Aparecen listos para copiar en TikTok → «Listos para publicar». Si los dejas vacíos, ATRIL los propone.</p>
          <Group label="Texto de TikTok (descripción y hashtags)">
            <textarea className="input min-h-[60px] text-[13px]" aria-label="Texto de TikTok" disabled={locked} value={cfg.publish?.tiktok ?? ""} onChange={(e) => set({ publish: { ...(cfg.publish ?? {}), tiktok: e.target.value } })} />
          </Group>
          <div className="grid grid-cols-2 gap-3">
            <Group label="Título de YouTube Shorts"><input className="input" aria-label="Título de Shorts" maxLength={100} disabled={locked} value={cfg.publish?.shortsTitle ?? ""} onChange={(e) => set({ publish: { ...(cfg.publish ?? {}), shortsTitle: e.target.value } })} /></Group>
            <Group label="Descripción de YouTube Shorts"><input className="input" aria-label="Descripción de Shorts" disabled={locked} value={cfg.publish?.shortsDescription ?? ""} onChange={(e) => set({ publish: { ...(cfg.publish ?? {}), shortsDescription: e.target.value } })} /></Group>
          </div>
        </div>
      )}
    </>
  );

  let body: ReactNode;
  if (mode === "auto") {
    const c = cfg as AutoCfg;
    body = (
      <div className="space-y-4">
        {!isTpl && (
          <Group label="Tema">
            <div className="space-y-2">
              <Segmented value={c.topic.kind} disabled={locked} options={[{ id: "next", label: "Siguiente aprobado" }, { id: "topic", label: "Elegir un tema propuesto" }, { id: "idea", label: "Mi propia idea" }]}
                onChange={(k) => set({ topic: k === "topic" ? { kind: "topic", id: usable[0]?.id ?? "", title: usable[0]?.title ?? "" } : k === "idea" ? { kind: "idea", text: "" } : { kind: "next" } })} />
              {c.topic.kind === "topic" && (
                <select className="input" aria-label="Tema propuesto" disabled={locked} value={c.topic.id} onChange={(e) => { const t = usable.find((x) => x.id === e.target.value); if (t) set({ topic: { kind: "topic", id: t.id, title: t.title } }); }}>
                  {!usable.length && <option value="">No hay temas: pide propuestas en Temas</option>}
                  {usable.map((t) => <option key={t.id} value={t.id}>{t.status === "approved" ? "✓ " : ""}{t.title}{t.score ? ` · ${t.score}` : ""}</option>)}
                </select>
              )}
              {c.topic.kind === "idea" && <textarea className="input min-h-[70px]" aria-label="Idea" disabled={locked} value={c.topic.text} onChange={(e) => set({ topic: { kind: "idea", text: e.target.value } })} placeholder="La idea, la pregunta o las instrucciones del video" />}
              {c.topic.kind === "next" && <div className="text-[12px] text-muted-foreground">Usa el primer tema aprobado en Temas cuando le llegue el turno.</div>}
            </div>
          </Group>
        )}
        {!isTpl && <Group label="Título (opcional)" hint="Si lo escribes, se usa tal cual; si no, la IA propone y elige uno."><input className="input" aria-label="Título" maxLength={100} disabled={locked} value={c.title} onChange={(e) => set({ title: e.target.value })} /></Group>}
        <Group label="Enfoque o indicaciones (opcional)" k="notes" hint="Ángulo, público, qué destacar o evitar."><textarea className="input min-h-[60px]" aria-label="Enfoque" disabled={locked} value={c.notes} onChange={(e) => set({ notes: e.target.value })} /></Group>
        {common}
      </div>
    );
  } else {
    const p = cfg as PersonalCfg;
    const pickFiles = async () => {
      const sel = await openDialog({ multiple: true, filters: [{ name: "Imágenes, videos, audio y documentos", extensions: Object.values(ACCEPT).flat() }] });
      const list = (Array.isArray(sel) ? sel : sel ? [sel] : []).filter((x) => kindOf(x));
      const stored = await Promise.all(list.map((f) => storeFile(owner, f)));
      set({ files: [...p.files, ...stored] });
    };
    const pickScript = async () => {
      const sel = await openDialog({ multiple: false, filters: [{ name: "Guion", extensions: SCRIPT_EXT }] });
      if (typeof sel === "string") set({ scriptFile: await storeFile(owner, sel) });
    };
    const setLanguage = (l: "es" | "en") => {
      // Una voz de Google tiene idioma: se pasa a la misma voz en el otro idioma
      const v = p.voice && /^[a-z]{2}-[A-Z]{2}-Chirp3-HD-/.test(p.voice) ? p.voice.replace(/^[a-z]{2}-[A-Z]{2}-/, `${GOOGLE_LANG[l]}-`) : p.voice;
      set({ language: l, voice: v });
    };
    const KIND_ICON = { image: ImageIcon, video: Film, audio: Music2, document: FileText } as const;
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {!isTpl ? <Group label="Título del video"><input className="input" aria-label="Título del video" maxLength={100} disabled={locked} value={p.title} onChange={(e) => set({ title: e.target.value })} /></Group> : <div />}
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Group label="Modo" k={["tone", "toneCustom"]}>
              <select className="input" aria-label="Modo" disabled={locked} value={p.tone ?? ""} onChange={(e) => set({ tone: (e.target.value || null) as ToneId | null, toneCustom: e.target.value === "custom" ? p.toneCustom ?? { name: "", description: "" } : p.toneCustom })}>
                <option value="">Sin modo (estilo del canal)</option>
                {(Object.keys(TONES) as (keyof typeof TONES)[]).map((k) => <option key={k} value={k}>{TONES[k].label} — {TONES[k].hint}</option>)}
                <option value="custom">Escribir mi propio modo…</option>
              </select>
            </Group>
            <Group label="Idioma" k="language"><Segmented value={p.language} disabled={locked} options={[{ id: "es", label: "Español" }, { id: "en", label: "Inglés" }]} onChange={setLanguage} /></Group>
          </div>
        </div>
        {p.tone === "custom" && (
          <div className="grid grid-cols-[220px_1fr] gap-3">
            <Group label="Nombre del modo"><input className="input" aria-label="Nombre del modo" disabled={locked} value={p.toneCustom?.name ?? ""} onChange={(e) => set({ toneCustom: { name: e.target.value, description: p.toneCustom?.description ?? "" } })} placeholder="Ej.: Inspirador" /></Group>
            <Group label="Descripción del modo"><input className="input" aria-label="Descripción del modo" disabled={locked} value={p.toneCustom?.description ?? ""} onChange={(e) => set({ toneCustom: { name: p.toneCustom?.name ?? "", description: e.target.value } })} placeholder="Cómo debe sonar y verse: ritmo, voz, emociones, tipo de música" /></Group>
          </div>
        )}
        <Group label="De qué trata el video" k="about" hint={isTpl ? "Solo si todos los videos de la campaña comparten el mismo tema; si no, escríbelo en cada tarjeta." : undefined}>
          <textarea className="input min-h-[70px]" aria-label="De qué trata" disabled={locked} value={p.about} onChange={(e) => set({ about: e.target.value })} placeholder="El tema, el mensaje principal y los puntos que no pueden faltar" />
        </Group>
        <div className="grid grid-cols-3 gap-3">
          <Group label="Para qué es (opcional)" k="description"><input className="input" aria-label="Para qué es" disabled={locked} value={p.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ej.: lanzamiento de la app" /></Group>
          <Group label="Público (opcional)" k="audience"><input className="input" aria-label="Público" disabled={locked} value={p.audience} onChange={(e) => set({ audience: e.target.value })} placeholder="Ej.: universitarios de 18–24" /></Group>
          <Group label="Llamado a la acción (opcional)" k="cta"><input className="input" aria-label="Llamado a la acción" disabled={locked} value={p.cta} onChange={(e) => set({ cta: e.target.value })} placeholder="Ej.: descarga la app" /></Group>
        </div>
        <Group label="Estética del video" k="aesthetic" hint={<>Describe con detalle cómo debe verse y sonar: fondo, colores (con código si lo tienes), tipografía, ritmo, transiciones, animaciones, imágenes, subtítulos, música y qué evitar. Manda sobre el estilo del canal. {!locked && <button type="button" className="text-primary hover:underline" onClick={() => set({ aesthetic: p.aesthetic.trim() ? `${p.aesthetic.trim()}\n\n${AESTHETIC_EXAMPLE}` : AESTHETIC_EXAMPLE })}><Wand2 size={11} className="inline -mt-0.5" /> Insertar ejemplo</button>}</>}>
          <textarea className="input min-h-[140px] text-[13px]" aria-label="Estética del video" disabled={locked} value={p.aesthetic} onChange={(e) => set({ aesthetic: e.target.value })} />
        </Group>
        <div className="grid grid-cols-[auto_auto_auto_1fr] items-end gap-3">
          {(["background", "foreground", "accent"] as const).map((k, i) => (
            <Group key={k} label={{ background: "Fondo", foreground: "Texto", accent: "Acento" }[k]} k={i === 0 ? "palette" : undefined}>
              <div className="flex items-center gap-1">
                <input type="color" aria-label={k} title={p.palette?.[k] ? p.palette[k] : "Sin elegir: el del canal"} className={`h-9 w-10 rounded border bg-transparent ${p.palette?.[k] ? "border-border" : "border-dashed border-border opacity-40"}`} disabled={locked}
                  value={p.palette?.[k] ?? { background: "#0b0d12", foreground: "#f2f2f0", accent: "#4c7dff" }[k]} onChange={(e) => set({ palette: { ...(p.palette ?? {}), [k]: e.target.value } })} />
                {!p.palette?.[k] && <span className="text-[10.5px] text-muted-foreground">canal</span>}
                {p.palette?.[k] && !locked && <button className="btn-ghost btn-sm" title="Quitar" onClick={() => { const pal = { ...(p.palette ?? {}) }; delete pal[k]; set({ palette: Object.keys(pal).length ? pal : null }); }}><X size={12} /></button>}
              </div>
            </Group>
          ))}
          <Group label="Tipografía de títulos (opcional)" k="font">
            <select className="input" aria-label="Tipografía" disabled={locked} value={p.font ?? ""} onChange={(e) => set({ font: e.target.value || null })}>
              <option value="">La del canal</option>
              {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Group>
        </div>
        {!isTpl && (
          <Group label="Guion (opcional)" hint="Si lo escribes o subes, se respeta tal cual (la IA solo lo divide en partes). Sin guion, la IA lo escribe con lo de arriba.">
            <textarea className="input min-h-[110px] text-[13px]" aria-label="Guion" disabled={locked || (!!p.scriptFile && !p.script)} value={p.script} onChange={(e) => set({ script: e.target.value })} placeholder={p.scriptFile ? `Se usará el archivo ${fileName(p.scriptFile)}` : "Escribe o pega el guion"} />
            {!locked && <div className="flex items-center gap-2 mt-1.5">
              <button type="button" className="btn-ghost btn-sm" onClick={() => void pickScript()}><FileText size={12} /> {p.scriptFile ? "Cambiar archivo" : "Subir archivo de guion"}</button>
              {p.scriptFile && <span className="chip text-primary border-primary/40 bg-primary/10">{fileName(p.scriptFile)}<button aria-label="Quitar" onClick={() => set({ scriptFile: null })}><X size={11} /></button></span>}
            </div>}
          </Group>
        )}
        <div className="rounded-lg border border-border p-3 space-y-2.5">
          <div className="text-[13px] font-medium flex items-center gap-1.5"><Library size={14} /> Recursos<Own k={["library", "files", "web"]} /></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted-foreground" title="Completa: toda la biblioteca (personal y de automatización)">Biblioteca:</span>
            <Segmented value={p.library.mode} disabled={locked} options={[{ id: "all", label: "Completa" }, { id: "pick", label: "Solo algunos" }, { id: "none", label: "Ninguna" }]} onChange={(m) => set({ library: { ...p.library, mode: m } })} />
            {p.library.mode === "pick" && <button className="btn-ghost btn-sm" disabled={locked} onClick={() => setLib(true)}>Elegir ({p.library.ids.length})</button>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!locked && <button className="btn-ghost btn-sm" onClick={() => void pickFiles().catch(warnErr)}><Plus size={12} /> {isTpl ? "Archivos para todos los videos" : "Archivos solo para este video"}</button>}
            {p.files.map((f) => { const I = KIND_ICON[kindOf(f) ?? "document"]; return <span key={f} className="chip text-muted-foreground border-border"><I size={11} /> {fileName(f).replace(/^[a-z0-9]+-/, "")}{!locked && <button aria-label="Quitar" onClick={() => set({ files: p.files.filter((x) => x !== f) })}><X size={11} /></button>}</span>; })}
          </div>
          <Toggle checked={p.web} onChange={(v) => !locked && set({ web: v })} label="Buscar material en internet y crear imágenes con IA (además de tus recursos)" />
        </div>
        {common}
        <LibraryPicker open={lib} ids={p.library.ids} onClose={() => setLib(false)} onChange={(ids) => set({ library: { mode: "pick", ids } })} />
      </div>
    );
  }

  const title = isTpl ? `Plantilla · ${campaign!.name}` : `${mode === "auto" ? "Automatización" : "Personal"} · ${titleOf({ ...item!, cfg }, topics)}`;
  const note = isTpl
    ? `Lo que cambies aquí lo heredan las ${target.count} tarjeta(s) de la campaña que aún no empezaron (salvo los campos que cada una cambió). Título, tema, guion y textos son de cada tarjeta.`
    : locked ? "El video de esta tarjeta ya se creó: su configuración ya no cambia." : "Los cambios se guardan solos.";
  return (
    <Modal open onClose={() => void close()} wide title={title}
      footer={<>
        <span className="flex-1 text-[11.5px] text-muted-foreground">{note}</span>
        {item && !campaign && !locked && <AsyncButton className="btn-ghost" onClick={() => toCampaign().catch(warnErr)}><Layers size={14} /> Crear campaña con esta tarjeta</AsyncButton>}
        <button className="btn-primary" onClick={() => void close()}>Listo</button>
      </>}>
      {item && campaign && <div className="mb-3 text-[12.5px] rounded-md border border-primary/30 bg-primary/5 px-3 py-2 flex items-center gap-2"><Layers size={13} className="text-primary" /> De la campaña <b>{campaign.name}</b>: cada campo muestra si viene de la plantilla o es propio de esta tarjeta.</div>}
      {video && <div className="mb-3 text-[12.5px] flex items-center gap-2"><span className="text-muted-foreground">Video:</span><button className="text-primary hover:underline" onClick={() => { void close(); navigate({ page: "video", id: video.id }); }}>{video.title}</button></div>}
      <Inherit.Provider value={{ base, cfg: cfg as unknown as Record<string, unknown>, set, locked }}>
        {body}
      </Inherit.Provider>
      {(chk.problems.length > 0 || chk.warnings.length > 0) && (
        <div className="mt-4 space-y-1 text-[12.5px]">
          {chk.problems.map((x) => <div key={x} className="text-red-600 dark:text-red-500 flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {x}</div>)}
          {chk.warnings.map((x) => <div key={x} className="text-amber-700 dark:text-amber-500 flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {x}</div>)}
        </div>
      )}
    </Modal>
  );
}
