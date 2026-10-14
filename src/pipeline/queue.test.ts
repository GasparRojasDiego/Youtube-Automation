import { describe, it, expect, vi, beforeAll } from "vitest";
import * as nfs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

vi.mock("../lib/ipc", () => import("../../e2e/node-ipc"));
const ipc = await import("../../e2e/node-ipc");
const { UserError } = await import("../lib/events");
const { UsageLimitError } = await import("../providers/claude");
const Q = await import("./queue");

const dir = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-cola-"));
const md5 = (f: string) => execFileSync("md5sum", [f]).toString().split(" ")[0];

// ffmpeg real: con la máquina cargada (CI, otra prueba renderizando) puede pasar de los 5 s por defecto
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

describe("cola: qué hacer con cada fallo", () => {
  it("clasifica los fallos", () => {
    expect(Q.classifyFailure(new UsageLimitError(null, ""))).toBe("limit");
    expect(Q.classifyFailure(new UserError("Claude Code no tiene una sesión iniciada.", "", "claude", false))).toBe("setup");
    expect(Q.classifyFailure(new UserError("Queda poco espacio en disco (menos de 4 GB).", "Libera espacio y reintenta.", "montaje", false))).toBe("disk");
    expect(Q.classifyFailure(new UserError("Claude Code tardó demasiado en «Guion».", "", "claude"))).toBe("transient");
    expect(Q.classifyFailure(new UserError("Claude Code devolvió un error: API Error: 529 Overloaded", "", "claude"))).toBe("transient");
    expect(Q.classifyFailure(new UserError("No se pudo crear ninguna animación (3).", "Sintaxis", "animaciones", false))).toBe("fatal");
    expect(Q.classifyFailure(new UserError("No se pudo crear ninguna animación (3).", "Se agotó el límite de uso del plan.", "animaciones", false))).toBe("limit");
    expect(Q.classifyFailure(new Error("algo raro"))).toBe("transient");
  });

  it("espera al límite, reintenta con esperas crecientes y luego sigue con el siguiente", () => {
    const now = 1_000_000_000_000;
    const m = Q.QUEUE_TIMING.limitMarginMs;
    expect(Q.nextAfterFailure("limit", 0, now, now + 3600_000)).toEqual({ action: "wait", until: now + 3600_000 + m });
    expect(Q.nextAfterFailure("limit", 0, now, null)).toEqual({ action: "wait", until: now + Q.QUEUE_TIMING.limitUnknownMs });
    expect(Q.nextAfterFailure("limit", 0, now, now - 5000)).toEqual({ action: "wait", until: now + 10 * 60_000 });
    expect(Q.nextAfterFailure("transient", 1, now, null)).toEqual({ action: "wait", until: now + 2 * 60_000 });
    expect(Q.nextAfterFailure("transient", 3, now, null)).toEqual({ action: "wait", until: now + 30 * 60_000 });
    expect(Q.nextAfterFailure("transient", 4, now, null)).toEqual({ action: "fail" });
    expect(Q.nextAfterFailure("fatal", 1, now, null)).toEqual({ action: "wait", until: now + 60_000 });
    expect(Q.nextAfterFailure("fatal", 2, now, null)).toEqual({ action: "fail" });
    expect(Q.nextAfterFailure("setup", 1, now, null)).toEqual({ action: "pause" });
    expect(Q.nextAfterFailure("disk", 1, now, null)).toEqual({ action: "pause" });
  });
});

describe("cola: tarjetas", () => {
  let ch = "";
  beforeAll(async () => {
    ipc.openDb(path.join(dir, "atril.db"));
    ipc.setPaths({ data: path.join(dir, "data"), exe_dir: dir, resources: dir, home: dir, documents: dir, downloads: path.join(dir, "descargas") });
    const { migrate } = await import("../lib/schema");
    await migrate();
    const repo = await import("../lib/repo");
    ch = (await repo.createChannel("Prueba")).id;
  });

  it("admite hasta 50 pendientes, ordena, duplica (con sus portadas) y quita", async () => {
    const a = await Q.addItem(ch, "personal");
    const b = await Q.addItem(ch, "auto");
    expect((await Q.listQueue(ch)).map((x) => x.id)).toEqual([a.id, b.id]);
    expect((b.cfg as any).topic).toEqual({ kind: "next" });
    expect((a.cfg as any).library).toEqual({ mode: "all", ids: [] });
    await Q.moveItem(b.id, -1);
    expect((await Q.listQueue(ch)).map((x) => x.id)).toEqual([b.id, a.id]);
    // Portada guardada en la carpeta de la tarjeta, con los mismos bytes
    const img = path.join(dir, "portada.jpg");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=s=1280x720:d=1", "-frames:v", "1", img]);
    const stored = await Q.storeFile(a.id, img, "youtube");
    expect(md5(stored)).toBe(md5(img));
    await Q.saveCfg(a.id, { ...(a.cfg as any), title: "Mi video", covers: { youtube: stored } });
    const c = (await Q.duplicateItem(a.id))!;
    expect((c.cfg as any).title).toBe("Mi video");
    expect((c.cfg as any).covers.youtube).not.toBe(stored);
    expect(md5((c.cfg as any).covers.youtube)).toBe(md5(img));
    expect((await Q.listQueue(ch)).map((x) => x.id)).toEqual([b.id, a.id, c.id]);
    await expect(Q.storeFile(a.id, path.join(dir, "atril.db"), "tiktok")).rejects.toThrow(/Formato de portada/);
    await Q.removeItem(c.id);
    expect(nfs.existsSync(path.dirname((c.cfg as any).covers.youtube))).toBe(false);
    for (let i = (await Q.listQueue(ch)).length; i < Q.QUEUE_MAX; i++) await Q.addItem(ch, "auto");
    await expect(Q.addItem(ch, "auto")).rejects.toThrow(/hasta 50/);
    for (const it of (await Q.listQueue(ch)).slice(2)) await Q.removeItem(it.id);
  });

  it("valida cada tarjeta antes de producirla", async () => {
    const repo = await import("../lib/repo");
    const t1 = await repo.addTopic({ channel_id: ch, title: "Tema uno", status: "approved" });
    const items = await Q.listQueue(ch);
    const auto = items.find((x) => x.mode === "auto")!, pers = items.find((x) => x.mode === "personal")!;
    const topics = await repo.listTopics(ch);
    const check = (it: typeof auto) => Q.checkItem(it, { topics, items: [...items.filter((x) => x.id !== it.id), it] });
    expect(check(auto).problems).toEqual([]);
    expect(check({ ...auto, cfg: { ...(auto.cfg as any), topic: { kind: "idea", text: " " } } }).problems[0]).toMatch(/idea/);
    expect(check({ ...auto, cfg: { ...(auto.cfg as any), minutes: [5, 2] } }).problems[0]).toMatch(/rango/);
    expect(check({ ...auto, cfg: { ...(auto.cfg as any), format: "9:16", minutes: [2, 4] } }).warnings.join(" ")).toMatch(/Short/);
    expect(check({ ...pers, cfg: { ...(pers.cfg as any), title: "", about: "", script: "", scriptFile: null } }).problems[0]).toMatch(/título/);
    expect(check({ ...pers, cfg: { ...(pers.cfg as any), tone: "custom", toneCustom: { name: "X", description: "" } } }).problems.join(" ")).toMatch(/modo propio/);
    expect(check({ ...pers, cfg: { ...(pers.cfg as any), library: { mode: "pick", ids: [] } } }).problems.join(" ")).toMatch(/recurso/);
    // Dos tarjetas con el mismo tema
    const dupA = { ...auto, cfg: { ...(auto.cfg as any), topic: { kind: "topic", id: t1, title: "Tema uno" } } };
    const dupB = { ...dupA, id: "otro", position: 99 };
    expect(Q.checkItem(dupA, { topics, items: [dupA, dupB] }).problems.join(" ")).toMatch(/mismo tema/);
  });

  it("crea el video de una tarjeta de Automatización con su tema, formato, duración, título y portadas exactas", async () => {
    const repo = await import("../lib/repo");
    const t2 = await repo.addTopic({ channel_id: ch, title: "Tema dos", notes: "notas", status: "candidate" });
    const auto = (await Q.listQueue(ch)).find((x) => x.mode === "auto")!;
    const yt = path.join(dir, "yt.jpg"), tk = path.join(dir, "tk.webp");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=s=1280x720:d=1", "-frames:v", "1", yt]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=s=1080x1920:d=1", "-frames:v", "1", tk]);
    const cfg = { ...(auto.cfg as any), topic: { kind: "topic", id: t2, title: "Tema dos" }, title: "Título fijo", notes: "Enfócate en Perú", format: "9:16", minutes: [0.5, 1],
      covers: { youtube: await Q.storeFile(auto.id, yt, "youtube"), tiktok: await Q.storeFile(auto.id, tk, "tiktok") } };
    await Q.saveCfg(auto.id, cfg);
    const v = await Q.videoForItem((await Q.getItem(auto.id))!);
    expect(v.title).toBe("Título fijo");
    expect(v.data.format).toBe("9:16");
    expect(v.data.minutesRange).toEqual([0.5, 1]);
    expect(v.data.fixedTitle).toBe("Título fijo");
    expect(v.data.topic.notes).toContain("Enfócate en Perú");
    expect(md5(v.data.covers.youtube)).toBe(md5(yt));                 // la de YouTube, mismos bytes
    expect(v.data.covers.tiktok).toMatch(/tiktok\.png$/);              // WebP → PNG sin pérdida (un MP4 no admite WebP como portada)
    expect((await repo.listTopics(ch)).find((t) => t.id === t2)?.status).toBe("used");
    const { minutesRangeOf, isVertical } = await import("./format");
    expect(isVertical(v)).toBe(true);
    expect(minutesRangeOf(v, [10, 13])).toEqual([0.5, 1]);
  });

  it("crea el video de una tarjeta Personal con todo lo de la tarjeta", async () => {
    const pers = (await Q.listQueue(ch)).find((x) => x.mode === "personal")!;
    const cfg = { ...(pers.cfg as any), title: "App Atril", about: "Qué hace la app", tone: "dinamico", aesthetic: "Fondo negro, acento azul", palette: { accent: "#4C7DFF" }, font: "Inter",
      script: "Hola. Esta es mi app.", minutes: [0.5, 0.75], format: "9:16", web: false, library: { mode: "all", ids: [] } };
    await Q.saveCfg(pers.id, cfg);
    const v = await Q.videoForItem((await Q.getItem(pers.id))!);
    const p = v.data.personal;
    expect(v.title).toBe("App Atril");
    expect(p).toMatchObject({ title: "App Atril", about: "Qué hace la app", tone: "dinamico", aesthetic: "Fondo negro, acento azul", minutesRange: [0.5, 0.75], useLibrary: false, library: { mode: "all", ids: [] } });
    expect(nfs.readFileSync(p.script.path, "utf8")).toBe("Hola. Esta es mi app.");
    expect(v.data.format).toBe("9:16");
    const { personalBrief, personalVisualBrief, visualFor } = await import("./personal");
    expect(personalBrief(p)).toContain("use it exactly as the title");
    expect(personalBrief(p)).toContain("between 30 seconds and 45 seconds");
    expect(personalVisualBrief(p)).toContain("Fondo negro, acento azul");
    expect(personalVisualBrief(p)).toContain("Fast and kinetic");
    const vis = await visualFor(v);
    expect(vis.accent).toBe("#4C7DFF");
    expect(vis.fontTitle).toBe("Inter");
    const stages = await (await import("../lib/repo")).getStages(v.id);
    expect(stages.find((s) => s.stage === "publish")?.status).toBe("skipped");   // un video personal nunca se sube
  });
});
