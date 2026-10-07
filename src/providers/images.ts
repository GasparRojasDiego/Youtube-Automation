// Imágenes generadas (opcional, de pago: Gemini u OpenAI), con procedencia registrada.
import { fs } from "../lib/ipc";
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

async function geminiImage(job: ImageJob): Promise<ImageResult> {
  const cfg = getSettings().images.gemini;
  const key = await requireSecret(SECRET.geminiApiKey, "Gemini");
  await assertBudget(cfg.priceUsd, "una imagen");
  const res = await requestJson<any>("Gemini (imágenes)", {
    method: "POST",
    url: `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${encodeURIComponent(key)}`,
    headers: jsonHeaders, timeoutS: 240,
    bodyText: JSON.stringify({
      contents: [{ parts: [{ text: job.prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: job.aspect ?? "16:9" } },
    }),
  });
  const parts: any[] = res?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) {
    const reason = res?.candidates?.[0]?.finishReason ?? res?.promptFeedback?.blockReason ?? "sin imagen";
    throw new UserError(`Gemini no generó la imagen (${reason}).`, `Ajusta la descripción de esa toma. Respuesta: ${JSON.stringify(res).slice(0, 600)}`, "Gemini (imágenes)", false);
  }
  const ext = String(img.inlineData.mimeType ?? "image/png").includes("jpeg") ? "jpg" : "png";
  const path = `${job.outBase}.${ext}`;
  await fs.writeB64(path, img.inlineData.data);
  await addCost({ videoId: job.videoId, channelId: job.channelId, provider: "gemini-image", item: job.label ?? "imagen", units: 1, usd: cfg.priceUsd });
  return { path, usd: cfg.priceUsd, provenance: { kind: "generated", provider: `Gemini ${cfg.model}`, prompt: job.prompt } };
}

async function openaiImage(job: ImageJob): Promise<ImageResult> {
  const cfg = getSettings().images.openai;
  const key = await requireSecret(SECRET.openaiApiKey, "OpenAI");
  await assertBudget(cfg.priceUsd, "una imagen");
  const size = job.aspect === "1:1" ? "1024x1024" : job.aspect === "9:16" ? "1024x1536" : cfg.size;
  const res = await requestJson<any>("OpenAI (imágenes)", {
    method: "POST", url: "https://api.openai.com/v1/images/generations", timeoutS: 240,
    headers: { ...jsonHeaders, Authorization: `Bearer ${key}` },
    bodyText: JSON.stringify({ model: cfg.model, prompt: job.prompt, size, quality: cfg.quality, n: 1 }),
  });
  const b64 = res?.data?.[0]?.b64_json;
  if (!b64) throw new UserError("OpenAI no devolvió la imagen.", JSON.stringify(res).slice(0, 600), "OpenAI (imágenes)");
  const path = `${job.outBase}.png`;
  await fs.writeB64(path, b64);
  await addCost({ videoId: job.videoId, channelId: job.channelId, provider: "openai-image", item: job.label ?? "imagen", units: 1, usd: cfg.priceUsd });
  return { path, usd: cfg.priceUsd, provenance: { kind: "generated", provider: `OpenAI ${cfg.model}`, prompt: job.prompt } };
}

export async function generateImage(job: ImageJob): Promise<ImageResult> {
  const p = getSettings().images.provider;
  if (p === "gemini") return geminiImage(job);
  if (p === "openai") return openaiImage(job);
  throw new UserError("No hay proveedor de imágenes configurado.", "Elige uno en Ajustes → Imágenes, o deja que el plan visual use tarjetas y archivo libre.", "imágenes", false);
}
