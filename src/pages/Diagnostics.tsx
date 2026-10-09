// Detecta y aísla fallos rápido: comprueba cada integración por separado.
import { useState } from "react";
import { Stethoscope, CheckCircle2, XCircle, AlertTriangle, Loader2, CircleDashed, Copy, Check, ClipboardCopy } from "lucide-react";
import { db, secrets, appPaths, fs } from "../lib/ipc";
import { SECRET, getSettings } from "../lib/settings";
import { claudeVersion, refreshPlanUsage } from "../providers/claude";
import { pct, fmtReset } from "../lib/usage";
import { findBrowser, tauriHost, motionResources } from "../motion/host";
import { launchBrowser, closeBrowser, renderComposition } from "../motion/engine";
import { libraryRoot } from "../media/library";
import { joinPath } from "../lib/util";
import { ffmpegVersion, pickEncoder } from "../providers/ffmpeg";
import { requestJson } from "../providers/net";
import { imageProvider, GEMINI_IMAGE_MODELS, OPENAI_IMAGE_MODELS } from "../providers/images";
import { synthSfx } from "../media/sfx";
import { myChannel } from "../providers/youtube";
import { PageHeader, Card } from "../ui/kit";
import { Constellation } from "../ui/Constellation";
import { appVersion } from "../lib/updater";
import { fmtBytes } from "../lib/util";
import { errorText } from "../lib/events";

type Res = { state: "ok" | "warn" | "fail" | "running" | "idle"; detail: string };
const CHECKS: { id: string; label: string; run: () => Promise<Res> }[] = [
  { id: "claude", label: "Claude Code", run: async () => { const v = await claudeVersion(); return v ? { state: "ok", detail: v } : { state: "fail", detail: "No encontrado. Instálalo y ejecuta «claude» para iniciar sesión." }; } },
  { id: "ffmpeg", label: "ffmpeg", run: async () => { const v = await ffmpegVersion(); return v ? { state: "ok", detail: v } : { state: "fail", detail: "No encontrado" }; } },
  { id: "encoder", label: "Codificador", run: async () => { const e = await pickEncoder(); return { state: "ok", detail: e.name === "h264_qsv" ? "Intel Quick Sync" : e.name }; } },
  { id: "google", label: "Voz (Google TTS)", run: async () => {
    const k = await secrets.get(SECRET.googleApiKey); if (!k) return { state: "warn", detail: "Sin clave" };
    const r = await requestJson<any>("Google TTS", { url: `https://texttospeech.googleapis.com/v1/voices?languageCode=en-US&key=${encodeURIComponent(k)}` }, 0);
    const v = getSettings().tts.google.voice; const has = (r.voices ?? []).some((x: any) => x.name === v);
    return has ? { state: "ok", detail: `Voz «${v}» disponible` } : { state: "warn", detail: `La voz «${v}» ya no existe; elige otra en Ajustes → Voz` };
  } },
  { id: "images", label: "Imágenes con IA", run: async () => {
    const p = await imageProvider();
    if (!p) return { state: "warn", detail: "Sin clave de OpenAI ni Gemini: no habrá imágenes con IA (más tarjetas)." };
    if (p === "gemini") {
      const k = (await secrets.get(SECRET.geminiApiKey))!;
      for (const m of [getSettings().images.gemini.model, ...GEMINI_IMAGE_MODELS]) {
        try { await requestJson<any>("Gemini", { url: `https://generativelanguage.googleapis.com/v1beta/models/${m}`, headers: { "x-goog-api-key": k } }, 0); return { state: "ok", detail: `Gemini · modelo «${m}» disponible` }; } catch { /* siguiente */ }
      }
      return { state: "fail", detail: "Ningún modelo de imagen de Gemini responde con tu clave." };
    }
    const k = (await secrets.get(SECRET.openaiApiKey))!;
    const r = await requestJson<any>("OpenAI", { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${k}` } }, 0);
    const ids: string[] = (r.data ?? []).map((x: any) => x.id);
    const m = [getSettings().images.openai.model, ...OPENAI_IMAGE_MODELS].find((x) => ids.includes(x));
    return m ? { state: "ok", detail: `OpenAI · modelo «${m}» disponible` } : { state: "warn", detail: "La clave funciona, pero tu cuenta no lista modelos de imagen (¿organización sin verificar?)." };
  } },
  { id: "sfx", label: "Efectos de sonido", run: async () => {
    const parts: string[] = ["síntesis propia siempre disponible"];
    if (await secrets.get(SECRET.freesoundApiKey)) parts.push("Freesound");
    if (getSettings().sfx.elevenlabs && (await secrets.get(SECRET.elevenlabsApiKey))) parts.push("ElevenLabs");
    const t = joinPath((await appPaths()).data, "diagnostico-sfx.wav");
    await synthSfx("whoosh", t, 0);
    await fs.remove(t).catch(() => null);
    return { state: "ok", detail: parts.join(" · ") };
  } },
  { id: "plan", label: "Plan de Claude", run: async () => {
    const l = await refreshPlanUsage();
    if (!l) return { state: "warn", detail: "Claude Code no informó el límite. Actualízalo con «claude update»." };
    return { state: (l.fiveHour?.utilization ?? 0) > 0.9 ? "warn" : "ok", detail: `5 h: ${pct(l.fiveHour?.utilization)} (se repone ${fmtReset(l.fiveHour?.resetsAt)}) · 7 días: ${pct(l.sevenDay?.utilization)} (se repone ${fmtReset(l.sevenDay?.resetsAt)})` };
  } },
  { id: "browser", label: "Motor de animaciones", run: async () => {
    const b = await findBrowser(); if (!b) return { state: "fail", detail: "No se encontró Edge ni Chrome" };
    const work = joinPath((await appPaths()).data, "diagnostico-motion");
    const br = await launchBrowser(tauriHost, b, work);
    try {
      const r = await renderComposition(br, { id: "diag", duration: 0.5, transparent: false, libs: ["map"], css: "",
        html: "", js: "const tl=gsap.timeline();const s=K.scene();K.paper(s);K.hud({tl:'ATRIL',tr:'TC'},s);const t=K.title(s,'ATRIL',{font:'Oswald',size:160});K.show(tl,s,0);K.reveal(tl,t,0,{fx:'rise'});ATRIL.register(tl,0.5);" },
        { ...(await motionResources()), workDir: joinPath(work, "c"), out: joinPath(work, "prueba.mp4") });
      const errs = [...r.errors, ...r.consoleErrors];
      return errs.length ? { state: "fail", detail: errs.join(" · ").slice(0, 400) } : { state: "ok", detail: `${b.split(/[\\/]/).pop()} · ${r.frames} cuadros con el kit de animación` };
    } finally { await closeBrowser(br); await fs.remove(work).catch(() => null); }
  } },
  { id: "library", label: "Biblioteca", run: async () => {
    const root = await libraryRoot(); const t = joinPath(root, ".prueba.txt");
    await fs.writeText(t, "ok"); await fs.remove(t);
    const r = await db.query<{ n: number }>("SELECT COUNT(*) n FROM assets");
    return { state: "ok", detail: `${root} · ${r[0]?.n ?? 0} archivos` };
  } },
  { id: "sources", label: "Fuentes de medios", run: async () => {
    const on = getSettings().media.sources;
    const missing: string[] = [];
    for (const [n, id, k] of [["Pexels", "pexels", SECRET.pexelsApiKey], ["Pixabay", "pixabay", SECRET.pixabayApiKey], ["Freesound", "freesound", SECRET.freesoundApiKey]] as const)
      if (on[id] && !(await secrets.get(k))) missing.push(n);
    const ov = !on.openverse || !!(await secrets.get(SECRET.openverseClientId));
    const active = Object.entries(on).filter(([, v]) => v).length;
    return missing.length || !ov
      ? { state: "warn", detail: `${missing.length ? `Faltan claves: ${missing.join(", ")} (o apaga esa fuente en Ajustes → Medios).` : ""}${ov ? "" : " Openverse sin registrar."}`.trim() }
      : { state: "ok", detail: `${active} fuentes activas` };
  } },
  { id: "wikimedia", label: "Wikimedia Commons", run: async () => { await requestJson<any>("Wikimedia", { url: "https://commons.wikimedia.org/w/api.php?action=query&meta=siteinfo&format=json" }, 0); return { state: "ok", detail: "Responde" }; } },
  { id: "youtube", label: "YouTube", run: async () => {
    if (!(await secrets.get(SECRET.youtubeRefreshToken))) return { state: "warn", detail: "No conectado (puedes exportar y subir a mano)" };
    const c = await myChannel(); return c ? { state: "ok", detail: `${c.snippet.title}${c.status?.longUploadsStatus === "allowed" ? " · verificado" : " · verifica el canal por teléfono"}` } : { state: "warn", detail: "Sin canal" };
  } },
  { id: "disk", label: "Espacio en disco", run: async () => { const p = await appPaths(); const f = await fs.diskFree(p.data); return { state: f > 20 * 1024 ** 3 ? "ok" : f > 5 * 1024 ** 3 ? "warn" : "fail", detail: `${fmtBytes(f)} libres` }; } },
];

const ICON = { ok: CheckCircle2, warn: AlertTriangle, fail: XCircle, running: Loader2, idle: CircleDashed } as const;
const TONE = { ok: "text-green-600 dark:text-green-500", warn: "text-amber-600 dark:text-amber-500", fail: "text-red-600 dark:text-red-500", running: "text-primary", idle: "text-muted-foreground" } as const;

/** Informe en texto plano para pegarlo en el chat con Claude (sin claves ni datos privados). */
async function buildReport(res: Record<string, Res>): Promise<string> {
  const s = getSettings();
  const ev = await db.query<{ ts: number; level: string; source: string; message: string; detail: string }>(
    "SELECT ts, level, source, message, detail FROM events WHERE level IN ('error','warn') ORDER BY ts DESC LIMIT 15");
  const lines = [
    `INFORME DE DIAGNÓSTICO DE ATRIL v${await appVersion()}`,
    `Fecha: ${new Date().toISOString()}`,
    `Sistema: ${navigator.userAgent}`,
    `Proveedores: voz=${s.tts.provider} · imágenes=${s.images.provider} (${s.images.openai.model} / ${s.images.gemini.model}) · motion=${s.motion.enabled ? "sí" : "no"} · Claude: ${Object.entries(s.claude.models).map(([k, m]) => `${k}=${m}`).join(", ")}`,
    "",
    "COMPROBACIONES",
    ...CHECKS.map((c) => { const r = res[c.id]; return `- [${(r?.state ?? "idle").toUpperCase()}] ${c.label}: ${r?.detail ?? ""}`; }),
    "",
    "ÚLTIMOS ERRORES Y AVISOS",
    ...ev.map((e) => `- ${new Date(e.ts).toISOString()} [${e.level}] ${e.source}: ${e.message}${e.detail ? `\n    ${e.detail.replace(/\s+/g, " ").slice(0, 500)}` : ""}`),
  ];
  return lines.join("\n");
}

export function Diagnostics() {
  const [res, setRes] = useState<Record<string, Res>>({});
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState("");
  const [copied, setCopied] = useState(false);
  const done = Object.values(res).filter((r) => r.state !== "running").length;
  const fails = Object.values(res).filter((r) => r.state === "fail").length;
  const warns = Object.values(res).filter((r) => r.state === "warn").length;

  const run = async () => {
    setRunning(true); setReport(""); setRes({});
    const out: Record<string, Res> = {};
    for (const c of CHECKS) {
      setRes((r) => ({ ...r, [c.id]: { state: "running", detail: "Comprobando…" } }));
      try { out[c.id] = await c.run(); } catch (e) { out[c.id] = { state: "fail", detail: errorText(e).message }; }
      setRes((r) => ({ ...r, [c.id]: out[c.id] }));
    }
    if (Object.values(out).some((r) => r.state !== "ok")) setReport(await buildReport(out));
    setRunning(false);
  };

  return (
    <div className="space-y-5">
      <PageHeader kicker="Control" title="Diagnóstico" subtitle="Comprueba todo con un clic. Si algo falla, copia el informe y pégamelo." />
      <section className="card relative overflow-hidden">
        <Constellation density={26000} max={40} alpha={0.6} />
        <div className="relative flex flex-col items-center text-center py-10 px-6">
          <button onClick={() => void run()} disabled={running}
            className="group relative w-28 h-28 rounded-full grid place-items-center text-primary-foreground disabled:cursor-wait transition-transform duration-300 ease-frame hover:scale-[1.04] active:scale-95"
            style={{ background: "radial-gradient(circle at 30% 25%, hsl(var(--primary)) 0%, hsl(var(--primary) / .75) 60%, hsl(var(--primary) / .55) 100%)", boxShadow: "0 0 0 8px hsl(var(--primary) / .12), 0 0 0 16px hsl(var(--primary) / .06), 0 20px 50px -12px hsl(var(--primary) / .8)" }}>
            {running ? <Loader2 size={34} className="animate-spin" /> : <Stethoscope size={34} />}
            {running && <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-30" />}
          </button>
          <div className="mt-5 text-lg font-semibold tracking-tight">{running ? `Comprobando ${done}/${CHECKS.length}…` : Object.keys(res).length ? (fails || warns ? `${fails} fallo(s) · ${warns} aviso(s)` : "Todo en orden") : "Diagnosticar"}</div>
          <div className="text-sm text-muted-foreground mt-1">{Object.keys(res).length ? "" : "Claude, ffmpeg, voz, imágenes, animaciones, fuentes de medios, YouTube y disco."}</div>
        </div>
      </section>

      {Object.keys(res).length > 0 && (
        <Card pad={false}>
          <div className="grid grid-cols-2 divide-x divide-y divide-border/60">
            {CHECKS.map((c) => {
              const r = res[c.id] ?? { state: "idle" as const, detail: "En espera" };
              const I = ICON[r.state];
              return (
                <div key={c.id} className="flex items-start gap-3 px-5 py-3.5 animate-fade-up">
                  <I size={18} className={`mt-0.5 shrink-0 ${TONE[r.state]} ${r.state === "running" ? "animate-spin" : ""}`} />
                  <div className="min-w-0"><div className="text-sm font-medium">{c.label}</div><div className="text-xs text-muted-foreground break-words">{r.detail}</div></div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {report && (
        <Card title="Informe para Claude" icon={ClipboardCopy} actions={
          <button className="btn-primary btn-sm" onClick={async () => { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar informe"}
          </button>}>
          <div className="text-xs text-muted-foreground mb-2">Pégalo tal cual en el chat: incluye los fallos y los últimos errores, sin claves ni datos privados.</div>
          <pre className="font-mono text-[11px] leading-relaxed bg-input border border-border rounded-lg p-3 max-h-80 overflow-auto whitespace-pre-wrap">{report}</pre>
        </Card>
      )}
    </div>
  );
}
