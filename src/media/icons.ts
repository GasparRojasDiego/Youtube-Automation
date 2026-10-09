// Íconos: se buscan en Iconify (más de 200 colecciones abiertas, cada una con
// su licencia) y solo se usan los de licencias que permiten uso comercial.
// Si no hay ninguno, Claude dibuja uno sencillo en SVG. Todos quedan en la
// biblioteca para reutilizarlos en otros videos.
import { db, fs, http } from "../lib/ipc";
import { emit } from "../lib/bus";
import { joinPath, uid, now, slugify } from "../lib/util";
import { claudeRun } from "../providers/claude";
import { libraryRoot, getAsset, searchLibrary, type Asset } from "./library";

const API = "https://api.iconify.design";
/** Licencias aptas para videos monetizados (CC BY exige atribución, que va en la descripción). */
const OK_LICENSES = new Set(["MIT", "Apache-2.0", "ISC", "CC0-1.0", "OFL-1.1", "BSD-2-Clause", "BSD-3-Clause", "CC-BY-4.0", "CC-BY-3.0"]);
/** Colecciones preferidas: limpias, coherentes y de trazo uniforme. */
const PREFERRED = ["ph", "tabler", "lucide", "material-symbols", "mdi", "fluent", "solar", "iconoir", "mingcute", "ri", "carbon", "streamline"];

interface SetInfo { name: string; license?: { title: string; spdx?: string; url?: string }; author?: { name: string; url?: string } }
const setCache = new Map<string, SetInfo | null>();

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await http.request({ url, timeoutS: 30, headers: { "User-Agent": "ATRIL" } });
    return r.status === 200 ? (JSON.parse(r.body) as T) : null;
  } catch { return null; }
}

async function setInfos(prefixes: string[]): Promise<Map<string, SetInfo | null>> {
  const missing = prefixes.filter((p) => !setCache.has(p));
  if (missing.length) {
    const r = await getJson<Record<string, SetInfo>>(`${API}/collections?prefixes=${encodeURIComponent(missing.join(","))}`);
    for (const p of missing) setCache.set(p, r?.[p] ?? null);
  }
  return new Map(prefixes.map((p) => [p, setCache.get(p) ?? null]));
}

/** El SVG es seguro para insertarlo en una página (sin scripts ni recursos externos). */
export function cleanSvg(svg: string): string | null {
  const s = svg.trim();
  if (!/^<svg[\s>]/i.test(s) || s.length > 60_000) return null;
  if (/<script|<foreignObject|\son\w+\s*=|javascript:|(?:href|src)\s*=\s*["']https?:/i.test(s)) return null;
  if (!/viewBox=/i.test(s)) return null;
  // Solo la etiqueta raíz: un <rect width="20"> interno debe quedar intacto.
  return s.replace(/^<svg[^>]*>/i, (tag) => {
    const t = tag.replace(/\s(?:width|height)="[^"]*"/gi, "");
    return t.replace(/^<svg/i, '<svg width="1em" height="1em"');
  });
}

export interface IconHit { id: string; prefix: string; name: string; set: string; license: string; spdx: string; author: string }

/** Busca en Iconify; prueba la frase completa y luego palabras sueltas. */
export async function searchIcons(query: string, limit = 24): Promise<IconHit[]> {
  const words = query.toLowerCase().replace(/[^a-z0-9 -]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  const tries = [...new Set([words.join(" "), words.slice(-2).join(" "), ...[...words].sort((a, b) => b.length - a.length)])].filter(Boolean);
  for (const q of tries) {
    const r = await getJson<{ icons?: string[] }>(`${API}/search?query=${encodeURIComponent(q)}&limit=96`);
    const ids = r?.icons ?? [];
    if (!ids.length) continue;
    const infos = await setInfos([...new Set(ids.map((i) => i.split(":")[0]))]);
    const hits: IconHit[] = [];
    for (const id of ids) {
      const [prefix, name] = id.split(":");
      const info = infos.get(prefix);
      const spdx = info?.license?.spdx ?? "";
      if (!info || !OK_LICENSES.has(spdx)) continue;
      hits.push({ id, prefix, name, set: info.name, license: info.license?.title ?? spdx, spdx, author: info.author?.name ?? "" });
    }
    const rank = (h: IconHit) => { const i = PREFERRED.indexOf(h.prefix); return (i < 0 ? 50 : i) + (h.name.includes("-duotone") || h.name.includes("-fill") ? 0.5 : 0); };
    hits.sort((a, b) => rank(a) - rank(b));
    if (hits.length) return hits.slice(0, limit);
  }
  return [];
}

async function saveIcon(svg: string, meta: { source: "iconify" | "generated"; sourceId: string; title: string; tags: string; license: string; attribution: string; pageUrl: string | null }): Promise<Asset> {
  const dup = await db.query<{ id: string }>("SELECT id FROM assets WHERE source=? AND source_id=?", [meta.source, meta.sourceId]);
  if (dup[0]) { const a = await getAsset(dup[0].id); if (a && (await fs.exists(a.path))) return a; await db.execute("DELETE FROM assets WHERE id=?", [dup[0].id]); }
  const id = uid("as_");
  const path = joinPath(await libraryRoot(), "Iconos", `${slugify(meta.sourceId.replace(":", "-"), 60)}.svg`);
  await fs.writeText(path, svg);
  await db.execute(
    `INSERT INTO assets(id,kind,source,source_id,url,page_url,title,author,license,license_url,attribution,path,thumb,width,height,duration,bytes,sha,query,tags,description,issues,created_at,usable,described_at,quality)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,4)`,
    [id, "icon", meta.source, meta.sourceId, null, meta.pageUrl, meta.title, meta.attribution.split(" by ")[1]?.split(" — ")[0] ?? "", meta.license, "", meta.attribution, path, path,
      24, 24, null, svg.length, null, meta.tags, meta.tags, `Ícono: ${meta.title}`, "", now(), now()]);
  await db.execute("INSERT INTO assets_fts(asset_id,title,description,tags,query) VALUES(?,?,?,?,?)", [id, meta.title, `icon ${meta.title}`, meta.tags, meta.tags]);
  emit("assets");
  return (await getAsset(id))!;
}

/** Descarga un ícono de Iconify a la biblioteca. */
export async function importIcon(hit: IconHit, query = ""): Promise<Asset> {
  const r = await http.request({ url: `${API}/${hit.prefix}/${hit.name}.svg`, timeoutS: 30, headers: { "User-Agent": "ATRIL" } });
  const svg = r.status === 200 ? cleanSvg(r.body) : null;
  if (!svg) throw new Error(`No se pudo descargar el ícono ${hit.id}`);
  return saveIcon(svg, {
    source: "iconify", sourceId: hit.id, title: hit.name.replace(/-/g, " "), tags: [query, hit.name.replace(/-/g, " "), hit.set].filter(Boolean).join(", "),
    license: hit.license, attribution: `Icon "${hit.name}" from ${hit.set}${hit.author ? ` by ${hit.author}` : ""} — ${hit.license} — via Iconify`, pageUrl: `https://icon-sets.iconify.design/${hit.prefix}/${hit.name}/`,
  });
}

const ICON_SCHEMA = { type: "object", properties: { svg: { type: "string" } }, required: ["svg"], additionalProperties: false };

/** Claude dibuja un ícono sencillo cuando no existe uno con licencia abierta. */
export async function createIcon(name: string, videoId?: string | null): Promise<Asset> {
  const r = await claudeRun<{ svg: string }>({
    stage: "storyboard", label: `Crear ícono «${name}»`, quiet: true, videoId,
    system: "You are an icon designer. You draw minimal, consistent line icons as clean SVG.",
    schema: ICON_SCHEMA,
    prompt: `Draw a simple, recognisable icon of: "${name}".\nRules: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">; 2-8 paths/shapes; use fill="currentColor" only for small solid details; no text, no gradients, no external references, no scripts.`,
  });
  const svg = cleanSvg(r.data.svg ?? "");
  if (!svg) throw new Error("Claude no devolvió un SVG válido");
  return saveIcon(svg, { source: "generated", sourceId: `atril:${slugify(name, 50)}`, title: name, tags: name, license: "Propio (creado con IA)", attribution: "", pageUrl: null });
}

/** Ícono para un concepto: biblioteca → Iconify → Claude. */
export async function resolveIcon(name: string, videoId?: string | null): Promise<Asset | null> {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const local = (await searchLibrary(q, "icon", 3)).find((a) => a.title.toLowerCase() === q || a.tags.toLowerCase().split(", ")[0] === q) ?? (await searchLibrary(q, "icon", 1))[0];
  if (local) return local;
  try { const hits = await searchIcons(q, 4); if (hits[0]) return await importIcon(hits[0], q); } catch { /* sin conexión */ }
  try { return await createIcon(q, videoId); } catch { return null; }
}
