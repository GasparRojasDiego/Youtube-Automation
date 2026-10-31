// Voces: catálogo por proveedor e idioma, prueba con una frase de muestra (guardada para no pagarla dos
// veces) y la voz que corresponde a cada video (la elegida en su tarjeta o la de Ajustes en su idioma).
import { appPaths, fs, http, secrets } from "../lib/ipc";
import { getSettings, SECRET } from "../lib/settings";
import { joinPath, slugify } from "../lib/util";
import { synthesize, ttsProviderName, type VoiceOverride } from "./tts";

export type VoiceLang = "es" | "en";
export interface VoiceInfo { id: string; label: string; gender: "F" | "M" | ""; previewUrl?: string; note?: string }

/** Las 30 voces de Chirp 3 HD (Google) y de Gemini TTS: mismos nombres, cada una con su timbre. */
export const CHIRP3: { name: string; gender: "F" | "M" }[] = [
  ["Achernar", "F"], ["Achird", "M"], ["Algenib", "M"], ["Algieba", "M"], ["Alnilam", "M"], ["Aoede", "F"], ["Autonoe", "F"], ["Callirrhoe", "F"],
  ["Charon", "M"], ["Despina", "F"], ["Enceladus", "M"], ["Erinome", "F"], ["Fenrir", "M"], ["Gacrux", "F"], ["Iapetus", "M"], ["Kore", "F"],
  ["Laomedeia", "F"], ["Leda", "F"], ["Orus", "M"], ["Puck", "M"], ["Pulcherrima", "F"], ["Rasalgethi", "M"], ["Sadachbia", "M"], ["Sadaltager", "M"],
  ["Schedar", "M"], ["Sulafat", "F"], ["Umbriel", "M"], ["Vindemiatrix", "F"], ["Zephyr", "F"], ["Zubenelgenubi", "M"],
].map(([name, gender]) => ({ name, gender: gender as "F" | "M" }));

/** Código de idioma de Google para cada idioma de la app. */
export const GOOGLE_LANG: Record<VoiceLang, string> = { es: "es-US", en: "en-US" };
const isGoogleName = (x?: string | null) => !!x && /^[a-z]{2,3}-[A-Z]{2}-/.test(x);
export const shortVoiceName = (id: string) => id.replace(/^[a-z]{2,3}-[A-Z]{2}-(Chirp3-HD-)?/, "");

/**
 * Voz de un video. Google (Chirp 3 HD) tiene una voz por idioma: la elegida para el video si es de
 * Google, o la de Ajustes para ese idioma (en español, la de Ajustes o la misma voz en su versión
 * latinoamericana). Gemini y ElevenLabs son multilingües: la elegida o la de Ajustes.
 */
export function voiceOverride(provider: string, base: VoiceOverride, lang: string, chosen?: string | null): VoiceOverride {
  const g = getSettings().tts.google;
  if (provider !== "google") return { ...base, ...(chosen && !isGoogleName(chosen) ? { voice: chosen } : {}) };
  let name = isGoogleName(chosen) ? chosen! : "";
  if (name && lang === "es" && !name.startsWith("es-")) name = "";   // una voz inglesa no narra un video en español
  if (name && lang !== "es" && name.startsWith("es-")) name = "";
  if (!name && lang === "es") name = isGoogleName(g.voiceEs) ? g.voiceEs : `es-US-Chirp3-HD-${/-Chirp3-HD-(\w+)$/.exec(base.voice || g.voice)?.[1] ?? "Charon"}`;
  if (!name) name = base.voice || g.voice;
  return { ...base, voice: name, languageCode: name.split("-").slice(0, 2).join("-") };
}

/** Voz que usará un idioma si el video no elige otra (para mostrarla en la interfaz). */
export function defaultVoice(lang: VoiceLang): string {
  const provider = ttsProviderName();
  const st = getSettings().tts;
  if (provider === "google") return voiceOverride("google", {}, lang).voice ?? st.google.voice;
  if (provider === "gemini") return st.gemini.voice;
  return st.elevenlabs.voiceId;
}

/** Catálogo de voces del proveedor activo en un idioma (en línea si se puede; si no, la lista conocida). */
export async function listVoices(lang: VoiceLang, provider = ttsProviderName()): Promise<VoiceInfo[]> {
  if (provider === "elevenlabs") {
    const key = await secrets.get(SECRET.elevenlabsApiKey);
    if (!key) return [];
    const r = await http.request({ url: "https://api.elevenlabs.io/v1/voices", headers: { "xi-api-key": key }, timeoutS: 30 });
    if (r.status >= 300) throw new Error(`ElevenLabs respondió ${r.status}`);
    return ((JSON.parse(r.body).voices ?? []) as any[]).map((x) => ({
      id: String(x.voice_id), label: String(x.name ?? x.voice_id), previewUrl: x.preview_url || undefined,
      gender: /female|mujer/i.test(String(x.labels?.gender ?? "")) ? "F" : /male|hombre/i.test(String(x.labels?.gender ?? "")) ? "M" : "",
      note: [x.labels?.accent, x.labels?.description, x.labels?.use_case].filter(Boolean).join(" · "),
    }));
  }
  if (provider === "gemini") return CHIRP3.map((v) => ({ id: v.name, label: v.name, gender: v.gender }));
  // Google: el catálogo real (nombres y voces nuevas), filtrado a Chirp 3 HD; sin red, la lista conocida
  const code = GOOGLE_LANG[lang];
  const fallback = CHIRP3.map((v) => ({ id: `${code}-Chirp3-HD-${v.name}`, label: v.name, gender: v.gender }));
  try {
    const key = await secrets.get(SECRET.googleApiKey);
    if (!key) return fallback;
    const r = await http.request({ url: `https://texttospeech.googleapis.com/v1/voices?languageCode=${code}`, headers: { "x-goog-api-key": key }, timeoutS: 30 });
    if (r.status >= 300) return fallback;
    const list = ((JSON.parse(r.body).voices ?? []) as any[]).filter((x) => /Chirp3-HD-/.test(String(x.name)) && (x.languageCodes ?? []).includes(code))
      .map((x) => ({ id: String(x.name), label: shortVoiceName(String(x.name)), gender: x.ssmlGender === "FEMALE" ? "F" as const : x.ssmlGender === "MALE" ? "M" as const : "" as const }));
    return list.length ? list.sort((a, b) => a.label.localeCompare(b.label)) : fallback;
  } catch { return fallback; }
}

export const SAMPLE: Record<VoiceLang, string> = {
  es: "Hola. Así sonará la narración de tus videos: clara, cercana y con buen ritmo. ¿Empezamos?",
  en: "Hi there. This is how the narration of your videos will sound: clear, warm and well paced. Shall we begin?",
};

/** Archivo de audio con la frase de muestra en esa voz (se crea una sola vez). */
export async function previewVoice(voice: VoiceInfo, lang: VoiceLang, provider = ttsProviderName()): Promise<string> {
  const dir = joinPath((await appPaths()).data, "voces");
  await fs.mkdir(dir);
  const base = joinPath(dir, `${provider}-${slugify(voice.id, 60)}-${lang}`);
  for (const ext of ["wav", "mp3"]) if (await fs.exists(`${base}.${ext}`)) return `${base}.${ext}`;
  // ElevenLabs publica una muestra de cada voz: se descarga sin gastar caracteres
  if (provider === "elevenlabs" && voice.previewUrl) { await http.download(voice.previewUrl, `${base}.mp3`); return `${base}.mp3`; }
  const over: VoiceOverride = provider === "google" ? { provider, voice: voice.id, languageCode: voice.id.split("-").slice(0, 2).join("-") } : { provider, voice: voice.id };
  return (await synthesize({ text: SAMPLE[lang], outPath: base, override: over })).path;
}
