// Visión de Claude (Sonnet): describe cada imagen o clip UNA sola vez y guarda
// el resultado. Después, todo el sistema trabaja con el texto (búsquedas,
// casting, retoques) sin volver a gastar tokens mirando el archivo.
// Las imágenes viajan reducidas (≈800 px, ≈480 tokens) y en lotes, en un solo
// turno (sin llamadas a herramientas).
import { getSettings } from "../lib/settings";
import { claudeRun } from "../providers/claude";
import { activity } from "../lib/activity";
import { emit } from "../lib/bus";
import { db } from "../lib/ipc";
import { visionProxy, saveDescription, type Asset } from "./library";

export const VISION_SYSTEM = `You are the visual librarian of a documentary studio. You look at media files once and write a precise catalogue entry so that nobody ever needs to look at them again.
Rules:
- Describe only what is visible. Never guess identities of real people: do not name anyone unless the name is printed in the image; say "a man who appears to be in his 40s" instead.
- description_es: detailed, objective Spanish description (60–120 words) in this order: background/setting, main subjects (apparent age range, clothing, expression, pose), objects, text visible in the image (transcribed), lighting, colour palette, camera framing (close-up, wide…), style (photo, illustration, engraving, painting, meme, screenshot, map, diagram), era cues. If someone looks under 18, say so ("parece menor de 18 años").
- caption_en: one short English caption (max 15 words).
- tags_en: 12–25 English search keywords and synonyms (subjects, setting, era, mood, style, colours, actions, shot type).
- mood: 1–3 English words (e.g. "eerie, cold").
- quality 1–5: technical quality for a 1080p documentary (sharpness, resolution, compression, watermarks). 5 = excellent.
- real_person: true if an identifiable real person's face is clearly visible.
- usable: false if it has a watermark, a third-party logo as main subject, graphic violence/gore, nudity, a minor in a sensitive context, or is unreadable.
- issues: short Spanish note of any problem (watermark, text overlay, low resolution, borders…), or "".
- For video contact sheets (4 frames in a 2×2 grid, in time order), describe the clip as a whole and mention the action.`;

export const VISION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "title", "description_es", "caption_en", "tags_en", "mood", "quality", "real_person", "usable", "issues"],
        properties: {
          id: { type: "string" }, title: { type: "string", description: "Short descriptive English title (max 8 words)" },
          description_es: { type: "string" }, caption_en: { type: "string" },
          tags_en: { type: "array", items: { type: "string" } }, mood: { type: "string" },
          quality: { type: "integer", minimum: 1, maximum: 5 }, real_person: { type: "boolean" }, usable: { type: "boolean" }, issues: { type: "string" },
        },
      },
    },
  },
};

/** Describe un lote de archivos (imágenes o clips). Devuelve cuántos quedaron descritos. */
export async function describeAssets(assets: Asset[], ctx: { videoId?: string | null; channelId?: string | null; stage?: string; jobId?: string } = {}): Promise<number> {
  const todo = assets.filter((a) => (a.kind === "image" || a.kind === "video") && !a.described_at);
  const size = Math.max(1, getSettings().media.visionBatch);
  let done = 0;
  for (let i = 0; i < todo.length; i += size) {
    const batch = todo.slice(i, i + size);
    const images: { label: string; path: string }[] = [];
    for (const a of batch) {
      try { images.push({ label: `File id: ${a.id} (${a.kind === "video" ? `video clip, ${Math.round(a.duration ?? 0)} s, contact sheet` : "image"}; source title: "${a.title.slice(0, 120)}")`, path: await visionProxy(a) }); }
      catch { /* archivo ilegible: se omite */ }
    }
    if (!images.length) continue;
    await activity(ctx.videoId, ctx.stage ?? "assets", "read", `Claude mira ${images.length} archivo(s) nuevos para describirlos`, batch.map((a) => a.title).join(" · "));
    const r = await claudeRun<{ items: any[] }>({
      stage: "vision", label: `Visión: ${images.length} archivos`, system: VISION_SYSTEM, schema: VISION_SCHEMA, images, quiet: true,
      prompt: `Catalogue each of the ${images.length} files below. Return one item per file, using exactly the file id given before each image.`,
      videoId: ctx.videoId, channelId: ctx.channelId, activityStage: ctx.stage ?? "assets", jobId: ctx.jobId, timeoutMin: 20,
    });
    for (const it of r.data.items ?? []) {
      const a = batch.find((x) => x.id === it.id);
      if (!a) continue;
      await saveDescription(a.id, it);
      done++;
      await activity(ctx.videoId, ctx.stage ?? "assets", "asset", it.caption_en || a.title, it.description_es, a.thumb);
    }
    emit("assets");
  }
  return done;
}

/** Describe lo pendiente de la biblioteca (botón en la página Biblioteca). */
export async function describePending(limit = 40): Promise<number> {
  const rows = await db.query<Asset>("SELECT * FROM assets WHERE described_at IS NULL AND kind IN ('image','video') ORDER BY created_at DESC LIMIT ?", [limit]);
  return describeAssets(rows);
}
