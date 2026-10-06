// YouTube: OAuth (bucle local + PKCE), Data API, subida, miniatura, Analytics y Reporting.
import { openUrl } from "@tauri-apps/plugin-opener";
import { oauth, secrets, youtubeUpload, fs, http } from "../lib/ipc";
import { SECRET } from "../lib/settings";
import { UserError } from "../lib/events";
import { requestJson, requireSecret, jsonHeaders } from "./net";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64url(digest) };
}

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

export async function connectYouTube(): Promise<string> {
  const clientId = await requireSecret(SECRET.youtubeClientId, "YouTube (ID de cliente OAuth)");
  const clientSecret = await requireSecret(SECRET.youtubeClientSecret, "YouTube (secreto de cliente OAuth)");
  const port = await oauth.listen();
  const redirect = `http://127.0.0.1:${port}`;
  const { verifier, challenge } = await pkce();
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const url = "https://accounts.google.com/o/oauth2/v2/auth?" + form({
    client_id: clientId, redirect_uri: redirect, response_type: "code", scope: SCOPES,
    code_challenge: challenge, code_challenge_method: "S256", access_type: "offline", prompt: "consent", state,
  });
  await openUrl(url);
  const q = await oauth.wait(port, 600);
  if (q.error) throw new UserError(`Google rechazó la autorización: ${q.error}`, "", "YouTube", false);
  if (q.state !== state) throw new UserError("La respuesta de Google no coincide con la solicitud (state).", "", "YouTube", false);
  const tok = await requestJson<any>("Google OAuth", {
    method: "POST", url: "https://oauth2.googleapis.com/token",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    bodyText: form({ code: q.code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: "authorization_code", code_verifier: verifier }),
  }, 1);
  if (!tok.refresh_token) throw new UserError("Google no entregó un token de actualización.", "Quita el acceso de ATRIL en myaccount.google.com/permissions y vuelve a conectar.", "YouTube", false);
  await secrets.set(SECRET.youtubeRefreshToken, tok.refresh_token);
  accessCache = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
  const ch = await myChannel();
  return ch?.snippet?.title ?? "(canal sin nombre)";
}

export async function disconnectYouTube() {
  await secrets.remove(SECRET.youtubeRefreshToken);
  accessCache = null;
}

let accessCache: { token: string; exp: number } | null = null;

export async function accessToken(): Promise<string> {
  if (accessCache && accessCache.exp > Date.now()) return accessCache.token;
  const refresh = await secrets.get(SECRET.youtubeRefreshToken);
  if (!refresh) throw new UserError("YouTube no está conectado.", "Conéctalo en Ajustes → YouTube.", "YouTube", false);
  const clientId = await requireSecret(SECRET.youtubeClientId, "YouTube (ID de cliente OAuth)");
  const clientSecret = await requireSecret(SECRET.youtubeClientSecret, "YouTube (secreto de cliente OAuth)");
  try {
    const tok = await requestJson<any>("Google OAuth", {
      method: "POST", url: "https://oauth2.googleapis.com/token",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      bodyText: form({ refresh_token: refresh, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
    }, 2);
    accessCache = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
    return tok.access_token;
  } catch (e) {
    if (e instanceof UserError && /invalid_grant|40[01]/.test(e.userMessage + e.detail))
      throw new UserError("La autorización de YouTube caducó o fue revocada.",
        "Vuelve a conectar en Ajustes → YouTube. Si pasa cada 7 días, cambia la pantalla de consentimiento OAuth de tu proyecto a «En producción».", "YouTube", false);
    throw e;
  }
}

const auth = async () => ({ Authorization: `Bearer ${await accessToken()}` });

export async function myChannel(): Promise<any | null> {
  const r = await requestJson<any>("YouTube", { url: "https://www.googleapis.com/youtube/v3/channels?part=snippet,status,statistics&mine=true", headers: await auth() });
  return r.items?.[0] ?? null;
}

// ---------- Lectura pública (clave de API) para referentes ----------
export async function resolveChannel(input: string): Promise<{ id: string; title: string; uploads: string; subs: number } | null> {
  const key = await requireSecret(SECRET.googleApiKey, "Google Cloud");
  const s = input.trim();
  let param: string;
  const idMatch = s.match(/(UC[\w-]{22})/);
  const handle = s.match(/@([\w.-]+)/);
  if (idMatch) param = `id=${idMatch[1]}`;
  else if (handle) param = `forHandle=${encodeURIComponent("@" + handle[1])}`;
  else param = `forHandle=${encodeURIComponent(s.startsWith("@") ? s : "@" + s)}`;
  const r = await requestJson<any>("YouTube Data API", { url: `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&${param}&key=${encodeURIComponent(key)}` });
  const it = r.items?.[0];
  if (!it) return null;
  return { id: it.id, title: it.snippet.title, uploads: it.contentDetails.relatedPlaylists.uploads, subs: Number(it.statistics?.subscriberCount ?? 0) };
}

export interface PublicVideo { id: string; title: string; publishedAt: string; durationS: number; views: number; likes: number; comments: number; thumb: string; description: string }

export function isoDurationToSeconds(iso: string): number {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0));
}

export async function channelVideos(uploadsPlaylist: string, max = 100): Promise<PublicVideo[]> {
  const key = await requireSecret(SECRET.googleApiKey, "Google Cloud");
  const ids: string[] = []; let page = "";
  while (ids.length < max) {
    const r = await requestJson<any>("YouTube Data API", { url: `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploadsPlaylist}${page ? `&pageToken=${page}` : ""}&key=${encodeURIComponent(key)}` });
    ids.push(...(r.items ?? []).map((i: any) => i.contentDetails.videoId));
    if (!r.nextPageToken) break; page = r.nextPageToken;
  }
  const out: PublicVideo[] = [];
  for (let i = 0; i < Math.min(ids.length, max); i += 50) {
    const r = await requestJson<any>("YouTube Data API", { url: `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.slice(i, i + 50).join(",")}&key=${encodeURIComponent(key)}` });
    for (const v of r.items ?? []) out.push({
      id: v.id, title: v.snippet.title, publishedAt: v.snippet.publishedAt, description: v.snippet.description ?? "",
      durationS: isoDurationToSeconds(v.contentDetails.duration ?? ""), views: +(v.statistics.viewCount ?? 0),
      likes: +(v.statistics.likeCount ?? 0), comments: +(v.statistics.commentCount ?? 0),
      thumb: v.snippet.thumbnails?.maxres?.url ?? v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.medium?.url ?? "",
    });
  }
  return out;
}

// ---------- Publicación ----------
export interface UploadMeta {
  title: string; description: string; tags: string[]; categoryId: string; defaultLanguage: string;
  privacy: "private" | "unlisted" | "public"; publishAt?: string | null; containsSyntheticMedia: boolean;
}

export function buildVideoResource(m: UploadMeta) {
  const status: any = {
    privacyStatus: m.publishAt ? "private" : m.privacy,
    selfDeclaredMadeForKids: false,
    containsSyntheticMedia: m.containsSyntheticMedia,
    embeddable: true,
    license: "youtube",
  };
  if (m.publishAt) status.publishAt = m.publishAt;
  return {
    snippet: { title: m.title.slice(0, 100), description: m.description.slice(0, 5000), tags: m.tags, categoryId: m.categoryId,
      defaultLanguage: m.defaultLanguage, defaultAudioLanguage: m.defaultLanguage },
    status,
  };
}

export async function uploadVideo(jobId: string, file: string, meta: UploadMeta, session?: string | null): Promise<any> {
  const token = await accessToken();
  const json = await youtubeUpload(jobId, file, JSON.stringify(buildVideoResource(meta)), token, session);
  return JSON.parse(json);
}

export async function setThumbnail(videoId: string, pngPath: string): Promise<void> {
  const b64 = await fs.readB64(pngPath);
  const res = await http.request({
    method: "POST", url: `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`,
    headers: { ...(await auth()), "Content-Type": pngPath.endsWith(".jpg") ? "image/jpeg" : "image/png" }, bodyB64: b64, timeoutS: 120,
  });
  if (res.status === 403) throw new UserError("YouTube no permitió subir la miniatura personalizada.",
    "El canal debe estar verificado por teléfono (youtube.com/verify). El video ya está subido; puedes poner la miniatura a mano en YouTube Studio.", "YouTube", false);
  if (res.status >= 300) throw new UserError(`No se pudo subir la miniatura (HTTP ${res.status}).`, res.body.slice(0, 1500), "YouTube");
}

export async function videoStatus(videoIds: string[]): Promise<any[]> {
  if (!videoIds.length) return [];
  const r = await requestJson<any>("YouTube", { url: `https://www.googleapis.com/youtube/v3/videos?part=status,statistics,snippet&id=${videoIds.join(",")}`, headers: await auth() });
  return r.items ?? [];
}

// ---------- Métricas propias ----------
export async function analyticsByVideo(videoIds: string[], startDate: string, endDate: string): Promise<Record<string, any>> {
  // Una consulta por video (filtro video==ID, sin dimensiones): forma documentada y estable.
  const h = await auth();
  const out: Record<string, any> = {};
  for (const id of videoIds) {
    const url = "https://youtubeanalytics.googleapis.com/v2/reports?" + new URLSearchParams({
      ids: "channel==MINE", startDate, endDate,
      metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes",
      filters: `video==${id}`,
    });
    const r = await requestJson<any>("YouTube Analytics", { url, headers: h });
    const cols = (r.columnHeaders ?? []).map((c: any) => c.name);
    const row = r.rows?.[0];
    if (row) { const o: any = { video: id }; cols.forEach((c: string, i: number) => (o[c] = row[i])); out[id] = o; }
  }
  return out;
}

export async function retentionCurve(videoId: string, startDate: string, endDate: string): Promise<{ t: number; watch: number; rel: number }[]> {
  const url = "https://youtubeanalytics.googleapis.com/v2/reports?" + new URLSearchParams({
    ids: "channel==MINE", startDate, endDate, dimensions: "elapsedVideoTimeRatio",
    metrics: "audienceWatchRatio,relativeRetentionPerformance", filters: `video==${videoId}`,
  });
  const r = await requestJson<any>("YouTube Analytics", { url, headers: await auth() });
  return (r.rows ?? []).map((row: number[]) => ({ t: row[0], watch: row[1], rel: row[2] }));
}

const REACH_REPORT = "channel_reach_basic_a1";

/** Crea (una vez) el trabajo de informes de alcance; los informes aparecen ~48 h después. */
export async function ensureReachJob(): Promise<string> {
  const h = await auth();
  const list = await requestJson<any>("YouTube Reporting", { url: "https://youtubereporting.googleapis.com/v1/jobs", headers: h });
  const job = (list.jobs ?? []).find((j: any) => j.reportTypeId === REACH_REPORT);
  if (job) return job.id;
  const created = await requestJson<any>("YouTube Reporting", {
    method: "POST", url: "https://youtubereporting.googleapis.com/v1/jobs", headers: { ...h, ...jsonHeaders },
    bodyText: JSON.stringify({ reportTypeId: REACH_REPORT, name: "ATRIL reach" }),
  });
  return created.id;
}

/** Devuelve impresiones y CTR por video y día de los informes disponibles. */
export async function reachRows(sinceIso?: string): Promise<{ day: string; video: string; impressions: number; ctr: number }[]> {
  const jobId = await ensureReachJob();
  const h = await auth();
  const reports = await requestJson<any>("YouTube Reporting", {
    url: `https://youtubereporting.googleapis.com/v1/jobs/${jobId}/reports${sinceIso ? `?createdAfter=${encodeURIComponent(sinceIso)}` : ""}`, headers: h,
  });
  const out: { day: string; video: string; impressions: number; ctr: number }[] = [];
  for (const rep of (reports.reports ?? []).slice(0, 60)) {
    const res = await http.request({ url: rep.downloadUrl, headers: h, timeoutS: 120 });
    if (res.status >= 300) continue;
    const lines = res.body.trim().split("\n");
    const head = lines.shift()?.split(",") ?? [];
    const iDay = head.indexOf("date"), iVid = head.indexOf("video_id"),
      iImp = head.indexOf("video_thumbnail_impressions"), iCtr = head.indexOf("video_thumbnail_impressions_ctr");
    if (iVid < 0 || iImp < 0) continue;
    for (const l of lines) {
      const c = l.split(",");
      out.push({ day: c[iDay], video: c[iVid], impressions: +c[iImp] || 0, ctr: iCtr >= 0 ? +c[iCtr] || 0 : 0 });
    }
  }
  return out;
}
