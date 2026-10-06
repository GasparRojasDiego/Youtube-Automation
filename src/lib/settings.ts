// Ajustes de la app (un solo documento JSON en la tabla settings).
import { db } from "./ipc";
import { safeJson } from "./util";
import { emit } from "./bus";

export type StageModelKey = "topics" | "research" | "script" | "verify" | "plan" | "package" | "analysis";

export interface AppSettings {
  theme: "dark" | "light";
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
    provider: "google" | "gemini" | "elevenlabs" | "own";
    google: { voice: string; languageCode: string; speakingRate: number; priceUsdPerMChars: number; freeCharsPerMonth: number };
    gemini: { model: string; voice: string; style: string; priceUsdPerMAudioTokens: number };
    elevenlabs: { voiceId: string; modelId: string; stability: number; similarity: number; style: number; speed: number; priceUsdPer1kChars: number };
  };
  images: {
    provider: "gemini" | "openai" | "none";
    gemini: { model: string; priceUsd: number };
    openai: { model: string; quality: string; size: string; priceUsd: number };
    useWikimedia: boolean;
    maxGenerated: { standard: number; premium: number };
    thumbnailCandidates: number;
  };
  budget: { monthlyPen: number; penPerUsd: number; warnAtPct: number; hardStop: boolean };
  publishing: {
    timeZone: string; time: string; categoryId: string; defaultLanguage: string;
    aiDisclosure: string; privacyPolicyUrl: string;
  };
  production: {
    targetMinutes: { standard: [number, number]; premium: [number, number] };
    scriptPasses: { standard: number; premium: number };
    autoRunToReview: boolean;
  };
  review: { dailyMinutesGoal: number };
  ffmpeg: { path: string; ffprobePath: string; encoder: "auto" | "h264_qsv" | "h264_mf" | "libx264"; quality: number };
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  activeChannelId: null,
  onboarded: false,
  claude: {
    path: "claude",
    extraArgs: "",
    models: { topics: "sonnet", research: "sonnet", script: "opus", verify: "opus", plan: "sonnet", package: "sonnet", analysis: "opus" },
    effort: { topics: "medium", research: "medium", script: "high", verify: "high", plan: "low", package: "medium", analysis: "high" },
    timeoutMin: 40,
  },
  tts: {
    provider: "google",
    google: { voice: "en-US-Chirp3-HD-Charon", languageCode: "en-US", speakingRate: 1.0, priceUsdPerMChars: 30, freeCharsPerMonth: 1_000_000 },
    gemini: { model: "gemini-2.5-flash-preview-tts", voice: "Charon", style: "Read in a calm, measured documentary tone:", priceUsdPerMAudioTokens: 10 },
    elevenlabs: { voiceId: "", modelId: "eleven_multilingual_v2", stability: 0.5, similarity: 0.75, style: 0.15, speed: 1.0, priceUsdPer1kChars: 0.08 },
  },
  images: {
    provider: "gemini",
    gemini: { model: "gemini-2.5-flash-image", priceUsd: 0.039 },
    openai: { model: "gpt-image-1-mini", quality: "low", size: "1536x1024", priceUsd: 0.006 },
    useWikimedia: true,
    maxGenerated: { standard: 10, premium: 30 },
    thumbnailCandidates: 3,
  },
  budget: { monthlyPen: 100, penPerUsd: 3.75, warnAtPct: 80, hardStop: true },
  publishing: {
    timeZone: "America/New_York",
    time: "12:00",
    categoryId: "27",
    defaultLanguage: "en",
    aiDisclosure: "Narration in this video uses an AI-generated voice. Some illustrations are AI-generated; every factual claim is sourced below.",
    privacyPolicyUrl: "",
  },
  production: {
    targetMinutes: { standard: [10, 13], premium: [12, 15] },
    scriptPasses: { standard: 1, premium: 2 },
    autoRunToReview: true,
  },
  review: { dailyMinutesGoal: 30 },
  ffmpeg: { path: "", ffprobePath: "", encoder: "auto", quality: 21 },
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
  current = deepMerge(DEFAULT_SETTINGS, safeJson(rows[0]?.value, {}));
  return current;
}

export const getSettings = () => current;

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
} as const;
