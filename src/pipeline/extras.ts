// Banco de temas, referentes (fase cero) y ciclo de mejora con métricas.
import { db } from "../lib/ipc";
import { emit } from "../lib/bus";
import { composeSkills, listSkills, saveSkill } from "../lib/skills";
import { addTopic, listTopics, listVideos } from "../lib/repo";
import { log } from "../lib/events";
import { now, uid, safeJson } from "../lib/util";
import { claudeRun } from "../providers/claude";
import { resolveChannel, channelVideos, analyticsByVideo, retentionCurve, reachRows } from "../providers/youtube";
import * as P from "./prompts";

// ---------- Temas ----------
export async function suggestTopics(channelId: string, count: number, hint: string): Promise<number> {
  const existing = (await listTopics(channelId)).map((t) => t.title);
  const r = await claudeRun<{ topics: any[] }>({
    stage: "topics", label: "Sugerir temas", system: P.SYSTEM_BASE, schema: P.TOPICS_SCHEMA, tools: ["WebSearch", "WebFetch"],
    prompt: P.topicsPrompt({ skills: await composeSkills(channelId, "topics"), existing, count, hint }), channelId,
  });
  for (const t of r.data.topics ?? []) {
    await addTopic({
      channel_id: channelId, title: t.title, angle: t.angle_es, notes: [t.why_now_es, t.notes_es].filter(Boolean).join("\n\n"), origin: "ai",
      potential: { interest: t.interest, competition: t.competition, sources: t.sources },
      risk: { legal: t.legal_risk, policy: t.policy_risk, verification: t.verification_risk }, sources: t.key_sources ?? [],
    });
  }
  return r.data.topics?.length ?? 0;
}

// ---------- Referentes ----------
export interface Creator {
  id: string; channel_id: string | null; name: string; url: string; yt_channel_id: string | null; weight: number;
  notes: string; notebook_md: string; profile_md: string; profile_json: any; analyzed_at: number | null; created_at: number;
}
export const rowToCreator = (r: any): Creator => ({ ...r, profile_json: safeJson(r.profile_json, null) });

export async function listCreators(channelId: string | null): Promise<Creator[]> {
  const rows = await db.query("SELECT * FROM creators WHERE channel_id IS ? OR channel_id IS NULL ORDER BY weight DESC, name", [channelId]);
  return rows.map(rowToCreator);
}

export async function addCreators(channelId: string | null, lines: string[]) {
  for (const raw of lines.map((l) => l.trim()).filter(Boolean)) {
    const [url, w] = raw.split(/\s*[|;]\s*/);
    const name = url.replace(/^https?:\/\/(www\.)?youtube\.com\//, "").replace(/^@/, "").replace(/\/.*$/, "") || url;
    await db.execute("INSERT INTO creators(id,channel_id,name,url,weight,created_at) VALUES(?,?,?,?,?,?)", [uid("cr_"), channelId, name, url, Number(w) || 1, now()]);
  }
  emit("creators");
}

export async function updateCreator(id: string, patch: Partial<Creator>) {
  const r = await db.query("SELECT * FROM creators WHERE id=?", [id]); if (!r[0]) return;
  const c = { ...rowToCreator(r[0]), ...patch };
  await db.execute("UPDATE creators SET name=?,url=?,yt_channel_id=?,weight=?,notes=?,notebook_md=?,profile_md=?,profile_json=?,analyzed_at=? WHERE id=?",
    [c.name, c.url, c.yt_channel_id, c.weight, c.notes, c.notebook_md, c.profile_md, c.profile_json ? JSON.stringify(c.profile_json) : null, c.analyzed_at, id]);
  emit("creators");
}

export async function deleteCreator(id: string) {
  await db.batch([{ sql: "DELETE FROM creators WHERE id=?", params: [id] }, { sql: "DELETE FROM creator_videos WHERE creator_id=?", params: [id] }]);
  emit("creators");
}

const DAY = 86_400_000;

/** Políticas de la API de YouTube: los datos públicos de canales ajenos se borran o refrescan a los 30 días. */
export async function purgeStaleCreatorData() {
  const r = await db.execute("DELETE FROM creator_videos WHERE fetched_at < ?", [now() - 30 * DAY]);
  if (r.changes) await log("info", "referentes", `Se borraron ${r.changes} registros públicos de YouTube con más de 30 días (políticas de la API).`, "", null, false);
}

export async function fetchCreatorVideos(c: Creator, max = 100): Promise<number> {
  const ch = await resolveChannel(c.yt_channel_id || c.url);
  if (!ch) throw new Error(`No se encontró el canal «${c.url}».`);
  const vids = await channelVideos(ch.uploads, max);
  const t = now();
  await db.batch([
    { sql: "DELETE FROM creator_videos WHERE creator_id=?", params: [c.id] },
    ...vids.map((v) => ({ sql: "INSERT OR REPLACE INTO creator_videos(id,creator_id,title,published_at,duration_s,views,likes,comments,thumb_url,fetched_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      params: [v.id, c.id, v.title, v.publishedAt, v.durationS, v.views, v.likes, v.comments, v.thumb, t] })),
    { sql: "UPDATE creators SET yt_channel_id=?, name=? WHERE id=?", params: [ch.id, ch.title, c.id] },
  ]);
  emit("creators");
  return vids.length;
}

export async function creatorVideos(creatorId: string) {
  return db.query<{ id: string; title: string; published_at: string; duration_s: number; views: number; likes: number; comments: number; thumb_url: string; fetched_at: number }>(
    "SELECT * FROM creator_videos WHERE creator_id=? ORDER BY views DESC", [creatorId]);
}

export async function analyzeCreator(c: Creator): Promise<void> {
  const vids = await creatorVideos(c.id);
  const r = await claudeRun<any>({
    stage: "analysis", label: `Análisis de ${c.name}`, system: P.SYSTEM_BASE, schema: P.CREATOR_SCHEMA,
    prompt: P.creatorPrompt({ skills: await composeSkills(c.channel_id, "analysis"), name: c.name, notebook: c.notebook_md,
      videos: vids.map((v) => ({ title: v.title, views: v.views, publishedAt: v.published_at, durationS: v.duration_s })) }),
    channelId: c.channel_id,
  });
  await updateCreator(c.id, { profile_md: r.data.profile_md, profile_json: r.data, analyzed_at: now() });
}

export async function distillCreators(channelId: string | null, goal: string): Promise<{ overview_es: string; created: number }> {
  const creators = (await listCreators(channelId)).filter((c) => c.profile_json);
  if (!creators.length) throw new Error("Analiza al menos un referente antes de destilar.");
  const r = await claudeRun<{ overview_es: string; skills: { name: string; description: string; scopes: any[]; content: string }[] }>({
    stage: "analysis", label: "Destilar referentes", system: P.SYSTEM_BASE, schema: P.DISTILL_SCHEMA, timeoutMin: 60,
    prompt: P.distillPrompt({ goal, profiles: creators.map((c) => ({ name: c.name, weight: c.weight, profile: { ...c.profile_json, profile_md: undefined } })) }),
    channelId,
  });
  for (const s of r.data.skills ?? []) {
    await saveSkill({ channel_id: channelId, name: `${s.name} (borrador)`, description: s.description, scopes: s.scopes?.length ? s.scopes : ["all"], content: s.content, enabled: false }, "borrador destilado");
  }
  return { overview_es: r.data.overview_es, created: r.data.skills?.length ?? 0 };
}

// ---------- Métricas y propuestas ----------
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function syncMetrics(channelId: string): Promise<{ videos: number; reach: number }> {
  const vids = (await listVideos(channelId, 300)).filter((v) => v.youtube_id);
  if (!vids.length) return { videos: 0, reach: 0 };
  const start = ymd(new Date(Math.min(...vids.map((v) => v.created_at)) - DAY));
  const end = ymd(new Date());
  const ids = vids.map((v) => v.youtube_id!) ;
  const byVideo: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 40) Object.assign(byVideo, await analyticsByVideo(ids.slice(i, i + 40), start, end));
  const stmts: { sql: string; params: unknown[] }[] = [];
  for (const v of vids) {
    const m = byVideo[v.youtube_id!]; if (!m) continue;
    stmts.push({ sql: "INSERT OR REPLACE INTO metrics(video_id,day,views,minutes,avg_view_s,avg_pct,impressions,ctr,subs) VALUES(?,?,?,?,?,?,COALESCE((SELECT impressions FROM metrics WHERE video_id=? AND day='total'),NULL),COALESCE((SELECT ctr FROM metrics WHERE video_id=? AND day='total'),NULL),?)",
      params: [v.id, "total", m.views, m.estimatedMinutesWatched, m.averageViewDuration, m.averageViewPercentage, v.id, v.id, m.subscribersGained] });
  }
  if (stmts.length) await db.batch(stmts);
  for (const v of vids.slice(0, 30)) {
    try {
      const curve = await retentionCurve(v.youtube_id!, start, end);
      if (curve.length) await db.execute("INSERT OR REPLACE INTO retention(video_id,curve,fetched_at) VALUES(?,?,?)", [v.id, JSON.stringify(curve), now()]);
    } catch { /* videos muy nuevos aún no tienen curva */ }
  }
  let reach = 0;
  try {
    const rows = await reachRows();
    const agg: Record<string, { imp: number; clicks: number }> = {};
    for (const r of rows) { const a = (agg[r.video] ??= { imp: 0, clicks: 0 }); a.imp += r.impressions; a.clicks += r.impressions * r.ctr; }
    for (const v of vids) {
      const a = agg[v.youtube_id!]; if (!a) continue; reach++;
      await db.execute("UPDATE metrics SET impressions=?, ctr=? WHERE video_id=? AND day='total'", [a.imp, a.imp ? a.clicks / a.imp : 0, v.id]);
    }
  } catch (e) {
    await log("info", "métricas", "Los informes de impresiones y CTR aún no están disponibles (tardan ~48 h tras activarse).", String(e), null, false);
  }
  emit("metrics");
  return { videos: stmts.length, reach };
}

export async function metricsTable(channelId: string) {
  return db.query<any>(`SELECT v.id, v.title, v.mode, v.voice_mode, v.created_at, v.youtube_id, m.views, m.minutes, m.avg_view_s, m.avg_pct, m.impressions, m.ctr, m.subs, r.curve
    FROM videos v LEFT JOIN metrics m ON m.video_id=v.id AND m.day='total' LEFT JOIN retention r ON r.video_id=v.id
    WHERE v.channel_id=? AND v.youtube_id IS NOT NULL ORDER BY v.created_at DESC`, [channelId]);
}

export async function proposeImprovements(channelId: string): Promise<{ summary: string; count: number }> {
  const rows = await metricsTable(channelId);
  if (rows.length < 3) throw new Error("Hacen falta al menos 3 videos publicados con métricas para proponer cambios con algo de base.");
  const metrics = rows.map((r) => {
    const curve = safeJson<{ t: number; watch: number }[]>(r.curve, []);
    const at = (x: number) => curve.find((c) => c.t >= x)?.watch ?? null;
    return { title: r.title, mode: r.mode, views: r.views, avg_view_s: r.avg_view_s, avg_pct: r.avg_pct, impressions: r.impressions, ctr: r.ctr,
      retention_at_10pct: at(0.1), retention_at_50pct: at(0.5), retention_at_90pct: at(0.9) };
  });
  const skills = (await listSkills(channelId)).filter((s) => s.enabled);
  const r = await claudeRun<{ summary_es: string; findings_es: string[]; proposals: { skill_name: string; title_es: string; rationale_es: string; new_content: string }[] }>({
    stage: "analysis", label: "Propuestas de mejora", system: P.SYSTEM_BASE, schema: P.PROPOSALS_SCHEMA,
    prompt: P.proposalsPrompt({ skills: await composeSkills(channelId, "metrics"), metrics, allSkills: skills.map((s) => ({ name: s.name, content: s.content })) }), channelId,
  });
  for (const p of r.data.proposals ?? []) {
    const sk = skills.find((s) => s.name === p.skill_name);
    await db.execute("INSERT INTO proposals(id,channel_id,skill_id,skill_name,title,rationale,evidence,new_content,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [uid("pr_"), channelId, sk?.id ?? null, p.skill_name, p.title_es, p.rationale_es, JSON.stringify(r.data.findings_es ?? []), p.new_content, "pending", now()]);
  }
  emit("metrics");
  return { summary: r.data.summary_es, count: r.data.proposals?.length ?? 0 };
}

export async function listProposals(channelId: string) {
  return db.query<any>("SELECT * FROM proposals WHERE channel_id=? ORDER BY created_at DESC", [channelId]);
}

export async function resolveProposal(id: string, accept: boolean) {
  const r = await db.query<any>("SELECT * FROM proposals WHERE id=?", [id]); const p = r[0]; if (!p) return;
  if (accept) {
    if (p.skill_id) {
      const sk = (await listSkills()).find((s) => s.id === p.skill_id);
      if (sk) await saveSkill({ ...sk, content: p.new_content }, `propuesta aceptada: ${p.title}`);
    } else {
      await saveSkill({ channel_id: p.channel_id, name: p.skill_name, description: p.title, scopes: ["all"], content: p.new_content, enabled: false }, "propuesta aceptada");
    }
  }
  await db.execute("UPDATE proposals SET status=? WHERE id=?", [accept ? "accepted" : "rejected", id]);
  emit("metrics", "skills");
}

// ---------- Refinar habilidad con IA ----------
export async function refineSkill(name: string, content: string, request: string, channelId: string | null, withProfiles: boolean): Promise<{ summary_es: string; new_content: string }> {
  let context = "";
  if (withProfiles) {
    const creators = (await listCreators(channelId)).filter((c) => c.profile_json);
    context = creators.map((c) => `### ${c.name} (peso ${c.weight})\n${JSON.stringify({ distinctive: c.profile_json.distinctive_es, principles: c.profile_json.principles_es, titles: c.profile_json.title_patterns_es, hooks: c.profile_json.hook_patterns_es, structure: c.profile_json.structure_es, avoid: c.profile_json.avoid_es })}`).join("\n\n");
  }
  const r = await claudeRun<{ summary_es: string; new_content: string }>({
    stage: "analysis", label: `Refinar habilidad «${name}»`, system: P.SYSTEM_BASE, schema: P.REFINE_SCHEMA,
    prompt: P.refinePrompt({ name, content, request, context }), channelId,
  });
  return r.data;
}
