// Herramientas locales opcionales (el «toolkit» de video instalado por el usuario):
// whisper.cpp (tiempos reales de cada palabra) y rembg (recortes sin fondo para
// las animaciones). Se detectan solas en el PATH, en el PATH de usuario de
// Windows (aunque la app se abriera antes de instalarlas) y en las carpetas
// habituales; si no están o fallan, ATRIL sigue con lo propio. Nada se activa a mano.
import { proc, fs, appPaths } from "../lib/ipc";
import { joinPath, uid } from "../lib/util";
import { ffmpeg } from "../providers/ffmpeg";
import { parseWhisperJson, type AsrWord } from "../pipeline/align";

export type ToolId = "whisper" | "rembg";
export interface Tool { exe: string; model?: string }

const EXE: Record<ToolId, string[]> = { whisper: ["whisper-cli"], rembg: ["rembg"] };
const cache = new Map<ToolId, Promise<Tool | null>>();
const broken = new Set<ToolId>();   // falló en esta sesión: no se insiste
let extraDirs: Promise<string[]> | null = null;

const isWin = (home: string) => /^[A-Za-z]:[\\/]/.test(home);

/** Carpetas donde buscar además del PATH del proceso. */
function searchDirs(): Promise<string[]> {
  if (!extraDirs) extraDirs = (async () => {
    const { home } = await appPaths();
    const dirs = [
      joinPath(home, "tools", "video", "whisper", "Release"), joinPath(home, "tools", "video", "whisper"),
      joinPath(home, "tools", "video"), joinPath(home, ".local", "bin"),
    ];
    if (isWin(home)) {
      // PATH de usuario y del sistema tal como están ahora (el del proceso puede ser anterior a la instalación)
      try {
        const r = await proc.run({ id: uid("path_"), program: "powershell.exe", timeoutS: 20,
          args: ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetEnvironmentVariable('Path','User'); [Environment]::GetEnvironmentVariable('Path','Machine')"] });
        if (r.code === 0) dirs.push(...r.stdout.split(/[;\r\n]+/).map((d) => d.trim()).filter(Boolean));
      } catch { /* sin PowerShell: basta con el PATH del proceso */ }
    }
    return [...new Set(dirs)];
  })();
  return extraDirs;
}

async function findExe(names: string[]): Promise<string | null> {
  for (const n of names) { const p = await proc.which(n).catch(() => null); if (p) return p; }
  const { home } = await appPaths();
  const exts = isWin(home) ? [".exe", ".cmd", ".bat"] : [""];
  for (const d of await searchDirs()) for (const n of names) for (const e of exts) {
    const p = joinPath(d, `${n}${e}`);
    if (await fs.exists(p).catch(() => false)) return p;
  }
  return null;
}

/** Modelo de whisper: el «base» (rápido: el texto ya se conoce, solo hacen falta los tiempos); si no, el que haya. */
async function whisperModel(): Promise<string | null> {
  const { home } = await appPaths();
  const dirs = [joinPath(home, ".cache", "whisper.cpp"), joinPath(home, "tools", "video", "whisper", "models"), joinPath(home, "tools", "video", "whisper")];
  const names = ["ggml-base.bin", "ggml-base-q5_1.bin", "ggml-small.bin", "ggml-large-v3-turbo-q5_0.bin", "ggml-large-v3-turbo.bin", "ggml-tiny.bin"];
  for (const n of names) for (const d of dirs) { const p = joinPath(d, n); if (await fs.exists(p).catch(() => false)) return p; }
  return null;
}

/** Herramienta disponible (con su modelo, si lo necesita) o null. Se busca una vez por sesión. */
export function tool(id: ToolId): Promise<Tool | null> {
  if (broken.has(id)) return Promise.resolve(null);
  if (!cache.has(id)) cache.set(id, (async () => {
    const exe = await findExe(EXE[id]);
    if (!exe) return null;
    if (id === "whisper") { const model = await whisperModel(); return model ? { exe, model } : null; }
    return { exe };
  })().catch(() => null));
  return cache.get(id)!;
}

/** Marca una herramienta como rota para el resto de la sesión (se vuelve a lo propio). */
export function disableTool(id: ToolId) { broken.add(id); }

/** Estado de las herramientas para Diagnóstico. */
export async function toolkitStatus(): Promise<{ id: ToolId; label: string; found: string | null; use: string }[]> {
  const w = await tool("whisper"), r = await tool("rembg");
  return [
    { id: "whisper", label: "whisper.cpp", found: w ? `${w.exe} · ${w.model?.split(/[\\/]/).pop()}` : null, use: "Subtítulos y cortes al ritmo exacto de cada palabra" },
    { id: "rembg", label: "rembg", found: r?.exe ?? null, use: "Recortes sin fondo para las animaciones" },
  ];
}

const threads = () => String(Math.max(2, Math.min(8, ((globalThis.navigator?.hardwareConcurrency as number | undefined) ?? 4) - 2)));
const utf8 = (b64: string) => new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/**
 * Palabras con sus tiempos reales según whisper.cpp, o null si no está instalado.
 * El texto conocido va como «prompt» (mejora el reconocimiento de nombres y cifras).
 */
export async function transcribeWords(audio: string, o: { language: string; prompt?: string; workDir: string; jobId?: string }): Promise<AsrWord[] | null> {
  const t = await tool("whisper");
  if (!t?.model) return null;
  await fs.mkdir(o.workDir);
  const base = joinPath(o.workDir, uid("w"));
  try {
    // whisper.cpp lee WAV de 16 kHz mono
    await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", audio, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", `${base}.wav`]);
    const args = ["-m", t.model, "-f", `${base}.wav`, "-l", o.language || "auto", "-ml", "1", "-sow", "-oj", "-of", base, "-t", threads(), "-np"];
    if (o.prompt) args.push("--prompt", o.prompt.replace(/\s+/g, " ").slice(0, 240));
    const r = await proc.run({ id: o.jobId ? `${o.jobId}:${uid("wh")}` : uid("wh_"), program: t.exe, args, timeoutS: 900 });
    if (r.code !== 0) throw new Error((r.stderr || r.stdout).slice(-600));
    return parseWhisperJson(utf8(await fs.readB64(`${base}.json`)));
  } finally {
    for (const f of [`${base}.wav`, `${base}.json`]) await fs.remove(f).catch(() => undefined);
  }
}

/**
 * Modelo de rembg: birefnet-general si ya está descargado (el de mejor calidad, pero ~1 GB y lento en
 * CPU); si no, isnet-general-use (179 MB, ~4 s por imagen; se descarga solo la primera vez).
 * rembg 2.0.85 guarda los modelos en ~/.rembg/models/<modelo>/; las versiones anteriores, en ~/.u2net.
 */
async function rembgModel(): Promise<string> {
  const { home } = await appPaths();
  for (const p of [joinPath(home, ".rembg", "models", "birefnet-general", "birefnet-general.onnx"), joinPath(home, ".u2net", "birefnet-general.onnx")])
    if (await fs.exists(p).catch(() => false)) return "birefnet-general";
  return "isnet-general-use";
}

/**
 * Recorte sin fondo (PNG con transparencia, mismo encuadre que la imagen) con rembg, o null si no
 * está instalado o falla. Se guarda por imagen: otro video que la use no lo repite.
 */
export async function cutout(src: string, dst: string, jobId?: string): Promise<string | null> {
  if (await fs.exists(dst).catch(() => false)) return dst;
  const t = await tool("rembg");
  if (!t) return null;
  const small = `${dst}.in.png`;
  try {
    // Hasta 1600 px: el recorte se muestra a ese tamaño como mucho y rembg tarda menos
    await ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-vf", "scale='min(1600,iw)':-2", "-frames:v", "1", small]);
    const r = await proc.run({ id: jobId ? `${jobId}:${uid("rb")}` : uid("rb_"), program: t.exe, args: ["i", "-m", await rembgModel(), small, dst], timeoutS: 900 });
    if (r.code !== 0 || !(await fs.exists(dst).catch(() => false))) throw new Error((r.stderr || r.stdout).slice(-600) || `rembg terminó con código ${r.code}`);
    return dst;
  } finally { await fs.remove(small).catch(() => undefined); }
}
