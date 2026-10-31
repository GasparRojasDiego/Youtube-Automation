import { describe, it, expect, vi, beforeAll } from "vitest";
import * as nfs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("../lib/ipc", () => import("../../e2e/node-ipc"));
const ipc = await import("../../e2e/node-ipc");
const Q = await import("./queue");
const I = await import("./importCards");

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
const dir = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-campanas-"));
let ch = "";

beforeAll(async () => {
  ipc.openDb(path.join(dir, "atril.db"));
  ipc.setPaths({ data: path.join(dir, "data"), exe_dir: dir, resources: dir, home: dir, documents: dir, downloads: path.join(dir, "descargas") });
  const { migrate } = await import("../lib/schema");
  await migrate();
  ch = (await (await import("../lib/repo")).createChannel("Prueba")).id;
});

describe("campañas: una plantilla y tarjetas que solo guardan lo propio", () => {
  it("las tarjetas heredan la plantilla en vivo y guardan solo sus cambios", async () => {
    const c = await Q.createCampaign(ch, "Frame", "personal", "9:16", { minutes: [0.5, 0.75], aesthetic: "Negro y azul", voice: "es-US-Chirp3-HD-Kore" } as any);
    const it = await Q.addItem(ch, "personal", { title: "Uno", script: "Hola." } as any, c.id);
    expect(it.campaign_id).toBe(c.id);
    expect(it.cfg).toMatchObject({ title: "Uno", script: "Hola.", aesthetic: "Negro y azul", minutes: [0.5, 0.75], voice: "es-US-Chirp3-HD-Kore", format: "9:16" });
    expect(it.overrides.sort()).toEqual(["script", "title"]);
    // Cambiar la plantilla cambia las tarjetas que no tocaron ese campo
    await Q.saveCampaign(c.id, { cfg: { ...c.cfg, aesthetic: "Blanco" } as any });
    expect((await Q.getItem(it.id))!.cfg).toMatchObject({ aesthetic: "Blanco" });
    // Un campo propio no lo pisa la plantilla; volver al valor de la plantilla lo deja de nuevo heredado
    const cur = (await Q.getItem(it.id))!;
    await Q.saveCfg(it.id, { ...cur.cfg, minutes: [1, 1.2] });
    await Q.saveCampaign(c.id, { cfg: { ...(await Q.getCampaign(c.id))!.cfg, minutes: [0.25, 0.3] } as any });
    let now = (await Q.getItem(it.id))!;
    expect(now.cfg.minutes).toEqual([1, 1.2]);
    expect(now.overrides).toContain("minutes");
    await Q.saveCfg(it.id, { ...now.cfg, minutes: [0.25, 0.3] });
    now = (await Q.getItem(it.id))!;
    expect(now.overrides).not.toContain("minutes");
    // El formato lo manda la campaña aunque la tarjeta intente otro
    await Q.saveCfg(it.id, { ...now.cfg, format: "16:9" });
    expect((await Q.getItem(it.id))!.cfg.format).toBe("9:16");
    // Duplicar conserva la campaña y lo propio
    const copy = (await Q.duplicateItem(it.id))!;
    expect(copy.campaign_id).toBe(c.id);
    expect(copy.overrides.sort()).toEqual(["script", "title"]);
  });

  it("el video de una tarjeta de campaña lleva la voz, los textos y la campaña", async () => {
    const c = (await Q.listCampaigns(ch)).find((x) => x.name === "Frame")!;
    const it = await Q.addItem(ch, "personal", { title: "Nueve megas", script: "Nueve megas.", publish: { tiktok: "Pesa 9 MB #FrameApp" } } as any, c.id);
    const v = await Q.videoForItem((await Q.getItem(it.id))!);
    expect(v.data.voice).toBe("es-US-Chirp3-HD-Kore");
    expect(v.data.publish).toEqual({ tiktok: "Pesa 9 MB #FrameApp" });
    expect(v.data.queue).toEqual({ item: it.id, campaign: c.id });
    expect(v.data.format).toBe("9:16");
    expect(v.data.personal.aesthetic).toBe("Blanco");
  });

  it("borrar la campaña deja sus tarjetas sueltas sin perder nada", async () => {
    const c = (await Q.listCampaigns(ch)).find((x) => x.name === "Frame")!;
    const before = (await Q.listQueue(ch)).filter((x) => x.campaign_id === c.id && !x.video_id);
    await Q.deleteCampaign(c.id);
    for (const b of before) {
      const after = (await Q.getItem(b.id))!;
      expect(after.campaign_id).toBeNull();
      expect(after.cfg).toEqual(b.cfg);
    }
  });

  it("una tarjeta suelta se vuelve campaña: lo común pasa a la plantilla y lo propio se queda", async () => {
    const it = await Q.addItem(ch, "personal", { title: "Base", about: "Tema propio", aesthetic: "Grano fino", cta: "Descarga Frame", format: "9:16" } as any);
    const c = (await Q.campaignFromItem(it.id, "Desde tarjeta"))!;
    expect(c.cfg).toMatchObject({ aesthetic: "Grano fino", cta: "Descarga Frame", title: "", about: "" });
    const after = (await Q.getItem(it.id))!;
    expect(after.campaign_id).toBe(c.id);
    expect(after.overrides.sort()).toEqual(["about", "title"]);
    expect(after.cfg).toMatchObject({ title: "Base", about: "Tema propio", aesthetic: "Grano fino" });
  });
});

describe("importar tarjetas (JSON del chat de marketing)", () => {
  it("lee duraciones en segundos, minutos, rangos y relojes", () => {
    expect(I.parseDuration("30 s")).toEqual([0.5, 0.56]);
    expect(I.parseDuration("45s")).toEqual([0.75, 0.84]);          // sin espacio: segundos, no minutos
    expect(I.parseDuration("30-45 s")).toEqual([0.5, 0.75]);
    expect(I.parseDuration("30 a 45 segundos")).toEqual([0.5, 0.75]);
    expect(I.parseDuration("0:30")).toEqual([0.5, 0.56]);
    expect(I.parseDuration("1:30-2:00")).toEqual([1.5, 2]);
    expect(I.parseDuration("1-2 min")).toEqual([1, 2]);
    expect(I.parseDuration(2)).toEqual([2, 2.24]);
    expect(I.parseDuration([30, 45], true)).toEqual([0.5, 0.75]);
    expect(I.parseDuration("media hora")).toBeNull();
    expect(I.parseDuration([45, 30], true)).toBeNull();
  });

  it("el ejemplo del formato se lee sin errores: campaña, plantilla y tarjetas", () => {
    const p = I.parseCardsJson(I.IMPORT_EXAMPLE, "personal");
    expect(p.errors).toEqual([]);
    expect(p.campaign?.name).toBe("Frame · lanzamiento en TikTok");
    expect(p.campaign?.template).toMatchObject({ language: "es", tone: "llamativo", minutes: [0.5, 0.75], voice: "es-US-Chirp3-HD-Kore", font: "Bebas Neue", web: false,
      palette: { background: "#0b0d12", foreground: "#f2f2f0", accent: "#4c7dff" }, library: { mode: "all", ids: [] } });
    expect(p.cards).toHaveLength(2);
    expect(p.cards[0]).toMatchObject({ title: "Dijiste que estudiaste tres horas", covers: { tiktok: "portadas/01-tres-horas.png" } });
    expect(p.cards[0].publish).toMatchObject({ shortsTitle: "¿Cuánto estudias de verdad?" });
    expect(p.cards[1].minutes).toEqual([0.3333, 0.5]);
  });

  it("señala errores y avisos sin adivinar", () => {
    expect(I.parseCardsJson("{ no es json", "personal").errors[0]).toMatch(/no es JSON válido/);
    const p = I.parseCardsJson(JSON.stringify({ plantilla: { titulo: "No va aquí", colores: { fondo: "negro" } }, tarjetas: [{ titulo: "A", inventado: 1, duracion: 45 }] }), "personal");
    expect(p.errors.join(" ")).toMatch(/no es hexadecimal/);
    expect(p.warnings.join(" ")).toMatch(/«titulo» es propio de cada video/);
    expect(p.warnings.join(" ")).toMatch(/«inventado» no se reconoce/);
    expect(p.warnings.join(" ")).toMatch(/usa «duracion_s»/);
    expect(p.campaign?.template.title).toBeUndefined();
    // La voz se resuelve con el idioma aunque venga antes en el JSON
    expect(I.parseCardsJson('[{"voz": "Puck", "idioma": "en"}]', "personal").cards[0].voice).toBe("en-US-Chirp3-HD-Puck");
    // Una lista sola también vale (tarjetas sueltas)
    const list = I.parseCardsJson('```json\n[{"titulo": "Solo"}]\n```', "personal");
    expect(list.errors).toEqual([]);
    expect(list.campaign).toBeNull();
    expect(list.cards).toEqual([{ title: "Solo" }]);
  });

  it("crea la campaña y sus tarjetas con portadas copiadas; con errores no crea nada", async () => {
    const base = path.join(dir, "marketing");
    nfs.mkdirSync(path.join(base, "portadas"), { recursive: true });
    nfs.writeFileSync(path.join(base, "portadas", "01.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const json = JSON.stringify({ campaña: "Importada", plantilla: { duracion_s: [20, 30], estetica: "Oscura" },
      tarjetas: [{ titulo: "Uno", guion: "Hola.", portada_tiktok: "portadas/01.png" }, { titulo: "Dos", guion: "Chao.", portada_tiktok: "portadas/falta.png" }] });
    const before = (await Q.listQueue(ch)).length;
    const r = await I.importCards(ch, json, { mode: "personal", format: "9:16", baseDir: base });
    expect(r.created).toBe(2);
    expect(r.campaign?.name).toBe("Importada");
    expect(r.warnings.join(" ")).toMatch(/no encuentro la portada «portadas\/falta.png»/);
    const mine = (await Q.listQueue(ch)).filter((x) => x.campaign_id === r.campaign!.id);
    expect(mine).toHaveLength(2);
    const uno = mine.find((x) => x.cfg.title === "Uno")!;
    expect(uno.cfg).toMatchObject({ aesthetic: "Oscura", minutes: [0.3333, 0.5], format: "9:16" });
    expect(uno.cfg.covers.tiktok).toContain(uno.id);                 // copiada a la carpeta de la tarjeta
    expect(nfs.existsSync(uno.cfg.covers.tiktok!)).toBe(true);
    expect(uno.overrides).toContain("covers");
    // Con un error, nada
    await expect(I.importCards(ch, JSON.stringify({ tarjetas: [{ idioma: "fr" }] }), { mode: "personal", format: "9:16" })).rejects.toThrow(/No se importó nada/);
    expect((await Q.listQueue(ch)).length).toBe(before + 2);
  });
});

describe("otros arreglos de esta versión", () => {
  it("un vertical sin duración propia dura 30–60 s, no lo de los videos largos", async () => {
    const { minutesRangeOf } = await import("./format");
    expect(minutesRangeOf({ data: { format: "9:16" } } as any, [10, 13])).toEqual([0.5, 1]);
    expect(minutesRangeOf({ data: { format: "9:16", minutesRange: [0.25, 0.3] } } as any, [10, 13])).toEqual([0.25, 0.3]);
    expect(minutesRangeOf({ data: {} } as any, [10, 13])).toEqual([10, 13]);
  });

  it("el aviso de IA sale en el idioma del video (y respeta un texto propio)", async () => {
    const { disclosureFor } = await import("./logic");
    const def = "Narration in this video uses an AI-generated voice. Sources are listed below.";
    expect(disclosureFor(def, "es", { generatedImages: false, aiVoice: true })).toBe("La narración de este video usa una voz generada con IA.");
    expect(disclosureFor(def, "es", { generatedImages: true, aiVoice: true })).toBe("La narración de este video usa una voz generada con IA. Algunas ilustraciones se generaron con IA.");
    expect(disclosureFor(def, "en", { generatedImages: true, aiVoice: true })).toBe("Narration in this video uses an AI-generated voice. Some illustrations are AI-generated.");
    expect(disclosureFor("Voz sintética. Sources are listed below.", "es", { generatedImages: false, aiVoice: true })).toBe("Voz sintética.");
  });

  it("filtros de la biblioteca: forma, estado, calidad y orden", async () => {
    const { filterAssets } = await import("../media/library");
    const a = (o: Record<string, unknown>) => ({ id: String(o.id), kind: "image", source: "pexels", width: 1920, height: 1080, described_at: 1, usable: 1, used_count: 0, quality: 3, favorite: 0, created_at: 1, bytes: 1, ...o }) as any;
    const list = [a({ id: "h" }), a({ id: "v", width: 1080, height: 1920, quality: 5, used_count: 2 }), a({ id: "s", width: 1000, height: 1000, described_at: null, quality: 4 }), a({ id: "x", usable: 0, source: "user" })];
    expect(filterAssets(list, { orientation: "portrait" }).map((x) => x.id)).toEqual(["v"]);
    expect(filterAssets(list, { orientation: "square" }).map((x) => x.id)).toEqual(["s"]);
    expect(filterAssets(list, { status: "undescribed" }).map((x) => x.id)).toEqual(["s"]);
    expect(filterAssets(list, { status: "unusable" }).map((x) => x.id)).toEqual(["x"]);
    expect(filterAssets(list, { status: "used" }).map((x) => x.id)).toEqual(["v"]);
    expect(filterAssets(list, { minQuality: 4, sort: "quality" }).map((x) => x.id)).toEqual(["v", "s"]);
    expect(filterAssets(list, { source: "user" }).map((x) => x.id)).toEqual(["x"]);
  });
});
