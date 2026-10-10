// Ajustes de la app (un solo documento JSON en la tabla settings).
import { db } from "./ipc";
import { safeJson } from "./util";
import { emit } from "./bus";

export type StageModelKey = "topics" | "research" | "script" | "verify" | "package" | "analysis" | "storyboard" | "vision" | "polish" | "motion" | "fix" | "critique";

export interface AppSettings {
  settingsVersion: number;
  theme: "system" | "dark" | "light";
  profile: { name: string; avatar: string; id: string };   // avatar: archivo en la carpeta de datos
  activeChannelId: string | null;
  onboarded: boolean;
  claude: {
    path: string;
    extraArgs: string;
    models: Record<StageModelKey, string>;
    effort: Record<StageModelKey, string>;
    timeoutMin: number;
  };
  tts: {
    provider: "google" | "gemini" | "elevenlabs";
    google: { voice: string; languageCode: string; speakingRate: number; priceUsdPerMChars: number; freeCharsPerMonth: number };
    gemini: { model: string; voice: string; style: string; priceUsdPerMAudioTokens: number };
    elevenlabs: { voiceId: string; modelId: string; stability: number; similarity: number; style: number; speed: number; priceUsdPer1kChars: number };
  };
  images: {
    provider: "auto" | "gemini" | "openai" | "none";   // auto = el que tenga clave (OpenAI primero)
    gemini: { model: string; priceUsd: number };
    openai: { model: string; quality: string; size: string; priceUsd: number };
    perVideo: number;                   // tope de imágenes generadas por video
    thumbnailCandidates: number;
  };
  sfx: {
    elevenlabs: boolean;                // crear efectos con ElevenLabs si hay clave (mejor calidad)
    maxGenerated: number;               // efectos creados con ElevenLabs por video
    priceUsdPerSecond: number;          // estimado (40 créditos por segundo)
  };
  publishing: {
    timeZone: string; time: string; categoryId: string; defaultLanguage: string;
    aiDisclosure: string; privacyPolicyUrl: string;
  };
  production: {
    targetMinutes: [number, number];
    scriptPasses: number;
    autoRunToReview: boolean;
    verifyMode: "auto" | "off";        // auto = revisa datos y corrige solo, sin detenerse
  };
  media: {
    libraryDir: string;                 // vacío = Documentos\ATRIL\Biblioteca
    sources: Record<"openverse" | "pexels" | "pixabay" | "wikimedia" | "nasa" | "met" | "freesound", boolean>;
    candidatesPerBeat: number;          // candidatos descargados por toma cuando la biblioteca no basta
    allowGenerated: boolean;            // permitir imágenes generadas (con costo) cuando no hay material libre
    visionBatch: number;                // imágenes por llamada de visión
    maxClipSeconds: number;
  };
  motion: {
    enabled: boolean;
    browserPath: string;                // vacío = Microsoft Edge o Google Chrome detectados
    perVideo: number;
    critique: boolean;                  // revisión visual de cada animación y su corrección
    parallel: number;                   // animaciones que Claude diseña a la vez
    renders: number;                    // animaciones que el navegador renderiza a la vez (memoria)
    maxFixes: number;                   // correcciones como máximo por animación
  };
  assets: { parallel: number };         // tomas que se buscan y descargan a la vez
  ffmpeg: { path: string; encoder: "auto" | "h264_qsv" | "h264_mf" | "libx264"; quality: number };
}

export const SETTINGS_VERSION = 24;

export const DEFAULT_SETTINGS: AppSettings = {
  settingsVersion: SETTINGS_VERSION,
  theme: "system",
  profile: { name: "", avatar: "", id: "" },
  activeChannelId: null,
  onboarded: false,
  claude: {
    path: "claude",
    extraArgs: "",
    models: { topics: "sonnet", research: "sonnet", script: "opus", verify: "sonnet", package: "sonnet", analysis: "sonnet",
      storyboard: "sonnet", vision: "sonnet", polish: "opus", motion: "opus", fix: "opus", critique: "sonnet" },
    effort: { topics: "medium", research: "medium", script: "high", verify: "medium", package: "medium", analysis: "medium",
      storyboard: "medium", vision: "low", polish: "high", motion: "high", fix: "high", critique: "low" },
    timeoutMin: 40,
  },
  tts: {
    provider: "google",
    google: { voice: "en-US-Chirp3-HD-Charon", languageCode: "en-US", speakingRate: 1.0, priceUsdPerMChars: 30, freeCharsPerMonth: 1_000_000 },
    gemini: { model: "gemini-2.5-flash-preview-tts", voice: "Charon", style: "Read in a calm, measured documentary tone:", priceUsdPerMAudioTokens: 10 },
    elevenlabs: { voiceId: "", modelId: "eleven_multilingual_v2", stability: 0.5, similarity: 0.75, style: 0.15, speed: 1.0, priceUsdPer1kChars: 0.08 },
  },
  images: {
    provider: "auto",
    gemini: { model: "gemini-3.1-flash-image-preview", priceUsd: 0.067 },
    openai: { model: "gpt-image-2", quality: "medium", size: "1536x1024", priceUsd: 0.05 },
    perVideo: 15,
    thumbnailCandidates: 3,
  },
  sfx: { elevenlabs: false, maxGenerated: 25, priceUsdPerSecond: 0.007 },
  publishing: {
    timeZone: "America/New_York",
    time: "12:00",
    categoryId: "27",
    defaultLanguage: "en",
    aiDisclosure: "Narration in this video uses an AI-generated voice. Sources are listed below.",
    privacyPolicyUrl: "",
  },
  production: {
    targetMinutes: [10, 13],
    scriptPasses: 1,
    autoRunToReview: true,
    verifyMode: "auto",
  },
  media: {
    libraryDir: "",
    sources: { openverse: true, pexels: true, pixabay: true, wikimedia: true, nasa: true, met: true, freesound: true },
    candidatesPerBeat: 3,
    allowGenerated: true,
    visionBatch: 10,
    maxClipSeconds: 5,
  },
  motion: { enabled: true, browserPath: "", perVideo: 10, critique: true, parallel: 4, renders: 2, maxFixes: 2 },
  assets: { parallel: 4 },
  ffmpeg: { path: "", encoder: "auto", quality: 21 },
};

function deepMerge<T>(base: T, over: any): T {
  if (Array.isArray(base) || typeof base !== "object" || base === null) return (over ?? base) as T;
  const out: any = { ...base };
  for (const k of Object.keys(over ?? {})) {
    const b = (base as any)[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) ? deepMerge(b, over[k]) : over[k];
  }
  return out;
}

let current: AppSettings = DEFAULT_SETTINGS;

export async function loadSettings(): Promise<AppSettings> {
  const rows = await db.query<{ value: string }>("SELECT value FROM settings WHERE key='app'");
  const saved = safeJson<any>(rows[0]?.value, {});
  current = deepMerge(DEFAULT_SETTINGS, saved);
  if (rows[0] && (saved.settingsVersion ?? 0) < SETTINGS_VERSION) current = await migrateSettings(current, saved.settingsVersion ?? 0);
  if (!current.profile.id) await saveSettings((x) => ({ ...x, profile: { ...x.profile, id: profileId() } }));
  return current;
}

/** Ajusta valores guardados de versiones anteriores (modelos retirados, topes nuevos). */
async function migrateSettings(s: AppSettings, from: number): Promise<AppSettings> {
  if (from < 22) {
    if (s.images.provider === "gemini" || (s.images.provider as string) === "none") s.images.provider = "auto";
    if (/^gemini-2\.5-flash-image/.test(s.images.gemini.model)) s.images.gemini = { model: "gemini-3.1-flash-image-preview", priceUsd: 0.067 };
    if (s.images.openai.model === "gpt-image-1-mini" && s.images.openai.quality === "low") s.images.openai = { model: "gpt-image-2", quality: "medium", size: "1536x1024", priceUsd: 0.05 };
    s.media.allowGenerated = true;
    if (s.claude.models.verify === "opus") { s.claude.models.verify = "sonnet"; s.claude.effort.verify = "medium"; }
    if (/Every factual claim is sourced below/.test(s.publishing.aiDisclosure)) s.publishing.aiDisclosure = s.publishing.aiDisclosure.replace("Every factual claim is sourced below.", "Sources are listed below.");
    s.production.autoRunToReview = true;
  }
  if (from < 23) {
    // Una sola categoría de video (sin estándar/premium), voz siempre sintética, modelo propio para corregir animaciones
    const std = (x: any, d: any) => (x && typeof x === "object" && !Array.isArray(x) ? x.standard ?? d : x ?? d);
    s.images.perVideo = std(s.images.perVideo, 15);
    s.motion.perVideo = Math.max(10, std(s.motion.perVideo, 10));
    s.production.targetMinutes = std(s.production.targetMinutes, [10, 13]);
    s.production.scriptPasses = std(s.production.scriptPasses, 1);
    if ((s.tts.provider as string) === "own") s.tts.provider = "google";
    if (!s.claude.models.fix) { s.claude.models.fix = s.claude.models.motion || "opus"; s.claude.effort.fix = s.claude.effort.motion || "high"; }
    for (const k of ["budget", "review", "ui"]) delete (s as any)[k];
  }
  if (from < 24) delete (s.motion as any).perCall;   // ahora cada animación va en su propia llamada, en paralelo
  s.settingsVersion = SETTINGS_VERSION;
  await db.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('app',?)", [JSON.stringify(s)]);
  return s;
}

export const getSettings = () => current;

/** ID de usuario: 12 caracteres sin ambigüedad (sin 0/O ni 1/I/L), generado una vez. */
export function profileId(): string {
  const A = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => A[b % A.length]).join("");
}

/** ¿Tema oscuro? «system» sigue al dispositivo. */
export const isDark = (t = current.theme) => t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);

export async function saveSettings(patch: Partial<AppSettings> | ((s: AppSettings) => AppSettings)): Promise<AppSettings> {
  current = typeof patch === "function" ? patch(structuredClone(current)) : deepMerge(current, patch);
  await db.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('app',?)", [JSON.stringify(current)]);
  emit("settings");
  return current;
}

// Claves de credenciales (Administrador de credenciales de Windows)
export const SECRET = {
  googleApiKey: "google_api_key",          // TTS, YouTube Data API (lectura pública)
  geminiApiKey: "gemini_api_key",          // Gemini (imágenes, TTS Gemini)
  openaiApiKey: "openai_api_key",
  elevenlabsApiKey: "elevenlabs_api_key",
  youtubeClientId: "youtube_client_id",
  youtubeClientSecret: "youtube_client_secret",
  youtubeRefreshToken: "youtube_refresh_token",
  pexelsApiKey: "pexels_api_key",
  pixabayApiKey: "pixabay_api_key",
  freesoundApiKey: "freesound_api_key",
  openverseClientId: "openverse_client_id",
  openverseClientSecret: "openverse_client_secret",
} as const;
