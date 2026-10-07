// Banco de temas, referentes (puntos fuertes a replicar) y refinado de habilidades.
import { db } from "../lib/ipc";
import { emit } from "../lib/bus";
import { composeSkills, referentStrengths } from "../lib/skills";
import { addTopic, listTopics } from "../lib/repo";
import { now, uid } from "../lib/util";
import { claudeRun } from "../providers/claude";
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
/** Un canal de referencia: sus puntos fuertes se recuerdan al escribir y editar. */
export interface Referent { id: string; channel_id: string | null; name: string; url: string; notes: string; notebook_md: string; enabled: number; created_at: number }

export async function listReferents(channelId: string | null): Promise<Referent[]> {
  return db.query<Referent>("SELECT id,channel_id,name,url,notes,notebook_md,COALESCE(enabled,1) enabled,created_at FROM creators WHERE channel_id IS ? OR channel_id IS NULL ORDER BY name", [channelId]);
}

export async function addReferent(channelId: string | null, name: string, url = ""): Promise<string> {
  const id = uid("cr_");
  await db.execute("INSERT INTO creators(id,channel_id,name,url,weight,notes,enabled,created_at) VALUES(?,?,?,?,1,'',1,?)", [id, channelId, name, url, now()]);
  emit("creators");
  return id;
}

export async function updateReferent(id: string, patch: Partial<Pick<Referent, "name" | "url" | "notes" | "notebook_md" | "enabled">>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  await db.execute(`UPDATE creators SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`, [...keys.map((k) => patch[k]), id]);
  emit("creators");
}

export async function deleteReferent(id: string) {
  await db.execute("DELETE FROM creators WHERE id=?", [id]);
  emit("creators");
}

/** Claude resume unas notas (p. ej. de NotebookLM) en puntos fuertes replicables. */
export async function summarizeReferent(r: Referent): Promise<string> {
  const out = await claudeRun<{ strengths_es: string[] }>({
    stage: "analysis", label: `Puntos fuertes de ${r.name}`, system: P.SYSTEM_BASE, schema: P.REFERENT_SCHEMA,
    prompt: P.referentPrompt({ name: r.name, notes: r.notebook_md }), channelId: r.channel_id,
  });
  const text = (out.data.strengths_es ?? []).map((x) => `- ${x}`).join("\n");
  await updateReferent(r.id, { notes: text });
  return text;
}

// ---------- Refinar habilidad con IA ----------
export async function refineSkill(name: string, content: string, request: string, channelId: string | null, withReferents: boolean): Promise<{ summary_es: string; new_content: string }> {
  const context = withReferents ? await referentStrengths(channelId) : "";
  const r = await claudeRun<{ summary_es: string; new_content: string }>({
    stage: "analysis", label: `Refinar «${name}»`, system: P.SYSTEM_BASE, schema: P.REFINE_SCHEMA,
    prompt: P.refinePrompt({ name, content, request, context }), channelId,
  });
  return r.data;
}
