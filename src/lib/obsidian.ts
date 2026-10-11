// Obsidian como «segundo cerebro»: ATRIL detecta la bóveda (la lista que guarda la propia app de
// Obsidian), escribe una nota por video y un índice del canal en una carpeta propia, y lee una
// nota corta que el usuario escribe para Claude («Memoria para Claude.md»). Nada sale del equipo:
// son archivos Markdown en la bóveda. Si no hay Obsidian, no hace nada.
import { fs, appPaths } from "./ipc";
import { joinPath } from "./util";
import { getSettings } from "./settings";

export interface Vault { path: string; name: string; open: boolean; ts: number }

const isWin = (home: string) => /^[A-Za-z]:[\\/]/.test(home);

/** Bóvedas registradas en Obsidian (la abierta más reciente primero). */
export async function detectVaults(): Promise<Vault[]> {
  const { home } = await appPaths();
  const cands = isWin(home) ? [joinPath(home, "AppData", "Roaming", "obsidian", "obsidian.json")]
    : [joinPath(home, "Library", "Application Support", "obsidian", "obsidian.json"), joinPath(home, ".config", "obsidian", "obsidian.json"), joinPath(home, ".var", "app", "md.obsidian.Obsidian", "config", "obsidian", "obsidian.json")];
  for (const c of cands) {
    if (!(await fs.exists(c).catch(() => false))) continue;
    try {
      const j = JSON.parse(await fs.readText(c)) as { vaults?: Record<string, { path?: string; open?: boolean; ts?: number }> };
      const out: Vault[] = [];
      for (const v of Object.values(j.vaults ?? {})) if (v.path && (await fs.exists(v.path).catch(() => false))) out.push({ path: v.path, name: v.path.split(/[\\/]/).filter(Boolean).pop() ?? v.path, open: !!v.open, ts: v.ts ?? 0 });
      return out.sort((a, b) => Number(b.open) - Number(a.open) || b.ts - a.ts);
    } catch { /* archivo ilegible: sin bóvedas */ }
  }
  return [];
}

/** Carpeta de ATRIL dentro de la bóveda elegida (o la detectada), o null si está desactivado o no hay bóveda. */
export async function atrilFolder(): Promise<string | null> {
  const o = getSettings().obsidian;
  if (!o.enabled) return null;
  const vault = o.vault && (await fs.exists(o.vault).catch(() => false)) ? o.vault : (await detectVaults())[0]?.path;
  return vault ? joinPath(vault, (o.folder || "ATRIL").replace(/[\\/:*?"<>|]+/g, " ").trim() || "ATRIL") : null;
}

/** Escribe (o reemplaza) una nota; `rel` es relativo a la carpeta de ATRIL, con «/». */
export async function writeNote(rel: string, md: string): Promise<string | null> {
  const dir = await atrilFolder();
  if (!dir) return null;
  const parts = rel.split("/");
  const file = joinPath(dir, ...parts);
  await fs.mkdir(parts.length > 1 ? joinPath(dir, ...parts.slice(0, -1)) : dir);
  await fs.writeText(file, md);
  return file;
}

export async function readNote(rel: string): Promise<string | null> {
  const dir = await atrilFolder();
  if (!dir) return null;
  const file = joinPath(dir, ...rel.split("/"));
  return (await fs.exists(file).catch(() => false)) ? fs.readText(file).catch(() => null) : null;
}

export const MEMORY_NOTE = "Memoria para Claude.md";
const MEMORY_TEMPLATE = `# Memoria para Claude

Escribe aquí, en pocas líneas, lo que Claude debe recordar en cada video del canal: lo que funcionó, lo que no, temas que no quieres repetir, el tono que prefieres. ATRIL lo lee al investigar, escribir el guion y elegir temas (como mucho 1 500 caracteres: lo breve se respeta mejor y gasta menos).

<!-- Borra este párrafo y escribe debajo. Las líneas que empiezan con «<!--» se ignoran. -->
`;

/**
 * Memoria breve escrita por el usuario (sin comentarios ni la plantilla), recortada a 1 500 caracteres.
 * La primera vez crea la nota con instrucciones.
 */
export async function claudeMemory(): Promise<string> {
  const dir = await atrilFolder();
  if (!dir) return "";
  const txt = await readNote(MEMORY_NOTE);
  if (txt == null) { await writeNote(MEMORY_NOTE, MEMORY_TEMPLATE).catch(() => null); return ""; }
  return cleanMemory(txt);
}

export function cleanMemory(md: string): string {
  const body = md.replace(/<!--[\s\S]*?-->/g, "").replace(/^# Memoria para Claude\s*/m, "")
    .replace(/^Escribe aquí, en pocas líneas,[^\n]*\n?/m, "").trim();
  return body.length > 1500 ? `${body.slice(0, 1500).replace(/\s+\S*$/, "")}…` : body;
}
