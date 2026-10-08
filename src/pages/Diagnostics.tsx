// Detecta y aísla fallos rápido: comprueba cada integración por separado.
import { useEffect, useState } from "react";
import { Stethoscope, CheckCircle2, XCircle, AlertTriangle, Loader2, FolderOpen, Trash2 } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { db, secrets, appPaths, fs } from "../lib/ipc";
import { useBus, emit } from "../lib/bus";
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
import { PageHeader, Card, AsyncButton, Chip } from "../ui/kit";
import { fmtBytes, fmtDate } from "../lib/util";
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
    const missing: string[] = [];
    for (const [n, k] of [["Pexels", SECRET.pexelsApiKey], ["Pixabay", SECRET.pixabayApiKey], ["Freesound", SECRET.freesoundApiKey]]) if (!(await secrets.get(k))) missing.push(n);
    const ov = await secrets.get(SECRET.openverseClientId);
    return missing.length ? { state: "warn", detail: `Faltan claves: ${missing.join(", ")} (Ajustes → Medios).${ov ? "" : " Openverse sin registrar."}` } : { state: "ok", detail: `Listas${ov ? "" : " · Openverse sin registrar"}` };
  } },
  { id: "wikimedia", label: "Wikimedia Commons", run: async () => { await requestJson<any>("Wikimedia", { url: "https://commons.wikimedia.org/w/api.php?action=query&meta=siteinfo&format=json" }, 0); return { state: "ok", detail: "Responde" }; } },
  { id: "youtube", label: "YouTube", run: async () => {
    if (!(await secrets.get(SECRET.youtubeRefreshToken))) return { state: "warn", detail: "No conectado (puedes exportar y subir a mano)" };
    const c = await myChannel(); return c ? { state: "ok", detail: `${c.snippet.title}${c.status?.longUploadsStatus === "allowed" ? " · verificado" : " · verifica el canal por teléfono"}` } : { state: "warn", detail: "Sin canal" };
  } },
  { id: "disk", label: "Espacio en disco", run: async () => { const p = await appPaths(); const f = await fs.diskFree(p.data); return { state: f > 20 * 1024 ** 3 ? "ok" : f > 5 * 1024 ** 3 ? "warn" : "fail", detail: `${fmtBytes(f)} libres` }; } },
];

export function Diagnostics() {
  const tick = useBus("events");
  const [res, setRes] = useState<Record<string, Res>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [level, setLevel] = useState("all");
  useEffect(() => { void db.query(`SELECT * FROM events ${level === "all" ? "" : "WHERE level=?"} ORDER BY ts DESC LIMIT 300`, level === "all" ? [] : [level]).then(setEvents); }, [tick, level]);

  const runAll = async () => {
    await Promise.all(CHECKS.map(async (c) => {
      setRes((r) => ({ ...r, [c.id]: { state: "running", detail: "" } }));
      try { const out = await c.run(); setRes((r) => ({ ...r, [c.id]: out })); }
      catch (e) { const t = errorText(e); setRes((r) => ({ ...r, [c.id]: { state: "fail", detail: t.message } })); }
    }));
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Diagnóstico"
        actions={<><button className="btn-ghost" onClick={async () => void openPath((await appPaths()).data)}><FolderOpen size={15} /> Carpeta de datos</button>
          <AsyncButton className="btn-primary" onClick={runAll}><Stethoscope size={15} /> Comprobar todo</AsyncButton></>} />
      <Card pad={false}>
        <div className="divide-y divide-border/60">
          {CHECKS.map((c) => {
            const r = res[c.id] ?? { state: "idle", detail: "Sin comprobar" };
            const I = r.state === "ok" ? CheckCircle2 : r.state === "warn" ? AlertTriangle : r.state === "fail" ? XCircle : r.state === "running" ? Loader2 : Stethoscope;
            const cls = r.state === "ok" ? "text-green-700 dark:text-green-500" : r.state === "warn" ? "text-amber-700 dark:text-amber-500" : r.state === "fail" ? "text-red-600 dark:text-red-500" : "text-muted-foreground";
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <I size={18} className={`${cls} ${r.state === "running" ? "animate-spin" : ""}`} />
                <div className="flex-1"><div className="text-sm font-medium">{c.label}</div><div className="text-xs text-muted-foreground">{r.detail}</div></div>
                <AsyncButton className="btn-ghost btn-sm" onClick={async () => { try { setRes((x) => ({ ...x, [c.id]: { state: "running", detail: "" } })); const o = await c.run(); setRes((x) => ({ ...x, [c.id]: o })); } catch (e) { setRes((x) => ({ ...x, [c.id]: { state: "fail", detail: errorText(e).message } })); } }}>Probar</AsyncButton>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Registro" actions={<>
        <select className="input h-8 py-0 w-32 text-xs" value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">Todos</option><option value="error">Errores</option><option value="warn">Avisos</option><option value="info">Información</option></select>
        <button className="btn-ghost btn-sm" onClick={async () => { if (confirm("¿Borrar eventos de más de 30 días?")) { await db.execute("DELETE FROM events WHERE ts<?", [Date.now() - 30 * 86400000]); emit("events"); } }}><Trash2 size={13} /></button>
      </>} pad={false}>
        <div className="max-h-[50vh] overflow-y-auto divide-y divide-border/50">
          {events.map((e) => (
            <details key={e.id} className="px-4 py-2 text-xs">
              <summary className="cursor-pointer flex items-center gap-2">
                <Chip tone={e.level === "error" ? "red" : e.level === "warn" ? "amber" : e.level === "success" ? "green" : "muted"}>{e.level}</Chip>
                <span className="text-muted-foreground tabular w-28 shrink-0">{fmtDate(e.ts)}</span>
                <span className="text-muted-foreground w-24 shrink-0 truncate">{e.source}</span>
                <span className="truncate">{e.message}</span>
              </summary>
              {e.detail && <pre className="mt-2 whitespace-pre-wrap text-[11px] text-muted-foreground bg-secondary/50 rounded p-2 max-h-64 overflow-y-auto">{e.detail}</pre>}
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
