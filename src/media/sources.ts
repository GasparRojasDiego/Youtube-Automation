// Fuentes oficiales de material libre (API públicas). Cada resultado se
// normaliza con su licencia y procedencia; solo se aceptan licencias que
// permiten uso comercial y modificación (CC0, dominio público, CC BY,
// CC BY-SA y las licencias propias de Pexels y Pixabay).
// Se excluyen a propósito GIPHY y Tenor: su contenido suele ser de terceros
// con copyright y sus condiciones no permiten usarlo en videos monetizados.
import { secrets } from "../lib/ipc";
import { getSettings, SECRET } from "../lib/settings";
import { requestJson } from "../providers/net";
import { recordApiCall, apiCount, API_LIMITS } from "../lib/usage";
import { stripHtml } from "../lib/util";

export type SourceId = "openverse" | "pexels" | "pixabay" | "wikimedia" | "nasa" | "met" | "freesound";
export type AssetKind = "image" | "video" | "sfx" | "music" | "icon";

export interface Candidate {
  source: SourceId; sourceId: string; kind: AssetKind;
  title: string; author: string; license: string; licenseUrl: string; attribution: string;
  pageUrl: string; downloadUrl: string; previewUrl: string;
  width?: number; height?: number; duration?: number; tags: string[]; query: string;
  /** Preferencia de licencia: 3 = sin atribución, 2 = CC BY, 1 = CC BY-SA. */
  licenseRank: number;
}

export const SOURCE_LABEL: Record<SourceId, string> = {
  openverse: "Openverse", pexels: "Pexels", pixabay: "Pixabay", wikimedia: "Wikimedia Commons",
  nasa: "NASA Image and Video Library", met: "The Met (Open Access)", freesound: "Freesound",
};

/** Qué fuentes sirven para cada tipo de material. */
export const SOURCES_FOR: Record<AssetKind, SourceId[]> = {
  image: ["pexels", "pixabay", "wikimedia", "openverse", "met", "nasa"],
  video: ["pexels", "pixabay", "wikimedia", "nasa"],
  sfx: ["freesound", "openverse"],
  music: ["openverse", "freesound"],
  icon: [],
};

// ---------- Licencias ----------
const CC_URL: Record<string, string> = {
  cc0: "https://creativecommons.org/publicdomain/zero/1.0/",
  pdm: "https://creativecommons.org/publicdomain/mark/1.0/",
};

export function normLicense(raw: string, version = ""): { license: string; rank: number; url: string } | null {
  const l = raw.toLowerCase().replace(/_/g, "-").trim();
  if (/(^|[\s-])(nc|nd)([\s-]|$)|non-?commercial|no ?deriv|fair use|non-free|sampling/.test(l)) return null;
  if (/^(cc0|creative commons 0|cc-zero|public domain dedication)/.test(l)) return { license: "CC0", rank: 3, url: CC_URL.cc0 };
  if (/^(pdm|public domain|pd\b|pd-|no restrictions|copyrighted free use)/.test(l)) return { license: "Dominio público", rank: 3, url: CC_URL.pdm };
  if (/^(cc[ -]?by[ -]?sa|by-sa|attribution[- ]share)/.test(l)) {
    const v = version || (l.match(/(\d\.\d)/)?.[1] ?? "4.0");
    return { license: `CC BY-SA ${v}`, rank: 1, url: `https://creativecommons.org/licenses/by-sa/${v}/` };
  }
  if (/^(cc[ -]?by|by\b|attribution)/.test(l)) {
    const v = version || (l.match(/(\d\.\d)/)?.[1] ?? "4.0");
    return { license: `CC BY ${v}`, rank: 2, url: `https://creativecommons.org/licenses/by/${v}/` };
  }
  return null;
}

export function attributionText(c: Pick<Candidate, "title" | "author" | "license" | "pageUrl" | "source">): string {
  return `"${c.title || "Untitled"}" by ${c.author || "Unknown"} — ${c.license} — via ${SOURCE_LABEL[c.source]} — ${c.pageUrl}`;
}

// ---------- Límites de cada API ----------
const WINDOWS: [keyof (typeof API_LIMITS)[string], number][] = [["perMinute", 60_000], ["perHour", 3_600_000], ["perDay", 86_400_000], ["perMonth", 30 * 86_400_000]];

/** ¿Queda margen en la cuota de la fuente? (se deja un 10 % de reserva). */
export async function hasQuota(src: SourceId, cost = 1): Promise<boolean> {
  const lim = await limitsFor(src);
  for (const [k, ms] of WINDOWS) {
    const max = lim[k] as number | undefined;
    if (max && (await apiCount(src, ms)) + cost > max * 0.9) return false;
  }
  return true;
}

let openverseToken: { token: string; exp: number } | null = null;
async function limitsFor(src: SourceId) {
  if (src === "openverse" && (await secrets.get(SECRET.openverseClientId))) return { label: "Openverse", perMinute: 100, perDay: 10000 };
  return API_LIMITS[src] ?? { label: src };
}

async function call<T>(src: SourceId, label: string, url: string, headers: Record<string, string> = {}, note = ""): Promise<T> {
  try {
    const r = await requestJson<T>(label, { url, headers, timeoutS: 60 }, 1);
    await recordApiCall(src, true, note);
    return r;
  } catch (e) {
    await recordApiCall(src, false, note);
    throw e;
  }
}

// ---------- Openverse (imágenes y audio de muchas colecciones) ----------
async function openverseAuth(): Promise<Record<string, string>> {
  const id = await secrets.get(SECRET.openverseClientId);
  const secret = await secrets.get(SECRET.openverseClientSecret);
  if (!id || !secret) return {};
  if (openverseToken && openverseToken.exp > Date.now() + 60_000) return { Authorization: `Bearer ${openverseToken.token}` };
  const r = await requestJson<any>("Openverse (token)", {
    method: "POST", url: "https://api.openverse.org/v1/auth_tokens/token/",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    bodyText: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }).toString(),
  }, 1);
  openverseToken = { token: r.access_token, exp: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
  return { Authorization: `Bearer ${openverseToken.token}` };
}

/** Registra ATRIL en Openverse para obtener cuotas mayores (requiere confirmar el correo). */
export async function registerOpenverse(email: string): Promise<{ client_id: string; client_secret: string }> {
  const r = await requestJson<any>("Openverse (registro)", {
    method: "POST", url: "https://api.openverse.org/v1/auth_tokens/register/",
    headers: { "Content-Type": "application/json" },
    bodyText: JSON.stringify({ name: `ATRIL personal ${Math.random().toString(36).slice(2, 7)}`, description: "Personal documentary production studio (desktop app) that searches openly licensed media.", email }),
  }, 0);
  await secrets.set(SECRET.openverseClientId, r.client_id);
  await secrets.set(SECRET.openverseClientSecret, r.client_secret);
  return r;
}

async function openverse(query: string, kind: AssetKind, n: number): Promise<Candidate[]> {
  const type = kind === "image" ? "images" : "audio";
  const p = new URLSearchParams({ q: query, license: "cc0,pdm,by,by-sa", page_size: String(Math.min(20, n * 3)), mature: "false" });
  if (kind === "image") { p.set("aspect_ratio", "wide"); p.set("size", "large"); }
  if (kind === "sfx") { p.set("category", "sound_effect"); p.set("length", "short"); }
  if (kind === "music") p.set("category", "music");
  const r = await call<any>("openverse", "Openverse", `https://api.openverse.org/v1/${type}/?${p}`, await openverseAuth(), query);
  const out: Candidate[] = [];
  for (const x of r.results ?? []) {
    const lic = normLicense(String(x.license ?? ""), String(x.license_version ?? ""));
    if (!lic || !x.url) continue;
    const c: Candidate = {
      source: "openverse", sourceId: String(x.id), kind, title: stripHtml(x.title ?? ""), author: stripHtml(x.creator ?? ""),
      license: lic.license, licenseUrl: x.license_url ?? lic.url, attribution: "", pageUrl: x.foreign_landing_url ?? x.detail_url ?? "",
      downloadUrl: x.url, previewUrl: x.thumbnail ?? x.url, width: x.width ?? undefined, height: x.height ?? undefined,
      duration: x.duration ? Number(x.duration) / 1000 : undefined, tags: (x.tags ?? []).map((t: any) => String(t.name)).slice(0, 20),
      query, licenseRank: lic.rank,
    };
    c.attribution = attributionText(c);
    out.push(c);
  }
  return out;
}

// ---------- Pexels (fotos y videos; licencia Pexels: uso libre, sin atribución obligatoria) ----------
async function pexels(query: string, kind: AssetKind, n: number): Promise<Candidate[]> {
  const key = await secrets.get(SECRET.pexelsApiKey);
  if (!key) return [];
  const per = String(Math.min(30, n * 3));
  if (kind === "image") {
    const r = await call<any>("pexels", "Pexels", `https://api.pexels.com/v1/search?${new URLSearchParams({ query, per_page: per, orientation: "landscape" })}`, { Authorization: key }, query);
    return (r.photos ?? []).map((x: any): Candidate => ({
      source: "pexels", sourceId: String(x.id), kind, title: x.alt || query, author: x.photographer ?? "", license: "Licencia de Pexels",
      licenseUrl: "https://www.pexels.com/license/", attribution: `Photo by ${x.photographer} on Pexels — ${x.url}`, pageUrl: x.url,
      downloadUrl: x.src?.large2x ?? x.src?.original, previewUrl: x.src?.medium ?? x.src?.small, width: x.width, height: x.height,
      tags: [], query, licenseRank: 3,
    }));
  }
  if (kind !== "video") return [];
  const r = await call<any>("pexels", "Pexels", `https://api.pexels.com/videos/search?${new URLSearchParams({ query, per_page: per, orientation: "landscape", size: "medium" })}`, { Authorization: key }, query);
  const out: Candidate[] = [];
  for (const x of r.videos ?? []) {
    const files = (x.video_files ?? []).filter((f: any) => f.file_type === "video/mp4" && f.width >= 1280 && f.width <= 1920)
      .sort((a: any, b: any) => Math.abs(a.width - 1920) - Math.abs(b.width - 1920));
    const f = files[0] ?? (x.video_files ?? [])[0];
    if (!f?.link) continue;
    out.push({
      source: "pexels", sourceId: `v${x.id}`, kind, title: (x.url ?? "").split("/").filter(Boolean).pop()?.replace(/-\d+$/, "").replace(/-/g, " ") || query,
      author: x.user?.name ?? "", license: "Licencia de Pexels", licenseUrl: "https://www.pexels.com/license/",
      attribution: `Video by ${x.user?.name ?? "Unknown"} on Pexels — ${x.url}`, pageUrl: x.url, downloadUrl: f.link, previewUrl: x.image,
      width: f.width, height: f.height, duration: x.duration, tags: [], query, licenseRank: 3,
    });
  }
  return out;
}

// ---------- Pixabay (fotos, ilustraciones y videos; licencia de contenido de Pixabay) ----------
async function pixabay(query: string, kind: AssetKind, n: number): Promise<Candidate[]> {
  const key = await secrets.get(SECRET.pixabayApiKey);
  if (!key || (kind !== "image" && kind !== "video")) return [];
  const p = new URLSearchParams({ key, q: query.slice(0, 100), per_page: String(Math.max(3, Math.min(50, n * 3))), safesearch: "true" });
  if (kind === "image") { p.set("orientation", "horizontal"); p.set("min_width", "1280"); }
  const url = kind === "image" ? `https://pixabay.com/api/?${p}` : `https://pixabay.com/api/videos/?${p}`;
  const r = await call<any>("pixabay", "Pixabay", url, {}, query);
  return (r.hits ?? []).map((x: any): Candidate | null => {
    const base = {
      source: "pixabay" as const, kind, author: x.user ?? "", license: "Licencia de contenido de Pixabay", licenseUrl: "https://pixabay.com/service/license-summary/",
      pageUrl: x.pageURL, tags: String(x.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean), query, licenseRank: 3,
      title: String(x.tags ?? query), attribution: `By ${x.user} on Pixabay — ${x.pageURL}`,
    };
    if (kind === "image") return { ...base, sourceId: String(x.id), downloadUrl: x.largeImageURL, previewUrl: x.webformatURL, width: x.imageWidth, height: x.imageHeight };
    const v = x.videos?.large?.url ? x.videos.large : x.videos?.medium;
    if (!v?.url) return null;
    return { ...base, sourceId: `v${x.id}`, downloadUrl: v.url, previewUrl: v.thumbnail ?? x.videos?.tiny?.thumbnail ?? "", width: v.width, height: v.height, duration: x.duration };
  }).filter(Boolean) as Candidate[];
}

// ---------- Wikimedia Commons (archivo histórico, ciudades, obras; imágenes y videos) ----------
async function wikimedia(query: string, kind: AssetKind, n: number): Promise<Candidate[]> {
  if (kind !== "image" && kind !== "video") return [];
  const isVideo = kind === "video";
  const p = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrsearch: `${query} filetype:${isVideo ? "video" : "bitmap"}`, gsrnamespace: "6",
    gsrlimit: String(Math.min(20, n * 4)), prop: isVideo ? "videoinfo" : "imageinfo", origin: "*",
  });
  if (isVideo) { p.set("viprop", "url|extmetadata|size|mime|derivatives"); p.set("viurlwidth", "640"); }
  else { p.set("iiprop", "url|extmetadata|size|mime"); p.set("iiurlwidth", "1920"); }
  const r = await call<any>("wikimedia", "Wikimedia Commons", `https://commons.wikimedia.org/w/api.php?${p}`, {}, query);
  const out: Candidate[] = [];
  for (const pg of (Object.values(r?.query?.pages ?? {}) as any[]).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
    const ii = (isVideo ? pg.videoinfo : pg.imageinfo)?.[0];
    if (!ii) continue;
    const md = ii.extmetadata ?? {};
    const lic = normLicense(stripHtml(md.LicenseShortName?.value ?? md.License?.value ?? ""));
    if (!lic) continue;
    let downloadUrl = ii.thumburl ?? ii.url;
    if (isVideo) {
      const der = (ii.derivatives ?? []).filter((d: any) => /webm|mp4/.test(d.type ?? "") && (d.height ?? 0) >= 480)
        .sort((a: any, b: any) => Math.abs((a.height ?? 0) - 720) - Math.abs((b.height ?? 0) - 720));
      downloadUrl = der[0]?.src ?? (Number(ii.size ?? 0) < 120e6 ? ii.url : "");
      if (!downloadUrl) continue;
    } else if (!/jpe?g|png|webp/i.test(ii.mime ?? "") || (ii.width ?? 0) < 900) continue;
    const c: Candidate = {
      source: "wikimedia", sourceId: String(pg.pageid ?? pg.title), kind, title: stripHtml(String(pg.title).replace(/^File:/, "").replace(/\.\w+$/, "")),
      author: stripHtml(md.Artist?.value ?? "Unknown").slice(0, 160), license: lic.license, licenseUrl: md.LicenseUrl?.value ?? lic.url, attribution: "",
      pageUrl: ii.descriptionurl ?? ii.url, downloadUrl, previewUrl: ii.thumburl ?? "", width: ii.width, height: ii.height,
      duration: ii.duration ? Number(ii.duration) : undefined, tags: [], query, licenseRank: lic.rank,
    };
    c.attribution = attributionText(c);
    out.push(c);
  }
  return out;
}

// ---------- NASA Image and Video Library (dominio público en EE. UU.) ----------
async function nasa(query: string, kind: AssetKind, n: number): Promise<Candidate[]> {
  if (kind !== "image" && kind !== "video") return [];
  const r = await call<any>("nasa", "NASA Images", `https://images-api.nasa.gov/search?${new URLSearchParams({ q: query, media_type: kind, page_size: String(Math.min(30, n * 3)) })}`, {}, query);
  const out: Candidate[] = [];
  for (const it of (r.collection?.items ?? []).slice(0, n * 2)) {
    const d = it.data?.[0]; if (!d?.nasa_id) continue;
    const preview = (it.links ?? []).find((l: any) => l.rel === "preview")?.href ?? "";
    out.push({
      source: "nasa", sourceId: d.nasa_id, kind, title: d.title ?? d.nasa_id, author: d.photographer || d.secondary_creator || d.center || "NASA",
      license: "Dominio público (NASA)", licenseUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
      attribution: `${d.title} — NASA${d.center ? ` (${d.center})` : ""} — https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
      pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`, downloadUrl: "", previewUrl: preview,
      tags: (d.keywords ?? []).slice(0, 15), query, licenseRank: 3,
    });
  }
  return out;
}

/** NASA entrega los archivos en un manifiesto aparte: se resuelve al descargar. */
export async function resolveNasa(c: Candidate): Promise<string> {
  const r = await call<any>("nasa", "NASA Images", `https://images-api.nasa.gov/asset/${encodeURIComponent(c.sourceId)}`, {}, "asset");
  const hrefs: string[] = (r.collection?.items ?? []).map((x: any) => String(x.href).replace(/^http:/, "https:"));
  const pick = c.kind === "video"
    ? hrefs.find((h) => /~medium\.mp4$/.test(h)) ?? hrefs.find((h) => /~small\.mp4$/.test(h)) ?? hrefs.find((h) => /\.mp4$/.test(h))
    : hrefs.find((h) => /~large\.(jpe?g|png)$/i.test(h)) ?? hrefs.find((h) => /~orig\.(jpe?g|png)$/i.test(h)) ?? hrefs.find((h) => /\.(jpe?g|png)$/i.test(h));
  if (!pick) throw new Error("NASA no ofrece un archivo descargable para este elemento");
  return pick;
}

// ---------- The Met (obras en dominio público, CC0) ----------
async function met(query: string, kind: AssetKind, n: number): Promise<Candidate[]> {
  if (kind !== "image") return [];
  const s = await call<any>("met", "The Met", `https://collectionapi.metmuseum.org/public/collection/v1/search?${new URLSearchParams({ hasImages: "true", q: query })}`, {}, query);
  const out: Candidate[] = [];
  for (const id of (s.objectIDs ?? []).slice(0, Math.min(8, n * 2))) {
    try {
      const o = await call<any>("met", "The Met", `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, {}, String(id));
      if (!o.isPublicDomain || !o.primaryImage) continue;
      const c: Candidate = {
        source: "met", sourceId: String(id), kind, title: [o.title, o.objectDate].filter(Boolean).join(", "), author: o.artistDisplayName || o.culture || "The Met",
        license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "", pageUrl: o.objectURL,
        downloadUrl: o.primaryImage, previewUrl: o.primaryImageSmall || o.primaryImage, tags: (o.tags ?? []).map((t: any) => t.term).slice(0, 15), query, licenseRank: 3,
      };
      c.attribution = attributionText(c);
      out.push(c);
    } catch { /* objeto no disponible */ }
  }
  return out;
}

// ---------- Freesound (efectos de sonido y ambientes; CC0 y CC BY) ----------
async function freesound(query: string, kind: AssetKind, n: number): Promise<Candidate[]> {
  if (kind !== "sfx" && kind !== "music") return [];
  const token = await secrets.get(SECRET.freesoundApiKey);
  if (!token) return [];
  const dur = kind === "sfx" ? "duration:[0.1 TO 12]" : "duration:[45 TO 600]";
  const p = new URLSearchParams({
    query, filter: `license:("Creative Commons 0" OR "Attribution") ${dur}`, sort: "score", page_size: String(Math.min(30, n * 4)),
    fields: "id,name,tags,description,license,username,duration,previews,url,avg_rating,num_downloads", token,
  });
  const r = await call<any>("freesound", "Freesound", `https://freesound.org/apiv2/search/text/?${p}`, {}, query);
  const out: Candidate[] = [];
  for (const x of r.results ?? []) {
    const lic = normLicense(String(x.license ?? "").includes("publicdomain/zero") ? "cc0" : String(x.license ?? "").includes("/by/") ? `cc by ${String(x.license).match(/(\d\.\d)/)?.[1] ?? ""}` : String(x.license ?? ""));
    const url = x.previews?.["preview-hq-mp3"] ?? x.previews?.["preview-lq-mp3"];
    if (!lic || !url) continue;
    const c: Candidate = {
      source: "freesound", sourceId: String(x.id), kind, title: String(x.name ?? "").replace(/\.(wav|mp3|aiff?|flac|ogg)$/i, ""), author: x.username ?? "",
      license: lic.license, licenseUrl: x.license ?? lic.url, attribution: "", pageUrl: x.url, downloadUrl: url, previewUrl: url,
      duration: Number(x.duration ?? 0), tags: (x.tags ?? []).slice(0, 20), query, licenseRank: lic.rank + (Number(x.avg_rating ?? 0) >= 4 ? 0.3 : 0),
    };
    c.attribution = attributionText(c);
    out.push(c);
  }
  return out;
}

const IMPL: Record<SourceId, (q: string, k: AssetKind, n: number) => Promise<Candidate[]>> = { openverse, pexels, pixabay, wikimedia, nasa, met, freesound };

/** ¿La fuente está configurada (clave presente cuando hace falta)? */
export async function sourceReady(src: SourceId): Promise<boolean> {
  if (!getSettings().media.sources[src]) return false;
  if (src === "pexels") return !!(await secrets.get(SECRET.pexelsApiKey));
  if (src === "pixabay") return !!(await secrets.get(SECRET.pixabayApiKey));
  if (src === "freesound") return !!(await secrets.get(SECRET.freesoundApiKey));
  return true;
}

export interface SearchReport { candidates: Candidate[]; errors: { source: SourceId; message: string }[]; skipped: SourceId[] }

/** Busca en las fuentes habilitadas para el tipo, respetando cuotas. */
export async function searchSources(query: string, kind: AssetKind, n: number, only?: SourceId[]): Promise<SearchReport> {
  const rep: SearchReport = { candidates: [], errors: [], skipped: [] };
  const list = (only ?? SOURCES_FOR[kind]).filter((s) => SOURCES_FOR[kind].includes(s));
  await Promise.all(list.map(async (src) => {
    if (!(await sourceReady(src))) return;
    if (!(await hasQuota(src, src === "met" ? 6 : 1))) { rep.skipped.push(src); return; }
    try { rep.candidates.push(...(await IMPL[src](query, kind, n))); }
    catch (e) { rep.errors.push({ source: src, message: e instanceof Error ? e.message : String(e) }); }
  }));
  return rep;
}

/** Orden de preferencia: licencia sin atribución, resolución adecuada, posición en la fuente. */
export function rankCandidates(cs: Candidate[], kind: AssetKind, maxClip = 5): Candidate[] {
  const score = (c: Candidate, i: number) => {
    let s = c.licenseRank * 10 - i * 0.5;
    if (kind === "image") s += Math.min(4, ((c.width ?? 1200) / 1920) * 4);
    if (kind === "video") s += c.duration && c.duration >= 2 && c.duration <= 40 ? 3 : 0;
    if (kind === "sfx") s += c.duration && c.duration <= Math.max(3, maxClip) ? 2 : 0;
    return s;
  };
  // Intercala fuentes para no depender de una sola
  const bySrc = new Map<SourceId, Candidate[]>();
  for (const c of cs) { if (!bySrc.has(c.source)) bySrc.set(c.source, []); bySrc.get(c.source)!.push(c); }
  const scored: { c: Candidate; s: number }[] = [];
  for (const arr of bySrc.values()) arr.forEach((c, i) => scored.push({ c, s: score(c, i) }));
  return scored.sort((a, b) => b.s - a.s).map((x) => x.c);
}
