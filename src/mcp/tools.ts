// Herramientas MCP de ATRIL: lo que un chat de Claude puede hacer en la app. Respuestas compactas (JSON
// sin espacios, solo lo útil) para gastar pocos tokens. Lo largo (videos, descripciones, temas) arranca
// y responde enseguida; el avance se consulta después. Publicar en YouTube nunca se hace desde aquí.
import { db, fs, http, appPaths, mcp as mcpIpc } from "../lib/ipc";
import { getSettings, SECRET } from "../lib/settings";
import { secrets } from "../lib/ipc";
import { UserError } from "../lib/events";
import { uid, joinPath, extName, slugify } from "../lib/util";
import { activeChannel, listVideos, getVideo, getStages, stagesByVideo, videoNumbers, deleteVideo, setStage, listTopics, updateTopic, deleteTopic,
  STAGES, type Video, type StageRow, type StageId } from "../lib/repo";
import { runVideo, cancelCurrent, rerenderFrom, redoVoiceSegment, acceptVideo, rejectVideo, runningVideoId, isQueued } from "../pipeline/runner";
import { listQueue, listCampaigns, getCampaign, addItem, getItem, saveCfg, removeItem, moveItem, retryItem, skipItem, clearFinished, storeFile, checkItem,
  getQueueState, startQueue, pauseQueue, createCampaign, saveCampaign, deleteCampaign, defaultCfg, isActive, runningFormats, createVideoFromCfg,
  type AutoCfg, type PersonalCfg, type QueueMode, type Campaign } from "../pipeline/queue";
import { importCards, parseDuration, resolveVoice, resolveLibrary } from "../pipeline/importCards";
import { TONES, kindOf, type ToneId } from "../pipeline/personal";
import { formatOf, minutesRangeOf, VERTICAL_DEFAULT, type VideoFormat } from "../pipeline/format";
import { requestImprovement } from "../pipeline/improve";
import { downloadVideo, cutParts, tiktokText } from "../pipeline/tiktok";
import { suggestTopics } from "../pipeline/extras";
import { listAssets, getAssets, updateAsset, deleteAsset, importLocalFile, importCandidate, libraryStats, librarySources, libraryRoot, type Asset } from "../media/library";
import { searchSources, rankCandidates, type Candidate, type AssetKind } from "../media/sources";
import { describeAssets, describePending } from "../media/vision";
import { exportLibraryMd } from "../media/catalog";
import { probeMedia } from "../providers/ffmpeg";
import { listSkills, getSkill, saveSkill, type Scope } from "../lib/skills";
import { listActivity } from "../lib/activity";
import { FONT_FAMILIES } from "../motion/page";
import { awaiting } from "../ui/Steps";
import { navigate, type Page } from "../ui/nav";
import type { RenderOut, PackageOut, VoiceOut, ScriptOut } from "../pipeline/types";
import { guideTopic, GUIDE_TOPICS } from "./guide";
import type { ToolDef, ToolOut } from "./protocol";

type Cfg = Partial<AutoCfg & PersonalCfg>;
const ok = (data: unknown): ToolOut => ({ data });
const fail = (text: string): ToolOut => ({ isError: true, text });
const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") : null);
const cut = (s: string | null | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? "");
const platformOf = (f: VideoFormat) => (f === "9:16" ? "tiktok" : "youtube");
const formatFor = (p: unknown): VideoFormat => (p === "tiktok" ? "9:16" : "16:9");
const HEX = /^#[0-9a-f]{6}$/i;

async function channel() {
  const ch = await activeChannel();
  if (!ch) throw new UserError("ATRIL no tiene canal todavía.", "Ábrelo y termina la bienvenida.", "mcp", false);
  return ch;
}

// ---------- Trabajos en segundo plano (descripciones, temas, recortes) ----------
interface Job { id: string; kind: string; status: "running" | "done" | "error"; started: number; finished?: number; result?: unknown; error?: string }
const JOBS = new Map<string, Job>();
function startJob(kind: string, fn: () => Promise<unknown>): Job {
  const job: Job = { id: uid("job_"), kind, status: "running", started: Date.now() };
  JOBS.set(job.id, job);
  for (const k of [...JOBS.keys()].slice(0, Math.max(0, JOBS.size - 20))) JOBS.delete(k);
  void fn().then((r) => { job.status = "done"; job.result = r; }, (e) => { job.status = "error"; job.error = String(e?.userMessage ?? e?.message ?? e); })
    .finally(() => { job.finished = Date.now(); });
  return job;
}

// ---------- Configuración de un video o tarjeta a partir de los argumentos ----------
const CARD: Record<string, any> = {
  title: { type: "string", description: "Exact title (≤100 chars)." },
  about: { type: "string", description: "Personal: what it is about — main message and must-have points." },
  purpose: { type: "string", description: "Personal: goal (e.g. 'class presentation', 'app launch')." },
  audience: { type: "string" },
  cta: { type: "string", description: "Call to action at the end." },
  tone: { type: "string", enum: [...Object.keys(TONES), "custom"] },
  tone_custom: { type: "object", properties: { name: { type: "string" }, description: { type: "string" } } },
  aesthetic: { type: "string", description: "Look and sound in detail: background, colors, typography, pacing, transitions, animations (cite effects/pieces by name), images, captions, music, what to avoid. Read atril_guide aesthetics + effects first." },
  colors: { type: "object", description: "Hex #RRGGBB, one accent.", properties: { background: { type: "string" }, text: { type: "string" }, accent: { type: "string" } } },
  font: { type: "string", enum: FONT_FAMILIES },
  script: { type: "string", description: "Exact narration, kept word for word. Omit to let ATRIL write it." },
  script_file: { type: "string", description: "Path to a script file (.txt .md .docx .pdf)." },
  duration_s: { anyOf: [{ type: "number" }, { type: "array", items: { type: "number" } }], description: "Seconds: 30 or [min,max]. The video always lasts at least the minimum." },
  language: { type: "string", enum: ["es", "en"] },
  voice: { type: "string", description: "Voice name, e.g. Kore (atril_guide voices)." },
  files: { type: "array", items: { type: "string" }, description: "Local files used as primary material: images, videos, audio, documents (.pptx .pdf .docx)." },
  library: { anyOf: [{ type: "string", enum: ["all", "none"] }, { type: "array", items: { type: "string" } }], description: "'all' (default), 'none' or asset ids/names." },
  web: { type: "boolean", description: "Also search the internet and create AI images (default true)." },
  covers: { type: "object", description: "Exact covers: YouTube 1280×720, TikTok 1080×1920.", properties: { youtube: { type: "string" }, tiktok: { type: "string" } } },
  publish: { type: "object", description: "Texts to post by hand (TikTok/Shorts).", properties: { tiktok: { type: "string" }, shorts_title: { type: "string" }, shorts_description: { type: "string" } } },
  idea: { type: "string", description: "Auto mode: idea or question for the video." },
  topic_id: { type: "string", description: "Auto mode: id from topics." },
  next_topic: { type: "boolean", description: "Auto mode: use the next approved topic." },
  notes: { type: "string", description: "Auto mode: angle and instructions." },
};

async function exists(p: string) { try { return await fs.exists(p); } catch { return false; } }

/** Solo los campos que vinieron (para campañas: lo demás se hereda). */
async function buildCfg(spec: Record<string, any>, mode: QueueMode, channelId: string): Promise<{ given: Cfg; errors: string[]; warnings: string[] }> {
  const g: Cfg = {}; const errors: string[] = []; const warnings: string[] = [];
  const str = (x: unknown) => (x == null ? "" : String(x).trim());
  const lang: "es" | "en" | undefined = spec.language === "en" ? "en" : spec.language === "es" ? "es" : undefined;
  if (spec.title !== undefined) g.title = str(spec.title).slice(0, 100);
  if (mode === "personal") {
    if (spec.about !== undefined) g.about = str(spec.about);
    if (spec.purpose !== undefined) g.description = str(spec.purpose);
    if (spec.audience !== undefined) g.audience = str(spec.audience);
    if (spec.cta !== undefined) g.cta = str(spec.cta);
    if (spec.aesthetic !== undefined) g.aesthetic = str(spec.aesthetic);
    if (spec.tone) {
      g.tone = spec.tone as ToneId | "custom" as ToneId;
      g.toneCustom = spec.tone === "custom" ? { name: str(spec.tone_custom?.name) || "Propio", description: str(spec.tone_custom?.description) } : null;
    }
    if (spec.colors) {
      const pal: NonNullable<PersonalCfg["palette"]> = {};
      for (const [k, slot] of [["background", "background"], ["text", "foreground"], ["accent", "accent"]] as const) {
        const v = str(spec.colors[k]);
        if (!v) continue;
        if (HEX.test(v)) pal[slot] = v.toLowerCase(); else errors.push(`colors.${k}: «${v}» no es #RRGGBB`);
      }
      g.palette = Object.keys(pal).length ? pal : null;
    }
    if (spec.font) g.font = spec.font;
    if (spec.script !== undefined) g.script = str(spec.script);
    if (spec.script_file) { if (await exists(spec.script_file)) g.scriptFile = spec.script_file; else errors.push(`script_file: no existe «${spec.script_file}»`); }
    if (lang) g.language = lang;
    if (Array.isArray(spec.files)) {
      g.files = [];
      for (const f of spec.files) {
        if (!(await exists(f))) errors.push(`files: no existe «${f}»`);
        else if (!kindOf(f)) errors.push(`files: tipo no admitido «${f}»`);
        else g.files.push(f);
      }
    }
    if (spec.library !== undefined) {
      if (Array.isArray(spec.library)) g.library = (await resolveLibrary({ library: { mode: "pick", ids: spec.library.map(String) } }, "library", warnings)).library;
      else g.library = { mode: spec.library === "none" ? "none" : "all", ids: [] };
    }
    if (spec.web !== undefined) g.web = !!spec.web;
  } else {
    if (spec.idea) g.topic = { kind: "idea", text: str(spec.idea) };
    else if (spec.topic_id) {
      const t = (await listTopics(channelId)).find((x) => x.id === spec.topic_id);
      if (t) g.topic = { kind: "topic", id: t.id, title: t.title }; else errors.push(`topic_id: no existe «${spec.topic_id}» (mira topics action=list)`);
    } else if (spec.next_topic) g.topic = { kind: "next" };
    if (spec.notes !== undefined) g.notes = str(spec.notes);
  }
  if (spec.duration_s !== undefined) { const d = parseDuration(spec.duration_s, true); if (d) g.minutes = d; else errors.push(`duration_s: «${JSON.stringify(spec.duration_s)}» no válida`); }
  if (spec.voice) g.voice = resolveVoice(str(spec.voice), lang ?? ((getSettings().publishing.defaultLanguage || "en").startsWith("es") || mode === "personal" ? "es" : "en"));
  if (spec.covers) {
    const covers: AutoCfg["covers"] = {};
    for (const k of ["youtube", "tiktok"] as const) {
      const p = spec.covers[k];
      if (!p) continue;
      if (await exists(p)) covers[k] = p; else errors.push(`covers.${k}: no existe «${p}»`);
    }
    g.covers = covers;
  }
  if (spec.publish) g.publish = { tiktok: str(spec.publish.tiktok) || undefined, shortsTitle: str(spec.publish.shorts_title).slice(0, 100) || undefined, shortsDescription: str(spec.publish.shorts_description) || undefined };
  return { given: g, errors, warnings };
}

/** Configuración completa de un video suelto: la predeterminada del modo, su formato y lo que vino. */
function fullCfg(mode: QueueMode, format: VideoFormat, given: Cfg): AutoCfg | PersonalCfg {
  const base = defaultCfg(mode);
  const minutes: [number, number] = format === "9:16" ? (mode === "personal" ? [0.5, 0.75] : VERTICAL_DEFAULT) : base.minutes;
  return { ...base, format, minutes, ...given } as AutoCfg | PersonalCfg;
}

/** Copia a la carpeta de una tarjeta o campaña los archivos que nombra la configuración (para que sigan ahí). */
async function ownFiles(owner: string, g: Cfg): Promise<Cfg> {
  const out: Cfg = { ...g };
  if (g.files) out.files = await Promise.all(g.files.map((f) => storeFile(owner, f)));
  if (g.scriptFile) out.scriptFile = await storeFile(owner, g.scriptFile);
  if (g.covers) { out.covers = {}; for (const k of ["youtube", "tiktok"] as const) if (g.covers[k]) out.covers[k] = await storeFile(owner, g.covers[k]!, k); }
  return out;
}

async function findCampaign(channelId: string, ref: string, mode?: QueueMode, format?: VideoFormat): Promise<Campaign | null> {
  const all = await listCampaigns(channelId);
  const r = ref.trim().toLowerCase();
  return all.find((c) => c.id === ref) ?? all.find((c) => c.name.trim().toLowerCase() === r && (!mode || c.mode === mode) && (!format || c.format === format)) ?? null;
}

// ---------- Videos: fila compacta y estado ----------
function stateOf(v: Video, st: StageRow[]): string {
  if (v.status === "published" || v.status === "scheduled") return v.data?.personal ? "finished" : "published";
  if (v.status === "ready") return "accepted";
  if (v.status === "rejected" || v.status === "archived") return v.status;
  if (st.some((s) => s.stage === "final" && s.status === "review")) return "review";
  if (st.some((s) => s.status === "failed")) return "failed";
  if (st.some((s) => s.status === "running") || isQueued(v.id) || runningVideoId() === v.id) return "producing";
  return st.some((s) => s.status === "pending") ? "paused" : "done";
}

function videoRow(v: Video, st: StageRow[], n?: number) {
  const r = st.find((s) => s.stage === "render")?.output as RenderOut | undefined;
  return { id: v.id, n, title: v.title, platform: platformOf(formatOf(v)), mode: v.data?.personal ? "personal" : "auto", state: stateOf(v, st), status: awaiting(v, st).text,
    duration_s: r?.duration ? Math.round(r.duration * 10) / 10 : undefined, created: iso(v.created_at) };
}

async function videoByRef(ref: string): Promise<Video> {
  const ch = await channel();
  let id = ref.trim();
  if (/^#?\d+$/.test(id)) { const n = Number(id.replace("#", "")); const nums = await videoNumbers(ch.id); id = [...nums.entries()].find(([, k]) => k === n)?.[0] ?? id; }
  const v = await getVideo(id);
  if (!v) throw new UserError(`No existe el video «${ref}».`, "Usa video_list para ver los ids (o el número #N).", "mcp", false);
  return v;
}

// ---------- Biblioteca ----------
const scopeOf = (a: Pick<Asset, "source">) => (a.source === "personal" ? "personal" : "auto");
function assetRow(a: Asset, full = false) {
  const dims = a.width && a.height ? `${a.width}x${a.height}` : undefined;
  const row: Record<string, unknown> = { id: a.id, kind: a.kind, scope: scopeOf(a), title: cut(a.title, 80), tags: a.tags ? a.tags.split(",").map((x) => x.trim()).filter(Boolean).slice(0, full ? 30 : 6) : [],
    quality: a.quality || undefined, usable: !!a.usable, used: a.used_count || 0, fav: a.favorite ? true : undefined, dims, dur_s: a.duration ? Math.round(a.duration * 10) / 10 : undefined, source: a.source,
    described: !!a.described_at };
  if (full) Object.assign(row, { description: a.description, license: a.license, author: a.author, attribution: a.attribution, page: a.page_url, path: a.path, mood: a.mood, issues: a.issues, created: iso(a.created_at) });
  return row;
}

const EXT: Record<string, string[]> = {
  image: ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "avif"], video: ["mp4", "mov", "webm", "mkv", "avi", "m4v"],
  audio: ["mp3", "wav", "m4a", "ogg", "flac", "aac", "opus"], icon: ["svg"],
};
const SFX_HINT = /(sfx|efecto|whoosh|swoosh|swish|click|pop|impact|hit|riser|boom|transici|ding|notif|glitch|camera|shutter|typing|keyboard|swipe|bell|beep|laugh|risa|aplauso|applause)/i;
const MUSIC_HINT = /(music|musica|música|song|cancion|canción|beat|loop|track|instrumental|lofi|lo-fi|ambient|background|fondo)/i;

async function audioKind(path: string, forced?: string): Promise<AssetKind> {
  if (forced === "sfx" || forced === "music") return forced;
  const name = path.split(/[\\/]/).pop() ?? "";
  if (SFX_HINT.test(name)) return "sfx";
  if (MUSIC_HINT.test(name)) return "music";
  const d = (await probeMedia(path).catch(() => null))?.duration ?? 0;
  return d && d <= 20 ? "sfx" : "music";
}

async function expandPaths(paths: string[], recursive: boolean): Promise<{ files: string[]; missing: string[] }> {
  const files: string[] = []; const missing: string[] = [];
  const walk = async (p: string, depth: number) => {
    if (files.length >= 2000) return;
    const entries = await fs.list(p).catch(() => null);
    if (!entries) { if (await exists(p)) files.push(p); else missing.push(p); return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.is_dir) { if (recursive && depth < 6) await walk(e.path, depth + 1); }
      else files.push(e.path);
    }
  };
  for (const p of paths) {
    const entries = await fs.list(p).catch(() => null);
    if (entries) await walk(p, 0); else if (await exists(p)) files.push(p); else missing.push(p);
  }
  return { files, missing };
}

const CANDIDATES = new Map<string, Candidate>();

// ---------- Herramientas ----------
const PLATFORM = { type: "string", enum: ["youtube", "tiktok"], description: "youtube = horizontal 16:9; tiktok = vertical 9:16 (also Shorts)." };
const MODE = { type: "string", enum: ["personal", "auto"], description: "personal = custom video (never uploaded); auto = channel video from a topic or idea." };

export const TOOLS: ToolDef[] = [
  {
    name: "atril_status", title: "Estado de ATRIL",
    description: "Version, channel, providers configured, queue per platform, video in production, counts and background jobs. Call first.",
    inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true },
    run: async () => {
      const ch = await channel();
      const s = getSettings();
      const [st, q, nums, lib, paths] = await Promise.all([getQueueState(), listQueue(ch.id), db.query<{ n: number; review: number }>(
        "SELECT COUNT(*) n, SUM(CASE WHEN EXISTS(SELECT 1 FROM stages s WHERE s.video_id=v.id AND s.stage='final' AND s.status='review') THEN 1 ELSE 0 END) review FROM videos v WHERE channel_id=? AND status NOT IN ('rejected','archived')", [ch.id]),
        libraryStats("all"), appPaths()]);
      const running = runningVideoId();
      const rv = running ? await getVideo(running) : null;
      const rst = running ? await getStages(running) : [];
      const has = async (k: string) => !!(await secrets.get(k).catch(() => null));
      const free = await fs.diskFree(paths.data).catch(() => 0);
      return ok({
        version: (await import("../../package.json")).version, channel: ch.name,
        providers: { tts: s.tts.provider, ttsKey: await has(s.tts.provider === "elevenlabs" ? SECRET.elevenlabsApiKey : s.tts.provider === "gemini" ? SECRET.geminiApiKey : SECRET.googleApiKey),
          images: s.images.provider, pexels: await has(SECRET.pexelsApiKey), pixabay: await has(SECRET.pixabayApiKey), freesound: await has(SECRET.freesoundApiKey), youtube: await has(SECRET.youtubeRefreshToken) },
        queue: { running: st.running, platforms: runningFormats(st).map(platformOf), note: st.note ?? undefined,
          pending: { youtube: q.filter((i) => isActive(i) && i.cfg.format === "16:9").length, tiktok: q.filter((i) => isActive(i) && i.cfg.format === "9:16").length } },
        producing: rv ? { id: rv.id, title: rv.title, status: awaiting(rv, rst).text } : null,
        videos: { total: nums[0]?.n ?? 0, in_review: nums[0]?.review ?? 0 },
        library: Object.fromEntries(Object.entries(lib).map(([k, v]) => [k, v?.n ?? 0])),
        disk_free_gb: Math.round((free / 1024 ** 3) * 10) / 10,
        jobs: [...JOBS.values()].slice(-8).map((j) => ({ id: j.id, kind: j.kind, status: j.status, result: j.result, error: j.error })),
      });
    },
  },
  {
    name: "atril_guide", title: "Guía de ATRIL",
    description: `How to specify videos well. Topics: ${GUIDE_TOPICS.join(", ")}. Read 'aesthetics' and 'effects' (and 'pieces' for 16:9) before writing an aesthetic; 'voices' lists voice names.`,
    inputSchema: { type: "object", properties: { topic: { type: "string", enum: GUIDE_TOPICS } }, required: ["topic"] }, annotations: { readOnlyHint: true },
    run: async (a) => ({ text: await guideTopic(a.topic) }),
  },
  {
    name: "atril_show", title: "Mostrar en ATRIL",
    description: "Bring the ATRIL window to the front on a page (or a video) so the user sees it.",
    inputSchema: { type: "object", properties: { page: { type: "string", enum: ["youtube", "tiktok", "produccion", "videos", "biblioteca", "instrucciones", "ajustes", "video"] }, video_id: { type: "string" } }, required: ["page"] },
    run: async (a) => {
      if (a.page === "video") { if (!a.video_id) return fail("page=video necesita video_id"); navigate({ page: "video", id: (await videoByRef(a.video_id)).id }); }
      else navigate({ page: a.page as Page });
      await mcpIpc.focus();
      return ok({ shown: a.page });
    },
  },
  {
    name: "video_create", title: "Crear video",
    description: "Create a video and start producing it now (or add it to the queue with queue:true / campaign). Personal: give at least title, about, script or files; a detailed aesthetic gives the best result. Returns at once; production takes 5–60 min — follow it with video_get. ATRIL never publishes without the user.",
    inputSchema: { type: "object", properties: { mode: MODE, platform: PLATFORM, ...CARD, iterate: { type: "boolean", description: "Personal: after the first version the user can ask for changes (video_action request_changes)." },
      queue: { type: "boolean", description: "Add to the production queue instead of starting now." }, campaign: { type: "string", description: "Queue it inside this campaign (id or name): the card inherits the template." },
      show: { type: "boolean", description: "Show the video in ATRIL (default true)." } } },
    run: async (a) => {
      const ch = await channel();
      const mode: QueueMode = a.mode === "auto" ? "auto" : "personal";
      const format = formatFor(a.platform);
      const { given, errors, warnings } = await buildCfg(a, mode, ch.id);
      if (mode === "personal" && !a.campaign && !given.title && !given.about && !given.script && !given.scriptFile && !given.description && !given.files?.length) errors.push("Describe el video: title, about, script, script_file, purpose o files.");
      if (mode === "auto" && !a.campaign && !given.topic) errors.push("Modo auto: da idea, topic_id o next_topic:true.");
      if (errors.length) return fail(`No se creó nada:\n- ${errors.join("\n- ")}`);
      if (a.queue || a.campaign) {
        const camp = a.campaign ? await findCampaign(ch.id, String(a.campaign), mode, format) : null;
        if (a.campaign && !camp) return fail(`No existe la campaña «${a.campaign}» (${mode}, ${platformOf(format)}). Créala con campaign action=create o mira campaign action=list.`);
        const it = await addItem(ch.id, camp?.mode ?? mode, camp ? {} : { format }, camp?.id ?? null);
        const owned = await ownFiles(it.id, given);
        const fresh = (await getItem(it.id))!;
        await saveCfg(it.id, camp ? ({ ...fresh.cfg, ...owned } as AutoCfg | PersonalCfg) : fullCfg(mode, format, owned));
        const done = (await getItem(it.id))!;
        const chk = checkItem(done, { topics: await listTopics(ch.id), items: await listQueue(ch.id) });
        return ok({ queued: true, item_id: it.id, campaign: camp?.name, problems: chk.problems, warnings: [...warnings, ...chk.warnings], next: "queue_action action=start platform=" + platformOf(format) });
      }
      const cfg = fullCfg(mode, format, given);
      const v = await createVideoFromCfg(ch.id, mode, cfg, { origin: "mcp" }, { iterate: !!a.iterate });
      runVideo(v.id);
      if (a.show !== false) { navigate({ page: "video", id: v.id }); await mcpIpc.focus(); }
      const [lo, hi] = minutesRangeOf(v, cfg.minutes);
      return ok({ video_id: v.id, title: v.title, platform: platformOf(format), mode, target_s: [Math.round(lo * 60), Math.round(hi * 60)], warnings, next: "video_get to follow progress; the user reviews and approves it in ATRIL." });
    },
  },
  {
    name: "video_list", title: "Listar videos",
    description: "Videos with state (producing, review, accepted, published, finished, failed, paused). Filters: platform, mode, state, q (title).",
    inputSchema: { type: "object", properties: { platform: PLATFORM, mode: MODE, state: { type: "string" }, q: { type: "string" }, limit: { type: "integer", description: "Default 20, max 100." } } },
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const ch = await channel();
      const [list, stages, nums] = await Promise.all([listVideos(ch.id, 500), stagesByVideo(ch.id, ["render"]), videoNumbers(ch.id)]);
      const q = String(a.q ?? "").toLowerCase();
      const rows = list.filter((v) => v.status !== "archived").map((v) => videoRow(v, stages.get(v.id) ?? [], nums.get(v.id)))
        .filter((r) => (!a.platform || r.platform === a.platform) && (!a.mode || r.mode === a.mode) && (!a.state || r.state === a.state) && (!q || r.title.toLowerCase().includes(q)));
      return ok({ total: rows.length, videos: rows.slice(0, Math.min(100, a.limit ?? 20)) });
    },
  },
  {
    name: "video_get", title: "Ver un video",
    description: "Details of a video (id or #number): stages, files, texts. include: stages, files, package, plan, script, activity, revisions (default stages+files).",
    inputSchema: { type: "object", properties: { id: { type: "string" }, include: { type: "array", items: { type: "string", enum: ["stages", "files", "package", "plan", "script", "activity", "revisions"] } } }, required: ["id"] },
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const v = await videoByRef(a.id);
      const st = await getStages(v.id);
      const inc = new Set<string>(a.include?.length ? a.include : ["stages", "files"]);
      const out: Record<string, unknown> = videoRow(v, st, (await videoNumbers(v.channel_id)).get(v.id));
      const get = <T,>(s: string) => st.find((x) => x.stage === s)?.output as T | undefined;
      if (inc.has("stages")) out.stages = st.map((s) => ({ stage: s.stage, status: s.status, progress: s.progress || undefined, error: s.error ? cut(s.error, 300) : undefined }));
      if (inc.has("files")) {
        const r = get<RenderOut>("render"); const pkg = get<PackageOut>("package");
        out.files = { video: r?.file, poster: r?.poster, thumbnail: pkg?.thumbnails?.[pkg.chosen_thumbnail ?? 0]?.path, tiktok_parts: (v.data?.tiktok as { exportedTo?: string } | undefined)?.exportedTo, folder: v.dir };
      }
      if (inc.has("package")) {
        const pkg = get<PackageOut>("package");
        out.package = pkg ? { title: pkg.chosen_title, description: cut(pkg.description, 1500), tags: pkg.tags, tiktok_text: tiktokText(v, pkg).text, publish: v.data?.publish ?? undefined } : null;
      }
      if (inc.has("plan")) out.plan = get<VoiceOut>("voice")?.plan ?? null;
      if (inc.has("script")) out.script = get<ScriptOut>("script")?.segments.map((s) => ({ id: s.id, title: s.title, text: cut(s.text_en, 2500) })) ?? null;
      if (inc.has("activity")) out.activity = (await listActivity(v.id, 15)).map((x) => ({ at: iso(x.ts), stage: x.stage, kind: x.kind, title: cut(x.title, 160) }));
      if (inc.has("revisions")) out.revisions = ((v.data?.revisions ?? []) as any[]).slice(-5).map((r) => ({ at: iso(r.at), request: cut(r.request, 200), status: r.status, reply: cut(r.reply_es, 400) }));
      return ok(out);
    },
  },
  {
    name: "video_action", title: "Acción sobre un video",
    description: "continue (resume, retrying failed steps) · cancel · redo_from (stage) · redo_voice_segment (segment_id) · request_changes (text; personal videos in review) · accept (keep it without publishing) · reject (reason) · download (copy to Downloads) · cut_tiktok (cut into ~1:30 parts) · delete (confirm:true). Publishing to YouTube is only done by the user in ATRIL.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, action: { type: "string", enum: ["continue", "cancel", "redo_from", "redo_voice_segment", "request_changes", "accept", "reject", "download", "cut_tiktok", "delete"] },
      stage: { type: "string", enum: STAGES.map((s) => s.id as string) }, segment_id: { type: "string" }, text: { type: "string" }, reason: { type: "string" }, confirm: { type: "boolean" } }, required: ["id", "action"] },
    annotations: { destructiveHint: true },
    run: async (a) => {
      const v = await videoByRef(a.id);
      const st = await getStages(v.id);
      const inReview = st.some((s) => s.stage === "final" && s.status === "review") || v.status === "ready";
      switch (a.action) {
        case "continue":
          for (const s of st.filter((x) => x.status === "failed")) await setStage(v.id, s.stage, { status: "pending", error: null });
          runVideo(v.id); return ok({ continued: v.id });
        case "cancel":
          if (runningVideoId() !== v.id) return fail("Ese video no está en producción ahora.");
          await cancelCurrent(); return ok({ cancelled: v.id, note: "Queda guardado; continue lo retoma donde quedó." });
        case "redo_from":
          if (!a.stage) return fail("redo_from necesita stage.");
          await rerenderFrom(v.id, a.stage as StageId); return ok({ redoing_from: a.stage });
        case "redo_voice_segment":
          if (!a.segment_id) return fail("redo_voice_segment necesita segment_id (video_get include=script).");
          await redoVoiceSegment(v.id, a.segment_id); return ok({ redoing_voice: a.segment_id });
        case "request_changes": {
          if (!a.text?.trim()) return fail("request_changes necesita text (qué cambiar).");
          if (!inReview) return fail("Solo se piden cambios a un video en revisión final.");
          const job = startJob("request_changes", async () => { const r = await requestImprovement(v.id, a.text, runVideo); return { status: r.status, reply: r.reply_es }; });
          return ok({ job: job.id, note: "ATRIL planifica y aplica los cambios; sigue el avance con video_get include=revisions,stages." });
        }
        case "accept":
          if (!inReview) return fail("Solo se acepta un video en revisión final.");
          await acceptVideo(v.id); return ok({ accepted: v.id, note: v.data?.personal ? "Terminado (está en Descargas)." : "Guardado sin publicar: el usuario lo publica desde ATRIL cuando quiera." });
        case "reject":
          await rejectVideo(v.id, String(a.reason ?? "Rechazado desde Claude")); return ok({ rejected: v.id });
        case "download":
          return ok({ file: await downloadVideo(v) });
        case "cut_tiktok": {
          const job = startJob("cut_tiktok", async () => ({ folder: await cutParts(v, () => undefined) }));
          return ok({ job: job.id, note: "Partes en Descargas; atril_status muestra cuándo termina." });
        }
        case "delete":
          if (a.confirm !== true) return fail("Borrar es irreversible: repite con confirm:true si el usuario lo pidió.");
          await deleteVideo(v.id); return ok({ deleted: v.id });
      }
      return fail("Acción desconocida.");
    },
  },
  {
    name: "queue_list", title: "Ver la cola",
    description: "Production queue: state per platform, campaigns and cards (status, problems).",
    inputSchema: { type: "object", properties: { platform: PLATFORM } }, annotations: { readOnlyHint: true },
    run: async (a) => {
      const ch = await channel();
      const [st, items, camps, topics] = await Promise.all([getQueueState(), listQueue(ch.id), listCampaigns(ch.id), listTopics(ch.id)]);
      const f = a.platform ? formatFor(a.platform) : null;
      const mine = items.filter((i) => !f || i.cfg.format === f);
      const active = items.filter(isActive);
      return ok({
        state: { running: st.running, platforms: runningFormats(st).map(platformOf), note: st.note ?? undefined },
        campaigns: camps.filter((c) => !f || c.format === f).map((c) => ({ id: c.id, name: c.name, mode: c.mode, platform: platformOf(c.format), cards: items.filter((i) => i.campaign_id === c.id).length,
          template: { duration_s: c.cfg.minutes.map((m) => Math.round(m * 60)), voice: c.cfg.voice ?? undefined, tone: (c.cfg as PersonalCfg).tone ?? undefined, aesthetic: cut((c.cfg as PersonalCfg).aesthetic, 120) || undefined } })),
        items: mine.map((i) => {
          const chk = checkItem(i, { topics, items });
          const p = i.cfg as PersonalCfg & AutoCfg;
          return { id: i.id, pos: active.indexOf(i) + 1 || undefined, title: cut(p.title || p.about || (p.topic?.kind === "idea" ? p.topic.text : "") || "(sin título)", 80), mode: i.mode, platform: platformOf(i.cfg.format),
            status: i.status, campaign: camps.find((c) => c.id === i.campaign_id)?.name, own_fields: i.campaign_id ? i.overrides : undefined, problems: chk.problems.length ? chk.problems : undefined, video_id: i.video_id ?? undefined, error: i.error ? cut(i.error, 200) : undefined };
        }),
      });
    },
  },
  {
    name: "queue_add", title: "Añadir tarjetas a la cola",
    description: "Add one or many cards (same fields as video_create) to the queue, optionally inside a campaign (cards then hold only what differs from the template). Or pass json in the 'Importar' format (atril_guide json_import) with base_dir for relative cover paths.",
    inputSchema: { type: "object", properties: { mode: MODE, platform: PLATFORM, campaign: { type: "string", description: "Campaign id or name." },
      cards: { type: "array", items: { type: "object", properties: CARD } }, json: { type: "string" }, base_dir: { type: "string" } } },
    run: async (a) => {
      const ch = await channel();
      const mode: QueueMode = a.mode === "auto" ? "auto" : "personal";
      const format = formatFor(a.platform);
      const camp = a.campaign ? await findCampaign(ch.id, String(a.campaign), mode, format) : null;
      if (a.campaign && !camp) return fail(`No existe la campaña «${a.campaign}».`);
      if (a.json) {
        const r = await importCards(ch.id, String(a.json), { mode, format, campaignId: camp?.id ?? null, baseDir: a.base_dir ?? null });
        return ok({ created: r.created, campaign: r.campaign?.name, warnings: r.warnings.slice(0, 20) });
      }
      if (!Array.isArray(a.cards) || !a.cards.length) return fail("Da cards (lista) o json.");
      const built = await Promise.all(a.cards.map((c: any) => buildCfg(c, mode, ch.id)));
      const errors = built.flatMap((b, i) => b.errors.map((e) => `Tarjeta ${i + 1}: ${e}`));
      if (errors.length) return fail(`No se añadió nada:\n- ${errors.join("\n- ")}`);
      const ids: string[] = [];
      for (const b of built) {
        const it = await addItem(ch.id, camp?.mode ?? mode, camp ? {} : { format }, camp?.id ?? null);
        const owned = await ownFiles(it.id, b.given);
        const fresh = (await getItem(it.id))!;
        await saveCfg(it.id, camp ? ({ ...fresh.cfg, ...owned } as AutoCfg | PersonalCfg) : fullCfg(mode, format, owned));
        ids.push(it.id);
      }
      return ok({ created: ids.length, item_ids: ids, campaign: camp?.name, warnings: built.flatMap((b) => b.warnings).slice(0, 20), next: `queue_action action=start platform=${platformOf(format)}` });
    },
  },
  {
    name: "queue_action", title: "Controlar la cola",
    description: "start · pause (finish current video, then stop) · stop (cancel current video now) for a platform; retry · skip · remove · move_up · move_down a card (item_id); clear_finished.",
    inputSchema: { type: "object", properties: { action: { type: "string", enum: ["start", "pause", "stop", "retry", "skip", "remove", "move_up", "move_down", "clear_finished"] }, platform: PLATFORM, item_id: { type: "string" } }, required: ["action"] },
    run: async (a) => {
      const ch = await channel();
      const f = a.platform ? formatFor(a.platform) : undefined;
      const needItem = ["retry", "skip", "remove", "move_up", "move_down"].includes(a.action);
      if (needItem && !a.item_id) return fail(`${a.action} necesita item_id (queue_list).`);
      if (needItem && !(await getItem(a.item_id))) return fail(`No existe la tarjeta «${a.item_id}».`);
      switch (a.action) {
        case "start": await startQueue(ch.id, f); break;
        case "pause": await pauseQueue(false, f); break;
        case "stop": await pauseQueue(true, f); break;
        case "retry": await retryItem(a.item_id); break;
        case "skip": await skipItem(a.item_id); break;
        case "remove": await removeItem(a.item_id); break;
        case "move_up": await moveItem(a.item_id, -1); break;
        case "move_down": await moveItem(a.item_id, 1); break;
        case "clear_finished": await clearFinished(ch.id, f); break;
      }
      const st = await getQueueState();
      return ok({ done: a.action, running: st.running, platforms: runningFormats(st).map(platformOf) });
    },
  },
  {
    name: "campaign", title: "Campañas",
    description: "list · create (name, mode, platform, template) · update (id, name and/or template fields to change) · delete (id; its cards stay as loose cards). The template holds what similar videos share (duration, tone, aesthetic, colors, font, voice, resources, CTA).",
    inputSchema: { type: "object", properties: { action: { type: "string", enum: ["list", "create", "update", "delete"] }, id: { type: "string" }, name: { type: "string" }, mode: MODE, platform: PLATFORM,
      template: { type: "object", properties: CARD } }, required: ["action"] },
    run: async (a) => {
      const ch = await channel();
      if (a.action === "list") return ok((await listCampaigns(ch.id)).map((c) => ({ id: c.id, name: c.name, mode: c.mode, platform: platformOf(c.format), template: c.cfg })));
      if (a.action === "create") {
        if (!a.name?.trim()) return fail("create necesita name.");
        const mode: QueueMode = a.mode === "auto" ? "auto" : "personal";
        const { given, errors } = await buildCfg(a.template ?? {}, mode, ch.id);
        if (errors.length) return fail(errors.join("\n"));
        const c = await createCampaign(ch.id, a.name, mode, formatFor(a.platform));
        await saveCampaign(c.id, { cfg: { ...c.cfg, ...(await ownFiles(c.id, given)) } as AutoCfg | PersonalCfg });
        return ok({ created: c.id, name: c.name, next: "queue_add with campaign=<id> and only the fields each video changes" });
      }
      const c = a.id ? await getCampaign(a.id) : null;
      if (!c) return fail(`No existe la campaña «${a.id ?? ""}».`);
      if (a.action === "delete") { await deleteCampaign(c.id); return ok({ deleted: c.id }); }
      const { given, errors } = await buildCfg(a.template ?? {}, c.mode, ch.id);
      if (errors.length) return fail(errors.join("\n"));
      await saveCampaign(c.id, { name: a.name, cfg: { ...c.cfg, ...(await ownFiles(c.id, given)) } as AutoCfg | PersonalCfg });
      return ok({ updated: c.id, changed: Object.keys(given) });
    },
  },
  {
    name: "library_overview", title: "Resumen de la biblioteca",
    description: "Library health: counts per kind and scope (auto = automation library, personal = user's own files), undescribed, unusable, never used, exact duplicates, missing files, sources, folder.",
    inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true },
    run: async () => {
      const [auto, personal, sources, root] = await Promise.all([libraryStats("auto"), libraryStats("personal"), librarySources("all"), libraryRoot()]);
      const one = async (sql: string) => (await db.query<{ n: number }>(sql))[0]?.n ?? 0;
      const paths = await db.query<{ path: string }>("SELECT path FROM assets ORDER BY created_at DESC LIMIT 5000");
      let missing = 0;
      for (const p of paths) if (!(await exists(p.path))) missing++;
      const pack = (s: Awaited<ReturnType<typeof libraryStats>>) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { n: v?.n ?? 0, mb: Math.round((v?.bytes ?? 0) / 1048576), undescribed: v?.undescribed ?? 0 }]));
      return ok({
        folder: root, auto: pack(auto), personal: pack(personal),
        unusable: await one("SELECT COUNT(*) n FROM assets WHERE usable=0"), never_used: await one("SELECT COUNT(*) n FROM assets WHERE used_count=0"),
        duplicate_groups: await one("SELECT COUNT(*) n FROM (SELECT 1 FROM assets WHERE sha LIKE 'fp1:%' GROUP BY (source='personal'), sha HAVING COUNT(*)>1)"),
        without_fingerprint: await one("SELECT COUNT(*) n FROM assets WHERE sha IS NULL OR sha NOT LIKE 'fp1:%'"),
        missing_files: missing, sources: Object.fromEntries(sources.map((x) => [x.source, x.n])),
      });
    },
  },
  {
    name: "library_list", title: "Listar la biblioteca",
    description: "Assets with filters (scope, kind, q = semantic search over descriptions, status, orientation, min_quality 1–5, source, favorites, sort) or by ids. detail:full adds description, license, path.",
    inputSchema: { type: "object", properties: { scope: { type: "string", enum: ["auto", "personal", "all"] }, kind: { type: "string", enum: ["image", "video", "sfx", "music", "icon"] }, q: { type: "string" },
      status: { type: "string", enum: ["described", "undescribed", "unusable", "unused", "used"] }, orientation: { type: "string", enum: ["landscape", "portrait", "square"] }, min_quality: { type: "integer" },
      source: { type: "string" }, favorites: { type: "boolean" }, sort: { type: "string", enum: ["new", "old", "used", "quality", "size"] }, ids: { type: "array", items: { type: "string" } },
      limit: { type: "integer", description: "Default 30, max 200." }, offset: { type: "integer" }, detail: { type: "string", enum: ["brief", "full"] } } },
    annotations: { readOnlyHint: true },
    run: async (a) => {
      const full = a.detail === "full";
      if (a.ids?.length) { const m = await getAssets(a.ids); return ok([...m.values()].map((x) => assetRow(x, full))); }
      const list = await listAssets({ scope: a.scope ?? "all", kind: a.kind ?? null, q: a.q, status: a.status, orientation: a.orientation, minQuality: a.min_quality, source: a.source,
        favorites: a.favorites, sort: a.sort, limit: Math.min(200, a.limit ?? 30), offset: a.offset ?? 0 });
      return ok({ count: list.length, assets: list.map((x) => assetRow(x, full)) });
    },
  },
  {
    name: "library_update", title: "Editar la biblioteca",
    description: "Edit many assets at once: title, description, tags (list or comma text), favorite, usable (false = never use), scope (only for the user's own files: auto ↔ personal).",
    inputSchema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, description: { type: "string" },
      tags: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] }, favorite: { type: "boolean" }, usable: { type: "boolean" }, scope: { type: "string", enum: ["auto", "personal"] } }, required: ["id"] } } }, required: ["items"] },
    run: async (a) => {
      const assets = await getAssets(a.items.map((x: any) => x.id));
      let updated = 0; const problems: string[] = [];
      for (const it of a.items) {
        const cur = assets.get(it.id);
        if (!cur) { problems.push(`${it.id}: no existe`); continue; }
        const patch: Parameters<typeof updateAsset>[1] = {};
        if (it.title !== undefined) patch.title = String(it.title).slice(0, 200);
        if (it.description !== undefined) patch.description = String(it.description);
        if (it.tags !== undefined) patch.tags = (Array.isArray(it.tags) ? it.tags : String(it.tags).split(",")).map((t: string) => t.trim()).filter(Boolean).join(", ");
        if (it.favorite !== undefined) patch.favorite = it.favorite ? 1 : 0;
        if (it.usable !== undefined) patch.usable = it.usable ? 1 : 0;
        if (Object.keys(patch).length) await updateAsset(it.id, patch);
        if (it.scope && it.scope !== scopeOf(cur)) {
          if (cur.source !== "user" && cur.source !== "personal") problems.push(`${it.id}: solo los archivos propios cambian de biblioteca (este viene de ${cur.source}; los videos personales ya pueden usarlo)`);
          else await db.execute("UPDATE assets SET source=? WHERE id=?", [it.scope === "personal" ? "personal" : "user", it.id]);
        }
        updated++;
      }
      return ok({ updated, problems: problems.length ? problems : undefined });
    },
  },
  {
    name: "library_delete", title: "Borrar de la biblioteca",
    description: "Delete assets and their files. Requires confirm:true. Assets already used in videos are skipped unless force:true (deleting them breaks re-renders of those videos).",
    inputSchema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } }, confirm: { type: "boolean" }, force: { type: "boolean" } }, required: ["ids", "confirm"] },
    annotations: { destructiveHint: true },
    run: async (a) => {
      if (a.confirm !== true) return fail("Repite con confirm:true si el usuario lo pidió.");
      const m = await getAssets(a.ids);
      let deleted = 0; const kept: string[] = [];
      for (const id of a.ids) {
        const x = m.get(id);
        if (!x) continue;
        if (x.used_count > 0 && !a.force) { kept.push(id); continue; }
        await deleteAsset(id); deleted++;
      }
      return ok({ deleted, kept_used: kept.length ? kept : undefined });
    },
  },
  {
    name: "library_search_web", title: "Buscar material libre",
    description: "Search free-license sources (images: Pexels, Pixabay, Wikimedia, Openverse, Met, NASA; video: Pexels, Pixabay, Wikimedia, NASA; sfx and music: Freesound, Openverse). Returns candidates with license; import them with library_import candidates=[key…]. Prefer this over random downloads: these licenses allow monetized use.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "English works best." }, kind: { type: "string", enum: ["image", "video", "sfx", "music"] },
      limit: { type: "integer", description: "Default 10, max 30." }, orientation: { type: "string", enum: ["landscape", "portrait"] } }, required: ["query", "kind"] },
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (a) => {
      const n = Math.min(30, a.limit ?? 10);
      const rep = await searchSources(String(a.query), a.kind as AssetKind, n, undefined, a.orientation);
      const ranked = rankCandidates(rep.candidates, a.kind as AssetKind, getSettings().media.maxClipSeconds).slice(0, n);
      const rows = ranked.map((c) => {
        const key = `${c.source}:${c.sourceId}`;
        CANDIDATES.set(key, c);
        return { key, title: cut(c.title, 80), source: c.source, license: c.license, author: cut(c.author, 40), dims: c.width && c.height ? `${c.width}x${c.height}` : undefined, dur_s: c.duration ? Math.round(c.duration) : undefined, preview: c.previewUrl, page: c.pageUrl };
      });
      return ok({ candidates: rows, skipped_sources: rep.skipped.length ? rep.skipped : undefined, errors: rep.errors.length ? rep.errors.map((e) => `${e.source}: ${cut(e.message, 120)}`) : undefined });
    },
  },
  {
    name: "library_import", title: "Añadir a la biblioteca",
    description: "Add material to the library: local files or folders (paths; kind detected — audio ≤20 s or with sfx-like names becomes sfx, else music), candidates from library_search_web, or direct URLs you found with a clear license. scope auto (for channel videos; give license = origin and usage rights) or personal (user's own material). describe:true (default) runs Claude vision in the background so assets become searchable.",
    inputSchema: { type: "object", properties: { paths: { type: "array", items: { type: "string" } }, candidates: { type: "array", items: { type: "string" } },
      urls: { type: "array", items: { type: "object", properties: { url: { type: "string" }, title: { type: "string" }, license: { type: "string" }, author: { type: "string" }, page: { type: "string" }, kind: { type: "string", enum: ["image", "video", "sfx", "music"] } }, required: ["url", "license"] } },
      scope: { type: "string", enum: ["auto", "personal"] }, license: { type: "string", description: "Origin and rights of local files (e.g. 'Pixabay Content License — pixabay.com/…', 'own recording')." },
      kind: { type: "string", enum: ["sfx", "music"], description: "Force the kind of audio files." }, recursive: { type: "boolean" }, describe: { type: "boolean" } } },
    annotations: { openWorldHint: true },
    run: async (a) => {
      const personal = a.scope === "personal";
      if (a.paths?.length && !personal && !String(a.license ?? "").trim()) return fail("Para la biblioteca de automatización indica license: de dónde viene y con qué derecho se usa (o usa scope:personal).");
      const ids: string[] = []; const failed: string[] = []; let duplicates = 0;
      const before = new Set((await db.query<{ id: string }>("SELECT id FROM assets")).map((r) => r.id));
      // Lo que ya estaba, o lo que esta misma llamada ya trajo (otra copia del mismo archivo), es un duplicado
      const tally = (x: Asset) => { if (before.has(x.id)) duplicates++; else { before.add(x.id); ids.push(x.id); } };
      if (a.paths?.length) {
        const { files, missing } = await expandPaths(a.paths, a.recursive !== false);
        failed.push(...missing.map((m) => `${m}: no existe`));
        for (const f of files) {
          const ext = extName(f).toLowerCase();
          const kind: AssetKind | null = EXT.image.includes(ext) ? "image" : EXT.video.includes(ext) ? "video" : EXT.audio.includes(ext) ? await audioKind(f, a.kind) : EXT.icon.includes(ext) ? "icon" : null;
          if (!kind) continue;
          try { const x = await importLocalFile(f, kind, { license: a.license, note: personal ? "" : String(a.license ?? ""), personal }); tally(x); }
          catch (e: any) { failed.push(`${f}: ${cut(e?.message ?? String(e), 120)}`); }
        }
      }
      for (const key of a.candidates ?? []) {
        const c = CANDIDATES.get(key);
        if (!c) { failed.push(`${key}: búscalo antes con library_search_web`); continue; }
        try { const x = await importCandidate(c); tally(x); } catch (e: any) { failed.push(`${key}: ${cut(e?.message ?? String(e), 120)}`); }
      }
      if (a.urls?.length) {
        const tmp = joinPath((await appPaths()).data, "mcp-descargas");
        await fs.mkdir(tmp);
        for (const u of a.urls) {
          try {
            const ext = (extName(new URL(u.url).pathname) || (u.kind === "image" ? "jpg" : u.kind === "video" ? "mp4" : "mp3")).toLowerCase();
            const file = joinPath(tmp, `${slugify(u.title || "descarga", 40)}-${uid("").slice(-6)}.${ext}`);
            await http.download(u.url, file);
            const kind: AssetKind = (u.kind as AssetKind) ?? (EXT.image.includes(ext) ? "image" : EXT.video.includes(ext) ? "video" : await audioKind(file));
            const x = await importLocalFile(file, kind, { title: u.title, license: u.license, attribution: [u.author, u.page].filter(Boolean).join(" · "), note: u.page ?? "", personal });
            await fs.remove(file).catch(() => undefined);
            tally(x);
          } catch (e: any) { failed.push(`${u.url}: ${cut(e?.message ?? String(e), 120)}`); }
        }
      }
      let job: Job | null = null;
      if (a.describe !== false && ids.length) {
        const fresh = [...(await getAssets(ids)).values()].filter((x) => (x.kind === "image" || x.kind === "video") && !x.described_at);
        if (fresh.length) job = startJob("describe", async () => describeAssets(fresh, { stage: "biblioteca" }));
      }
      return ok({ imported: ids.length, duplicates, failed: failed.length ? failed.slice(0, 30) : undefined, ids: ids.slice(0, 60), describing: job?.id });
    },
  },
  {
    name: "library_organize", title: "Ordenar la biblioteca",
    description: "Tidy the library. Without apply it only reports the plan: exact duplicates (the most used/favorite copy is kept; copies used in videos are never deleted), rows whose file is missing, messy tags, undescribed assets. apply:true executes it (describing runs in the background). Also creates a catalog .md in Downloads with catalog:true.",
    inputSchema: { type: "object", properties: { apply: { type: "boolean" }, dedupe: { type: "boolean" }, missing: { type: "boolean" }, tags: { type: "boolean" }, describe: { type: "boolean" },
      describe_limit: { type: "integer", description: "Default 40." }, catalog: { type: "boolean" } } },
    annotations: { destructiveHint: true },
    run: async (a) => {
      const apply = a.apply === true;
      const rows = await db.query<Asset>("SELECT * FROM assets");
      const report: Record<string, unknown> = { dry_run: !apply };
      if (a.dedupe !== false) {
        // Huella del contenido de los que aún no la tienen (se guarda: la próxima vez es inmediato)
        let fingerprinted = 0;
        for (const x of rows) {
          if (x.sha?.startsWith("fp1:") || !(await exists(x.path))) continue;
          const fp = await fs.fingerprint(x.path).catch(() => null);
          if (fp) { x.sha = fp; fingerprinted++; await db.execute("UPDATE assets SET sha=? WHERE id=?", [fp, x.id]); }
        }
        const groups = new Map<string, Asset[]>();
        for (const x of rows) if (x.sha?.startsWith("fp1:")) { const k = `${scopeOf(x)}|${x.sha}`; groups.set(k, [...(groups.get(k) ?? []), x]); }
        const remove: string[] = []; const keptUsed: string[] = [];
        for (const g of groups.values()) {
          if (g.length < 2) continue;
          const [keep, ...rest] = [...g].sort((p, q) => (q.favorite - p.favorite) || (q.used_count - p.used_count) || (Number(!!q.described_at) - Number(!!p.described_at)) || (p.created_at - q.created_at));
          void keep;
          for (const r of rest) (r.used_count > 0 || r.favorite ? keptUsed : remove).push(r.id);
        }
        if (apply) for (const id of remove) await deleteAsset(id);
        report.duplicates = { removable: remove.length, kept_because_used: keptUsed.length, ids: remove.slice(0, 20), fingerprinted };
      }
      if (a.missing !== false) {
        const gone: string[] = [];
        for (const x of rows) if (!(await exists(x.path))) gone.push(x.id);
        if (apply) for (const id of gone) await deleteAsset(id);
        report.missing_files = { count: gone.length, ids: gone.slice(0, 20) };
      }
      if (a.tags !== false) {
        let fixed = 0;
        for (const x of rows) {
          if (!x.tags) continue;
          const seen = new Set<string>();
          const clean = x.tags.split(",").map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 25).join(", ");
          if (clean !== x.tags) { fixed++; if (apply) await updateAsset(x.id, { tags: clean }); }
        }
        report.tags_normalized = fixed;
      }
      if (a.describe !== false) {
        const pending = rows.filter((x) => (x.kind === "image" || x.kind === "video") && !x.described_at).length;
        report.undescribed = pending;
        if (apply && pending) report.describing = startJob("describe", async () => describePending(Math.min(200, a.describe_limit ?? 40))).id;
      }
      if (a.catalog) report.catalog = await exportLibraryMd();
      return ok(report);
    },
  },
  {
    name: "topics", title: "Temas del canal",
    description: "Topics for channel (auto) videos: list · propose (count, hint; researched by Claude in the background) · approve · reject · delete (id).",
    inputSchema: { type: "object", properties: { action: { type: "string", enum: ["list", "propose", "approve", "reject", "delete"] }, id: { type: "string" }, count: { type: "integer" }, hint: { type: "string" }, status: { type: "string", enum: ["candidate", "approved", "used", "rejected"] } }, required: ["action"] },
    run: async (a) => {
      const ch = await channel();
      if (a.action === "list") return ok((await listTopics(ch.id, a.status)).slice(0, 60).map((t) => ({ id: t.id, title: t.title, status: t.status, score: t.score || undefined, angle: cut(t.angle, 160) || undefined })));
      if (a.action === "propose") return ok({ job: startJob("topics", async () => ({ added: await suggestTopics(ch.id, Math.min(15, a.count ?? 6), String(a.hint ?? "")) })).id, note: "atril_status muestra cuándo termina; luego topics action=list." });
      if (!a.id) return fail(`${a.action} necesita id.`);
      if (a.action === "delete") await deleteTopic(a.id); else await updateTopic(a.id, { status: a.action === "approve" ? "approved" : "rejected" });
      return ok({ done: a.action, id: a.id });
    },
  },
  {
    name: "instructions", title: "Instrucciones del canal",
    description: "The user's instruction documents (skills) that steer every video: list · get (id) · update (id, content; versioned, the user can restore old versions in ATRIL) · create (name, content, scopes). Change them only when the user asks.",
    inputSchema: { type: "object", properties: { action: { type: "string", enum: ["list", "get", "update", "create"] }, id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, content: { type: "string" },
      scopes: { type: "array", items: { type: "string" } } }, required: ["action"] },
    run: async (a) => {
      const ch = await channel();
      if (a.action === "list") return ok((await listSkills(ch.id)).map((s) => ({ id: s.id, name: s.name, description: cut(s.description, 160), scopes: s.scopes, enabled: s.enabled, chars: s.content.length, version: s.version })));
      if (a.action === "create") {
        if (!a.name || !a.content) return fail("create necesita name y content.");
        const s = await saveSkill({ name: a.name, description: a.description ?? "", content: a.content, scopes: (a.scopes?.length ? a.scopes : ["all"]) as Scope[], channel_id: ch.id, enabled: true }, "Claude (MCP)");
        return ok({ created: s.id });
      }
      const s = a.id ? await getSkill(a.id) : null;
      if (!s) return fail(`No existe la instrucción «${a.id ?? ""}».`);
      if (a.action === "get") return ok({ id: s.id, name: s.name, scopes: s.scopes, version: s.version, content: s.content });
      if (!a.content) return fail("update necesita content (el documento completo).");
      const n = await saveSkill({ ...s, content: a.content, name: a.name ?? s.name, description: a.description ?? s.description }, "Claude (MCP)");
      return ok({ updated: n.id, version: n.version });
    },
  },
];
