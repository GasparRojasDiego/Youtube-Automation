// Notas de Obsidian que escribe ATRIL: una por video (qué se hizo, con qué piezas, cómo terminó)
// y un índice del canal. Se reescriben enteras cada vez (ATRIL es la fuente); lo que el usuario
// quiera anotar va en «Memoria para Claude.md», que ATRIL nunca reescribe.
import { getVideo, getStages, listVideos, videoNumbers, type Video } from "../lib/repo";
import { writeNote } from "../lib/obsidian";
import { logError } from "../lib/events";
import { fmtDuration } from "../lib/util";
import { personalOf } from "./personal";
import { pieceById } from "../motion/pieces";
import type { PackageOut, RenderOut, MotionOut, PolishOut } from "./types";

const STATUS: Record<Video["status"], string> = { active: "En producción", approved: "Aprobado", ready: "Aceptado (sin publicar)", scheduled: "Programado", published: "Publicado", rejected: "Rechazado", archived: "Archivado" };
const day = (t: number | null | undefined) => (t ? new Date(t).toISOString().slice(0, 10) : "");
const safe = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Video";
const yaml = (s: string) => JSON.stringify(s ?? "");

export function noteName(n: number | undefined, title: string) { return `${String(n ?? 0).padStart(3, "0")} - ${safe(title)}`; }

/** Nota de un video (función pura: la arma a partir de lo guardado). */
export function videoNote(v: Video, n: number | undefined, st: { pkg?: PackageOut; render?: RenderOut; motion?: MotionOut; polish?: PolishOut }): string {
  const { pkg, render, motion, polish } = st;
  const title = pkg?.chosen_title || v.title;
  const items = motion?.items ?? [];
  const used = new Map<string, number>();
  for (const m of items) for (const p of m.pieces ?? []) used.set(p, (used.get(p) ?? 0) + 1);
  const scratch = items.filter((m) => !m.pieces?.length || m.piece_use === "none").length;
  const lines = [
    "---",
    `numero: ${n ?? ""}`, `titulo: ${yaml(title)}`, `estado: ${yaml(STATUS[v.status] ?? v.status)}`, `modo: ${personalOf(v) ? "Personal" : "Automatización"}`,
    `creado: ${day(v.created_at)}`, ...(v.published_at ? [`publicado: ${day(v.published_at)}`] : []), ...(v.youtube_id ? [`youtube: https://youtu.be/${v.youtube_id}`] : []),
    `duracion: ${yaml(render ? fmtDuration(render.duration) : "")}`, "tags: [atril, video]",
    "---", "", `# ${title}`, "",
  ];
  if (pkg?.description) lines.push("## Descripción", "", pkg.description.trim(), "");
  if (pkg?.chapters?.length) lines.push("## Capítulos", "", ...pkg.chapters.map((c) => `- ${c.t != null ? fmtDuration(c.t) : ""} ${c.title}`.trim()), "");
  if (items.length) {
    lines.push("## Animaciones", "", `${items.length} en total · ${items.filter((m) => m.file).length} renderizadas · ${scratch} desde cero.`);
    if (used.size) lines.push("", "Piezas listas usadas:", ...[...used].map(([id, c]) => `- ${pieceById(id)?.name ?? id} (\`P.${id}\`)${c > 1 ? ` ×${c}` : ""}`));
    const crit = items.map((m) => m.critique_es).filter(Boolean).slice(0, 6);
    if (crit.length) lines.push("", "Lo que corrigió la revisión visual:", ...crit.map((c) => `- ${String(c).replace(/\s+/g, " ").slice(0, 200)}`));
    lines.push("");
  }
  if (polish?.notes_es) lines.push("## Decisiones de edición", "", polish.notes_es.trim(), "");
  if (v.data?.rejected_reason) lines.push("## Motivo del rechazo", "", String(v.data.rejected_reason), "");
  if (render?.file) lines.push("## Archivo", "", `\`${render.file}\``, "");
  lines.push(`_Nota generada por ATRIL; se reescribe sola. Lo tuyo, en [[Memoria para Claude]]._`);
  return lines.join("\n");
}

/** Índice del canal: todos los videos con su estado (los más recientes arriba). */
export function indexNote(videos: Video[], nums: Map<string, number>, titles: Map<string, string>): string {
  const rows = videos.slice().sort((a, b) => b.created_at - a.created_at).map((v) => {
    const t = titles.get(v.id) || v.title;
    return `| ${nums.get(v.id) ?? ""} | [[${noteName(nums.get(v.id), t)}\\|${t.replace(/\|/g, "/")}]] | ${STATUS[v.status] ?? v.status} | ${personalOf(v) ? "Personal" : "Automatización"} | ${day(v.published_at || v.created_at)} |`;
  });
  return ["# Canal en ATRIL", "", `${videos.length} videos. Se actualiza solo.`, "", "| N.º | Video | Estado | Modo | Fecha |", "|---|---|---|---|---|", ...rows, "", "Ver también: [[Memoria para Claude]]"].join("\n");
}

/** Escribe la nota del video y el índice del canal. Nunca interrumpe la producción. */
export async function syncVault(videoId: string): Promise<void> {
  try {
    const v = await getVideo(videoId);
    if (!v) return;
    const nums = await videoNumbers(v.channel_id);
    const st = await getStages(videoId);
    const get = <T,>(s: string) => st.find((x) => x.stage === s)?.output as T | undefined;
    const pkg = get<PackageOut>("package");
    const ok = await writeNote(`Videos/${noteName(nums.get(v.id), pkg?.chosen_title || v.title)}.md`, videoNote(v, nums.get(v.id), { pkg, render: get<RenderOut>("render"), motion: get<MotionOut>("motion"), polish: get<PolishOut>("polish") }));
    if (!ok) return;
    const videos = await listVideos(v.channel_id, 1000);
    const titles = new Map<string, string>();
    for (const x of videos) { const o = (await getStages(x.id)).find((s) => s.stage === "package")?.output as PackageOut | undefined; if (o?.chosen_title) titles.set(x.id, o.chosen_title); }
    await writeNote("Canal.md", indexNote(videos, nums, titles));
  } catch (e) { await logError(e, videoId, "Nota de Obsidian"); }
}
