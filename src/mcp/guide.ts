// Guía para Claude: secciones de docs/guia-cola-marketing.md (una sola fuente de verdad, la misma que
// usa el chat de marketing) y catálogos generados del código (modos, tipografías, piezas, voces).
import GUIDE from "../../docs/guia-cola-marketing.md?raw";
import { TONES, AESTHETIC_EXAMPLE } from "../pipeline/personal";
import { FONT_FAMILIES } from "../motion/page";
import { PIECES } from "../motion/pieces";
import { listVoices, type VoiceLang } from "../providers/voices";
import { ttsProviderName } from "../providers/tts";

/** Sección de la guía por su número («4.1», «8»): del encabezado hasta el siguiente del mismo nivel o superior. */
export function guideSection(num: string, md = GUIDE): string {
  const lines = md.split("\n");
  const level = num.includes(".") ? 3 : 2;
  const start = lines.findIndex((l) => new RegExp(`^#{${level}} ${num.replace(".", "\\.")}[ .]`).test(l));
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{2,3}) /.exec(lines[i]);
    if (m && m[1].length <= level && !(level === 2 && m[1].length === 3)) { end = i; break; }
  }
  return lines.slice(start, end).join("\n").replace(/\n---\s*$/, "").trim();
}

const OVERVIEW = `# ATRIL desde Claude (MCP)
ATRIL es la app de escritorio de VT Asvent que produce videos completos: investigación → guion → verificación → voz → storyboard → medios → retoques → animaciones → montaje → revisión final.
- **Dos estudios:** YouTube (horizontal 16:9) y TikTok (vertical 9:16, también Shorts). En las herramientas: platform "youtube" | "tiktok".
- **Dos modos:** "personal" (video a medida: exposición, promoción, proyecto; nunca se sube a YouTube, termina en Descargas) y "auto" (videos del canal a partir de un tema o idea).
- **La duración se cumple siempre** (aunque el guion sea corto). Un video tarda de 5 a 60 min según duración y animaciones.
- **Nada se publica sin el usuario:** la revisión final y la publicación en YouTube se hacen en la app. Por MCP puedes aceptar (guardar sin publicar) o rechazar, nunca publicar.
- Flujo típico: atril_status → (atril_guide aesthetics/effects si vas a escribir la estética) → video_create → video_get para seguir el avance → el usuario revisa en ATRIL.
- Biblioteca: material reutilizable (imágenes, clips, efectos, música, íconos). Para videos monetizados usa material con licencia libre: library_search_web (Pexels, Pixabay, Wikimedia, Openverse, Freesound…) y library_import; lo que bajes tú con el navegador impórtalo con library_import indicando su origen y licencia.`;

const TOPICS: Record<string, () => string | Promise<string>> = {
  overview: () => `${OVERVIEW}\n\n${guideSection("1")}`,
  personal: () => guideSection("4").split("### 4.1")[0].trim(),
  aesthetics: () => `${guideSection("4.1")}\n\n**Ejemplo completo de estética (para adaptar):**\n${AESTHETIC_EXAMPLE}`,
  script: () => guideSection("4.2"),
  resources: () => guideSection("4.3"),
  durations: () => guideSection("2"),
  covers: () => guideSection("5"),
  auto: () => guideSection("3"),
  json_import: () => guideSection("6"),
  effects: () => [guideSection("8.2"), guideSection("8.3")].join("\n\n"),
  pieces: () => `## Piezas listas (solo 16:9; cítalas por su nombre en la estética)\n${PIECES.map((p) => `- **${p.id}** [${p.kind}, ~${p.dur}s]: ${p.en}`).join("\n")}`,
  tones: () => `## Modos (campo tone)\n${(Object.keys(TONES) as (keyof typeof TONES)[]).map((k) => `- **${k}**: ${TONES[k].label} — ${TONES[k].hint}`).join("\n")}\n- **custom**: modo propio con tone_custom {name, description}.`,
  fonts: () => `## Tipografías de títulos (campo font; solo estas)\n${FONT_FAMILIES.join(", ")}`,
  checklist: () => guideSection("9"),
  voices: async () => {
    const provider = ttsProviderName();
    const out: string[] = [`## Voces (proveedor activo: ${provider}). Usa el nombre en el campo voice; se adapta al idioma del video.`];
    for (const lang of ["es", "en"] as VoiceLang[]) {
      const list = await listVoices(lang).catch(() => []);
      out.push(`**${lang === "es" ? "Español" : "Inglés"}** (${list.length}): ${list.map((v) => `${v.label}${v.gender ? ` (${v.gender === "F" ? "mujer" : "hombre"})` : ""}`).join(", ") || "sin lista (falta la clave del proveedor)"}`);
    }
    return out.join("\n");
  },
};

export const GUIDE_TOPICS = Object.keys(TOPICS);

export async function guideTopic(topic: string): Promise<string> {
  const f = TOPICS[topic];
  if (!f) throw new Error(`Tema desconocido: ${topic}. Usa: ${GUIDE_TOPICS.join(", ")}`);
  return (await f()) || `(La sección «${topic}» está vacía en esta versión.)`;
}
