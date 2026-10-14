// Modo Personal: videos a medida (tareas, proyectos, promoción de apps) con
// descripción, duración e idioma propios, archivos del usuario, guion propio
// opcional y la opción de usar solo lo que el usuario subió.
import { fs } from "../lib/ipc";
import { composeSkills, skillParams, VISUAL_DEFAULTS, type Scope, type VisualParams } from "../lib/skills";
import { joinPath, extName, slugify } from "../lib/util";
import { importLocalFile, getAssets, listAssets, type Asset } from "../media/library";
import { SYSTEM_BASE } from "./prompts";
import type { Video } from "../lib/repo";

export type FileKind = "image" | "video" | "audio" | "document";
export interface PersonalFile { path: string; name: string; kind: FileKind; asset_id?: string | null }
export type ToneId = "alegre" | "corporativo" | "profesional" | "dinamico" | "llamativo" | "custom";
export interface PersonalSpec {
  description: string;        // cómo será el video: público, tono, estilo, propósito
  minutes: number;            // duración objetivo
  language: "es" | "en";
  useLibrary: boolean;        // false: solo los archivos subidos (más gráficos y animaciones creados por ATRIL)
  iterate: boolean;           // mejora continua al terminar la primera versión
  files: PersonalFile[];
  script?: { path: string; name: string } | null;
  // Cola de producción (2.5.8): todo opcional, los videos anteriores siguen igual
  title?: string;             // título del video (se respeta tal cual)
  about?: string;             // de qué trata
  audience?: string;          // para quién es
  cta?: string;               // qué debe hacer quien lo vea
  tone?: ToneId;
  toneCustom?: { name: string; description: string } | null;
  aesthetic?: string;         // descripción detallada del apartado estético
  minutesRange?: [number, number];
  palette?: { background?: string; foreground?: string; accent?: string } | null;
  font?: string | null;       // tipografía de títulos (una de las incluidas)
  library?: { mode: "all" | "pick" | "none"; ids: string[] };   // biblioteca personal: toda, solo algunas o ninguna
}

/** Modos (tono) del video personal: cómo se escribe y cómo se ve. */
export const TONES: Record<Exclude<ToneId, "custom">, { label: string; hint: string; script_en: string; visual_en: string }> = {
  alegre: { label: "Alegre", hint: "Cálido, cercano y optimista",
    script_en: "Warm, upbeat and friendly. Short sentences, positive framing, a smile in the voice, light humour only if natural.",
    visual_en: "Bright and warm: generous light, lively accent colour, soft rounded shapes, friendly icons, playful but tasteful motion (gentle overshoot allowed on accents), upbeat acoustic or pop music." },
  corporativo: { label: "Corporativo", hint: "Sobrio, confiable y pulido",
    script_en: "Clear, confident and trustworthy. Benefits and proof first, no slang, no hype, measured rhythm.",
    visual_en: "Clean and polished: restrained palette, lots of negative space, precise grids, subtle motion (fades, slides, gentle pushes), data shown as tidy charts, calm corporate ambient music." },
  profesional: { label: "Profesional", hint: "Experto, claro y preciso",
    script_en: "Authoritative and precise, like an expert explainer. Every claim concrete, definitions where needed, calm pacing.",
    visual_en: "Documentary and precise: neutral palette with one accent, diagrams and labelled visuals, steady camera moves, clean typography, understated music." },
  dinamico: { label: "Dinámico", hint: "Rápido, enérgico y con ritmo",
    script_en: "Energetic and fast: punchy sentences, strong verbs, momentum from start to finish.",
    visual_en: "Fast and kinetic: shots of 1.5–3 s, punch-ins on key words, kinetic typography, whip transitions, frequent motion graphics, driving rhythmic music and synced hits." },
  llamativo: { label: "Llamativo", hint: "Audaz, que atrapa la mirada",
    script_en: "Bold hook in the first two seconds, curiosity gaps, strong contrasts, memorable lines.",
    visual_en: "Bold and eye-catching: high contrast, huge type, saturated accent, impactful transitions (covers, flashes, slams), big numbers, strong sound design." },
};

/** Ejemplo de descripción estética (se inserta en la tarjeta como punto de partida). */
export const AESTHETIC_EXAMPLE = `Estética editorial y minimalista, entre una presentación de producto premium y un documental moderno.
• Fondo: casi negro (#0B0D12) con grano fino de película; nunca blanco puro.
• Color: un solo acento, azul eléctrico (#4C7DFF), solo para cifras y palabras clave; el resto en blanco roto (#F2F2F0) y gris (#8A8F98).
• Tipografía: títulos grandes y condensados (Bebas Neue), 2–4 palabras por pantalla; textos de apoyo en una sans limpia (Inter). Nada de párrafos en pantalla.
• Ritmo: un cambio de plano cada 2–3 s; un «punch-in» (zoom rápido) en cada dato importante; un respiro de 1 s antes del cierre.
• Transiciones: cortes secos casi siempre; un barrido rápido (whip) solo al cambiar de sección.
• Animaciones: íconos de línea fina que se dibujan solos, contadores que suben hasta la cifra, flechas que conectan ideas, una línea de tiempo que avanza con la narración.
• Imágenes: fotos reales con gradación fría y viñeta suave; primeros planos de objetos y manos trabajando. Evitar el stock genérico de gente sonriendo a cámara.
• Subtítulos: grandes, blancos, con la palabra que se dice resaltada en el azul de acento.
• Sonido: música electrónica ambiental con pulsos suaves; «whoosh» sutil en cada transición y un golpe grave al revelar la cifra principal.
• Evitar: degradados arcoíris, brillos de neón, texto que tiembla, emojis, más de un color de acento.`;

export function toneLine(p: PersonalSpec, which: "script_en" | "visual_en"): string {
  if (!p.tone) return "";
  if (p.tone === "custom") return p.toneCustom?.description?.trim() ? `${p.toneCustom.name?.trim() || "Custom"}: ${p.toneCustom.description.trim()}` : "";
  return `${TONES[p.tone].label}: ${TONES[p.tone][which]}`;
}

/** Formatos aceptados (los más comunes; nada exótico). */
export const ACCEPT: Record<FileKind, string[]> = {
  image: ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic"],
  video: ["mp4", "mov", "m4v", "webm", "mkv", "avi"],
  audio: ["mp3", "wav", "m4a", "aac", "ogg", "flac"],
  document: ["pdf", "docx", "pptx", "txt", "md", "rtf", "odt", "csv"],
};
export const SCRIPT_EXT = ["txt", "md", "docx", "pdf", "rtf", "odt"];
export const kindOf = (path: string): FileKind | null => {
  const e = extName(path).toLowerCase();
  return (Object.keys(ACCEPT) as FileKind[]).find((k) => ACCEPT[k].includes(e)) ?? null;
};

export const personalOf = (v: Pick<Video, "data">): PersonalSpec | null => (v.data?.personal as PersonalSpec) ?? null;
const LANG = { es: "Spanish (neutral Latin American)", en: "English" };

/** Instrucciones de sistema: las del canal, o las del video personal (propósito e idioma propios). */
export function systemFor(v: Pick<Video, "data">): string {
  const p = personalOf(v);
  if (!p) return SYSTEM_BASE;
  return `You are the production engine of ATRIL, a studio that produces engaging, high-quality videos. This is a PERSONAL video made to the operator's brief (for example school work, a project presentation or an app promotion), not an episode of the YouTube channel.
Rules:
- Language: write every piece of narration, on-screen text, title, description and caption in ${LANG[p.language]}. Fields whose name ends in "_en" hold content in that language too, EXCEPT stock-media search queries and image prompts, which stay in English. Fields whose name ends in "_es" must be written in short, simple Spanish.
- Follow the operator's brief closely: purpose, audience, tone and style. Length matters: respect the target duration.
- Do not invent facts, sources, URLs, quotes, dates or numbers. Material the operator provides is a trusted source.
- The narrator never claims credentials and never impersonates a real person.
- Answer only through the required structured output.`;
}

const dur = (m: number) => (m < 1 ? `${Math.round(m * 60)} seconds` : `${Math.round(m * 10) / 10} minute(s)`);
export const durationText = (p: PersonalSpec) => (p.minutesRange ? `between ${dur(p.minutesRange[0])} and ${dur(p.minutesRange[1])}` : `about ${dur(p.minutes)}`);

/** Brief del video personal en el lugar de las directrices de contenido del canal (las visuales se mantienen). */
export function personalBrief(p: PersonalSpec): string {
  const lines = [
    `- Target duration: ${durationText(p)}.`,
    `- Language: ${LANG[p.language]}.`,
    p.title?.trim() ? `- Title of the video (use it exactly as the title): ${p.title.trim()}` : "",
    p.about?.trim() ? `- What the video is about: ${p.about.trim()}` : "",
    `- Description of the video (purpose, audience, tone, look): ${p.description.trim() || "(not given: make it clear, engaging and well paced)"}`,
    p.audience?.trim() ? `- Audience: ${p.audience.trim()}` : "",
    p.cta?.trim() ? `- What the viewer should do or remember at the end (call to action): ${p.cta.trim()}` : "",
    toneLine(p, "script_en") ? `- Tone / mode: ${toneLine(p, "script_en")}` : "",
    p.files.length ? `- The operator provided ${p.files.length} file(s); use them as the primary material.` : "",
  ].filter(Boolean);
  return `OPERATOR BRIEF FOR THIS PERSONAL VIDEO (mandatory):\n${lines.join("\n")}`;
}

/** Lo estético del video personal: manda sobre las directrices visuales del canal donde choquen. */
export function personalVisualBrief(p: PersonalSpec): string {
  const lines = [
    toneLine(p, "visual_en") ? `- Mode / look: ${toneLine(p, "visual_en")}` : "",
    p.aesthetic?.trim() ? `- Aesthetic direction written by the operator (follow it closely; it is the art direction of this video):\n${p.aesthetic.trim()}` : "",
    p.palette && (p.palette.background || p.palette.foreground || p.palette.accent) ? `- Colours chosen by the operator: background ${p.palette.background ?? "(free)"}, text ${p.palette.foreground ?? "(free)"}, accent ${p.palette.accent ?? "(free)"}.` : "",
    p.font ? `- Title typeface chosen by the operator: ${p.font}.` : "",
  ].filter(Boolean);
  return lines.length ? `OPERATOR ART DIRECTION FOR THIS PERSONAL VIDEO (mandatory; where it conflicts with the channel's visual rules below, this wins):\n${lines.join("\n")}` : "";
}

/** Parámetros visuales del video: los del canal con los colores y la tipografía que eligió el operador. */
export async function visualFor(v: Pick<Video, "channel_id" | "data">): Promise<VisualParams> {
  const base = await skillParams(v.channel_id, "visual", VISUAL_DEFAULTS);
  const p = personalOf(v);
  if (!p) return base;
  const hex = (x?: string) => (x && /^#[0-9a-f]{6}$/i.test(x) ? x : undefined);
  const pal = p.palette ?? {};
  return { ...base, ...(hex(pal.background) ? { background: hex(pal.background)! } : {}), ...(hex(pal.foreground) ? { foreground: hex(pal.foreground)! } : {}),
    ...(hex(pal.accent) ? { accent: hex(pal.accent)! } : {}), ...(p.font ? { fontTitle: p.font } : {}) };
}

/**
 * Biblioteca personal disponible para el video: toda (por defecto en la cola), solo la elegida o ninguna.
 * Con «toda» y muchos archivos, se quedan los que más se parecen al guion (máx. `limit`).
 */
export async function libraryPool(v: Pick<Video, "data">, text: string, limit = 40): Promise<Asset[]> {
  const p = personalOf(v);
  const mode = p?.library?.mode ?? "none";
  if (!p || mode === "none") return [];
  const uploads = new Set(p.files.map((f) => f.asset_id).filter(Boolean));
  // «Completa»: toda la biblioteca (la personal y la de automatización); a igual parecido, primero lo personal
  const list = (mode === "pick" ? [...(await getAssets(p.library!.ids)).values()] : await listAssets({ scope: "all", limit: 3000 }))
    .filter((a) => (a.kind === "image" || a.kind === "video") && !uploads.has(a.id) && a.usable !== 0);
  if (mode === "pick" || list.length <= limit) return list;
  const words = new Set(text.toLowerCase().match(/\p{L}{4,}/gu) ?? []);
  const score = (a: Asset) => (`${a.title} ${a.tags} ${a.description}`.toLowerCase().match(/\p{L}{4,}/gu) ?? []).reduce((n, w) => n + (words.has(w) ? 1 : 0), 0) + (a.source === "personal" ? 0.5 : 0);
  return list.map((a) => ({ a, s: score(a) })).sort((x, y) => y.s - x.s || y.a.created_at - x.a.created_at).slice(0, limit).map((x) => x.a);
}

/** Fotos y videos del usuario para el video: los subidos y la biblioteca (toda, la elegida o ninguna) según la tarjeta. */
export async function userMedia(v: Pick<Video, "data">, text: string): Promise<{ uploads: Asset[]; library: Asset[] }> {
  const p = personalOf(v);
  if (!p) return { uploads: [], library: [] };
  const uploads = [...(await getAssets(p.files.map((f) => f.asset_id ?? "").filter(Boolean))).values()].filter((a) => a.kind === "image" || a.kind === "video");
  const seen = new Set(uploads.map((a) => a.id));
  return { uploads, library: (await libraryPool(v, text)).filter((a) => !seen.has(a.id)) };
}

const CONTENT_SCOPES = new Set<Scope>(["research", "script", "verify", "metadata", "thumbnail"]);
/** Directrices para una etapa: en un video personal, el brief sustituye a las de contenido del canal. */
export async function skillsFor(v: Video, scope: Scope | Scope[]): Promise<string> {
  const p = personalOf(v);
  const scopes = Array.isArray(scope) ? scope : [scope];
  if (!p) return composeSkills(v.channel_id, scopes);
  const visual = scopes.filter((s) => !CONTENT_SCOPES.has(s));
  const rest = visual.length ? await composeSkills(v.channel_id, visual) : "";
  return [personalBrief(p), visual.length ? personalVisualBrief(p) : "", rest].filter(Boolean).join("\n\n");
}

/** Copia los archivos del usuario a la carpeta del video y lleva los medios a la biblioteca. */
export async function importUploads(v: Pick<Video, "id" | "dir" | "title">, paths: string[]): Promise<PersonalFile[]> {
  const dir = joinPath(v.dir, "entregado");
  await fs.mkdir(dir);
  const out: PersonalFile[] = [];
  for (const [i, src] of paths.entries()) {
    const kind = kindOf(src);
    if (!kind) continue;
    const name = src.split(/[\\/]/).pop()!;
    const dest = joinPath(dir, `${String(i + 1).padStart(2, "0")}-${slugify(name.replace(/\.\w+$/, ""), 50)}.${extName(src).toLowerCase()}`);
    await fs.copy(src, dest);
    let asset: Asset | null = null;
    if (kind !== "document") asset = await importLocalFile(dest, kind === "audio" ? "music" : kind, { title: name.replace(/\.\w+$/, ""), note: `Subido para «${v.title}»`, license: "Del usuario", personal: true }).catch(() => null);
    out.push({ path: dest, name, kind, asset_id: asset?.id ?? null });
  }
  return out;
}

// ---------- Texto de documentos (sin dependencias) ----------
/** Lee una entrada de un .zip (docx, pptx y odt son zip). */
async function zipEntries(bytes: Uint8Array, want: (name: string) => boolean): Promise<{ name: string; text: string }[]> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return [];
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: { name: string; text: string }[] = [];
  for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (!want(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + csize);
    let raw: Uint8Array;
    if (method === 0) raw = data;
    else if (method === 8) raw = new Uint8Array(await new Response(new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    else continue;
    out.push({ name, text: new TextDecoder().decode(raw) });
  }
  return out;
}

const xmlText = (xml: string, para: RegExp) => xml.replace(para, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, "\n\n").trim();

/** Texto de un documento; null si hay que leerlo con Claude (PDF) o no se pudo. */
export async function extractText(path: string): Promise<string | null> {
  const ext = extName(path).toLowerCase();
  try {
    if (["txt", "md", "csv"].includes(ext)) return (await fs.readText(path)).trim();
    if (ext === "rtf") return (await fs.readText(path)).replace(/\\par[d]?/g, "\n").replace(/\{\\[^{}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, "").trim();
    if (!["docx", "pptx", "odt"].includes(ext)) return null;
    const bytes = Uint8Array.from(atob(await fs.readB64(path)), (c) => c.charCodeAt(0));
    if (ext === "docx") { const e = await zipEntries(bytes, (n) => n === "word/document.xml"); return e[0] ? xmlText(e[0].text, /<\/w:p>/g) : null; }
    if (ext === "odt") { const e = await zipEntries(bytes, (n) => n === "content.xml"); return e[0] ? xmlText(e[0].text, /<\/text:(p|h)>/g) : null; }
    const slides = (await zipEntries(bytes, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).sort((a, b) => Number(a.name.match(/\d+/)![0]) - Number(b.name.match(/\d+/)![0]));
    return slides.map((s, i) => `[Diapositiva ${i + 1}]\n${xmlText(s.text, /<\/a:p>/g)}`).join("\n\n") || null;
  } catch { return null; }
}

/** Material de texto para la investigación y el guion: documentos leídos aquí y PDF para leer con Claude. */
export async function documentsOf(p: PersonalSpec): Promise<{ text: string; pdfs: string[] }> {
  const parts: string[] = []; const pdfs: string[] = [];
  for (const f of p.files.filter((x) => x.kind === "document")) {
    const t = await extractText(f.path);
    if (t) parts.push(`### ${f.name}\n${t.slice(0, 40_000)}`);
    else if (extName(f.path).toLowerCase() === "pdf") pdfs.push(f.path);
  }
  return { text: parts.join("\n\n").slice(0, 120_000), pdfs };
}

/** Voz en el idioma del video: el mismo timbre de Chirp 3 HD en español latinoamericano. */
export function voiceFor(p: PersonalSpec | null, current: string): { voice?: string; languageCode?: string } {
  if (!p || p.language === "en") return {};
  const name = /-Chirp3-HD-(\w+)$/.exec(current)?.[1] ?? "Charon";
  return { voice: `es-US-Chirp3-HD-${name}`, languageCode: "es-US" };
}
