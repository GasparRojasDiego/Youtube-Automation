// YouTube: OAuth (bucle local + PKCE), subida y miniatura.
import { openUrl } from "@tauri-apps/plugin-opener";
import { oauth, secrets, youtubeUpload, fs, http } from "../lib/ipc";
import { SECRET } from "../lib/settings";
import { UserError } from "../lib/events";
import { requestJson, requireSecret } from "./net";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
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
