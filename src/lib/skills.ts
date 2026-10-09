// Habilidades: documentos Markdown que el usuario escribe. Dos tipos:
// «Instrucciones» (cómo debe salir el guion) y «Visuales» (imágenes, montaje,
// animaciones). Los referentes añaden sus puntos fuertes como recordatorio.
// Los parámetros se escriben en bloques ```atril:<nombre> {json}```.
import { db } from "./ipc";
import { emit } from "./bus";
import { now, uid, safeJson } from "./util";

export const SCOPES = [
  { id: "all", label: "Todas las etapas" },
  { id: "topics", label: "Banco de temas" },
  { id: "research", label: "Investigación" },
  { id: "script", label: "Guion" },
  { id: "verify", label: "Verificación" },
  { id: "voice", label: "Voz" },
  { id: "visuals", label: "Imágenes y plan visual" },
  { id: "thumbnail", label: "Miniatura" },
  { id: "metadata", label: "Título, descripción y etiquetas" },
  { id: "montage", label: "Montaje" },
  { id: "edit", label: "Retoques de edición (Opus)" },
  { id: "motion", label: "Animaciones y motion graphics" },
  { id: "metrics", label: "Análisis de métricas" },
  { id: "analysis", label: "Análisis de referentes" },
] as const;
export type Scope = (typeof SCOPES)[number]["id"];

export type SkillKind = "script" | "visual";
/** Etapas en las que se inyecta cada tipo de habilidad. */
export const KIND_SCOPES: Record<SkillKind, Scope[]> = {
  script: ["topics", "research", "script", "metadata"],
  visual: ["visuals", "thumbnail", "montage", "motion", "edit"],
};
export function skillKindOf(scopes: string[]): SkillKind {
  const visual = new Set<string>(KIND_SCOPES.visual);
  const textual = scopes.filter((x) => !visual.has(x));
  return scopes.length > 0 && textual.length === 0 ? "visual" : "script";
}

export interface Skill {
  id: string; channel_id: string | null; name: string; description: string; scopes: Scope[];
  content: string; enabled: boolean; version: number; created_at: number; updated_at: number;
}

const rowToSkill = (r: any): Skill => ({
  ...r, scopes: safeJson<Scope[]>(r.scopes, ["all"]), enabled: !!r.enabled,
});

export async function listSkills(channelId?: string | null): Promise<Skill[]> {
  const rows = channelId === undefined
    ? await db.query("SELECT * FROM skills ORDER BY name")
    : await db.query("SELECT * FROM skills WHERE channel_id IS NULL OR channel_id=? ORDER BY name", [channelId]);
  return rows.map(rowToSkill);
}

export async function getSkill(id: string): Promise<Skill | null> {
  const r = await db.query("SELECT * FROM skills WHERE id=?", [id]);
  return r[0] ? rowToSkill(r[0]) : null;
}

export async function saveSkill(s: Partial<Skill> & { name: string }, note = ""): Promise<Skill> {
  const t = now();
  if (s.id) {
    const prev = await getSkill(s.id);
    if (prev) {
      const changed = prev.content !== (s.content ?? prev.content);
      const version = changed ? prev.version + 1 : prev.version;
      const stmts: { sql: string; params: unknown[] }[] = [];
      if (changed) stmts.push({ sql: "INSERT INTO skill_versions(skill_id,version,content,note,created_at) VALUES(?,?,?,?,?)", params: [prev.id, prev.version, prev.content, note, t] });
      stmts.push({
        sql: "UPDATE skills SET channel_id=?,name=?,description=?,scopes=?,content=?,enabled=?,version=?,updated_at=? WHERE id=?",
        params: [s.channel_id === undefined ? prev.channel_id : s.channel_id, s.name, s.description ?? prev.description,
          JSON.stringify(s.scopes ?? prev.scopes), s.content ?? prev.content, (s.enabled ?? prev.enabled) ? 1 : 0, version, t, prev.id],
      });
      await db.batch(stmts);
      emit("skills");
      return (await getSkill(prev.id))!;
    }
  }
  const id = s.id ?? uid("sk_");
  await db.execute(
    "INSERT INTO skills(id,channel_id,name,description,scopes,content,enabled,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    [id, s.channel_id ?? null, s.name, s.description ?? "", JSON.stringify(s.scopes ?? ["all"]), s.content ?? "", s.enabled === false ? 0 : 1, 1, t, t]);
  emit("skills");
  return (await getSkill(id))!;
}

export async function setSkillEnabled(id: string, enabled: boolean) {
  await db.execute("UPDATE skills SET enabled=?, updated_at=? WHERE id=?", [enabled ? 1 : 0, now(), id]);
  emit("skills");
}

export async function deleteSkill(id: string) {
  await db.batch([{ sql: "DELETE FROM skills WHERE id=?", params: [id] }, { sql: "DELETE FROM skill_versions WHERE skill_id=?", params: [id] }]);
  emit("skills");
}

export async function skillVersions(id: string) {
  return db.query<{ id: number; version: number; content: string; note: string; created_at: number }>(
    "SELECT * FROM skill_versions WHERE skill_id=? ORDER BY version DESC", [id]);
}

// ---------- Formato ----------

export interface ParsedSkillFile { name?: string; description?: string; scopes?: Scope[]; body: string }

/** Lee un SKILL.md con frontmatter YAML sencillo (name, description, scopes). */
export function parseSkillFile(md: string): ParsedSkillFile {
  const m = md.match(/^﻿?---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { body: md };
  const out: ParsedSkillFile = { body: m[2] };
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, k, raw] = kv;
    const v = raw.trim().replace(/^["']|["']$/g, "");
    if (k === "name") out.name = v;
    else if (k === "description") out.description = v;
    else if (k === "scopes") {
      const list = v.replace(/^\[|\]$/g, "").split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      const valid = new Set(SCOPES.map((s) => s.id as string));
      out.scopes = list.filter((x) => valid.has(x)) as Scope[];
    }
  }
  return out;
}

export function serializeSkillFile(s: Skill): string {
  const esc = (t: string) => t.replace(/\n/g, " ").replace(/"/g, "'");
  return `---\nname: "${esc(s.name)}"\ndescription: "${esc(s.description)}"\nscopes: [${s.scopes.join(", ")}]\n---\n${s.content}`;
}

const PARAM_RE = /```atril:([a-z_]+)\s*\n([\s\S]*?)```/g;

const stripComments = (t: string) => t.replace(/<!--[\s\S]*?-->/g, "");

/** Los bloques dentro de comentarios HTML (<!-- -->) quedan desactivados. */
export function parseParamBlocks(content: string): { params: Record<string, any>; errors: string[] } {
  const params: Record<string, any> = {}; const errors: string[] = [];
  for (const m of stripComments(content).matchAll(PARAM_RE)) {
    try { params[m[1]] = { ...(params[m[1]] ?? {}), ...JSON.parse(m[2]) }; }
    catch (e) { errors.push(`Bloque atril:${m[1]} con JSON inválido: ${(e as Error).message}`); }
  }
  return { params, errors };
}

export const stripParamBlocks = (content: string) => stripComments(content).replace(PARAM_RE, "").trim();

const matchesScope = (s: Skill, scope: Scope) => s.scopes.includes("all") || s.scopes.includes(scope);

// ---------- Secciones dirigidas a una etapa ----------
// Un título que termina en etiquetas entre corchetes («## Efectos [animaciones]»)
// manda esa sección (hasta el siguiente título de su nivel o superior) solo a
// esas etapas, aunque la habilidad sea Textual o Visual. Sin etiquetas, la
// sección hereda las etapas de su título padre o de la habilidad.

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
/** Etiqueta (sin tildes, minúsculas) → etapas. */
export const STAGE_TAGS: Record<string, Scope[]> = {
  todas: ["all"], todo: ["all"], all: ["all"],
  temas: ["topics"], topics: ["topics"],
  investigacion: ["research"], research: ["research"],
  guion: ["script"], script: ["script"],
  verificacion: ["verify"], verify: ["verify"],
  paquete: ["metadata", "thumbnail"], metadatos: ["metadata"], metadata: ["metadata"], titulos: ["metadata"], titulo: ["metadata"], descripcion: ["metadata"],
  miniatura: ["thumbnail"], thumbnail: ["thumbnail"],
  plan: ["visuals"], storyboard: ["visuals"], imagenes: ["visuals"], imagen: ["visuals"], visuals: ["visuals"],
  montaje: ["montage"], sonido: ["montage"], musica: ["montage"], montage: ["montage"],
  retoques: ["edit"], edicion: ["edit"], edit: ["edit"],
  animaciones: ["motion"], animacion: ["motion"], motion: ["motion"],
};
/** Nombres que se muestran en la interfaz, en el orden del pipeline. */
export const STAGE_LABELS: { scope: Scope; label: string }[] = [
  { scope: "topics", label: "Temas" }, { scope: "research", label: "Investigación" }, { scope: "script", label: "Guion" },
  { scope: "metadata", label: "Paquete" }, { scope: "visuals", label: "Plan visual" }, { scope: "edit", label: "Retoques" },
  { scope: "motion", label: "Animaciones" }, { scope: "thumbnail", label: "Miniatura" },
];

/** Etapas de un título con etiquetas al final, o null si no las tiene (o ninguna es conocida). */
export function headingTags(title: string): { title: string; scopes: Scope[] } | null {
  const m = title.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  if (!m) return null;
  const scopes = new Set<Scope>();
  for (const raw of m[2].split(",")) for (const sc of STAGE_TAGS[norm(raw)] ?? []) scopes.add(sc);
  return scopes.size ? { title: m[1], scopes: [...scopes] } : null;
}

/** Deja solo las secciones que corresponden a alguna de las etapas pedidas. */
export function sectionsFor(content: string, skillScopes: Scope[], requested: Scope[]): string {
  const hits = (scopes: Scope[]) => scopes.includes("all") || requested.includes("all") || scopes.some((s) => requested.includes(s));
  const stack: { level: number; scopes: Scope[] }[] = [];
  const out: string[] = [];
  let fence = false;
  for (const line of content.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence ? line.match(/^(#{1,6})\s+(.*)$/) : null;
    let text = line;
    if (h) {
      const level = h[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const tags = headingTags(h[2]);
      const inherited = stack.length ? stack[stack.length - 1].scopes : skillScopes;
      stack.push({ level, scopes: tags ? tags.scopes : inherited });
      if (tags) text = `${h[1]} ${tags.title}`;
    }
    const scopes = stack.length ? stack[stack.length - 1].scopes : skillScopes;
    if (hits(scopes)) out.push(text);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Caracteres que recibe cada etapa de una habilidad (para la interfaz). */
export function stageSizes(content: string, skillScopes: Scope[]): { scope: Scope; label: string; chars: number }[] {
  const body = stripParamBlocks(content);
  return STAGE_LABELS.map((s) => ({ ...s, chars: sectionsFor(body, skillScopes, [s.scope]).length }));
}

/** Texto de las habilidades activas para una etapa, listo para inyectar en un prompt. */
export async function composeSkills(channelId: string | null, scope: Scope | Scope[]): Promise<string> {
  const scopes = Array.isArray(scope) ? scope : [scope];
  // Una habilidad que aplica a varias etapas de la misma llamada se incluye una sola vez;
  // sus secciones con etiquetas pueden llegar a etapas fuera de su tipo.
  const parts: string[] = [];
  for (const s of (await listSkills(channelId)).filter((x) => x.enabled)) {
    const body = sectionsFor(stripParamBlocks(s.content), s.scopes, scopes);
    if (body) parts.push(`<skill name="${s.name}">\n${body}\n</skill>`);
  }
  return parts.join("\n\n");
}

/** Parámetros estructurados combinados (habilidades activas) sobre los valores por defecto del motor. */
export async function skillParams<T extends object>(channelId: string | null, block: string, defaults: T): Promise<T> {
  const skills = (await listSkills(channelId)).filter((s) => s.enabled);
  let out: any = { ...defaults };
  for (const s of skills) {
    const p = parseParamBlocks(s.content).params[block];
    if (p) out = { ...out, ...p };
  }
  return out as T;
}

export async function activeSkillNames(channelId: string | null, scope: Scope): Promise<string[]> {
  return (await listSkills(channelId)).filter((s) => s.enabled && matchesScope(s, scope)).map((s) => s.name);
}

// ---------- Valores por defecto del motor (neutros; la identidad va en habilidades) ----------

export const MONTAGE_DEFAULTS = {
  shotSeconds: [3.5, 7] as [number, number],
  transition: "fade" as "fade" | "cut" | "dissolve" | "fadeblack" | "smoothleft",
  transitionSeconds: 0.5,
  segmentTransition: "fadeblack" as "cut" | "fadeblack",
  pauseBetweenSegments: 0.6,
  kenBurns: 0.08,
  musicVolumeDb: -22,
  musicDuck: true,
  lowerThirds: true,
  sourceCardSeconds: 6,
  humor: false,          // permite memes y momentos cómicos
  grain: 3,              // grano de película (0 = sin grano)
  vignette: true,
};
export type MontageParams = typeof MONTAGE_DEFAULTS;

export const VISUAL_DEFAULTS = {
  background: "#111113",
  foreground: "#F2EFE9",
  muted: "#9A958C",
  accent: "#C9A227",
  fontTitle: "Oswald",
  fontBody: "Source Serif 4",
  fontMono: "JetBrains Mono",
  photorealistic: false,
  imageStyle: "",
};
export type VisualParams = typeof VISUAL_DEFAULTS;

export const THUMBNAIL_DEFAULTS = {
  font: "Anton",
  weight: 400,
  textColor: "#FFFFFF",
  strokeColor: "#000000",
  highlightColor: "#FFD400",
  maxWords: 4,
  textScale: 1,
};
export type ThumbnailParams = typeof THUMBNAIL_DEFAULTS;

export const SCRIPT_DEFAULTS = { wordsPerMinute: 150 };

export const SKILL_TEMPLATES: Record<SkillKind, string> = {
  script: `# Cómo debe salir el guion

## Gancho y estructura [guion]
- Gancho: …
- Estructura: …

## Tono y ritmo [guion]
- …

## Títulos y descripción [paquete]
- …

## Qué evitar
- …

<!-- Parámetro opcional (quita el comentario para activarlo):
\`\`\`atril:guion
{ "wordsPerMinute": 150 }
\`\`\`
-->
`,
  visual: `# Estilo visual

## Imágenes [plan]
- …

## Animaciones [animaciones]
- La imagen cuenta la historia; el texto solo la rotula.
- …

## Montaje y sonido [montaje]
- …

## Miniatura [miniatura]
- …

<!-- Parámetros opcionales (quita el comentario para activarlos):
\`\`\`atril:visual
{ "background": "#111113", "foreground": "#F2EFE9", "accent": "#C9A227", "fontTitle": "Oswald", "fontBody": "Source Serif 4" }
\`\`\`
\`\`\`atril:montaje
{ "shotSeconds": [3.5, 7], "kenBurns": 0.08, "musicVolumeDb": -22, "humor": false }
\`\`\`
\`\`\`atril:subtitulos
{ "enabled": true, "font": "Poppins ExtraBold", "highlight": "#FFD400" }
\`\`\`
\`\`\`atril:miniatura
{ "font": "Anton", "highlightColor": "#FFD400", "maxWords": 4 }
\`\`\`
-->
`,
};
