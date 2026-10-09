// Banco de temas y refinado de habilidades.
import { composeSkills } from "../lib/skills";
import { addTopic, listTopics } from "../lib/repo";
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

// ---------- Refinar habilidad con IA ----------
export async function refineSkill(name: string, content: string, request: string, channelId: string | null): Promise<{ summary_es: string; new_content: string }> {
  const context = "";
  const r = await claudeRun<{ summary_es: string; new_content: string }>({
    stage: "analysis", label: `Refinar «${name}»`, system: P.SYSTEM_BASE, schema: P.REFINE_SCHEMA,
    prompt: P.refinePrompt({ name, content, request, context }), channelId,
  });
  return r.data;
}
