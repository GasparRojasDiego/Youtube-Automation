// Modo Personal: videos a medida (tareas, proyectos, promoción de apps) con
// descripción, duración e idioma propios, archivos del usuario, guion propio
// opcional y la opción de usar solo lo que el usuario subió.
import { fs } from "../lib/ipc";
import { composeSkills, type Scope } from "../lib/skills";
import { joinPath, extName, slugify } from "../lib/util";
import { importLocalFile, type Asset } from "../media/library";
import { SYSTEM_BASE } from "./prompts";
import type { Video } from "../lib/repo";

export type FileKind = "image" | "video" | "audio" | "document";
export interface PersonalFile { path: string; name: string; kind: FileKind; asset_id?: string | null }
export interface PersonalSpec {
  description: string;        // cómo será el video: público, tono, estilo, propósito
  minutes: number;            // duración objetivo
  language: "es" | "en";
  useLibrary: boolean;        // false: solo los archivos subidos (más gráficos y animaciones creados por ATRIL)
  iterate: boolean;           // mejora continua al terminar la primera versión
  files: PersonalFile[];
  script?: { path: string; name: string } | null;
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

/** Brief del video personal en el lugar de las directrices de contenido del canal (las visuales se mantienen). */
export function personalBrief(p: PersonalSpec): string {
  return `OPERATOR BRIEF FOR THIS PERSONAL VIDEO (mandatory):
- Target duration: about ${p.minutes < 1 ? `${Math.round(p.minutes * 60)} seconds` : `${p.minutes} minute(s)`}.
- Language: ${LANG[p.language]}.
- Description of the video (purpose, audience, tone, look): ${p.description.trim() || "(not given: make it clear, engaging and well paced)"}${p.files.length ? `\n- The operator provided ${p.files.length} file(s); use them as the primary material.` : ""}`;
}

const CONTENT_SCOPES = new Set<Scope>(["research", "script", "verify", "metadata", "thumbnail"]);
/** Directrices para una etapa: en un video personal, el brief sustituye a las de contenido del canal. */
export async function skillsFor(v: Video, scope: Scope | Scope[]): Promise<string> {
  const p = personalOf(v);
  const scopes = Array.isArray(scope) ? scope : [scope];
  if (!p) return composeSkills(v.channel_id, scopes);
  const visual = scopes.filter((s) => !CONTENT_SCOPES.has(s));
  const rest = visual.length ? await composeSkills(v.channel_id, visual) : "";
  return [personalBrief(p), rest].filter(Boolean).join("\n\n");
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
    if (kind !== "document") asset = await importLocalFile(dest, kind === "audio" ? "music" : kind, { title: name.replace(/\.\w+$/, ""), note: `Subido para «${v.title}»`, license: "Del usuario" }).catch(() => null);
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
