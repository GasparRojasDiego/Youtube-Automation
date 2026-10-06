// Instrucciones y esquemas de salida de cada tarea de lenguaje. Son reglas del
// motor (rigor, formato, verificación); la identidad del canal llega por las
// habilidades del usuario, que se inyectan en cada prompt.

type S = Record<string, any>;
export const str = (description?: string): S => ({ type: "string", ...(description ? { description } : {}) });
export const num = (description?: string): S => ({ type: "number", ...(description ? { description } : {}) });
export const bool = (description?: string): S => ({ type: "boolean", ...(description ? { description } : {}) });
export const arr = (items: S, description?: string): S => ({ type: "array", items, ...(description ? { description } : {}) });
export const en = (values: string[], description?: string): S => ({ type: "string", enum: values, ...(description ? { description } : {}) });
export const obj = (properties: S, required: string[] = Object.keys(properties)): S => ({ type: "object", properties, required, additionalProperties: false });

export const SYSTEM_BASE = `You are the production engine of ATRIL, a studio that produces English-language YouTube videos for a US audience.
Absolute rules:
- Never invent facts, sources, URLs, quotes, dates or numbers. If something is uncertain, say so in the designated fields.
- Fields whose name ends in "_es" must be written in clear, simple Spanish (the operator is a B1-level English learner).
- The channel's identity, voice and style are defined by the <skill> blocks the operator provides. Follow them closely; when they conflict with these absolute rules, these rules win.
- The narrator never claims credentials, never impersonates a real person, and never presents an inference as an established fact.
- Answer only through the required structured output.`;

export const wrapSkills = (skills: string) => skills ? `\n\n<channel_skills>\n${skills}\n</channel_skills>` : "\n\n(No channel skills are active for this stage: use a neutral, rigorous documentary register.)";

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
    source_ids: arr(str()), quote: str("Verbatim excerpt copied from the fetched source that supports the fact (max ~60 words)"),
    quote_location: str("Section, page or paragraph where the quote appears"),
    confidence: en(["high", "medium", "low"]), about_real_person: bool(), note_es: str(),
  })),
  open_questions_es: arr(str()),
  risks: arr(obj({ kind: en(["legal", "policy", "verification"]), note_es: str() })),
});

export function researchPrompt(o: { skills: string; topic: string; angle: string; notes: string; seedSources: string[] }) {
  return `Research this topic for a 10-15 minute documentary video.

TOPIC: ${o.topic}
${o.angle ? `ANGLE: ${o.angle}\n` : ""}${o.notes ? `OPERATOR NOTES: ${o.notes}\n` : ""}${o.seedSources.length ? `SUGGESTED STARTING SOURCES:\n${o.seedSources.map((s) => `- ${s}`).join("\n")}\n` : ""}${wrapSkills(o.skills)}

Method:
1. Search the web broadly, then OPEN (fetch) every source you intend to cite. Never cite a page you did not open.
2. Prioritize primary sources: official reports, institutional documents, court records, government data, academic papers, and recognized investigative journalism. Use encyclopedias only to find primary sources.
3. Collect 8-20 sources and 25-60 atomic facts. Each fact must carry a verbatim quote copied exactly from the fetched page; if you cannot quote it, drop the fact.
4. Flag every fact about a real, identifiable person (about_real_person = true) and be extra precise with them.
5. Record contradictions between sources, missing evidence and legal/policy risks honestly.`;
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
});

const SCRIPT_RULES = (minW: number, maxW: number) => `Hard requirements:
- Total narration between ${minW} and ${maxW} words, split into 6-10 segments. The first two sentences of segment 1 are the hook.
- Every factual statement in the narration must appear as a claim whose text_en is an exact substring of the segment text, linked to the fact ids and source ids from the research. Do not state facts that are not in the research.
- Inferences and interpretations are allowed only as kind "inference" or "opinion" and must be phrased as such ("this suggests", "one reading is").
- Statements about real people must be precise, attributed, and never imply wrongdoing beyond what sources document.
- The video must deliver original analysis (connections, context, meaning), not a paraphrase of the sources.
- Write for the ear: varied sentence length, no lists, no stage directions, no URLs read aloud, numbers written as they are spoken.
- Titles must not promise more than the script demonstrates.`;

export function scriptPrompt(o: { skills: string; topic: string; research: unknown; minWords: number; maxWords: number; premium: boolean }) {
  return `Write the narration script for this video.${wrapSkills(o.skills)}

TOPIC: ${o.topic}
MODE: ${o.premium ? "premium (weekly flagship: richer analysis, more careful rhythm)" : "standard daily video"}

${SCRIPT_RULES(o.minWords, o.maxWords)}

RESEARCH (the only factual material you may use):
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
  vocab: arr(obj({ term: str("Useful English word or expression used in the script"), meaning_es: str(), example_en: str("The sentence from the script where it appears"), note_es: str("Matiz de uso, registro o falso amigo") })),
});

export function verifyPrompt(o: { skills: string; research: unknown; script: unknown }) {
  return `You are the independent fact-checker. Assume the script contains errors: language models invent sources and distort what sources say.${wrapSkills(o.skills)}

For EVERY claim: compare its text with the quotes of the linked facts. Mark:
- unsupported / unsourced: no linked fact actually supports it;
- mismatch / source_mismatch: the source says something different, narrower, older, or less certain;
- defamation_risk: a statement about a real, identifiable person or organization that implies wrongdoing beyond what the sources document;
- inference_as_fact: an interpretation stated as fact;
- overpromise: wording that promises more than the evidence shows.
Severity: "block" for anything legally risky, false or unsupported; "warn" for imprecision; "ok" otherwise.
You may fetch a cited URL to confirm a quote when the stored quote looks doubtful.
Also scan the narration for factual sentences that are NOT marked as claims (unlinked), check every title option against the script, and judge whether the video adds original analysis or merely paraphrases sources.
Finally, pick 5-8 vocabulary items from the script that are genuinely useful for a B1 English learner (not trivial words).

RESEARCH:
${JSON.stringify(o.research)}

SCRIPT:
${JSON.stringify(o.script)}`;
}

// ---------- Plan visual ----------
export const PLAN_SCHEMA = obj({
  shots: arr(obj({
    segment_id: str(), sentence_from: num("First sentence index covered (inclusive)"), sentence_to: num("Last sentence index covered (inclusive)"),
    kind: en(["generated", "archival", "source_card", "title_card", "quote_card", "text_card"]),
    prompt_en: str("For generated: detailed image prompt following the visual skill; empty otherwise"),
    archival_query: str("For archival: concrete Wikimedia Commons search query (place, building, document, historical photo); empty otherwise"),
    source_id: str("For source_card: the source id; empty otherwise"),
    card_text: str("For title/quote/text cards: the text to display (short); empty otherwise"),
    overlay_text: str("Optional short lower-third text (max 8 words); empty if none"),
    motion: en(["zoom_in", "zoom_out", "pan_left", "pan_right", "static"]),
  })),
});

export function planPrompt(o: { skills: string; visual: unknown; segments: { id: string; title: string; sentences: string[]; on_screen_sources: string[] }[]; sources: unknown; maxGenerated: number; shotSeconds: [number, number]; wps: number }) {
  return `Plan the visuals of this video shot by shot.${wrapSkills(o.skills)}

VISUAL PARAMETERS: ${JSON.stringify(o.visual)}

Rules:
- Cover every sentence of every segment, in order, with no gaps or overlaps. Each shot covers one or more consecutive sentences.
- Target shot length ${o.shotSeconds[0]}-${o.shotSeconds[1]} seconds (narration speed ≈ ${o.wps.toFixed(1)} words per second). Long sentences may get their own shot.
- At most ${o.maxGenerated} shots of kind "generated" in the whole video. Use them where they matter most.
- When the narration cites a document or source listed in on_screen_sources, use a "source_card" with that source id at that moment.
- Use "archival" for real places, buildings, historical photos, maps or documents that likely exist on Wikimedia Commons; give a concrete query.
- Use title/quote/text cards for chapter openings, key numbers and short quotations.
- Generated images must never depict identifiable real people photorealistically, must not show logos, brands, trademarks or copyrighted characters, and must follow the visual skill for coherence.
- Vary motion; avoid the same motion twice in a row.
- On-screen text (cards and lower thirds) must be at least as cautious as the narration: never state as fact something the narration presents as an inference or opinion, and never add claims that are not in the narration.

SOURCES: ${JSON.stringify(o.sources)}

SEGMENTS (sentence indices start at 0 inside each segment):
${o.segments.map((s) => `## ${s.id} — ${s.title}${s.on_screen_sources.length ? ` (on-screen sources: ${s.on_screen_sources.join(", ")})` : ""}\n${s.sentences.map((t, i) => `[${i}] ${t}`).join("\n")}`).join("\n\n")}`;
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
});

export function packagePrompt(o: { skills: string; script: unknown; verify: unknown; params: unknown; count: number; photorealistic: boolean; images?: { id: string; description: string }[] }) {
  return `Create the YouTube packaging for this video: 3 title options, description body, 10-20 tags and ${o.count} thumbnail concepts.${wrapSkills(o.skills)}

THUMBNAIL PARAMETERS: ${JSON.stringify(o.params)}
The visuals of this video are ${o.photorealistic ? "photorealistic AI images" : "stylized / non-photorealistic illustrations, archival images and text cards"}.
Rules: titles and thumbnails must not promise anything the video does not demonstrate (YouTube treats that as manipulative). Thumbnails must not look like generic AI art; follow the thumbnail skill.

${o.images?.length ? `IMAGES USED IN THE VIDEO (choose a strong, uncluttered one per thumbnail with background_asset_id):\n${o.images.map((x) => `- ${x.id}: ${x.description}`).join("\n")}\n\n` : ""}SCRIPT: ${JSON.stringify(o.script)}

VERIFICATION SUMMARY: ${JSON.stringify(o.verify)}`;
}

// ---------- Métricas ----------
export const PROPOSALS_SCHEMA = obj({
  summary_es: str("Qué funcionó y qué no, en español sencillo"),
  findings_es: arr(str()),
  proposals: arr(obj({
    skill_name: str("Exact name of an existing skill, or a new name"),
    title_es: str(), rationale_es: str("Con qué datos se justifica"),
    new_content: str("Complete new Markdown content of the skill with the change applied"),
  })),
});

export function proposalsPrompt(o: { skills: string; metrics: unknown; allSkills: { name: string; content: string }[] }) {
  return `Analyze the performance of this channel's videos and propose concrete, minimal changes to its skills (hooks, titles, thumbnails, rhythm, duration, topics).${wrapSkills(o.skills)}

Base every proposal on the data. Retention (audienceWatchRatio) and CTR come from the channel's own analytics. Be explicit about uncertainty when there are few videos.
Keep each skill's existing structure; change only what the evidence supports.

METRICS: ${JSON.stringify(o.metrics)}

CURRENT SKILLS:
${o.allSkills.map((s) => `<skill name="${s.name}">\n${s.content}\n</skill>`).join("\n\n")}`;
}

// ---------- Referentes (fase cero) ----------
export const NOTEBOOK_RUBRIC = `Analiza TODOS los videos de este cuaderno y escribe un único documento Markdown titulado "Perfil de <canal>" con exactamente estas secciones. Usa ejemplos textuales (citas breves) de los videos para cada afirmación.

1. Promesa del canal: qué ofrece y a quién.
2. Títulos: estructura, longitud, palabras gatillo, tipo de promesa, relación título-contenido. 5 ejemplos.
3. Ganchos (primeros 30 segundos): tipos de apertura, recursos, duración. 5 ejemplos transcritos.
4. Estructura narrativa: esqueleto típico del video, cómo pasa de la intriga al hecho y del hecho al significado.
5. Ritmo y frases: longitud media de frase, alternancia, frecuencia de giros, uso de preguntas, pausas.
6. Vocabulario y registro: palabras y expresiones recurrentes, tono, ironía, humor.
7. Uso de fuentes: cómo las introduce, cuántas, qué tipo, cómo las muestra.
8. Cierres: cómo terminan los videos, llamadas a la acción.
9. Rasgos DISTINTIVOS (lo que solo este canal hace) frente a rasgos COMUNES del género.
10. Debilidades o vicios a evitar.
11. Principios transferibles (reglas aplicables a otro canal sin copiar su voz).`;

export const CREATOR_SCHEMA = obj({
  profile_md: str("Perfil legible en español (Markdown) con las mismas secciones de la rúbrica, condensado"),
  distinctive_es: arr(str("Rasgo distintivo de este canal")),
  principles_es: arr(str("Principio transferible")),
  title_patterns_es: arr(str()),
  hook_patterns_es: arr(str()),
  structure_es: str(),
  avoid_es: arr(str()),
});

export function creatorPrompt(o: { skills: string; name: string; notebook: string; videos: { title: string; views: number; publishedAt: string; durationS: number }[] }) {
  return `Analyze this reference creator for the knowledge base of a new channel. Separate what is DISTINCTIVE of this creator (their personal voice, not to be copied) from TRANSFERABLE principles.${wrapSkills(o.skills)}

CREATOR: ${o.name}

NOTEBOOK ANALYSIS (made by the operator with NotebookLM from the creator's videos):
${o.notebook || "(not provided)"}

PUBLIC METADATA (title, views, date, duration). Views correlate only partially with quality; retention and CTR are not public.
${o.videos.slice(0, 120).map((v) => `- ${v.title} | ${v.views} views | ${v.publishedAt.slice(0, 10)} | ${Math.round(v.durationS / 60)} min`).join("\n") || "(not fetched)"}`;
}

export const DISTILL_SCHEMA = obj({
  overview_es: str("Qué aprendimos del conjunto, en español"),
  skills: arr(obj({
    name: str(), description: str(), scopes: arr(en(["all", "topics", "research", "script", "verify", "voice", "visuals", "thumbnail", "metadata", "montage", "metrics", "analysis"])),
    content: str("Markdown content of the skill draft, with positive and negative examples"),
  })),
});

export function distillPrompt(o: { goal: string; profiles: { name: string; weight: number; profile: unknown }[] }) {
  return `Distill these reference-creator profiles into DRAFT skills for a new channel. Do not average styles into something generic: keep the strongest transferable principles, note which creator each comes from, and leave the distinctive voice choices as explicit options for the operator to decide.
Each skill must contain rules plus positive and negative examples.

OPERATOR GOAL: ${o.goal || "(not specified)"}

PROFILES (weight = importance set by the operator):
${o.profiles.map((p) => `### ${p.name} (weight ${p.weight})\n${JSON.stringify(p.profile)}`).join("\n\n")}`;
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
${o.context ? `\nREFERENCE MATERIAL:\n${o.context}\n` : ""}
<skill name="${o.name}">
${o.content}
</skill>`;
}
