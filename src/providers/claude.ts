// Proveedor de lenguaje: Claude Code CLI en modo no interactivo (`claude -p`),
// con la sesión del plan del usuario. Salida estructurada con --json-schema y
// eventos en vivo con --output-format stream-json: cada búsqueda, lectura y
// texto intermedio se muestra en el Estudio en vivo, y los eventos oficiales
// `rate_limit_event` informan cuánto del plan (5 h / 7 días) se ha usado.
import { proc, appPaths, fs } from "../lib/ipc";
import { getSettings, type StageModelKey } from "../lib/settings";
import { UserError } from "../lib/events";
import { addCost } from "../lib/costs";
import { activity } from "../lib/activity";
import { getLimits, setLimits, parseRateLimit, recordClaudeRun, type ClaudeLimits } from "../lib/usage";
import { joinPath, uid, extractJson, safeJson, baseName, truncate } from "../lib/util";

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
  activityStage?: string;    // etapa del pipeline para el Estudio en vivo (por defecto, `stage`)
  onStep?: (text: string) => void;
  quiet?: boolean;           // no mostrar textos intermedios (lotes masivos)
  /** Imágenes enviadas directamente en el mensaje (visión en un solo turno, sin herramientas). */
  images?: { label: string; path: string; mime?: string }[];
}

export interface Tokens { input: number; cacheRead: number; cacheWrite: number; output: number; webSearches: number }
export interface ClaudeResult<T> { data: T; apiEquivUsd: number; turns: number; durationMs: number; tokens?: Tokens; model?: string }

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
    "--output-format", "stream-json", "--verbose",
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

/** Suma los tokens de todos los modelos usados (incluye subagentes y Haiku auxiliar). */
export function sumUsage(modelUsage: any, usage?: any): { tokens: Tokens; model: string } {
  const t: Tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, webSearches: 0 };
  let model = ""; let best = -1;
  const entries = Object.entries(modelUsage ?? {}) as [string, any][];
  for (const [name, u] of entries) {
    t.input += Number(u.inputTokens ?? 0); t.cacheRead += Number(u.cacheReadInputTokens ?? 0);
    t.cacheWrite += Number(u.cacheCreationInputTokens ?? 0); t.output += Number(u.outputTokens ?? 0);
    t.webSearches += Number(u.webSearchRequests ?? 0);
    const w = Number(u.costUSD ?? 0);
    if (w > best) { best = w; model = name; }
  }
  if (!entries.length && usage) {
    t.input = Number(usage.input_tokens ?? 0); t.cacheRead = Number(usage.cache_read_input_tokens ?? 0);
    t.cacheWrite = Number(usage.cache_creation_input_tokens ?? 0); t.output = Number(usage.output_tokens ?? 0);
    t.webSearches = Number(usage.server_tool_use?.web_search_requests ?? 0);
  }
  return { tokens: t, model };
}

/** Busca el evento `result` (stream-json) o el objeto único (json). */
function findResult(stdout: string): any {
  const lines = stdout.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{"));
  for (let i = lines.length - 1; i >= 0; i--) {
    const j = safeJson<any>(lines[i], null);
    if (j && (j.type === "result" || "structured_output" in j || "is_error" in j)) return j;
  }
  return safeJson<any>(stdout.trim(), null);
}

/** Interpreta la salida de `claude -p` (stream-json o json). */
export function parseClaudeOutput<T>(stdout: string, stderr: string, code: number): ClaudeResult<T> {
  const out = findResult(stdout);
  const all = `${stdout}\n${stderr}`.toLowerCase();
  if (!out) {
    if (/log ?in|logged in|authenticat|\/login|api key/.test(all))
      throw new UserError("Claude Code no tiene una sesión iniciada.", "En una terminal ejecuta «claude» e inicia sesión. " + stderr.slice(-800), "claude", false);
    throw new UserError(`Claude Code terminó sin respuesta válida (código ${code}).`, (stderr || stdout).slice(-2000), "claude");
  }
  if (out.is_error || (out.subtype && out.subtype !== "success")) {
    const msg = String(out.result ?? out.error ?? out.subtype ?? "error desconocido");
    if (/usage limit|limit reached|rate limit|quota/i.test(msg))
      throw new UserError("Se agotó el límite de uso del plan.", `Lo hecho quedó guardado. Reanuda cuando se reponga. ${msg}`, "claude");
    if (/max.?turns/i.test(String(out.subtype)))
      throw new UserError("Claude Code se quedó sin pasos.", msg, "claude");
    throw new UserError(`Claude Code devolvió un error: ${msg.slice(0, 300)}`, JSON.stringify(out).slice(0, 3000), "claude");
  }
  let data = out.structured_output;
  if (data == null && typeof out.result === "string") data = extractJson(out.result);
  if (data == null) throw new UserError("Claude Code no devolvió datos estructurados.", String(out.result ?? "").slice(0, 2000), "claude");
  const { tokens, model } = sumUsage(out.modelUsage, out.usage);
  return { data: data as T, apiEquivUsd: Number(out.total_cost_usd ?? 0), turns: Number(out.num_turns ?? 0), durationMs: Number(out.duration_ms ?? 0), tokens, model };
}

/** Describe un uso de herramienta para el Estudio en vivo. */
export function describeTool(name: string, input: any): { kind: "search" | "fetch" | "read" | "think"; title: string; detail: string } | null {
  switch (name) {
    case "StructuredOutput": return null;
    case "WebSearch": return { kind: "search", title: `Buscando: ${truncate(String(input?.query ?? ""), 140)}`, detail: "" };
    case "WebFetch": return { kind: "fetch", title: `Leyendo: ${truncate(String(input?.url ?? ""), 160)}`, detail: truncate(String(input?.prompt ?? ""), 400) };
    case "Read": return { kind: "read", title: `Mirando: ${baseName(String(input?.file_path ?? ""))}`, detail: String(input?.file_path ?? "") };
    case "Glob": case "Grep": return { kind: "read", title: `Explorando archivos: ${truncate(String(input?.pattern ?? ""), 100)}`, detail: "" };
    default: return { kind: "think", title: `Usando ${name}`, detail: truncate(JSON.stringify(input ?? {}), 300) };
  }
}

const sameWin = (a: ClaudeLimits["fiveHour"], b: ClaudeLimits["fiveHour"]) => !!a && !!b && Math.abs(a.resetsAt - b.resetsAt) < 120_000;

/**
 * Ajusta el estado «antes» a la ventana vigente: si la ventana anterior ya se
 * repuso cuando empezó la tarea, la utilización de partida es 0.
 */
export function alignBefore(before: ClaudeLimits | null, after: ClaudeLimits | null, startedAt: number): ClaudeLimits | null {
  if (!before || !after) return before;
  const fix = (b: ClaudeLimits["fiveHour"], a: ClaudeLimits["fiveHour"]) => {
    if (!b || !a) return b;
    if (sameWin(b, a)) return b;
    return b.resetsAt <= startedAt ? { utilization: 0, resetsAt: a.resetsAt } : null;
  };
  return { ...before, fiveHour: fix(before.fiveHour, after.fiveHour), sevenDay: fix(before.sevenDay, after.sevenDay) };
}

export async function claudeRun<T>(c: ClaudeCall): Promise<ClaudeResult<T>> {
  const cfg = getSettings().claude;
  const paths = await appPaths();
  const jobDir = joinPath(paths.data, "jobs", uid("cj_"));
  await fs.mkdir(jobDir);
  const program = cfg.path || "claude";
  const resolved = await proc.which(program);
  if (!resolved) {
    throw new UserError("No encuentro Claude Code.",
      "Instálalo, ejecuta «claude» para iniciar sesión y reintenta. Otra ruta: Ajustes → Claude Code.", "claude", false);
  }
  const { program: exe, prefix } = await resolveLauncher(resolved);
  const args = [...prefix, ...buildClaudeArgs(c, cfg)];
  let stdin = c.prompt;
  if (c.images?.length) {
    // Mensaje con bloques de imagen (stream-json de entrada): un solo turno, sin llamadas a Read.
    const content: unknown[] = [{ type: "text", text: c.prompt }];
    for (const im of c.images) {
      content.push({ type: "text", text: im.label });
      content.push({ type: "image", source: { type: "base64", media_type: im.mime ?? "image/jpeg", data: await fs.readB64(im.path) } });
    }
    args.push("--input-format", "stream-json");
    stdin = JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n";
  }
  // Id propio por llamada (varias corren en paralelo); «Detener» mata todas las de la tarea por el prefijo
  const runId = c.jobId ? `${c.jobId}:${uid("c")}` : uid("p_");
  const stage = c.activityStage ?? c.stage;
  const model = cfg.models[c.stage] || "sonnet";
  const startedAt = Date.now();
  const before = await getLimits();
  let after: ClaudeLimits | null = null;
  await activity(c.videoId, stage, "think", `Claude (${model}) · ${c.label}`, "");
  // Eventos en vivo
  const off = await proc.onLine((e) => {
    if (e.id !== runId || e.stream !== "stdout" || !e.line.startsWith("{")) return;
    const j = safeJson<any>(e.line, null);
    if (!j) return;
    if (j.type === "rate_limit_event") {
      const l = parseRateLimit(j.rate_limit_info);
      if (l) { after = l; void setLimits(l); }
    } else if (j.type === "assistant") {
      for (const b of j.message?.content ?? []) {
        if (b.type === "tool_use") {
          const d = describeTool(b.name, b.input);
          if (d) { void activity(c.videoId, stage, d.kind, d.title, d.detail); c.onStep?.(d.title); }
        } else if (b.type === "text" && !c.quiet && b.text?.trim()) {
          void activity(c.videoId, stage, "text", truncate(b.text.trim().replace(/\s+/g, " "), 280), b.text.slice(0, 2000));
        }
      }
    }
  });
  let res;
  try {
    // Prompt por stdin (sin límite de longitud de línea de comandos)
    res = await proc.run({
      id: runId, program: exe, args, cwd: jobDir, stdin, stream: true,
      timeoutS: Math.round((c.timeoutMin ?? cfg.timeoutMin) * 60),
      env: { DISABLE_AUTOUPDATER: "1" },
    });
  } finally { off(); }
  if (res.timed_out) throw new UserError(`Claude Code tardó demasiado en «${c.label}».`, "Sube el tiempo máximo en Ajustes → Claude Code o reintenta.", "claude");
  let parsed: ClaudeResult<T> | null = null; let err: unknown = null;
  try { parsed = parseClaudeOutput<T>(res.stdout, res.stderr, res.code); } catch (e) { err = e; }
  // Consumo exacto de la tarea (también si falló: los tokens ya se gastaron)
  const raw = findResult(res.stdout);
  const usage = parsed ? { tokens: parsed.tokens!, model: parsed.model! } : sumUsage(raw?.modelUsage, raw?.usage);
  const apiEquiv = parsed?.apiEquivUsd ?? Number(raw?.total_cost_usd ?? 0);
  await recordClaudeRun({
    videoId: c.videoId, stage, label: c.label, model: usage.model || model, ...usage.tokens, apiEquiv,
    durationMs: Date.now() - startedAt, before: alignBefore(before, after, startedAt), after, ok: !!parsed,
  });
  await activity(c.videoId, stage, "usage", `${c.label}: ${fmtTokens(usage.tokens)}`, JSON.stringify({ ...usage.tokens, apiEquiv, model: usage.model }));
  // Con el plan de suscripción el costo marginal es 0; se registra el equivalente de API como referencia.
  await addCost({ videoId: c.videoId, channelId: c.channelId, provider: "claude-code", item: c.label, units: parsed?.turns ?? 0, usd: 0, apiEquivUsd: apiEquiv });
  try { await fs.remove(jobDir); } catch { /* noop */ }
  if (err) throw err;
  return parsed!;
}

export function fmtTokens(t: Tokens): string {
  const k = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)} k` : String(n);
  return `${k(t.input + t.cacheRead + t.cacheWrite)} tokens de entrada (${k(t.cacheRead)} en caché) · ${k(t.output)} de salida${t.webSearches ? ` · ${t.webSearches} búsquedas` : ""}`;
}

/**
 * Consulta mínima (Haiku, sin herramientas) para obtener el estado actual del
 * plan cuando no hay tareas recientes. Gasta unos pocos cientos de tokens.
 */
export async function refreshPlanUsage(): Promise<ClaudeLimits | null> {
  const cfg = getSettings().claude;
  const resolved = await proc.which(cfg.path || "claude");
  if (!resolved) return null;
  const { program: exe, prefix } = await resolveLauncher(resolved);
  const paths = await appPaths();
  const jobDir = joinPath(paths.data, "jobs", uid("cu_"));
  await fs.mkdir(jobDir);
  const res = await proc.run({
    id: uid("cu_"), program: exe, cwd: jobDir, stdin: "Reply with: ok", timeoutS: 120, env: { DISABLE_AUTOUPDATER: "1" },
    args: [...prefix, "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--model", "haiku",
      "--system-prompt", "Reply with the single word ok.", "--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--max-turns", "1"],
  });
  try { await fs.remove(jobDir); } catch { /* noop */ }
  let found: ClaudeLimits | null = null;
  for (const line of res.stdout.split("\n")) {
    const j = safeJson<any>(line.trim(), null);
    if (j?.type === "rate_limit_event") found = parseRateLimit(j.rate_limit_info) ?? found;
  }
  const raw = findResult(res.stdout);
  if (raw) {
    const u = sumUsage(raw.modelUsage, raw.usage);
    await recordClaudeRun({ videoId: null, stage: "usage", label: "Consulta del límite", model: u.model || "haiku", ...u.tokens,
      apiEquiv: Number(raw.total_cost_usd ?? 0), durationMs: Number(raw.duration_ms ?? 0), before: await getLimits(), after: found, ok: !raw.is_error });
  }
  if (found) await setLimits(found);
  return found;
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
