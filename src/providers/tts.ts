// Voz sintética: Google Cloud TTS (Chirp 3 HD), Gemini TTS y ElevenLabs.
// Todos escriben un archivo de audio por fragmento; el pipeline los une.
import { fs } from "../lib/ipc";
import { getSettings, SECRET } from "../lib/settings";
import { addCost, monthUnits } from "../lib/costs";
import { requestJson, requireSecret, jsonHeaders } from "./net";
import { UserError } from "../lib/events";

export interface VoiceOverride { voice?: string; speakingRate?: number; style?: string; provider?: string }

export interface TtsJob { text: string; outPath: string; videoId?: string | null; channelId?: string | null; override?: VoiceOverride }
export interface TtsResult { path: string; ext: string }

/** Divide el texto en trozos que respeten el límite de bytes por petición. */
export function chunkText(text: string, maxBytes = 4200): string[] {
  const enc = new TextEncoder();
  const sentences = text.match(/[^.!?]+[.!?]+["'”’)]*\s*|[^.!?]+$/g) ?? [text];
  const chunks: string[] = []; let cur = "";
  for (const s of sentences) {
    if (enc.encode(cur + s).length > maxBytes && cur) { chunks.push(cur.trim()); cur = ""; }
    if (enc.encode(s).length > maxBytes) {
      for (const w of s.split(/(?<=,)\s+/)) {
        if (enc.encode(cur + w).length > maxBytes && cur) { chunks.push(cur.trim()); cur = ""; }
        cur += w + " ";
      }
    } else cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

/** Envuelve PCM s16le en un contenedor WAV. */
export function pcmToWavB64(pcmB64: string, sampleRate = 24000, channels = 1): string {
  const pcm = Uint8Array.from(atob(pcmB64), (c) => c.charCodeAt(0));
  const header = new ArrayBuffer(44); const v = new DataView(header);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length, true);
  const all = new Uint8Array(44 + pcm.length); all.set(new Uint8Array(header), 0); all.set(pcm, 44);
  let bin = ""; const step = 0x8000;
  for (let i = 0; i < all.length; i += step) bin += String.fromCharCode(...all.subarray(i, i + step));
  return btoa(bin);
}

async function googleTts(job: TtsJob): Promise<TtsResult> {
  const cfg = getSettings().tts.google;
  const key = await requireSecret(SECRET.googleApiKey, "Google Cloud");
  const chars = job.text.length;
  const used = await monthUnits("google-tts", "caracteres");
  const billable = Math.max(0, used + chars - cfg.freeCharsPerMonth) - Math.max(0, used - cfg.freeCharsPerMonth);
  const usd = (billable / 1_000_000) * cfg.priceUsdPerMChars;
  const voice = job.override?.voice || cfg.voice;
  const body: any = {
    input: { text: job.text },
    voice: { languageCode: cfg.languageCode, name: voice },
    audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 },
  };
  const rate = job.override?.speakingRate ?? cfg.speakingRate;
  if (rate && rate !== 1) body.audioConfig.speakingRate = rate;
  const res = await requestJson<{ audioContent: string }>("Google TTS", {
    method: "POST", url: "https://texttospeech.googleapis.com/v1/text:synthesize",
    headers: { ...jsonHeaders, "x-goog-api-key": key }, bodyText: JSON.stringify(body), timeoutS: 180,
  });
  if (!res.audioContent) throw new UserError("Google TTS no devolvió audio.", JSON.stringify(res).slice(0, 500), "Google TTS");
  const path = job.outPath + ".wav";
  await fs.writeB64(path, res.audioContent);
  await addCost({ videoId: job.videoId, channelId: job.channelId, provider: "google-tts", item: "caracteres", units: chars, usd });
  return { path, ext: "wav" };
}

async function geminiTts(job: TtsJob): Promise<TtsResult> {
  const cfg = getSettings().tts.gemini;
  const key = await requireSecret(SECRET.geminiApiKey, "Gemini");
  const estTokens = (job.text.split(/\s+/).length / 2.5) * 32; // ~2,5 palabras/s, 32 tokens/s
  const style = job.override?.style ?? cfg.style;
  const res = await requestJson<any>("Gemini TTS", {
    method: "POST",
    url: `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`,
    headers: { ...jsonHeaders, "x-goog-api-key": key }, timeoutS: 300,
    bodyText: JSON.stringify({
      contents: [{ parts: [{ text: style ? `${style}\n\n${job.text}` : job.text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: job.override?.voice || cfg.voice } } } },
    }),
  });
  const part = res?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
  if (!part) throw new UserError("Gemini TTS no devolvió audio.", JSON.stringify(res).slice(0, 800), "Gemini TTS");
  const rateMatch = String(part.inlineData.mimeType ?? "").match(/rate=(\d+)/);
  const path = job.outPath + ".wav";
  await fs.writeB64(path, pcmToWavB64(part.inlineData.data, rateMatch ? Number(rateMatch[1]) : 24000));
  const tokens = Number(res?.usageMetadata?.candidatesTokenCount ?? estTokens);
  await addCost({ videoId: job.videoId, channelId: job.channelId, provider: "gemini-tts", item: "tokens de audio", units: tokens, usd: (tokens / 1_000_000) * cfg.priceUsdPerMAudioTokens });
  return { path, ext: "wav" };
}

async function elevenTts(job: TtsJob): Promise<TtsResult> {
  const cfg = getSettings().tts.elevenlabs;
  const key = await requireSecret(SECRET.elevenlabsApiKey, "ElevenLabs");
  const voiceId = job.override?.voice || cfg.voiceId;
  if (!voiceId) throw new UserError("Falta el ID de voz de ElevenLabs.", "Indícalo en Ajustes → Voz.", "ElevenLabs", false);
  const usd = (job.text.length / 1000) * cfg.priceUsdPer1kChars;
  const res = await requestJson<any>("ElevenLabs", {
    method: "POST", url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    headers: { ...jsonHeaders, "xi-api-key": key, Accept: "audio/mpeg" }, response: "base64", timeoutS: 300,
    bodyText: JSON.stringify({ text: job.text, model_id: cfg.modelId,
      voice_settings: { stability: cfg.stability, similarity_boost: cfg.similarity, style: cfg.style, speed: job.override?.speakingRate ?? cfg.speed } }),
  });
  const path = job.outPath + ".mp3";
  await fs.writeB64(path, res.body);
  await addCost({ videoId: job.videoId, channelId: job.channelId, provider: "elevenlabs", item: "caracteres", units: job.text.length, usd });
  return { path, ext: "mp3" };
}

export function ttsProviderName(override?: VoiceOverride): string {
  return (override?.provider as string) || getSettings().tts.provider;
}

export async function synthesize(job: TtsJob): Promise<TtsResult> {
  const p = ttsProviderName(job.override);
  if (p === "google") return googleTts(job);
  if (p === "gemini") return geminiTts(job);
  if (p === "elevenlabs") return elevenTts(job);
  throw new UserError(`Proveedor de voz desconocido: ${p}.`, "Elige uno en Ajustes → Voz.", "voz", false);
}

/** Efecto de sonido creado con ElevenLabs (texto → audio). Requiere plan de pago para uso comercial. */
export async function elevenSoundEffect(o: { prompt: string; seconds: number; outPath: string; videoId?: string | null; channelId?: string | null }): Promise<string> {
  const key = await requireSecret(SECRET.elevenlabsApiKey, "ElevenLabs");
  const seconds = Math.min(30, Math.max(0.5, Math.round(o.seconds * 10) / 10));
  const usd = seconds * getSettings().sfx.priceUsdPerSecond;
  const res = await requestJson<any>("ElevenLabs (efectos)", {
    method: "POST", url: "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
    headers: { ...jsonHeaders, "xi-api-key": key, Accept: "audio/mpeg" }, response: "base64", timeoutS: 180,
    bodyText: JSON.stringify({ text: o.prompt, duration_seconds: seconds, prompt_influence: 0.45 }),
  }, 1);
  await fs.writeB64(o.outPath, res.body);
  await addCost({ videoId: o.videoId, channelId: o.channelId, provider: "elevenlabs-sfx", item: "segundos de efecto", units: seconds, usd });
  return o.outPath;
}
