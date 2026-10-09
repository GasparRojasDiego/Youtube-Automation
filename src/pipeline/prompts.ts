// Instrucciones y esquemas de salida de cada tarea de lenguaje. Son reglas del
// motor (formato, exactitud básica); la identidad del canal llega por las
// habilidades del usuario, que se inyectan en cada prompt.

type S = Record<string, any>;
export const str = (description?: string): S => ({ type: "string", ...(description ? { description } : {}) });
export const num = (description?: string): S => ({ type: "number", ...(description ? { description } : {}) });
export const bool = (description?: string): S => ({ type: "boolean", ...(description ? { description } : {}) });
export const arr = (items: S, description?: string): S => ({ type: "array", items, ...(description ? { description } : {}) });
export const en = (values: string[], description?: string): S => ({ type: "string", enum: values, ...(description ? { description } : {}) });
export const obj = (properties: S, required: string[] = Object.keys(properties)): S => ({ type: "object", properties, required, additionalProperties: false });

export const SYSTEM_BASE = `You are the production engine of ATRIL, a studio that produces engaging, high-quality English-language YouTube videos for a US audience.
Rules:
- Do not invent facts, sources, URLs, quotes, dates or numbers. Widely known general knowledge is fine; specific figures must come from real sources.
- Fields whose name ends in "_es" must be written in short, simple Spanish.
- The channel's identity, voice and style are defined by the <skill> blocks the operator provides. Follow them closely.
- The narrator never claims credentials and never impersonates a real person.
- Answer only through the required structured output.`;

export const wrapSkills = (skills: string) => skills
  ? `\n\n<channel_skills priority="highest">\nThe operator wrote these rules for this channel. They are MANDATORY. Follow every rule literally and give them priority over any default style, length, tone or format suggested elsewhere in this prompt (only the output schema and the rule against inventing facts take precedence). Before answering, check your output against each rule one by one and fix anything that does not comply.\n\n${skills}\n</channel_skills>`
  : "\n\n(No channel skills are active for this stage: use an engaging, clear, well-paced YouTube storytelling register.)";

/** Campo de autocomprobación: obliga a repasar cada regla de las habilidades. */
export const SKILLS_CHECK = arr(str("«Regla» → cómo la cumpliste (en español, breve)"), "One line per channel-skill rule that applies to this output; empty if no skills");

// ---------- Banco de temas ----------
export const TOPICS_SCHEMA = obj({
  topics: arr(obj({
    title: str("Working title in English"),
    angle_es: str("El ángulo concreto y por qué es poco conocido"),
    why_now_es: str(),
    interest: num("1-5 expected interest of a US audience"),
    competition: num("1-5 how saturated this exact angle already is on YouTube (5 = very saturated)"),
    sources: num("1-5 availability of solid primary sources"),
    legal_risk: num("1-5 defamation/legal exposure"),
    policy_risk: num("1-5 risk under YouTube monetization policies (inauthentic, shocking, sensitive events)"),
    verification_risk: num("1-5 difficulty of verifying the core claims"),
    key_sources: arr(str("URL actually found")),
    notes_es: str(),
  })),
});

export function topicsPrompt(o: { skills: string; existing: string[]; count: number; hint: string }) {
  return `Propose ${o.count} new video topics for this channel.${wrapSkills(o.skills)}

Use web search to check (a) whether solid, verifiable sources exist and (b) how saturated each exact angle already is on YouTube.
Prefer documented, little-known facts over insinuation. Avoid topics whose core claim depends on rumor.
${o.hint ? `Operator hint: ${o.hint}\n` : ""}
Do not repeat or closely paraphrase these existing topics:
${o.existing.map((t) => `- ${t}`).join("\n") || "(none)"}`;
}

// ---------- Investigación ----------
export const RESEARCH_SCHEMA = obj({
  summary_es: str("Resumen del tema en 4-6 frases"),
  angle_en: str("The specific documented angle the video should take"),
  sources: arr(obj({
    id: str("S1, S2, ..."), url: str(), title: str(), publisher: str(), date: str("Publication date or 'n.d.'"),
    type: en(["primary", "secondary", "tertiary"]), reliability: en(["high", "medium", "low"]), why_es: str(),
  })),
  facts: arr(obj({
    id: str("F1, F2, ..."), text_en: str("The fact, stated precisely and neutrally"),
    source_ids: arr(str()), quote: str("Short supporting excerpt from the source (may be empty)"),
    quote_location: str("Section, page or paragraph where the quote appears"),
    confidence: en(["high", "medium", "low"]), about_real_person: bool(), note_es: str(),
  })),
  open_questions_es: arr(str()),
  risks: arr(obj({ kind: en(["legal", "policy", "verification"]), note_es: str() })),
});

export function researchPrompt(o: { skills: string; topic: string; angle: string; notes: string; seedSources: string[] }) {
  return `Research this topic for an engaging 10-15 minute YouTube video. The operator's request may be a topic, an idea or full instructions: follow it.

TOPIC: ${o.topic}
${o.angle ? `ANGLE: ${o.angle}\n` : ""}${o.notes ? `OPERATOR NOTES: ${o.notes}\n` : ""}${o.seedSources.length ? `SUGGESTED STARTING SOURCES:\n${o.seedSources.map((s) => `- ${s}`).join("\n")}\n` : ""}${wrapSkills(o.skills)}

Method (be efficient: good material, not an academic investigation):
1. Search the web and open the pages you rely on. Reputable sources are enough: established media, official sites, encyclopedias, specialist sites.
2. Collect 5-12 sources and 20-45 facts, prioritising surprising details, stories, numbers and examples that make a video compelling.
3. Add a short supporting excerpt (quote) when you have it; it can be brief.
4. Flag facts about real, identifiable people (about_real_person = true) and keep them precise.
5. Note real legal/policy risks briefly, if any.`;
}

// ---------- Guion ----------
export const SCRIPT_SCHEMA = obj({
  title_options: arr(obj({ title: str("Max 70 characters, intriguing but fully supported by the script"), promise_es: str("Qué promete el título y dónde lo cumple el guion") })),
  segments: arr(obj({
    id: str("seg1, seg2, ..."), title: str("Chapter title, max 50 characters"), purpose_es: str(),
    text_en: str("Exactly what the narrator says in this segment"),
    claims: arr(obj({
      id: str("C1, C2, ... unique across the script"), text_en: str("EXACT substring of text_en containing one factual statement"),
      fact_ids: arr(str()), source_ids: arr(str()), kind: en(["fact", "inference", "opinion"]),
    })),
    on_screen_sources: arr(str("Source ids to show on screen in this segment")),
  })),
  originality_note_es: str("Qué análisis propio aporta el video más allá de resumir las fuentes"),
  skills_check_es: SKILLS_CHECK,
});

const SCRIPT_RULES = (minW: number, maxW: number) => `Requirements:
- Total narration between ${minW} and ${maxW} words, split into 6-10 segments. The first two sentences of segment 1 are a strong hook.
- Mark the key factual statements as claims (text_en = exact substring of the segment text) linked to research facts and sources. Specific numbers, dates and names must come from the research; general knowledge and storytelling need no claim.
- Interpretations are welcome when phrased as such.
- Statements about real people must be fair and never imply wrongdoing beyond what sources show.
- Entertain and explain: tension, curiosity gaps, concrete examples, payoffs, a satisfying ending. Add perspective, not a paraphrase of sources.
- Write for the ear: varied sentence length, no lists, no stage directions, no URLs read aloud, numbers written as they are spoken.
- Titles must be intriguing and delivered by the video.`;

export function scriptPrompt(o: { skills: string; topic: string; research: unknown; minWords: number; maxWords: number; premium: boolean }) {
  return `Write the narration script for this video.${wrapSkills(o.skills)}

TOPIC: ${o.topic}
MODE: ${o.premium ? "premium (weekly flagship: richer analysis, more careful rhythm)" : "standard daily video"}

${SCRIPT_RULES(o.minWords, o.maxWords)}

RESEARCH (your factual base):
${JSON.stringify(o.research)}`;
}

export function revisePrompt(o: { skills: string; research: unknown; script: unknown; issues: unknown; notes: string; minWords: number; maxWords: number }) {
  return `Revise this script. Fix every issue listed, keep everything else that works, and return the complete revised script.${wrapSkills(o.skills)}

${SCRIPT_RULES(o.minWords, o.maxWords)}

ISSUES FROM VERIFICATION AND THE OPERATOR:
${JSON.stringify(o.issues)}
${o.notes ? `\nOPERATOR NOTES: ${o.notes}\n` : ""}
CURRENT SCRIPT:
${JSON.stringify(o.script)}

RESEARCH:
${JSON.stringify(o.research)}`;
}

// ---------- Verificación ----------
export const VERIFY_SCHEMA = obj({
  overall_es: str("Diagnóstico general en 2-4 frases"),
  title_checks: arr(obj({ title: str(), verdict: en(["ok", "overpromise"]), note_es: str() })),
  originality: obj({ verdict: en(["ok", "weak"]), note_es: str() }),
  claims: arr(obj({
    claim_id: str(), verdict: en(["supported", "partially", "unsupported", "mismatch"]), severity: en(["ok", "warn", "block"]),
    issues: arr(en(["unsourced", "source_mismatch", "defamation_risk", "inference_as_fact", "overpromise", "outdated", "other"])),
    note_es: str("Explicación breve en español"), suggested_fix_en: str("Rewritten sentence if needed, else empty"),
    gloss_es: str("Traducción fiel al español de la afirmación"), quote_gloss_es: str("Traducción al español de la cita de la fuente"),
  })),
  unlinked: arr(obj({ segment_id: str(), text_en: str("Factual sentence in the narration that is not marked as a claim"), issue_es: str(), severity: en(["ok", "warn", "block"]) })),
  segment_glosses: arr(obj({ segment_id: str(), summary_es: str("Resumen fiel del segmento en español sencillo") })),
});

export function verifyPrompt(o: { skills: string; research: unknown; script: unknown }) {
  return `You are a quick, practical fact-checker for an entertainment/education YouTube video (not an academic paper). Flag only what would embarrass the channel or create risk.${wrapSkills(o.skills)}

For each claim, compare it with the linked facts:
- "block" ONLY for statements that are clearly false, invented specific numbers/dates/names, or defamatory about a real person or organization;
- "warn" for imprecision or overstatement;
- "ok" otherwise (general knowledge and reasonable storytelling are ok).
Flagged sentences will be rewritten automatically, so give a concrete suggested_fix_en for every "block".
Also list up to 5 unlinked sentences only if they look clearly false, and check that titles do not promise something the video never delivers.

RESEARCH:
${JSON.stringify(o.research)}

SCRIPT:
${JSON.stringify(o.script)}`;
}

// ---------- Miniatura y metadatos ----------
export const PACKAGE_SCHEMA = obj({
  titles: arr(obj({ title: str("Max 70 characters; intriguing, honest, supported by the video"), note_es: str() })),
  description_body_en: str("2-3 short paragraphs for the YouTube description; no chapters, no source list, no hashtags spam"),
  tags: arr(str()),
  thumbnails: arr(obj({
    concept_es: str(), text: str("Thumbnail text, max 4 words, may be empty"), highlight: str("One word of the text to highlight, or empty"),
    image_prompt_en: str("Background image prompt following the thumbnail skill; no real people photorealistic, no logos (only used if no listed image fits)"),
    background_asset_id: str("Id of the listed video image to use as background, or empty"),
    layout: en(["left", "right", "center"], "Where the text goes"),
  })),
  synthetic_media: bool("true if the video contains realistic AI-generated scenes that viewers could mistake for real footage"),
  synthetic_reason_es: str(),
  skills_check_es: SKILLS_CHECK,
});

export function packagePrompt(o: { skills: string; script: unknown; verify: unknown; params: unknown; count: number; photorealistic: boolean; images?: { id: string; description: string }[] }) {
  return `Create the YouTube packaging for this video: 3 title options, description body, 10-20 tags and ${o.count} thumbnail concepts.${wrapSkills(o.skills)}

THUMBNAIL PARAMETERS: ${JSON.stringify(o.params)}
The visuals of this video are ${o.photorealistic ? "photorealistic AI images" : "stylized / non-photorealistic illustrations, archival images and text cards"}.
Rules: titles and thumbnails must not promise anything the video does not demonstrate (YouTube treats that as manipulative). Thumbnails must not look like generic AI art; follow the thumbnail skill.

${o.images?.length ? `IMAGES USED IN THE VIDEO (choose a strong, uncluttered one per thumbnail with background_asset_id):\n${o.images.map((x) => `- ${x.id}: ${x.description}`).join("\n")}\n\n` : ""}SCRIPT: ${JSON.stringify(o.script)}

VERIFICATION SUMMARY: ${JSON.stringify(o.verify)}`;
}

// ---------- Refinar una habilidad (ciclo propone → corrige → incorpora) ----------
export const REFINE_SCHEMA = obj({
  summary_es: str("Qué cambiaste y por qué, en 2-4 frases"),
  new_content: str("Complete new Markdown content of the skill"),
});

export function refinePrompt(o: { name: string; content: string; request: string; context: string }) {
  return `Revise the channel skill below according to the operator's corrections. Keep its structure, its fenced \`atril:*\` parameter blocks (valid JSON) and everything the operator did not ask to change. Add positive and negative examples where they help. Write the rules in the same language the skill already uses.

OPERATOR CORRECTIONS (Spanish):
${o.request}
${o.context ? `\nREFERENCE STRENGTHS:\n${o.context}\n` : ""}
<skill name="${o.name}">
${o.content}
</skill>`;
}
