// Catálogo de la biblioteca en Markdown («Generar .md»): la descripción de cada recurso, para dárselo a
// otro chat (p. ej. quien prepara las tarjetas de la cola) y que sepa con qué material cuenta cada modo.
import { db, fs, appPaths } from "../lib/ipc";
import { joinPath } from "../lib/util";
import type { Asset } from "./library";
import type { AssetKind } from "./sources";

const KIND: Record<AssetKind, string> = { image: "Imágenes", video: "Videos y clips", icon: "Íconos", music: "Música", sfx: "Efectos de sonido" };
const ORDER: AssetKind[] = ["image", "video", "icon", "music", "sfx"];
const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function item(a: Asset): string {
  const facts = [
    a.width && a.height ? `${a.width}×${a.height}${a.width < a.height ? " (vertical)" : a.width > a.height ? " (horizontal)" : " (cuadrada)"}` : "",
    a.duration ? `${Math.round(a.duration * 10) / 10} s` : "",
    a.quality ? `calidad ${a.quality}/5` : "",
    a.usable === 0 ? "**no utilizable**" : "",
    a.real_person ? "persona real identificable" : "",
    a.favorite ? "favorito" : "",
  ].filter(Boolean).join(" · ");
  const lines = [`- **${oneLine(a.title) || fileName(a.path)}** — \`${fileName(a.path)}\`${facts ? ` · ${facts}` : ""}`];
  lines.push(`  - Descripción: ${oneLine(a.description) || "_(sin describir: pulsa «Describir» en Biblioteca)_"}`);
  if (a.tags.trim()) lines.push(`  - Etiquetas: ${oneLine(a.tags)}`);
  if (a.mood?.trim()) lines.push(`  - Ambiente: ${oneLine(a.mood)}`);
  if (a.issues?.trim()) lines.push(`  - Problemas: ${oneLine(a.issues)}`);
  if (a.source !== "personal") lines.push(`  - Origen: ${a.source}${a.author ? ` · ${oneLine(a.author)}` : ""}${a.license ? ` · ${oneLine(a.license)}` : ""}`);
  return lines.join("\n");
}

function section(title: string, note: string, list: Asset[]): string {
  const parts = [`## ${title} (${list.length})`, "", note, ""];
  if (!list.length) return [...parts, "_(vacía)_", ""].join("\n");
  for (const k of ORDER) {
    const of = list.filter((a) => a.kind === k);
    if (of.length) parts.push(`### ${KIND[k]} (${of.length})`, "", ...of.map(item), "");
  }
  return parts.join("\n");
}

/** Documento completo (función pura: se prueba sin la app). */
export function libraryMarkdown(personal: Asset[], auto: Asset[], date = new Date()): string {
  const d = date.toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short", hour12: false });
  return [
    "# Biblioteca de ATRIL",
    "",
    `*Generado el ${d}. ${personal.length + auto.length} recursos.*`,
    "",
    "**Qué material puede usar cada modo**",
    "- **Videos personales** (y las tarjetas Personal de la cola): **toda la biblioteca**, la personal y la de automatización. Con «Completa», ATRIL elige los 40 recursos más relacionados con el guion y, a igual parecido, prefiere los personales. Con «Solo algunos», usa exactamente los que se elijan (por su título o su archivo).",
    "- **Videos de Automatización**: **solo la biblioteca de automatización**. Nunca usan los archivos personales.",
    "",
    "Cada recurso trae su título, su archivo, sus medidas o duración y la descripción que hizo la visión de Claude. Los marcados como «no utilizable» no se usan en ningún video.",
    "",
    section("Biblioteca personal", "Lo que subió Diego (capturas, grabaciones, logos, fotos propias). Solo la usan los videos personales.", personal),
    section("Biblioteca de automatización", "Material libre descargado, propio importado, íconos e imágenes con IA. La usan los videos de Automatización y también los personales.", auto),
  ].join("\n").trimEnd() + "\n";
}

/** Escribe el catálogo en Descargas y devuelve la ruta. */
export async function exportLibraryMd(): Promise<string> {
  const all = await db.query<Asset>("SELECT * FROM assets ORDER BY kind, created_at DESC");
  const dir = (await appPaths()).downloads;
  await fs.mkdir(dir);
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const out = joinPath(dir, `ATRIL - Biblioteca ${stamp}.md`);
  await fs.writeText(out, libraryMarkdown(all.filter((a) => a.source === "personal"), all.filter((a) => a.source !== "personal"), now));
  return out;
}
