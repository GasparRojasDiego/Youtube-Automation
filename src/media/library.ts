// Biblioteca de medios local y reutilizable: cada archivo se descarga una sola
// vez (Documentos\ATRIL\Biblioteca), queda registrado con su licencia y
// procedencia, y Claude lo describe una sola vez para poder encontrarlo por
// texto en videos futuros sin volver a mirarlo.
import { db, fs, http, appPaths } from "../lib/ipc";
import { emit } from "../lib/bus";
import { getSettings } from "../lib/settings";
import { joinPath, uid, now, slugify, extName, sha256 } from "../lib/util";
import { ffmpeg, probeMedia } from "../providers/ffmpeg";
import { resolveNasa, attributionText, type Candidate, type AssetKind, type SourceId } from "./sources";

export interface Asset {
  id: string; kind: AssetKind; source: SourceId | "user" | "atril"; source_id: string;
  url: string | null; page_url: string | null; title: string; author: string; license: string; license_url: string; attribution: string;
  path: string; thumb: string | null; width: number | null; height: number | null; duration: number | null; bytes: number | null;
  sha: string | null; query: string; description: string; tags: string; mood: string; quality: number; real_person: number;
  usable: number; issues: string; described_at: number | null; created_at: number; used_count: number; last_used: number | null; favorite: number;
}

const FOLDER: Record<AssetKind, string> = { image: "Imagenes", video: "Clips", sfx: "Efectos", music: "Musica" };

export async function libraryRoot(): Promise<string> {
  const custom = getSettings().media.libraryDir;
  if (custom) return custom;
  const p = await appPaths();
  return joinPath(p.documents || p.home, "ATRIL", "Biblioteca");
}

export async function getAsset(id: string): Promise<Asset | null> {
  return (await db.query<Asset>("SELECT * FROM assets WHERE id=?", [id]))[0] ?? null;
}

export async function getAssets(ids: string[]): Promise<Map<string, Asset>> {
  const m = new Map<string, Asset>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    if (!chunk.length) continue;
    for (const a of await db.query<Asset>(`SELECT * FROM assets WHERE id IN (${chunk.map(() => "?").join(",")})`, chunk)) m.set(a.id, a);
  }
  return m;
}

async function indexFts(a: Pick<Asset, "id" | "title" | "description" | "tags" | "query">) {
  await db.execute("DELETE FROM assets_fts WHERE asset_id=?", [a.id]);
  await db.execute("INSERT INTO assets_fts(asset_id,title,description,tags,query) VALUES(?,?,?,?,?)", [a.id, a.title, a.description, a.tags, a.query]);
}

function extFor(c: Candidate, url: string): string {
  const e = extName(url.split("?")[0]);
  if (c.kind === "image") return ["jpg", "jpeg", "png", "webp"].includes(e) ? (e === "jpeg" ? "jpg" : e) : "jpg";
  if (c.kind === "video") return ["mp4", "webm", "mov", "ogv"].includes(e) ? e : "mp4";
  return ["mp3", "ogg", "wav", "flac", "m4a"].includes(e) ? e : "mp3";
}

/** Miniatura para la interfaz (y forma de onda para el audio). */
async function makeThumb(a: { kind: AssetKind; path: string; duration?: number | null }, out: string) {
  await fs.mkdir(out.replace(/[\\/][^\\/]+$/, ""));
  if (a.kind === "image") await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", a.path, "-vf", "scale=480:-2", "-frames:v", "1", "-q:v", "4", out]);
  else if (a.kind === "video") await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-ss", String(Math.min(1, (a.duration ?? 2) / 3)), "-i", a.path, "-vf", "scale=480:-2", "-frames:v", "1", "-q:v", "4", out]);
  else await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", a.path, "-filter_complex", "aformat=channel_layouts=mono,showwavespic=s=480x120:colors=0x7591FF", "-frames:v", "1", out]);
}

/** Descarga un candidato a la biblioteca (o devuelve el que ya estaba). */
export async function importCandidate(c: Candidate): Promise<Asset> {
  const ex = (await db.query<Asset>("SELECT * FROM assets WHERE source=? AND source_id=?", [c.source, c.sourceId]))[0];
  if (ex && (await fs.exists(ex.path))) return ex;
  const root = await libraryRoot();
  const url = c.source === "nasa" && !c.downloadUrl ? await resolveNasa(c) : c.downloadUrl;
  const id = ex?.id ?? uid("as_");
  const name = `${c.source}-${slugify(c.title || c.query, 40)}-${id.slice(-6)}.${extFor(c, url)}`;
  const path = joinPath(root, FOLDER[c.kind], name);
  const bytes = await http.download(url, path);
  let info = { width: c.width ?? 0, height: c.height ?? 0, duration: c.duration ?? 0 };
  try { const m = await probeMedia(path); info = { width: m.width || info.width, height: m.height || info.height, duration: m.duration || info.duration }; }
  catch (e) { await fs.remove(path); throw new Error(`El archivo descargado no es válido (${c.source} ${c.sourceId}): ${e instanceof Error ? e.message : e}`); }
  const thumb = joinPath(root, ".miniaturas", `${id}.${c.kind === "sfx" || c.kind === "music" ? "png" : "jpg"}`);
  try { await makeThumb({ kind: c.kind, path, duration: info.duration }, thumb); } catch { /* sin miniatura */ }
  const t = now();
  const row = {
    id, kind: c.kind, source: c.source, source_id: c.sourceId, url, page_url: c.pageUrl, title: c.title.slice(0, 300), author: c.author.slice(0, 200),
    license: c.license, license_url: c.licenseUrl, attribution: c.attribution || attributionText(c), path, thumb: (await fs.exists(thumb)) ? thumb : null,
    width: info.width || null, height: info.height || null, duration: info.duration || null, bytes, query: c.query,
    tags: c.tags.join(", "),
  };
  await db.execute(
    `INSERT OR REPLACE INTO assets(id,kind,source,source_id,url,page_url,title,author,license,license_url,attribution,path,thumb,width,height,duration,bytes,query,tags,created_at,usable)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [row.id, row.kind, row.source, row.source_id, row.url, row.page_url, row.title, row.author, row.license, row.license_url, row.attribution, row.path, row.thumb,
      row.width, row.height, row.duration, row.bytes, row.query, row.tags, ex?.created_at ?? t]);
  await indexFts({ id, title: row.title, description: "", tags: row.tags, query: row.query });
  emit("assets");
  return (await getAsset(id))!;
}

/** Importa un archivo propio (con derechos del usuario) a la biblioteca. */
export async function importLocalFile(src: string, kind: AssetKind, meta: { title?: string; license?: string; attribution?: string; note?: string } = {}): Promise<Asset> {
  const root = await libraryRoot();
  const id = uid("as_");
  const ext = extName(src) || (kind === "image" ? "jpg" : kind === "video" ? "mp4" : "mp3");
  const title = meta.title || src.split(/[\\/]/).pop()!.replace(/\.\w+$/, "");
  const path = joinPath(root, FOLDER[kind], `propio-${slugify(title, 40)}-${id.slice(-6)}.${ext}`);
  await fs.copy(src, path);
  const m = await probeMedia(path);
  const thumb = joinPath(root, ".miniaturas", `${id}.${kind === "sfx" || kind === "music" ? "png" : "jpg"}`);
  try { await makeThumb({ kind, path, duration: m.duration }, thumb); } catch { /* sin miniatura */ }
  const hash = await sha256(`${src}|${await fs.size(src)}`);
  await db.execute(
    `INSERT INTO assets(id,kind,source,source_id,url,page_url,title,author,license,license_url,attribution,path,thumb,width,height,duration,bytes,sha,query,issues,created_at,usable)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [id, kind, "user", hash.slice(0, 24), null, null, title, "Propio", meta.license || "Derechos del usuario", "", meta.attribution || "", path,
      (await fs.exists(thumb)) ? thumb : null, m.width || null, m.height || null, m.duration || null, await fs.size(path), hash, "", meta.note ?? "", now()]);
  await indexFts({ id, title, description: "", tags: "", query: "" });
  emit("assets");
  return (await getAsset(id))!;
}

/** Guarda la descripción hecha por Claude (una sola vez por archivo). */
export async function saveDescription(id: string, d: { title?: string; description_es: string; caption_en: string; tags_en: string[]; mood: string; quality: number; real_person: boolean; usable: boolean; issues: string }) {
  const a = await getAsset(id);
  if (!a) return;
  const title = d.title?.trim() || a.title;
  const tags = [d.caption_en, ...d.tags_en].filter(Boolean).join(", ");
  await db.execute("UPDATE assets SET title=?, description=?, tags=?, mood=?, quality=?, real_person=?, usable=?, issues=?, described_at=? WHERE id=?",
    [title, d.description_es, tags, d.mood, Math.round(d.quality), d.real_person ? 1 : 0, d.usable ? 1 : 0, d.issues, now(), id]);
  await indexFts({ id, title, description: d.description_es, tags, query: a.query });
}

/** Convierte texto libre en una consulta FTS5 segura (OR de términos, con prefijos). */
export function ftsQuery(q: string): string {
  const STOP = new Set(["the", "a", "an", "of", "and", "or", "in", "on", "at", "to", "for", "with", "by", "from", "de", "la", "el", "los", "las", "y", "en", "un", "una", "del", "con", "por"]);
  const terms = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{2,}/g) ?? [];
  const uniq = [...new Set(terms.filter((t) => !STOP.has(t)))].slice(0, 12);
  return uniq.map((t) => (t.length >= 4 ? `"${t}"*` : `"${t}"`)).join(" OR ");
}

export interface LibraryHit extends Asset { score: number }

/** Búsqueda por texto en la biblioteca (descripciones, etiquetas y consultas). */
export async function searchLibrary(q: string, kind: AssetKind | null, limit = 12, opts: { excludeIds?: string[]; onlyUsable?: boolean; minDur?: number } = {}): Promise<LibraryHit[]> {
  const fq = ftsQuery(q);
  if (!fq) return [];
  const rows = await db.query<LibraryHit>(
    `SELECT a.*, bm25(assets_fts, 0, 2.0, 1.0, 3.0, 1.0) AS score FROM assets_fts JOIN assets a ON a.id = assets_fts.asset_id
     WHERE assets_fts MATCH ? ${kind ? "AND a.kind = ?" : ""} ${opts.onlyUsable !== false ? "AND a.usable = 1" : ""}
     ORDER BY score LIMIT ?`, kind ? [fq, kind, limit * 3] : [fq, limit * 3]);
  const ex = new Set(opts.excludeIds ?? []);
  return rows.filter((r) => !ex.has(r.id) && (!opts.minDur || (r.duration ?? 0) >= opts.minDur))
    .map((r) => ({ ...r, score: -r.score + (r.described_at ? 1 : 0) + r.quality * 0.3 + r.favorite * 2 - Math.min(3, r.used_count * 0.5) }))
    .sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function listAssets(f: { kind?: AssetKind | null; q?: string; source?: string; onlyUndescribed?: boolean; favorites?: boolean; limit?: number; offset?: number } = {}): Promise<Asset[]> {
  if (f.q?.trim()) return searchLibrary(f.q, f.kind ?? null, f.limit ?? 120, { onlyUsable: false });
  const w: string[] = []; const p: unknown[] = [];
  if (f.kind) { w.push("kind=?"); p.push(f.kind); }
  if (f.source) { w.push("source=?"); p.push(f.source); }
  if (f.onlyUndescribed) w.push("described_at IS NULL AND kind IN ('image','video')");
  if (f.favorites) w.push("favorite=1");
  p.push(f.limit ?? 120, f.offset ?? 0);
  return db.query<Asset>(`SELECT * FROM assets ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY created_at DESC LIMIT ? OFFSET ?`, p);
}

export async function libraryStats() {
  const r = await db.query<{ kind: string; n: number; bytes: number; undescribed: number }>(
    "SELECT kind, COUNT(*) n, COALESCE(SUM(bytes),0) bytes, SUM(CASE WHEN described_at IS NULL AND kind IN ('image','video') THEN 1 ELSE 0 END) undescribed FROM assets GROUP BY kind");
  return Object.fromEntries(r.map((x) => [x.kind, x])) as Partial<Record<AssetKind, { n: number; bytes: number; undescribed: number }>>;
}

export async function markUsed(ids: string[]) {
  const t = now();
  for (const id of new Set(ids)) await db.execute("UPDATE assets SET used_count=used_count+1, last_used=? WHERE id=?", [t, id]);
  emit("assets");
}

export async function updateAsset(id: string, patch: Partial<Pick<Asset, "favorite" | "usable" | "title" | "description" | "tags" | "issues">>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  await db.execute(`UPDATE assets SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`, [...keys.map((k) => patch[k]), id]);
  const a = await getAsset(id);
  if (a) await indexFts(a);
  emit("assets");
}

export async function deleteAsset(id: string) {
  const a = await getAsset(id);
  if (!a) return;
  try { await fs.remove(a.path); if (a.thumb) await fs.remove(a.thumb); } catch { /* noop */ }
  await db.execute("DELETE FROM assets WHERE id=?", [id]);
  await db.execute("DELETE FROM assets_fts WHERE asset_id=?", [id]);
  emit("assets");
}

/** Imagen reducida para la visión de Claude (≈480 tokens por imagen). Videos: hoja de 4 cuadros. */
export async function visionProxy(a: Asset): Promise<string> {
  const root = await libraryRoot();
  const out = joinPath(root, ".vision", `${a.id}.jpg`);
  if (await fs.exists(out)) return out;
  await fs.mkdir(joinPath(root, ".vision"));
  if (a.kind === "image") {
    await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", a.path, "-vf", "scale='min(800,iw)':'min(800,ih)':force_original_aspect_ratio=decrease", "-frames:v", "1", "-q:v", "4", out]);
  } else {
    const d = Math.max(0.4, a.duration ?? 4);
    // 4 cuadros repartidos en el clip, en mosaico 2×2 de 800×450
    await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", a.path, "-vf",
      `fps=${(4 / d).toFixed(4)},scale=400:225:force_original_aspect_ratio=increase,crop=400:225,setsar=1,tile=2x2`, "-frames:v", "1", "-q:v", "4", out]);
  }
  return out;
}
