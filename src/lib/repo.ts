// Acceso a datos de canales, temas, videos, etapas, revisiones y música.
import { db, appPaths, fs } from "./ipc";
import { emit } from "./bus";
import { now, uid, safeJson, joinPath, slugify } from "./util";
import { getSettings, saveSettings } from "./settings";

// ---------- Canales ----------
export interface Channel { id: string; name: string; description: string; language: string; settings: Record<string, any>; created_at: number }

export async function listChannels(): Promise<Channel[]> {
  const rows = await db.query("SELECT * FROM channels WHERE archived=0 ORDER BY created_at");
  return rows.map((r) => ({ ...r, settings: safeJson(r.settings, {}) }) as Channel);
}

export async function createChannel(name: string, description = ""): Promise<Channel> {
  const id = uid("ch_");
  await db.execute("INSERT INTO channels(id,name,description,created_at) VALUES(?,?,?,?)", [id, name, description, now()]);
  if (!getSettings().activeChannelId) await saveSettings({ activeChannelId: id });
  emit("channels");
  return (await listChannels()).find((c) => c.id === id)!;
}

export async function activeChannel(): Promise<Channel | null> {
  const list = await listChannels();
  const id = getSettings().activeChannelId;
  return list.find((c) => c.id === id) ?? list[0] ?? null;
}

// ---------- Temas ----------
export interface Topic {
  id: string; channel_id: string; title: string; angle: string; notes: string;
  potential: { interest?: number; competition?: number; sources?: number };
  risk: { legal?: number; policy?: number; verification?: number };
  score: number; status: "candidate" | "approved" | "used" | "rejected"; origin: "user" | "ai";
  position: number; sources: string[]; created_at: number; used_video_id: string | null;
}

const rowToTopic = (r: any): Topic => ({ ...r, potential: safeJson(r.potential, {}), risk: safeJson(r.risk, {}), sources: safeJson(r.sources, []) });

export async function listTopics(channelId: string, status?: Topic["status"]): Promise<Topic[]> {
  const rows = status
    ? await db.query("SELECT * FROM topics WHERE channel_id=? AND status=? ORDER BY position, created_at", [channelId, status])
    : await db.query("SELECT * FROM topics WHERE channel_id=? ORDER BY CASE status WHEN 'approved' THEN 0 WHEN 'candidate' THEN 1 WHEN 'used' THEN 2 ELSE 3 END, position, score DESC, created_at", [channelId]);
  return rows.map(rowToTopic);
}

export function topicScore(t: Pick<Topic, "potential" | "risk">): number {
  const p = t.potential, r = t.risk;
  const pos = ((p.interest ?? 3) + (6 - (p.competition ?? 3)) + (p.sources ?? 3)) / 3;
  const neg = ((r.legal ?? 2) + (r.policy ?? 2) + (r.verification ?? 2)) / 3;
  return Math.round((pos * 2 - neg) * 10) / 10;
}

export async function addTopic(t: Partial<Topic> & { channel_id: string; title: string }): Promise<string> {
  const id = uid("tp_");
  const potential = t.potential ?? {}; const risk = t.risk ?? {};
  await db.execute(
    "INSERT INTO topics(id,channel_id,title,angle,notes,potential,risk,score,status,origin,position,sources,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, t.channel_id, t.title, t.angle ?? "", t.notes ?? "", JSON.stringify(potential), JSON.stringify(risk),
      topicScore({ potential, risk }), t.status ?? "candidate", t.origin ?? "user", t.position ?? now(), JSON.stringify(t.sources ?? []), now()]);
  emit("topics");
  return id;
}

export async function updateTopic(id: string, patch: Partial<Topic>) {
  const r = await db.query("SELECT * FROM topics WHERE id=?", [id]);
  if (!r[0]) return;
  const t = { ...rowToTopic(r[0]), ...patch };
  await db.execute("UPDATE topics SET title=?,angle=?,notes=?,potential=?,risk=?,score=?,status=?,position=?,sources=?,used_video_id=? WHERE id=?",
    [t.title, t.angle, t.notes, JSON.stringify(t.potential), JSON.stringify(t.risk), topicScore(t), t.status, t.position, JSON.stringify(t.sources), t.used_video_id, id]);
  emit("topics");
}

export async function deleteTopic(id: string) { await db.execute("DELETE FROM topics WHERE id=?", [id]); emit("topics"); }

// ---------- Videos y etapas ----------
export const STAGES = [
  { id: "research", label: "Investigación", short: "Investigar" },
  { id: "script", label: "Guion", short: "Guion" },
  { id: "verify", label: "Revisión de datos", short: "Datos" },
  { id: "voice", label: "Voz", short: "Voz" },
  { id: "storyboard", label: "Storyboard", short: "Storyboard" },
  { id: "assets", label: "Medios", short: "Medios" },
  { id: "polish", label: "Retoques", short: "Retoques" },
  { id: "motion", label: "Animaciones", short: "Motion" },
  { id: "render", label: "Montaje", short: "Montaje" },
  { id: "package", label: "Metadatos", short: "Metadatos" },
  { id: "final", label: "Revisión final", short: "Revisión", gate: true },
  { id: "publish", label: "Publicación", short: "Publicar" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];
export type StageStatus = "pending" | "running" | "done" | "failed" | "review" | "approved" | "skipped";

export interface Video {
  id: string; channel_id: string; topic_id: string | null; title: string; mode: "standard" | "premium";
  voice_mode: "ai" | "own"; status: "active" | "approved" | "scheduled" | "published" | "rejected" | "archived";
  stage: StageId | null; dir: string; created_at: number; updated_at: number; scheduled_at: number | null;
  published_at: number | null; youtube_id: string | null; upload_session: string | null; data: Record<string, any>;
}
export interface StageRow { video_id: string; stage: StageId; status: StageStatus; attempt: number; output: any; error: string | null; started_at: number | null; finished_at: number | null; progress: string | null }

const rowToVideo = (r: any): Video => ({ ...r, data: safeJson(r.data, {}) });

export async function listVideos(channelId?: string, limit = 200): Promise<Video[]> {
  const rows = channelId
    ? await db.query("SELECT * FROM videos WHERE channel_id=? ORDER BY created_at DESC LIMIT ?", [channelId, limit])
    : await db.query("SELECT * FROM videos ORDER BY created_at DESC LIMIT ?", [limit]);
  return rows.map(rowToVideo);
}

export async function getVideo(id: string): Promise<Video | null> {
  const r = await db.query("SELECT * FROM videos WHERE id=?", [id]);
  return r[0] ? rowToVideo(r[0]) : null;
}

export async function createVideo(channelId: string, topic: Topic | null, opts: { title?: string }): Promise<Video> {
  const id = uid("v_");
  const paths = await appPaths();
  const title = opts.title ?? topic?.title ?? "Video sin título";
  const date = new Date().toISOString().slice(0, 10);
  const dir = joinPath(paths.data, "channels", channelId, "videos", `${date}-${slugify(title, 40)}-${id.slice(-4)}`);
  await fs.mkdir(dir);
  const t = now();
  const stmts = [
    { sql: "INSERT INTO videos(id,channel_id,topic_id,title,mode,voice_mode,status,stage,dir,created_at,updated_at,data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      params: [id, channelId, topic?.id ?? null, title, "standard", "ai", "active", "research", dir, t, t,
        JSON.stringify({ topic: topic ? { title: topic.title, angle: topic.angle, notes: topic.notes, sources: topic.sources } : { title } })] },
    ...STAGES.map((s) => ({ sql: "INSERT INTO stages(video_id,stage,status) VALUES(?,?,?)", params: [id, s.id, "pending"] })),
  ];
  if (topic) stmts.push({ sql: "UPDATE topics SET status='used', used_video_id=? WHERE id=?", params: [id, topic.id] });
  await db.batch(stmts);
  emit("videos", "topics");
  return (await getVideo(id))!;
}

export async function updateVideo(id: string, patch: Partial<Omit<Video, "data">> & { data?: Record<string, any> }) {
  const v = await getVideo(id);
  if (!v) return;
  const next = { ...v, ...patch, data: patch.data ? { ...v.data, ...patch.data } : v.data };
  await db.execute(
    "UPDATE videos SET title=?,mode=?,voice_mode=?,status=?,stage=?,scheduled_at=?,published_at=?,youtube_id=?,upload_session=?,data=?,updated_at=? WHERE id=?",
    [next.title, next.mode, next.voice_mode, next.status, next.stage, next.scheduled_at, next.published_at, next.youtube_id, next.upload_session, JSON.stringify(next.data), now(), id]);
  emit("videos");
}

export async function getStages(videoId: string): Promise<StageRow[]> {
  let rows = await db.query("SELECT * FROM stages WHERE video_id=?", [videoId]);
  const order = STAGES.map((s) => s.id as string);
  const missing = order.filter((id) => !rows.some((r) => r.stage === id));
  if (missing.length) {
    // Videos creados con la v1: las etapas nuevas se añaden. Si el video ya
    // estaba montado, se marcan como omitidas para no rehacer nada sin pedirlo.
    const rendered = rows.some((r) => r.stage === "render" && ["done", "approved"].includes(r.status));
    await db.batch(missing.map((id) => ({ sql: "INSERT OR IGNORE INTO stages(video_id,stage,status) VALUES(?,?,?)", params: [videoId, id, rendered ? "skipped" : "pending"] })));
    rows = await db.query("SELECT * FROM stages WHERE video_id=?", [videoId]);
  }
  return rows.filter((r) => order.includes(r.stage)).map((r) => ({ ...r, output: safeJson(r.output, null) }) as StageRow).sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
}

export async function getStage(videoId: string, stage: StageId): Promise<StageRow | null> {
  const r = await db.query("SELECT * FROM stages WHERE video_id=? AND stage=?", [videoId, stage]);
  return r[0] ? ({ ...r[0], output: safeJson(r[0].output, null) } as StageRow) : null;
}

export async function setStage(videoId: string, stage: StageId, patch: Partial<Pick<StageRow, "status" | "output" | "error" | "progress">> & { startedNow?: boolean; finishedNow?: boolean; bumpAttempt?: boolean }) {
  const sets: string[] = []; const params: unknown[] = [];
  if (patch.status !== undefined) { sets.push("status=?"); params.push(patch.status); }
  if (patch.output !== undefined) { sets.push("output=?"); params.push(patch.output === null ? null : JSON.stringify(patch.output)); }
  if (patch.error !== undefined) { sets.push("error=?"); params.push(patch.error); }
  if (patch.progress !== undefined) { sets.push("progress=?"); params.push(patch.progress); }
  if (patch.startedNow) { sets.push("started_at=?"); params.push(now()); }
  if (patch.finishedNow) { sets.push("finished_at=?"); params.push(now()); }
  if (patch.bumpAttempt) sets.push("attempt=attempt+1");
  if (!sets.length) return;
  params.push(videoId, stage);
  await db.execute(`UPDATE stages SET ${sets.join(",")} WHERE video_id=? AND stage=?`, params);
  emit("stages");
}

/** Marca una etapa y todas las posteriores como pendientes (para rehacer). */
export async function resetFrom(videoId: string, stage: StageId, keepOutput = true) {
  const idx = STAGES.findIndex((s) => s.id === stage);
  const ids = STAGES.slice(idx).map((s) => s.id);
  await db.batch(ids.map((s) => ({
    sql: keepOutput ? "UPDATE stages SET status='pending', error=NULL, progress=NULL WHERE video_id=? AND stage=?"
      : "UPDATE stages SET status='pending', error=NULL, progress=NULL, output=NULL WHERE video_id=? AND stage=?",
    params: [videoId, s],
  })));
  await updateVideo(videoId, { stage, status: "active" });
  emit("stages");
}

export async function saveArtifact(videoId: string, kind: string, json: unknown, note = "") {
  const r = await db.query<{ v: number }>("SELECT COALESCE(MAX(version),0) AS v FROM artifacts WHERE video_id=? AND kind=?", [videoId, kind]);
  const version = (r[0]?.v ?? 0) + 1;
  await db.execute("INSERT INTO artifacts(video_id,kind,version,json,note,created_at) VALUES(?,?,?,?,?,?)", [videoId, kind, version, JSON.stringify(json), note, now()]);
  return version;
}

// ---------- Revisiones (tiempo invertido) ----------
export async function addReview(videoId: string, stage: string, decision: string, notes: string, seconds: number) {
  await db.execute("INSERT INTO reviews(video_id,stage,decision,notes,seconds,created_at) VALUES(?,?,?,?,?,?)", [videoId, stage, decision, notes, Math.round(seconds), now()]);
  emit("videos");
}

// ---------- Música ----------
export interface Track { id: string; title: string; artist: string; path: string; license: string; attribution: string; duration_s: number; mood: string; enabled: number }
export async function listMusic(): Promise<Track[]> { return db.query<Track>("SELECT * FROM music ORDER BY title"); }
export async function addTrack(t: Omit<Track, "id" | "enabled">) {
  await db.execute("INSERT INTO music(id,title,artist,path,license,attribution,duration_s,mood,enabled,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)",
    [uid("mu_"), t.title, t.artist, t.path, t.license, t.attribution, t.duration_s, t.mood, now()]);
  emit("music");
}
export async function updateTrack(id: string, patch: Partial<Track>) {
  const r = await db.query<Track>("SELECT * FROM music WHERE id=?", [id]); if (!r[0]) return;
  const t = { ...r[0], ...patch };
  await db.execute("UPDATE music SET title=?,artist=?,license=?,attribution=?,mood=?,enabled=? WHERE id=?", [t.title, t.artist, t.license, t.attribution, t.mood, t.enabled, id]);
  emit("music");
}
export async function deleteTrack(id: string) { await db.execute("DELETE FROM music WHERE id=?", [id]); emit("music"); }
