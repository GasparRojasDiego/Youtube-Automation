// Imágenes: generación (Gemini / OpenAI) y archivo libre (Wikimedia Commons),
// siempre con procedencia y licencia registradas.
import { fs, http } from "../lib/ipc";
import { getSettings, SECRET } from "../lib/settings";
import { addCost, assertBudget } from "../lib/costs";
import { requestJson, requireSecret, jsonHeaders } from "./net";
import { UserError } from "../lib/events";
import { stripHtml } from "../lib/util";

export interface Provenance {
  kind: "generated" | "archival" | "card" | "user";
  provider: string;
  prompt?: string;
  license?: string;
  attribution?: string;
  sourceUrl?: string;
  title?: string;
}

export interface ImageJob { prompt: string; outBase: string; aspect?: "16:9" | "9:16" | "1:1"; videoId?: string | null; channelId?: string | null; label?: string }
export interface ImageResult { path: string; provenance: Provenance; usd: number }

export function imagePrice(): number {
  const s = getSettings().images;
  return s.provider === "gemini" ? s.gemini.priceUsd : s.provider === "openai" ? s.openai.priceUsd : 0;
}

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

// ---------- Wikimedia Commons ----------
const FREE_LICENSE = /^(cc0|public domain|pd|pdm|cc by(-sa)?( \d(\.\d)?)?|cc-by(-sa)?|attribution|no restrictions|copyrighted free use)/i;
const NON_FREE = /(nc|nd|non-?commercial|no derivatives|fair use|non-free)/i;

export interface CommonsHit { title: string; url: string; thumb: string; width: number; height: number; license: string; artist: string; descriptionUrl: string }

export async function searchCommons(query: string, limit = 12): Promise<CommonsHit[]> {
  const url = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrsearch: `${query} filetype:bitmap`, gsrnamespace: "6",
    gsrlimit: String(limit), prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "1920", origin: "*",
  }).toString();
  const res = await requestJson<any>("Wikimedia Commons", { url, timeoutS: 60 }, 2);
  const pages = Object.values(res?.query?.pages ?? {}) as any[];
  const hits: CommonsHit[] = [];
  for (const p of pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const md = ii.extmetadata ?? {};
    const license = stripHtml(md.LicenseShortName?.value ?? md.License?.value ?? "");
    if (!license || NON_FREE.test(license) || !FREE_LICENSE.test(license)) continue;
    if (!/jpe?g|png/i.test(ii.mime ?? "") || (ii.width ?? 0) < 900) continue;
    hits.push({
      title: stripHtml(p.title.replace(/^File:/, "")), url: ii.url, thumb: ii.thumburl ?? ii.url,
      width: ii.width, height: ii.height, license,
      artist: stripHtml(md.Artist?.value ?? "Unknown").slice(0, 160), descriptionUrl: ii.descriptionurl ?? ii.url,
    });
  }
  return hits;
}

export async function downloadCommons(hit: CommonsHit, outBase: string): Promise<ImageResult> {
  const ext = /png$/i.test(hit.thumb) ? "png" : "jpg";
  const path = `${outBase}.${ext}`;
  await http.download(hit.thumb, path);
  return {
    path, usd: 0,
    provenance: { kind: "archival", provider: "Wikimedia Commons", license: hit.license, attribution: hit.artist, sourceUrl: hit.descriptionUrl, title: hit.title },
  };
}
