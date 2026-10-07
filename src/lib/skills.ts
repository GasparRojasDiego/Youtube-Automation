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

/** Puntos fuertes de los referentes activos (texto compacto). */
export async function referentStrengths(channelId: string | null): Promise<string> {
  const rows = await db.query<{ name: string; notes: string }>(
    "SELECT name, notes FROM creators WHERE (channel_id IS ? OR channel_id IS NULL) AND COALESCE(enabled,1)=1 AND TRIM(COALESCE(notes,''))<>'' ORDER BY name", [channelId]);
  return rows.map((r) => `## ${r.name}\n${r.notes.trim()}`).join("\n\n");
}

/** Etapas que reciben el recordatorio de referentes (una vez por llamada). */
const REFERENT_SCOPES: Scope[] = ["topics", "script", "visuals", "edit", "thumbnail"];

/** Texto de las habilidades activas para una etapa, listo para inyectar en un prompt. */
export async function composeSkills(channelId: string | null, scope: Scope): Promise<string> {
  const skills = (await listSkills(channelId)).filter((s) => s.enabled && matchesScope(s, scope));
  const parts = skills.map((s) => `<skill name="${s.name}">\n${stripParamBlocks(s.content)}\n</skill>`);
  if (REFERENT_SCOPES.includes(scope)) {
    const refs = await referentStrengths(channelId);
    if (refs) parts.push(`<reference_strengths note="Strong points of reference channels: replicate the techniques, never their voice or content.">\n${refs}\n</reference_strengths>`);
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

- Gancho: …
- Estructura: …
- Tono y ritmo: …
- Qué evitar: …

<!-- Parámetro opcional (quita el comentario para activarlo):
\`\`\`atril:guion
{ "wordsPerMinute": 150 }
\`\`\`
-->
`,
  visual: `# Estilo visual

- Imágenes: …
- Animaciones: …
- Montaje y sonido: …
- Miniatura: …

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
