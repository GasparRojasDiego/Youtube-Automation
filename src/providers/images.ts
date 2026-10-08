// Imágenes generadas con IA (Gemini u OpenAI), con procedencia registrada.
// Si el modelo elegido ya no existe, se prueba el siguiente de la lista.
import { fs, secrets } from "../lib/ipc";
import { getSettings, SECRET } from "../lib/settings";
import { addCost, assertBudget } from "../lib/costs";
import { requestJson, requireSecret, jsonHeaders } from "./net";
import { UserError } from "../lib/events";

export interface Provenance {
  kind: "generated" | "archival" | "stock" | "card" | "motion" | "user";
  provider: string;
  prompt?: string;
  license?: string;
  attribution?: string;
  sourceUrl?: string;
  title?: string;
  assetId?: string;
}

export interface ImageJob { prompt: string; outBase: string; aspect?: "16:9" | "9:16" | "1:1"; videoId?: string | null; channelId?: string | null; label?: string }
export interface ImageResult { path: string; provenance: Provenance; usd: number }

/** Modelos conocidos (octubre 2026), del preferido al de respaldo. */
export const GEMINI_IMAGE_MODELS = ["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview", "gemini-2.5-flash-image"];
export const OPENAI_IMAGE_MODELS = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1-mini"];

const notFound = (e: unknown) => e instanceof UserError && /\b404\b|not found|does not exist|no longer|deprecat|unsupported model|model_not_found|invalid model/i.test(`${e.userMessage} ${e.detail}`);
const chain = (first: string, list: string[]) => [first, ...list.filter((m) => m !== first)];

async function geminiOnce(model: string, key: string, job: ImageJob) {
  const res = await requestJson<any>("Gemini (imágenes)", {
    method: "POST",
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    headers: { ...jsonHeaders, "x-goog-api-key": key }, timeoutS: 240,
    bodyText: JSON.stringify({
      contents: [{ parts: [{ text: job.prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: job.aspect ?? "16:9" } },
    }),
  });
  const parts: any[] = res?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) {
    const reason = res?.candidates?.[0]?.finishReason ?? res?.promptFeedback?.blockReason ?? "sin imagen";
    throw new UserError(`Gemini no generó la imagen (${reason}).`, `Respuesta: ${JSON.stringify(res).slice(0, 600)}`, "Gemini (imágenes)", false);
  }
  return img.inlineData as { data: string; mimeType?: string };
}

async function geminiImage(job: ImageJob): Promise<ImageResult> {
  const cfg = getSettings().images.gemini;
  const key = await requireSecret(SECRET.geminiApiKey, "Gemini");
  await assertBudget(cfg.priceUsd, "una imagen");
  let last: unknown = null;
  for (const model of chain(cfg.model, GEMINI_IMAGE_MODELS)) {
    try {
      const img = await geminiOnce(model, key, job);
      const ext = String(img.mimeType ?? "image/png").includes("jpeg") ? "jpg" : "png";
      const path = `${job.outBase}.${ext}`;
      await fs.writeB64(path, img.data);
      await addCost({ videoId: job.videoId, channelId: job.channelId, provider: "gemini-image", item: job.label ?? "imagen", units: 1, usd: cfg.priceUsd });
      return { path, usd: cfg.priceUsd, provenance: { kind: "generated", provider: `Gemini ${model}`, prompt: job.prompt } };
    } catch (e) { last = e; if (!notFound(e)) throw e; }
  }
  throw last;
}

async function openaiImage(job: ImageJob): Promise<ImageResult> {
  const cfg = getSettings().images.openai;
  const key = await requireSecret(SECRET.openaiApiKey, "OpenAI");
  await assertBudget(cfg.priceUsd, "una imagen");
  const size = job.aspect === "1:1" ? "1024x1024" : job.aspect === "9:16" ? "1024x1536" : cfg.size;
  let last: unknown = null;
  for (const model of chain(cfg.model, OPENAI_IMAGE_MODELS)) {
    try {
      const res = await requestJson<any>("OpenAI (imágenes)", {
        method: "POST", url: "https://api.openai.com/v1/images/generations", timeoutS: 240,
        headers: { ...jsonHeaders, Authorization: `Bearer ${key}` },
        bodyText: JSON.stringify({ model, prompt: job.prompt, size, quality: cfg.quality, n: 1 }),
      });
      const b64 = res?.data?.[0]?.b64_json;
      if (!b64) throw new UserError("OpenAI no devolvió la imagen.", JSON.stringify(res).slice(0, 600), "OpenAI (imágenes)");
      const path = `${job.outBase}.png`;
      await fs.writeB64(path, b64);
      await addCost({ videoId: job.videoId, channelId: job.channelId, provider: "openai-image", item: job.label ?? "imagen", units: 1, usd: cfg.priceUsd });
      return { path, usd: cfg.priceUsd, provenance: { kind: "generated", provider: `OpenAI ${model}`, prompt: job.prompt } };
    } catch (e) { last = e; if (!notFound(e)) throw e; }
  }
  throw last;
}

/** Proveedor efectivo: el elegido, o en «auto» el que tenga clave (OpenAI primero, más barato por imagen). */
export async function imageProvider(): Promise<"gemini" | "openai" | null> {
  const p = getSettings().images.provider;
  if (p === "none") return null;
  const hasO = !!(await secrets.get(SECRET.openaiApiKey));
  const hasG = !!(await secrets.get(SECRET.geminiApiKey));
  if (p === "openai") return hasO ? "openai" : null;
  if (p === "gemini") return hasG ? "gemini" : null;
  return hasO ? "openai" : hasG ? "gemini" : null;
}

export async function generateImage(job: ImageJob): Promise<ImageResult> {
  const p = await imageProvider();
  if (p === "gemini") return geminiImage(job);
  if (p === "openai") return openaiImage(job);
  throw new UserError("No hay proveedor de imágenes con clave.", "Pon una clave de OpenAI o Gemini en Ajustes → Claves.", "imágenes", false);
}
