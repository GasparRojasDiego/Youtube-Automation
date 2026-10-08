// Motor de motion: abre Edge/Chrome sin ventana, carga la composición, fija
// cada instante t (render determinista) y captura los cuadros, que ffmpeg
// convierte en un clip (MP4 para planos completos, MOV con alfa para capas).
// Independiente de Tauri (recibe un «host»), para poder probarlo con Node.
import { Cdp } from "./cdp";
import { buildPage, fileUrlOf, libFiles, plainPath, LIBS_CHECK, FONT_FILES, type Composition } from "./page";

export interface MotionHost {
  spawn(id: string, program: string, args: string[]): Promise<void>;
  stop(id: string): Promise<void>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  writeB64(path: string, b64: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  ffmpeg(args: string[], cwd?: string): Promise<void>;
  join(...parts: string[]): string;
  sleep(ms: number): Promise<void>;
}

export interface Browser {
  cdp: Cdp; procId: string; profileDir: string; host: MotionHost; workRoot: string;
  /** Bibliotecas leídas una vez por sesión (se insertan en cada página) y carpeta de fuentes copiada. */
  code: Record<string, string>; fontBase: string | null;
}

export const BROWSER_CANDIDATES_WIN = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

export function browserArgs(profileDir: string, width = 1920, height = 1080): string[] {
  return [
    "--headless=new", "--remote-debugging-port=0", "--remote-allow-origins=*", `--user-data-dir=${profileDir}`,
    "--allow-file-access-from-files", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio",
    "--force-device-scale-factor=1", `--window-size=${width},${height}`, "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--font-render-hinting=none",
    "--force-color-profile=srgb", "--disable-extensions", "--disable-sync", "--disable-features=Translate,EdgeCollections,msEdgeSidebarV2",
    "about:blank",
  ];
}

/** Inicia el navegador y se conecta por CDP. */
export async function launchBrowser(host: MotionHost, program: string, workDir: string): Promise<Browser> {
  const profileDir = host.join(workDir, `perfil-${Date.now().toString(36)}`);
  await host.mkdir(profileDir);
  const procId = `motion-${Date.now().toString(36)}`;
  await host.spawn(procId, program, browserArgs(profileDir));
  // El navegador escribe el puerto elegido en DevToolsActivePort
  let port = ""; let path = "";
  for (let i = 0; i < 100 && !port; i++) {
    await host.sleep(200);
    const txt = await host.readText(host.join(profileDir, "DevToolsActivePort"));
    if (txt) { const [p, q] = txt.split(/\r?\n/); if (p && q) { port = p.trim(); path = q.trim(); } }
  }
  if (!port) { await host.stop(procId); throw new Error("El navegador no abrió el puerto de depuración (¿ruta incorrecta o bloqueado por el antivirus?)"); }
  const cdp = await Cdp.connect(`ws://127.0.0.1:${port}${path}`);
  return { cdp, procId, profileDir, host, workRoot: workDir, code: {}, fontBase: null };
}

export async function closeBrowser(b: Browser) {
  try { await b.cdp.send("Browser.close", {}, undefined, 5000); } catch { /* noop */ }
  b.cdp.close();
  await b.host.stop(b.procId);
  await b.host.sleep(400);
  try { await b.host.remove(b.profileDir); } catch { /* el perfil puede seguir bloqueado un momento */ }
}

export interface RenderOpts {
  width?: number; height?: number; fps?: number;
  resources: string; fontsDir: string;   // carpeta con gsap.min.js… y carpeta de fuentes
  workDir: string;                        // carpeta temporal de esta composición
  out: string;                            // .mp4 (opaco) o .mov (con alfa)
  samples?: number[];                     // fracciones 0..1 de cuadros a conservar como muestra (revisión visual)
  onFrame?: (i: number, total: number, preview?: { b64: string; mime: string }) => void;
  previewEvery?: number;
  cancelled?: () => boolean;
}

export interface RenderResult { file: string; frames: number; duration: number; errors: string[]; samples: string[]; consoleErrors: string[] }

/** Error del motor (bibliotecas, navegador, ffmpeg): no se arregla pidiéndole otra versión a Opus. */
export class EngineError extends Error {}

/** Lee las bibliotecas y copia las fuentes a la carpeta de trabajo (una vez por sesión). */
async function ensureKit(b: Browser, resources: string, fontsDir: string, files: string[]) {
  const host = b.host;
  for (const f of [...files, "kit.js", "kit.css"]) {
    if (b.code[f] != null) continue;
    const txt = await host.readText(host.join(resources, f)).catch(() => null);
    if (!txt) throw new EngineError(`No encuentro ${f} en ${plainPath(resources)}. Reinstala ATRIL (faltan recursos de animación).`);
    b.code[f] = txt;
  }
  if (!b.fontBase) {
    const dst = host.join(b.workRoot, "_kit", "fonts");
    await host.mkdir(dst);
    for (const f of FONT_FILES) await host.copy(host.join(fontsDir, f.file), host.join(dst, f.file)).catch(() => { /* la fuente faltante cae a otra del sistema */ });
    b.fontBase = fileUrlOf(dst) + "/";
  }
}

/** Renderiza una composición a video. Lanza error si la página falla al cargar. */
export async function renderComposition(b: Browser, c: Composition, o: RenderOpts): Promise<RenderResult> {
  const W = o.width ?? 1920, H = o.height ?? 1080, fps = o.fps ?? 30;
  const host = b.host;
  await host.mkdir(o.workDir);
  const pagePath = host.join(o.workDir, "composicion.html");
  await ensureKit(b, o.resources, o.fontsDir, libFiles(c.libs));
  await host.writeText(pagePath, buildPage(c, { width: W, height: H, code: b.code, fontBase: b.fontBase! }));
  const { targetId } = await b.cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await b.cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m: string, p: Record<string, unknown> = {}, t?: number) => b.cdp.send(m, p, sessionId, t);
  const consoleErrors: string[] = [];
  const off = b.cdp.on((method, params, sid) => {
    if (sid !== sessionId) return;
    if (method === "Runtime.exceptionThrown") consoleErrors.push(String(params?.exceptionDetails?.exception?.description ?? params?.exceptionDetails?.text ?? "excepción").slice(0, 500));
    if (method === "Runtime.consoleAPICalled" && params?.type === "error") consoleErrors.push((params.args ?? []).map((a: any) => a.value ?? a.description ?? "").join(" ").slice(0, 500));
    if (method === "Log.entryAdded" && params?.entry?.level === "error" && !/favicon/.test(params.entry.url ?? "")) consoleErrors.push(`${params.entry.text} ${params.entry.url ?? ""}`.slice(0, 500));
  });
  try {
    await s("Page.enable"); await s("Runtime.enable"); await s("Log.enable");
    await s("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    if (c.transparent) await s("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await s("Page.navigate", { url: fileUrlOf(pagePath) });
    // Espera a que la composición registre su timeline y carguen fuentes e imágenes
    let ready = false; let errs: string[] = [];
    for (let i = 0; i < 150 && !ready; i++) {
      await host.sleep(100);
      try {
        const r = await s("Runtime.evaluate", { expression: "JSON.stringify({r: !!(window.ATRIL && ATRIL.isReady && ATRIL.isReady()), e: (window.ATRIL && ATRIL.errors) || []})", returnByValue: true });
        const v = JSON.parse(r.result?.value ?? "{}");
        ready = !!v.r; errs = v.e ?? [];
        if (errs.length) break;
      } catch { /* la página aún carga */ }
    }
    // ¿Cargaron GSAP y el kit? Si no, es un problema del motor (no del código de la animación).
    try {
      const chk = JSON.parse((await s("Runtime.evaluate", { expression: LIBS_CHECK, returnByValue: true })).result?.value ?? "{}");
      if (!chk.gsap || !chk.split || !chk.kit) throw new EngineError(`El motor no cargó sus bibliotecas (gsap: ${chk.gsap ? "sí" : "no"}, kit: ${chk.kit ? "sí" : "no"}). ${consoleErrors.slice(0, 2).join(" · ")}`.trim());
    } catch (e) { if (e instanceof EngineError) throw e; }
    if (errs.length || !ready) {
      const why = errs.length ? errs : consoleErrors.length ? consoleErrors : ["La composición no llamó a ATRIL.register(tl) ni a ATRIL.onRender(fn) en 15 s"];
      throw new MotionError(why.slice(0, 6).join("\n"));
    }
    const durR = await s("Runtime.evaluate", { expression: "Number(ATRIL.duration)||0", returnByValue: true });
    const duration = Math.min(30, Math.max(0.5, Number(durR.result?.value) || c.duration));
    const total = Math.max(1, Math.round(duration * fps));
    const fmt = c.transparent ? "png" : "jpeg";
    const ext = c.transparent ? "png" : "jpg";
    const sampleIdx = new Set((o.samples ?? []).map((f) => Math.min(total - 1, Math.max(0, Math.round(f * (total - 1))))));
    const samples: string[] = [];
    for (let i = 0; i < total; i++) {
      if (o.cancelled?.()) throw new Error("Cancelado");
      await s("Runtime.evaluate", { expression: `ATRIL.seek(${(i / fps).toFixed(5)})`, returnByValue: true });
      const shot = await s("Page.captureScreenshot", { format: fmt, ...(fmt === "jpeg" ? { quality: 94 } : {}), fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true });
      const f = host.join(o.workDir, `f_${String(i).padStart(5, "0")}.${ext}`);
      await host.writeB64(f, shot.data);
      if (sampleIdx.has(i)) { const sp = host.join(o.workDir, `muestra_${String(i).padStart(5, "0")}.${ext}`); await host.writeB64(sp, shot.data); samples.push(sp); }
      const every = o.previewEvery ?? 12;
      o.onFrame?.(i + 1, total, i % every === 0 ? { b64: shot.data, mime: fmt === "png" ? "image/png" : "image/jpeg" } : undefined);
    }
    const late = await s("Runtime.evaluate", { expression: "JSON.stringify(ATRIL.errors||[])", returnByValue: true });
    const lateErrors: string[] = JSON.parse(late.result?.value ?? "[]");
    // Codificación: rutas relativas a la carpeta de trabajo (evita problemas de escape en Windows)
    const args = c.transparent
      ? ["-y", "-hide_banner", "-loglevel", "error", "-framerate", String(fps), "-i", `f_%05d.${ext}`, "-c:v", "png", "-pix_fmt", "rgba", "-f", "mov", o.out]
      : ["-y", "-hide_banner", "-loglevel", "error", "-framerate", String(fps), "-i", `f_%05d.${ext}`, "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", o.out];
    try { await host.ffmpeg(args, o.workDir); }
    catch (e) { throw new EngineError(`ffmpeg no pudo codificar la animación: ${e instanceof Error ? e.message : String(e)}`); }
    return { file: o.out, frames: total, duration: total / fps, errors: lateErrors, samples, consoleErrors };
  } finally {
    off();
    try { await b.cdp.send("Target.closeTarget", { targetId }); } catch { /* noop */ }
  }
}

/** Error de la composición (código de Opus): se reintenta pidiendo una corrección. */
export class MotionError extends Error {}

/** Lista de archivos de cuadros a borrar tras codificar. */
export function frameFiles(host: MotionHost, dir: string, total: number, ext: string): string[] {
  return Array.from({ length: total }, (_, i) => host.join(dir, `f_${String(i).padStart(5, "0")}.${ext}`));
}
