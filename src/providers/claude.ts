// Proveedor de lenguaje: Claude Code CLI en modo no interactivo (`claude -p`),
// con la sesión del plan del usuario. Salida estructurada con --json-schema.
import { proc, appPaths, fs } from "../lib/ipc";
import { getSettings, type StageModelKey } from "../lib/settings";
import { UserError } from "../lib/events";
import { addCost } from "../lib/costs";
import { joinPath, uid, extractJson, safeJson } from "../lib/util";

export interface ClaudeCall {
  stage: StageModelKey;
  system: string;
  prompt: string;
  schema: object;
  tools?: string[];          // p. ej. ["WebSearch","WebFetch"] o ["Read"]
  addDirs?: string[];        // carpetas legibles con la herramienta Read
  videoId?: string | null;
  channelId?: string | null;
  label: string;             // para el libro de costos y los avisos
  jobId?: string;            // para poder cancelar
  timeoutMin?: number;
}

export interface ClaudeResult<T> { data: T; apiEquivUsd: number; turns: number; durationMs: number }

/** Separa argumentos extra respetando comillas. */
export function splitArgs(s: string): string[] {
  const out: string[] = []; let cur = ""; let q: string | null = null;
  for (const ch of s.trim()) {
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ""; } }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export function buildClaudeArgs(c: Pick<ClaudeCall, "stage" | "system" | "schema" | "tools" | "addDirs">, cfg = getSettings().claude): string[] {
  const tools = c.tools ?? [];
  const args = [
    "-p",
    "--output-format", "json",
    "--no-session-persistence",
    "--model", cfg.models[c.stage] || "sonnet",
    "--system-prompt", c.system,
    "--tools", tools.join(","),
    "--permission-mode", "dontAsk",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--json-schema", JSON.stringify(c.schema),
  ];
  const effort = cfg.effort[c.stage];
  if (effort) args.push("--effort", effort);
  if (tools.length) args.push("--allowedTools", tools.join(","));
  for (const d of c.addDirs ?? []) args.push("--add-dir", d);
  args.push(...splitArgs(cfg.extraArgs || ""));
  return args;
}

/** Interpreta la salida JSON de `claude -p --output-format json`. */
export function parseClaudeOutput<T>(stdout: string, stderr: string, code: number): ClaudeResult<T> {
  const text = stdout.trim();
  const lastLine = text.split("\n").filter((l) => l.trim().startsWith("{")).pop() ?? text;
  const out = safeJson<any>(lastLine, null) ?? safeJson<any>(text, null);
  const all = `${stdout}\n${stderr}`.toLowerCase();
  if (!out) {
    if (/log ?in|logged in|authenticat|\/login|api key/.test(all))
      throw new UserError("Claude Code no tiene una sesión iniciada.", "Abre una terminal, ejecuta «claude» y entra con la cuenta del plan. " + stderr.slice(-800), "claude", false);
    throw new UserError(`Claude Code terminó sin respuesta válida (código ${code}).`, (stderr || stdout).slice(-2000), "claude");
  }
  if (out.is_error || (out.subtype && out.subtype !== "success")) {
    const msg = String(out.result ?? out.error ?? out.subtype ?? "error desconocido");
    if (/usage limit|limit reached|rate limit|quota/i.test(msg))
      throw new UserError("Se alcanzó el límite de uso del plan de Claude.", `El trabajo hecho quedó guardado. Reanuda cuando se renueve el límite. Detalle: ${msg}`, "claude");
    if (/max.?turns/i.test(String(out.subtype)))
      throw new UserError("Claude Code agotó el número de pasos permitido para esta tarea.", msg, "claude");
    throw new UserError(`Claude Code devolvió un error: ${msg.slice(0, 300)}`, JSON.stringify(out).slice(0, 3000), "claude");
  }
  let data = out.structured_output;
  if (data == null && typeof out.result === "string") data = extractJson(out.result);
  if (data == null) throw new UserError("Claude Code no devolvió datos estructurados.", String(out.result ?? "").slice(0, 2000), "claude");
  return { data: data as T, apiEquivUsd: Number(out.total_cost_usd ?? 0), turns: Number(out.num_turns ?? 0), durationMs: Number(out.duration_ms ?? 0) };
}

export async function claudeRun<T>(c: ClaudeCall): Promise<ClaudeResult<T>> {
  const cfg = getSettings().claude;
  const paths = await appPaths();
  const jobDir = joinPath(paths.data, "jobs", c.jobId ?? uid("job_"));
  await fs.mkdir(jobDir);
  const program = cfg.path || "claude";
  const resolved = await proc.which(program);
  if (!resolved) {
    throw new UserError("No encuentro Claude Code en este equipo.",
      "Instálalo (https://claude.com/claude-code), abre una terminal, ejecuta «claude» una vez para iniciar sesión y vuelve a intentarlo. Si está en otra ruta, indícala en Ajustes → Claude Code.", "claude", false);
  }
  const { program: exe, prefix } = await resolveLauncher(resolved);
  const args = [...prefix, ...buildClaudeArgs(c, cfg)];
  // Prompt por stdin (sin límite de longitud de línea de comandos)
  const res = await proc.run({
    id: c.jobId ?? uid("p_"), program: exe, args, cwd: jobDir, stdin: c.prompt,
    timeoutS: Math.round((c.timeoutMin ?? cfg.timeoutMin) * 60),
    env: { DISABLE_AUTOUPDATER: "1" },
  });
  if (res.timed_out) throw new UserError(`Claude Code tardó demasiado en «${c.label}».`, "Sube el tiempo máximo en Ajustes → Claude Code o reintenta.", "claude");
  const parsed = parseClaudeOutput<T>(res.stdout, res.stderr, res.code);
  // Con el plan de suscripción el costo marginal es 0; se registra el equivalente de API como referencia.
  await addCost({ videoId: c.videoId, channelId: c.channelId, provider: "claude-code", item: c.label, units: parsed.turns, usd: 0, apiEquivUsd: parsed.apiEquivUsd });
  try { await fs.remove(jobDir); } catch { /* noop */ }
  return parsed;
}

/**
 * Si Claude Code se instaló con npm, «claude» es un .cmd que pasa por cmd.exe,
 * y cmd.exe rompe argumentos con comillas o símbolos (el esquema JSON). En ese
 * caso se ejecuta node directamente con el script del CLI.
 */
async function resolveLauncher(resolved: string): Promise<{ program: string; prefix: string[] }> {
  if (!/\.(cmd|bat)$/i.test(resolved)) return { program: resolved, prefix: [] };
  try {
    const text = await fs.readText(resolved);
    const m = text.match(/"%(?:~dp0|dp0)%\\([^"]+?\.(?:js|mjs|cjs))"/i);
    const node = await proc.which("node");
    if (m && node) {
      const dir = resolved.replace(/[\\/][^\\/]+$/, "");
      return { program: node, prefix: [joinPath(dir, m[1])] };
    }
  } catch { /* se usa el .cmd tal cual */ }
  return { program: resolved, prefix: [] };
}

export async function claudeVersion(): Promise<string | null> {
  const cfg = getSettings().claude;
  const resolved = await proc.which(cfg.path || "claude");
  if (!resolved) return null;
  const r = await proc.run({ id: uid("v_"), program: resolved, args: ["--version"], timeoutS: 30 });
  return r.code === 0 ? r.stdout.trim() : null;
}
