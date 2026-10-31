// Importar tarjetas: el chat de marketing entrega UN bloque JSON con la campaña (plantilla común) y
// sus tarjetas (solo lo que cambia en cada video); ATRIL crea todo de una vez, con sus portadas y
// archivos. Acepta claves en español con o sin tildes (y las internas en inglés).
import { db, fs } from "../lib/ipc";
import { UserError } from "../lib/events";
import { joinPath } from "../lib/util";
import { FONT_FAMILIES } from "../motion/page";
import { listTopics } from "../lib/repo";
import { getSettings } from "../lib/settings";
import { GOOGLE_LANG, CHIRP3 } from "../providers/voices";
import type { ToneId } from "./personal";
import { addItem, createCampaign, getCampaign, getItem, listQueue, saveCfg, saveCampaign, storeFile, isActive, QUEUE_MAX,
  type AutoCfg, type PersonalCfg, type Campaign, type QueueMode, type PublishPack } from "./queue";
import type { VideoFormat } from "./format";

type Cfg = Partial<AutoCfg & PersonalCfg>;
export interface ParsedImport { campaign: { name: string; template: Cfg } | null; cards: Cfg[]; errors: string[]; warnings: string[] }
export interface ImportResult { created: number; campaign: Campaign | null; warnings: string[] }

const norm = (k: string) => k.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
const str = (x: unknown) => (typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "");

/** Duración en minutos [mín, máx]: número (minutos), [a, b] (minutos), «30 s», «45s», «30-45 s», «0:30», «1-2 min». */
export function parseDuration(x: unknown, seconds = false): [number, number] | null {
  const k = seconds ? 1 / 60 : 1;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pair = (lo: number, hi?: number): [number, number] | null => {
    const a = r2(lo), b = r2(hi ?? lo * 1.12);
    return a > 0 && b >= a ? [a, b] : null;
  };
  if (typeof x === "number") return x > 0 ? pair(x * k) : null;
  if (Array.isArray(x)) return x.length === 2 && x.every((n) => typeof n === "number" && n > 0) ? pair(x[0] * k, x[1] * k) : null;
  if (typeof x !== "string") return null;
  const t = x.toLowerCase().replace(/,/g, ".").trim();
  const clock = (c: string) => { const m = /^(\d+):(\d{1,2})$/.exec(c); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const parts = t.split(/\s*(?:-|–|—|\ba\b|\bto\b)\s*/).filter(Boolean);
  const vals = parts.map((p) => { const c = clock(p.replace(/[a-z"\s.]/g, "")); return c != null ? { v: c, sec: true } : { v: parseFloat(p), sec: false }; })
    .filter((o) => Number.isFinite(o.v) && o.v > 0);
  if (!vals.length || vals.length > 2 || vals.length !== parts.length) return null;
  const secUnit = seconds || /(\d|\s)(s|seg|segs|segundos?|sec|secs|seconds?)\b|"/.test(t);
  const toMin = (o: { v: number; sec: boolean }) => (o.sec || secUnit ? o.v / 60 : o.v);
  return pair(toMin(vals[0]), vals[1] ? toMin(vals[1]) : undefined);
}

const TONE_ALIASES: Record<string, ToneId> = { alegre: "alegre", corporativo: "corporativo", profesional: "profesional", dinamico: "dinamico", llamativo: "llamativo" };
const HEX = /^#[0-9a-f]{6}$/i;

/** Una tarjeta (o la plantilla) del JSON a configuración de ATRIL. Devuelve también sus avisos. */
export function mapCard(raw: Record<string, unknown>, mode: QueueMode, lang: "es" | "en", where: string): { cfg: Cfg; errors: string[]; warnings: string[] } {
  const cfg: Cfg = {}; const errors: string[] = []; const warnings: string[] = [];
  const publish: PublishPack = {};
  for (const [k0, val] of Object.entries(raw ?? {})) {
    const k = norm(k0);
    switch (k) {
      case "titulo": case "title": cfg.title = str(val).slice(0, 100); break;
      case "de_que_trata": case "about": case "sobre": cfg.about = str(val); break;
      case "para_que_es": case "proposito": case "objetivo": case "description": case "descripcion": cfg.description = str(val); break;
      case "publico": case "audiencia": case "audience": cfg.audience = str(val); break;
      case "llamado_a_la_accion": case "llamada_a_la_accion": case "cta": cfg.cta = str(val); break;
      case "estetica": case "aesthetic": cfg.aesthetic = str(val); break;
      case "guion": case "script": cfg.script = str(val); break;
      case "archivo_guion": case "guion_archivo": case "script_file": cfg.scriptFile = str(val) || null; break;
      case "enfoque": case "notas": case "indicaciones": case "notes": cfg.notes = str(val); break;
      case "idioma": case "language": { const l = norm(str(val)); if (/^(es|espanol|spanish)$/.test(l)) cfg.language = "es"; else if (/^(en|ingles|english)$/.test(l)) cfg.language = "en"; else errors.push(`${where}: idioma «${str(val)}» no válido (es o en).`); break; }
      case "modo": case "tono": case "tone": {
        if (val && typeof val === "object") { const o = val as Record<string, unknown>; cfg.tone = "custom"; cfg.toneCustom = { name: str(o.nombre ?? o.name) || "Propio", description: str(o.descripcion ?? o.description) }; break; }
        const t = TONE_ALIASES[norm(str(val))];
        if (t) cfg.tone = t; else if (str(val)) { cfg.tone = "custom"; cfg.toneCustom = { name: "Propio", description: str(val) }; warnings.push(`${where}: modo «${str(val).slice(0, 40)}» no es de la lista; se usa como modo propio.`); }
        break;
      }
      case "modo_propio": case "tono_propio": { const o = (val ?? {}) as Record<string, unknown>; cfg.tone = "custom"; cfg.toneCustom = { name: str(o.nombre ?? o.name) || "Propio", description: str(o.descripcion ?? o.description ?? val) }; break; }
      case "colores": case "paleta": case "palette": {
        const o = (val ?? {}) as Record<string, unknown>; const pal: NonNullable<PersonalCfg["palette"]> = {};
        for (const [ck, cv] of Object.entries(o)) {
          const c = str(cv); const kk = norm(ck);
          const slot = kk === "fondo" || kk === "background" ? "background" : kk === "texto" || kk === "foreground" ? "foreground" : kk === "acento" || kk === "accent" ? "accent" : null;
          if (!slot) { warnings.push(`${where}: color «${ck}» ignorado (usa fondo, texto o acento).`); continue; }
          if (HEX.test(c)) pal[slot] = c.toLowerCase(); else errors.push(`${where}: el color ${ck} «${c}» no es hexadecimal (#RRGGBB).`);
        }
        cfg.palette = Object.keys(pal).length ? pal : null; break;
      }
      case "tipografia": case "fuente": case "font": { const f = FONT_FAMILIES.find((x) => norm(x) === norm(str(val))); if (f) cfg.font = f; else if (str(val)) warnings.push(`${where}: la tipografía «${str(val)}» no está en ATRIL; se usa la del canal.`); break; }
      case "duracion": case "duration": case "minutos": case "duracion_min": {
        const d = parseDuration(val);
        if (!d) { errors.push(`${where}: duración «${JSON.stringify(val)}» no válida.`); break; }
        cfg.minutes = d;
        if (d[0] >= 10 && !/[a-z":]/i.test(String(val))) warnings.push(`${where}: «duracion» ${JSON.stringify(val)} se leyó en minutos; si eran segundos, usa «duracion_s».`);
        break;
      }
      case "duracion_s": case "segundos": { const d = parseDuration(val, true); if (d) cfg.minutes = d; else errors.push(`${where}: duración «${JSON.stringify(val)}» no válida.`); break; }
      case "biblioteca": case "library": {
        if (Array.isArray(val)) cfg.library = { mode: "pick", ids: val.map(str).filter(Boolean) };   // nombres: se resuelven al importar
        else { const m = norm(str(val)); cfg.library = { mode: /^(completa|toda|todo|all)$/.test(m) ? "all" : /^(ninguna|nada|none)$/.test(m) ? "none" : "all", ids: [] }; }
        break;
      }
      case "archivos": case "files": cfg.files = (Array.isArray(val) ? val : [val]).map(str).filter(Boolean); break;
      case "internet": case "web": case "buscar_en_internet": cfg.web = val === true || /^(si|yes|true)$/.test(norm(str(val))); break;
      case "voz": case "voice": cfg.voice = resolveVoice(str(val), cfg.language ?? lang); break;
      case "portada_tiktok": case "portada_vertical": case "cover_tiktok": cfg.covers = { ...(cfg.covers ?? {}), tiktok: str(val) || null }; break;
      case "portada_youtube": case "miniatura": case "cover_youtube": cfg.covers = { ...(cfg.covers ?? {}), youtube: str(val) || null }; break;
      case "publicacion": case "publish": {
        const o = (val ?? {}) as Record<string, unknown>;
        for (const [pk, pv] of Object.entries(o)) {
          const n = norm(pk);
          if (n === "tiktok" || n === "texto_tiktok") publish.tiktok = str(pv);
          else if (n === "shorts_titulo" || n === "titulo_shorts" || n === "titulo") publish.shortsTitle = str(pv).slice(0, 100);
          else if (n === "shorts_descripcion" || n === "descripcion_shorts" || n === "descripcion") publish.shortsDescription = str(pv);
        }
        break;
      }
      case "texto_tiktok": publish.tiktok = str(val); break;
      case "titulo_shorts": case "shorts_titulo": publish.shortsTitle = str(val).slice(0, 100); break;
      case "descripcion_shorts": case "shorts_descripcion": publish.shortsDescription = str(val); break;
      case "tema": case "idea": case "topic":
        if (mode === "auto") { const t = str(val); cfg.topic = /^siguiente/.test(norm(t)) ? { kind: "next" } : { kind: "idea", text: t }; }
        else cfg.about = cfg.about || str(val);
        break;
      case "tema_propuesto": cfg.topic = { kind: "topic", id: "", title: str(val) }; break;   // se busca por título al importar
      case "formato": case "format": case "numero": case "n": case "id": case "nota": case "comentario": break;   // la plataforma la da el estudio
      default: warnings.push(`${where}: el campo «${k0}» no se reconoce y se ignoró.`);
    }
  }
  if (Object.keys(publish).length) cfg.publish = publish;
  return { cfg, errors, warnings };
}

/** Nombre corto («Kore») → voz completa del idioma en Google; las demás voces quedan como están. */
function resolveVoice(name: string, lang: "es" | "en"): string | null {
  if (!name) return null;
  if (/^[a-z]{2}-[A-Z]{2}-/.test(name) || getSettings().tts.provider !== "google") return name;
  const v = CHIRP3.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return v ? `${GOOGLE_LANG[lang]}-Chirp3-HD-${v.name}` : name;
}

/** Lee el bloque JSON (con o sin ```json). Formas aceptadas: lista de tarjetas u objeto {campaña, plantilla, tarjetas}. */
export function parseCardsJson(text: string, mode: QueueMode): ParsedImport {
  const out: ParsedImport = { campaign: null, cards: [], errors: [], warnings: [] };
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let data: unknown;
  try { data = JSON.parse(clean); } catch (e) { out.errors.push(`El texto no es JSON válido: ${(e as Error).message}`); return out; }
  const obj = (Array.isArray(data) ? { tarjetas: data } : data) as Record<string, unknown>;
  const field = (...names: string[]) => { for (const [k, v] of Object.entries(obj ?? {})) if (names.includes(norm(k))) return v; return undefined; };
  const camp = field("campana", "campaign");
  const tpl = field("plantilla", "template", "comun");
  const cards = field("tarjetas", "cards", "videos");
  const lang: "es" | "en" = "es";
  if (camp != null || tpl != null) {
    const name = typeof camp === "object" && camp ? str((camp as any).nombre ?? (camp as any).name) : str(camp);
    const t = tpl && typeof tpl === "object" ? mapCard(tpl as Record<string, unknown>, mode, lang, "Plantilla") : { cfg: {} as Cfg, errors: [], warnings: [] };
    // Lo propio de cada video no va en la plantilla
    for (const k of ["title", "topic", "script", "scriptFile", "publish"] as const) {
      if (t.cfg[k] == null) continue;
      delete t.cfg[k];
      t.warnings.push(`Plantilla: «${{ title: "titulo", topic: "tema", script: "guion", scriptFile: "archivo_guion", publish: "publicacion" }[k]}» es propio de cada video; ponlo en cada tarjeta.`);
    }
    out.campaign = { name: name || "Campaña importada", template: t.cfg };
    out.errors.push(...t.errors); out.warnings.push(...t.warnings);
  }
  if (!Array.isArray(cards) || !cards.length) { out.errors.push("No hay tarjetas: falta la lista «tarjetas»."); return out; }
  cards.forEach((c, i) => {
    if (!c || typeof c !== "object") { out.errors.push(`Tarjeta ${i + 1}: no es un objeto.`); return; }
    const m = mapCard(c as Record<string, unknown>, mode, out.campaign?.template.language ?? lang, `Tarjeta ${i + 1}`);
    out.cards.push(m.cfg); out.errors.push(...m.errors); out.warnings.push(...m.warnings);
  });
  return out;
}

/** Ruta absoluta de un archivo nombrado en el JSON (relativa a la carpeta elegida). */
const resolvePath = (p: string, baseDir: string | null) => (/^([a-zA-Z]:[\\/]|[\\/])/.test(p) || !baseDir ? p : joinPath(baseDir, p));

/** Copia portadas y archivos nombrados a la carpeta de la tarjeta (o de la plantilla). */
async function bringFiles(ownerId: string, cfg: Cfg, baseDir: string | null, where: string, warnings: string[]): Promise<Cfg> {
  const out: Cfg = { ...cfg };
  if (cfg.covers) {
    out.covers = {};
    for (const k of ["youtube", "tiktok"] as const) {
      const p = cfg.covers[k];
      if (!p) continue;
      const abs = resolvePath(p, baseDir);
      if (!(await fs.exists(abs))) { warnings.push(`${where}: no encuentro la portada «${p}».`); continue; }
      try { out.covers[k] = await storeFile(ownerId, abs, k); } catch (e) { warnings.push(`${where}: ${(e as Error).message}`); }
    }
  }
  if (cfg.files?.length) {
    out.files = [];
    for (const p of cfg.files) {
      const abs = resolvePath(p, baseDir);
      if (await fs.exists(abs)) out.files.push(await storeFile(ownerId, abs)); else warnings.push(`${where}: no encuentro el archivo «${p}».`);
    }
  }
  if (cfg.scriptFile) {
    const abs = resolvePath(cfg.scriptFile, baseDir);
    if (await fs.exists(abs)) out.scriptFile = await storeFile(ownerId, abs); else { warnings.push(`${where}: no encuentro el guion «${cfg.scriptFile}».`); out.scriptFile = null; }
  }
  return out;
}

/** Recursos de la biblioteca nombrados por título o por nombre de archivo → sus ids. */
async function resolveLibrary(cfg: Cfg, where: string, warnings: string[]): Promise<Cfg> {
  if (cfg.library?.mode !== "pick") return cfg;
  const ids: string[] = [];
  for (const name of cfg.library.ids) {
    const rows = await db.query<{ id: string }>("SELECT id FROM assets WHERE id=? OR lower(title)=lower(?) OR lower(path) LIKE lower(?) LIMIT 1", [name, name, `%${name.replace(/[%_]/g, "")}`]);
    if (rows[0]) ids.push(rows[0].id); else warnings.push(`${where}: no hay en la biblioteca un recurso llamado «${name}».`);
  }
  return { ...cfg, library: { mode: ids.length ? "pick" : "all", ids } };
}

/**
 * Importa el JSON: crea la campaña (o usa la elegida) y una tarjeta por elemento, con sus portadas y
 * archivos copiados. Si hay errores, no crea nada.
 */
export async function importCards(channelId: string, text: string, o: { mode: QueueMode; format: VideoFormat; campaignId?: string | null; baseDir?: string | null }): Promise<ImportResult> {
  const p = parseCardsJson(text, o.mode);
  if (p.errors.length) throw new UserError(`No se importó nada: ${p.errors.length} error(es).`, p.errors.slice(0, 12).join("\n"), "cola", false);
  const active = (await listQueue(channelId)).filter(isActive).length;
  if (active + p.cards.length > QUEUE_MAX) throw new UserError(`Son ${p.cards.length} tarjetas y la cola ya tiene ${active}: el máximo es ${QUEUE_MAX} pendientes.`, "Importa menos tarjetas o espera a que avance la cola.", "cola", false);
  const warnings = [...p.warnings];
  let campaign = o.campaignId ? await getCampaign(o.campaignId) : null;
  if (!campaign && p.campaign) {
    campaign = await createCampaign(channelId, p.campaign.name, o.mode, o.format);
    const tpl = await resolveLibrary(await bringFiles(campaign.id, p.campaign.template, o.baseDir ?? null, "Plantilla", warnings), "Plantilla", warnings);
    await saveCampaign(campaign.id, { cfg: { ...campaign.cfg, ...tpl, format: o.format } as AutoCfg | PersonalCfg });
    campaign = await getCampaign(campaign.id);
  } else if (campaign && p.campaign && Object.keys(p.campaign.template).length) {
    warnings.push("Se importó en la campaña elegida: la plantilla del JSON se ignoró (edítala en «Plantilla»).");
  }
  // Temas propuestos: por título
  const topics = o.mode === "auto" ? await listTopics(channelId) : [];
  let created = 0;
  for (const [i, card0] of p.cards.entries()) {
    const where = `Tarjeta ${i + 1}`;
    let card: Cfg = { ...card0 };
    if (card.topic?.kind === "topic") {
      const t = topics.find((x) => x.title.trim().toLowerCase() === (card.topic as { title: string }).title.toLowerCase());
      card.topic = t ? { kind: "topic", id: t.id, title: t.title } : { kind: "idea", text: (card.topic as { title: string }).title };
      if (!t) warnings.push(`${where}: no hay un tema propuesto con ese título; se usa como idea propia.`);
    }
    const it = await addItem(channelId, o.mode, campaign ? {} : { format: o.format }, campaign?.id ?? null);
    card = await resolveLibrary(await bringFiles(it.id, card, o.baseDir ?? null, where, warnings), where, warnings);
    const fresh = await getItem(it.id);
    await saveCfg(it.id, { ...fresh!.cfg, ...card, format: o.format } as AutoCfg | PersonalCfg);
    created++;
  }
  return { created, campaign, warnings };
}

/** Ejemplo para el chat de marketing (y para el botón «Copiar formato»). */
export const IMPORT_EXAMPLE = JSON.stringify({
  campaña: "Frame · lanzamiento en TikTok",
  plantilla: {
    idioma: "es", modo: "llamativo", duracion_s: [30, 45], voz: "Kore",
    estetica: "Fondo casi negro (#0B0D12) con grano fino; un solo acento azul (#4C7DFF) para cifras; títulos en Bebas Neue de 2 a 4 palabras; cortes cada 2–3 s; grabaciones reales de la app en primer plano.",
    colores: { fondo: "#0B0D12", texto: "#F2F2F0", acento: "#4C7DFF" }, tipografia: "Bebas Neue",
    publico: "Estudiantes de secundaria y universidad que estudian solos", llamado_a_la_accion: "Descarga Frame gratis en Microsoft Store",
    biblioteca: "completa", internet: false, archivos: ["frame-pantalla-inicio.mp4"],
  },
  tarjetas: [
    { titulo: "Dijiste que estudiaste tres horas", de_que_trata: "Frame mide cada sesión y convierte tu enfoque en una nota real.",
      guion: "Dijiste que estudiaste tres horas. ¿Pero cuánto te enfocaste de verdad? Frame mide cada sesión y te da una nota honesta. Gratis en Microsoft Store.",
      portada_tiktok: "portadas/01-tres-horas.png",
      publicacion: { tiktok: "¿Estudiaste o solo abriste el cuaderno? 👀 #estudiar #productividad #FrameApp", shorts_titulo: "¿Cuánto estudias de verdad?", shorts_descripcion: "Frame: gratis en Microsoft Store. #Shorts" } },
    { titulo: "Nueve megas", guion: "Nueve megas. Eso pesa toda la app.", duracion_s: [20, 30], portada_tiktok: "portadas/02-nueve-megas.png" },
  ],
}, null, 2);
