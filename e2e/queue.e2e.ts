// Cola de producción de extremo a extremo (Claude real): dos tarjetas personales, la primera vertical
// 9:16 con portadas de YouTube y TikTok, la segunda horizontal. A la segunda se le simula un límite del
// plan con su hora de reposición: la cola debe esperar y seguir sola. Se comprueba que las descargas y
// las partes llevan exactamente las portadas subidas y que nada se publica.
// La voz se simula (sin red en la prueba).
// Ejecutar: npx vitest run -c vitest.e2e.config.ts e2e/queue.e2e.ts
import { describe, it, expect, vi } from "vitest";
import * as nfs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

vi.mock("../src/lib/ipc", () => import("./node-ipc"));
vi.mock("../src/pipeline/cards", () => import("./node-cards"));
vi.mock("../src/providers/tts", async (orig) => ({
  ...(await orig<typeof import("../src/providers/tts")>()),
  synthesize: async (job: { text: string; outPath: string }) => {
    const sentences = job.text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const out = `${job.outPath}.wav`;
    nfs.mkdirSync(path.dirname(out), { recursive: true });
    const parts = sentences.flatMap((s, i) => [`sine=f=${180 + i * 20}:d=${(s.split(/\s+/).length / 2.6).toFixed(2)}:sample_rate=24000`, "anullsrc=r=24000:cl=mono:d=0.4"]);
    const inputs = parts.flatMap((p) => ["-f", "lavfi", "-i", p]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${parts.map((_, i) => `[${i}:a]`).join("")}concat=n=${parts.length}:v=0:a=1,aformat=channel_layouts=mono[a]`, "-map", "[a]", out]);
    return { path: out, ext: "wav" };
  },
}));
// Límite del plan simulado: la primera llamada a Claude del video de la tarjeta marcada recibe el mensaje real del CLI
vi.mock("../src/providers/claude", async (orig) => {
  const m = await orig<typeof import("../src/providers/claude")>();
  let fired = false;
  return {
    ...m,
    claudeRun: async (c: Parameters<typeof m.claudeRun>[0]) => {
      const target = (globalThis as any).__limitItem as string | undefined;
      if (target && !fired && c.videoId) {
        const repo = await import("../src/lib/repo");
        const v = await repo.getVideo(c.videoId);
        if (v?.data?.queue?.item === target) {
          fired = true;
          (globalThis as any).__limitAt = Date.now();
          const reset = Math.floor((Date.now() + 25_000) / 1000);
          m.parseClaudeOutput(JSON.stringify({ type: "result", subtype: "success", is_error: true, result: `Claude AI usage limit reached|${reset}` }), "", 1);
        }
      }
      return m.claudeRun(c);
    },
  };
});

const SRC = "/tmp/claude-0/e2e/run/atril.db";
const WORK = "/tmp/claude-0/e2e/cola";
const IMG = "/tmp/claude-0/e2e/img";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SHEETS = process.env.SHEETS_DIR ?? WORK;
const SCRIPT_V = `¿Y si tu canal de YouTube se produjera solo? ATRIL investiga el tema, escribe el guion y lo narra. Después elige imágenes, crea animaciones y monta el video completo. Tú solo revisas el resultado final y decides si se publica. Así de simple.`;
const SCRIPT_H = `La fotosíntesis es la forma en que las plantas fabrican su propio alimento. Con la luz del sol, el agua y el dióxido de carbono, producen glucosa. Como resultado, liberan oxígeno al aire que respiramos.`;

const ff = (...a: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
const md5 = (f: string) => execFileSync("md5sum", [f]).toString().split(" ")[0];
const streams = (f: string) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", f]).toString()).streams as any[];
const mainVideo = (f: string) => streams(f).find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
const embedded = (f: string, out: string) => { ff("-i", f, "-map", "0:v:1", "-c", "copy", "-f", "image2", out); return out; };
const gray = (f: string, n: number) => execFileSync("ffmpeg", ["-loglevel", "error", "-i", f, "-map", "0:v:0", "-vf", `select=eq(n\\,${n}),scale=16:16,format=gray`, "-frames:v", "1", "-f", "rawvideo", "-"]);
const grayImg = (f: string, w: number, h: number) => execFileSync("ffmpeg", ["-loglevel", "error", "-i", f, "-vf", `scale=${w}:${h},scale=16:16,format=gray`, "-frames:v", "1", "-f", "rawvideo", "-"]);
const diff = (a: Buffer, b: Buffer) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / a.length;
/** Hoja de 6 cuadros del video para revisarlo a ojo. */
function sheet(file: string, out: string, dur: number, w: number, h: number) {
  const frames = [0.1, 0.25, 0.4, 0.55, 0.7, 0.88].map((f, i) => { const p = `${out}.${i}.jpg`; ff("-ss", (dur * f).toFixed(2), "-i", file, "-map", "0:v:0", "-frames:v", "1", "-vf", `scale=${w}:${h}`, p); return p; });
  ff(...frames.flatMap((p) => ["-i", p]), "-filter_complex", `${frames.map((_, i) => `[${i}:v]`).join("")}xstack=inputs=6:layout=${frames.map((_, i) => `${(i % 3) * w}_${Math.floor(i / 3) * h}`).join("|")}[v]`, "-map", "[v]", out);
  frames.forEach((p) => nfs.rmSync(p));
}

describe.skipIf(!nfs.existsSync(SRC))("cola de producción", () => {
  it("produce dos videos seguidos (uno vertical), espera el límite del plan y sigue sola, con las portadas exactas", async () => {
    nfs.rmSync(WORK, { recursive: true, force: true });
    nfs.mkdirSync(path.join(WORK, "entrada"), { recursive: true });
    nfs.copyFileSync(SRC, path.join(WORK, "atril.db"));
    const ipc = await import("./node-ipc");
    ipc.openDb(path.join(WORK, "atril.db"));
    ipc.setPaths({ data: path.join(WORK, "data"), exe_dir: WORK, resources: path.resolve(__dirname, "../src-tauri"), home: WORK, documents: path.join(WORK, "docs"), downloads: path.join(WORK, "descargas") });
    await (await import("../src/lib/schema")).migrate();
    const { loadSettings, saveSettings } = await import("../src/lib/settings");
    await loadSettings();
    await saveSettings((s) => ({ ...s, motion: { ...s.motion, enabled: true, browserPath: CHROME, perVideo: 1, parallel: 3 }, ffmpeg: { ...s.ffmpeg, encoder: "libx264" },
      media: { ...s.media, libraryDir: path.join(WORK, "Biblioteca") } }));
    // Portadas reconocibles
    const E = (f: string) => path.join(WORK, "entrada", f);
    ff("-f", "lavfi", "-i", "color=c=0xC0392B:s=1280x720", "-vf", "drawbox=x=80:y=80:w=520:h=300:color=white:t=fill", "-frames:v", "1", "-q:v", "2", E("portada-youtube.jpg"));
    ff("-f", "lavfi", "-i", "color=c=0x1F4FD8:s=1080x1920", "-vf", "drawbox=x=120:y=360:w=840:h=700:color=0xFFD400:t=fill", "-frames:v", "1", E("portada-tiktok.png"));
    for (const f of ["fruits.jpg", "home.jpg", "building.jpg"]) nfs.copyFileSync(path.join(IMG, f), E(f));

    const repo = await import("../src/lib/repo");
    const Q = await import("../src/pipeline/queue");
    const { AESTHETIC_EXAMPLE } = await import("../src/pipeline/personal");
    Q.QUEUE_TIMING.limitMarginMs = 5_000;
    Q.QUEUE_TIMING.tickMs = 1_000;
    const ch = (await repo.activeChannel())!;
    const a = await Q.addItem(ch.id, "personal");
    await Q.saveCfg(a.id, { ...(a.cfg as any), title: "ATRIL en 30 segundos", about: "Una app de escritorio que produce videos de YouTube casi sola.", audience: "creadores que empiezan", cta: "Pruébala gratis",
      tone: "llamativo", aesthetic: AESTHETIC_EXAMPLE, palette: { background: "#0B0D12", accent: "#4C7DFF" }, script: SCRIPT_V, minutes: [0.4, 0.7], format: "9:16", web: false,
      files: [await Q.storeFile(a.id, E("fruits.jpg")), await Q.storeFile(a.id, E("home.jpg"))],
      covers: { youtube: await Q.storeFile(a.id, E("portada-youtube.jpg"), "youtube"), tiktok: await Q.storeFile(a.id, E("portada-tiktok.png"), "tiktok") } });
    const b = await Q.addItem(ch.id, "personal");
    await Q.saveCfg(b.id, { ...(b.cfg as any), title: "La fotosíntesis en 30 segundos", about: "Cómo las plantas fabrican su alimento", tone: "profesional", script: SCRIPT_H, minutes: [0.4, 0.7], format: "16:9", web: false,
      files: [await Q.storeFile(b.id, E("building.jpg"))], covers: { youtube: await Q.storeFile(b.id, E("portada-youtube.jpg"), "youtube") } });
    (globalThis as any).__limitItem = b.id;

    // Se anota cada estado por el que pasa la segunda tarjeta
    const { subscribe } = await import("../src/lib/bus");
    const seen: { status: string; error: string | null; wait: number | null }[] = [];
    subscribe("queue", () => { void Q.getItem(b.id).then((x) => { if (x && seen.at(-1)?.status !== x.status) seen.push({ status: x.status, error: x.error, wait: x.wait_until }); }); });

    const t0 = Date.now();
    await Q.startQueue(ch.id);
    while ((await Q.getQueueState()).running) await new Promise((r) => setTimeout(r, 3000));
    console.log(`Cola terminada en ${((Date.now() - t0) / 60000).toFixed(1)} min · ${(await Q.getQueueState()).note}`);
    const items = await Q.listQueue(ch.id);
    for (const it of items) console.log(it.id, it.status, it.attempts, it.error ?? "");
    console.log("Estados de la 2ª tarjeta:", JSON.stringify(seen));
    expect(items.map((x) => x.status)).toEqual(["done", "done"]);

    // El límite simulado: la tarjeta esperó hasta la reposición (+ margen) y siguió sola
    const w = seen.find((x) => x.status === "waiting");
    expect(w?.error).toMatch(/Límite del plan/);
    expect(w!.wait! - (globalThis as any).__limitAt).toBeGreaterThan(20_000);

    // ---- Video 1: vertical, con portada de TikTok en la descarga y en la parte, y la de YouTube como miniatura
    const v1 = (await repo.getVideo(items[0].video_id!))!;
    const st1 = await repo.getStages(v1.id);
    const out1 = (s: string) => st1.find((x) => x.stage === s)!;
    for (const s of st1) console.log("v1", s.stage, s.status, s.error ? s.error.slice(0, 300) : "");
    expect(out1("final").status).toBe("review");
    expect(out1("publish").status).toBe("skipped");
    const r1 = out1("render").output;
    const m1 = mainVideo(r1.file);
    expect([m1.width, m1.height]).toEqual([1080, 1920]);
    expect(r1.duration).toBeGreaterThan(12);
    const words = out1("script").output.segments.map((s: any) => s.text_en).join(" ");
    expect(words).toContain("ATRIL investiga el tema, escribe el guion y lo narra.");
    const motion1 = out1("motion").output.items as any[];
    console.log("Animaciones v1:", JSON.stringify(motion1.map((m) => ({ id: m.id, file: !!m.file, pieces: m.pieces ?? null, error: m.error?.slice(0, 200) ?? null }))));
    const anim = motion1.find((m) => m.file);
    expect(anim).toBeTruthy();
    const am = mainVideo(anim.file);
    expect([am.width, am.height]).toEqual([1080, 1920]);
    expect(motion1.every((m) => !m.pieces?.length)).toBe(true);
    const pkg1 = out1("package").output;
    expect(pkg1.chosen_title).toBe("ATRIL en 30 segundos");
    const thumb = pkg1.thumbnails[pkg1.chosen_thumbnail];
    expect(thumb.own).toBe(true);
    expect(md5(thumb.path)).toBe(md5(E("portada-youtube.jpg")));
    const dl1 = v1.data.download as string;
    expect(nfs.existsSync(dl1)).toBe(true);
    expect(md5(embedded(dl1, path.join(WORK, "dl1-portada.png")))).toBe(md5(E("portada-tiktok.png")));
    const covT = grayImg(E("portada-tiktok.png"), 1080, 1920);
    expect(diff(gray(dl1, 0), covT)).toBeLessThan(8);
    const { cutParts } = await import("../src/pipeline/tiktok");
    const partsDir = await cutParts(v1, () => undefined);
    const part = nfs.readdirSync(partsDir).filter((f) => /^parte .+\.mp4$/.test(f)).map((f) => path.join(partsDir, f))[0];
    expect(md5(embedded(part, path.join(WORK, "parte-portada.png")))).toBe(md5(E("portada-tiktok.png")));
    expect(diff(gray(part, 0), covT)).toBeLessThan(8);
    sheet(r1.file, path.join(SHEETS, "cola-vertical.jpg"), r1.duration, 180, 320);

    // ---- Video 2: horizontal, portada de YouTube en la descarga (personal: también en los primeros cuadros)
    const v2 = (await repo.getVideo(items[1].video_id!))!;
    const st2 = await repo.getStages(v2.id);
    const r2 = st2.find((x) => x.stage === "render")!.output;
    const m2 = mainVideo(r2.file);
    expect([m2.width, m2.height]).toEqual([1920, 1080]);
    const dl2 = v2.data.download as string;
    expect(md5(embedded(dl2, path.join(WORK, "dl2-portada.jpg")))).toBe(md5(E("portada-youtube.jpg")));
    expect(diff(gray(dl2, 0), grayImg(E("portada-youtube.jpg"), 1920, 1080))).toBeLessThan(8);
    sheet(r2.file, path.join(SHEETS, "cola-horizontal.jpg"), r2.duration, 320, 180);

    // Nada se publicó
    for (const v of [v1, v2]) expect((await repo.getVideo(v.id))!.status).not.toBe("published");
  }, 120 * 60_000);
});
