import { describe, it, expect, vi, beforeAll } from "vitest";
import * as nfs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

vi.mock("../lib/ipc", () => import("../../e2e/node-ipc"));
const ipc = await import("../../e2e/node-ipc");
const C = await import("./covers");

const dir = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-portadas-"));
const ff = (...a: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
const md5 = (f: string) => execFileSync("md5sum", [f]).toString().split(" ")[0];
const probe = (f: string) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", f]).toString()).streams as any[];
/** Cuadro n del video principal, en gris 16×16 (para comparar con la portada). */
const gray = (f: string, n = 0) => execFileSync("ffmpeg", ["-loglevel", "error", "-i", f, "-map", "0:v:0", "-vf", `select=eq(n\\,${n}),scale=16:16,format=gray`, "-frames:v", "1", "-f", "rawvideo", "-"]);
const grayImg = (f: string, w: number, h: number) => execFileSync("ffmpeg", ["-loglevel", "error", "-i", f, "-vf", `scale=${w}:${h},scale=16:16,format=gray`, "-frames:v", "1", "-f", "rawvideo", "-"]);
const diff = (a: Buffer, b: Buffer) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / a.length;
/** Extrae la portada incrustada (attached_pic) tal cual. */
const embedded = (f: string, out: string) => { ff("-i", f, "-map", "0:v:1", "-c", "copy", "-f", "image2", out); return out; };

// ffmpeg real: con la máquina cargada (CI, otra prueba renderizando) puede pasar de los 5 s por defecto
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

describe("portadas propias: siempre la que subió el usuario", () => {
  let v: any;
  beforeAll(async () => {
    ipc.openDb(path.join(dir, "atril.db"));
    ipc.setPaths({ data: path.join(dir, "data"), exe_dir: dir, resources: dir, home: dir, documents: dir, downloads: path.join(dir, "descargas") });
    await (await import("../lib/schema")).migrate();
    const repo = await import("../lib/repo");
    const ch = await repo.createChannel("Prueba");
    v = await repo.createVideo(ch.id, null, { title: "Video" });
    // Portadas reconocibles (rojo con texto) y videos de prueba (patrón de barras) con audio
    ff("-f", "lavfi", "-i", "color=c=red:s=1280x720", "-vf", "drawbox=x=100:y=100:w=400:h=300:color=white:t=fill", "-frames:v", "1", "-q:v", "3", path.join(dir, "yt.jpg"));
    ff("-f", "lavfi", "-i", "color=c=blue:s=1080x1920", "-vf", "drawbox=x=100:y=300:w=600:h=600:color=yellow:t=fill", "-frames:v", "1", path.join(dir, "tk.png"));
    ff("-f", "lavfi", "-i", "color=c=green:s=1080x1920", "-frames:v", "1", path.join(dir, "tk.webp"));
    ff("-f", "lavfi", "-i", "testsrc=s=1920x1080:r=30:d=2", "-f", "lavfi", "-i", "sine=f=440:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(dir, "h.mp4"));
    ff("-f", "lavfi", "-i", "testsrc=s=1080x1920:r=30:d=2", "-f", "lavfi", "-i", "sine=f=440:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(dir, "v.mp4"));
  });

  it("guarda la portada con los mismos bytes (WebP → PNG sin pérdida)", async () => {
    const p = await C.saveCover(v, "youtube", path.join(dir, "yt.jpg"));
    expect(md5(p)).toBe(md5(path.join(dir, "yt.jpg")));
    const t = await C.saveCover(v, "tiktok", path.join(dir, "tk.webp"));
    expect(t).toMatch(/tiktok\.png$/);
    const t2 = await C.saveCover(v, "tiktok", path.join(dir, "tk.png"));
    expect(md5(t2)).toBe(md5(path.join(dir, "tk.png")));
    const fresh = await (await import("../lib/repo")).getVideo(v.id);
    expect(C.coversOf(fresh!)).toEqual({ youtube: p, tiktok: t2 });
    expect(await C.coverForShape(C.coversOf(fresh!), true)).toBe(t2);
    expect(await C.coverForShape(C.coversOf(fresh!), false)).toBe(p);
    expect(await C.coverForShape({ tiktok: t2 }, false)).toBe(t2);
    await expect(C.saveCover(v, "youtube", path.join(dir, "atril.db"))).rejects.toThrow(/Formato de portada/);
  });

  it("la copia descargable lleva la portada exacta incrustada (sin recodificar el video)", async () => {
    const out = await C.withCover(path.join(dir, "h.mp4"), path.join(dir, "h-portada.mp4"), path.join(dir, "yt.jpg"), { firstFrames: false });
    const st = probe(out);
    expect(st.filter((s) => s.codec_type === "video")).toHaveLength(2);
    expect(st.find((s) => s.disposition?.attached_pic === 1)?.codec_name).toBe("mjpeg");
    expect(st.find((s) => s.codec_type === "audio")).toBeTruthy();
    expect(md5(embedded(out, path.join(dir, "x1.jpg")))).toBe(md5(path.join(dir, "yt.jpg")));
    // La carpeta de destino se crea si no existe (Descargas puede faltar)
    expect(nfs.existsSync(await C.withCover(path.join(dir, "h.mp4"), path.join(dir, "no", "existe", "h.mp4"), path.join(dir, "yt.jpg"), { firstFrames: false }))).toBe(true);
    // El video en sí no cambia (copia directa)
    expect(gray(out, 15).equals(gray(path.join(dir, "h.mp4"), 15))).toBe(true);
  });

  it("vertical o personal: además, los primeros cuadros muestran la portada", async () => {
    const out = await C.withCover(path.join(dir, "v.mp4"), path.join(dir, "v-portada.mp4"), path.join(dir, "tk.png"), { firstFrames: true });
    const st = probe(out);
    expect(st.find((s) => s.disposition?.attached_pic === 1)?.codec_name).toBe("png");
    expect(md5(embedded(out, path.join(dir, "x2.png")))).toBe(md5(path.join(dir, "tk.png")));
    const main = st.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
    expect([main.width, main.height]).toEqual([1080, 1920]);
    const cov = grayImg(path.join(dir, "tk.png"), 1080, 1920);
    expect(diff(gray(out, 0), cov)).toBeLessThan(6);            // cuadro 0 = portada
    expect(diff(gray(out, 20), cov)).toBeGreaterThan(20);        // después, el video
    expect(Math.abs(Number(main.duration ?? 2) - 2)).toBeLessThan(0.1);
  });

  it("portada de otra forma: entera sobre un fondo desenfocado de sí misma", () => {
    expect(C.coverFilter(1920, 1080, 1280, 720)).toContain("scale=1920:1080:flags=lanczos");
    expect(C.coverFilter(1080, 1920, 1280, 720)).toContain("boxblur");
  });

  it("miniatura para YouTube: el original si es JPEG/PNG de hasta 2 MB; si no, una copia que cumpla", async () => {
    expect(await C.youtubeThumbFile(path.join(dir, "yt.jpg"))).toBe(path.join(dir, "yt.jpg"));
    const big = path.join(dir, "grande.png");
    ff("-f", "lavfi", "-i", "nullsrc=s=2600x1800,geq=random(1)*255:128:128", "-frames:v", "1", big);
    expect(nfs.statSync(big).size).toBeGreaterThan(2 * 1024 * 1024);
    const ok = await C.youtubeThumbFile(big);
    expect(ok).toMatch(/\.youtube\.jpg$/);
    expect(nfs.statSync(ok).size).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(await C.youtubeThumbFile(path.join(dir, "tk.webp"))).toMatch(/\.youtube\.jpg$/);
  });
});
