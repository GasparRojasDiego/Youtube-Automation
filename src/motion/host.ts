// Implementación del «host» del motor de motion sobre el núcleo Rust de ATRIL.
import { proc, fs, resourcePath } from "../lib/ipc";
import { getSettings } from "../lib/settings";
import { UserError } from "../lib/events";
import { joinPath, sleep } from "../lib/util";
import { ffmpeg } from "../providers/ffmpeg";
import { BROWSER_CANDIDATES_WIN, type MotionHost } from "./engine";

export const tauriHost: MotionHost = {
  spawn: async (id, program, args) => { await proc.spawn(id, program, args); },
  stop: async (id) => { await proc.stop(id).catch(() => false); },
  readText: async (p) => { try { return (await fs.exists(p)) ? await fs.readText(p) : null; } catch { return null; } },
  writeText: (p, t) => fs.writeText(p, t),
  writeB64: async (p, b) => { await fs.writeB64(p, b); },
  mkdir: (p) => fs.mkdir(p),
  remove: (p) => fs.remove(p),
  copy: (a, b) => fs.copy(a, b),
  ffmpeg: async (args, cwd) => { await ffmpeg(args, { cwd, timeoutS: 1800 }); },
  join: (...p) => joinPath(...p),
  sleep: async (ms) => { await sleep(ms); },
};

/** Ruta del navegador para el motor: ajuste manual, Edge o Chrome. */
export async function findBrowser(): Promise<string | null> {
  const custom = getSettings().motion.browserPath.trim();
  if (custom) return (await fs.exists(custom)) ? custom : null;
  for (const c of BROWSER_CANDIDATES_WIN) if (await fs.exists(c)) return c;
  for (const n of ["msedge", "chrome", "google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
    const w = await proc.which(n);
    if (w) return w;
  }
  return null;
}

export async function requireBrowser(): Promise<string> {
  const b = await findBrowser();
  if (!b) throw new UserError("No encuentro Microsoft Edge ni Google Chrome para renderizar las animaciones.",
    "Windows trae Edge instalado; si lo quitaste, instala Chrome o indica la ruta en Ajustes → Motion.", "motion", false);
  return b;
}

export async function motionResources(): Promise<{ resources: string; fontsDir: string }> {
  return { resources: await resourcePath("motion"), fontsDir: await resourcePath("fonts") };
}
