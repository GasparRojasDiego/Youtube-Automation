// Detecta y aísla fallos rápido: comprueba cada integración por separado.
import { useEffect, useState } from "react";
import { Stethoscope, CheckCircle2, XCircle, AlertTriangle, Loader2, FolderOpen, Trash2 } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { db, secrets, appPaths, fs } from "../lib/ipc";
import { useBus, emit } from "../lib/bus";
import { SECRET, getSettings } from "../lib/settings";
import { claudeVersion } from "../providers/claude";
import { ffmpegVersion, pickEncoder } from "../providers/ffmpeg";
import { requestJson } from "../providers/net";
import { myChannel } from "../providers/youtube";
import { PageHeader, Card, AsyncButton, Chip } from "../ui/kit";
import { fmtBytes, fmtDate } from "../lib/util";
import { errorText } from "../lib/events";

type Res = { state: "ok" | "warn" | "fail" | "running" | "idle"; detail: string };
const CHECKS: { id: string; label: string; run: () => Promise<Res> }[] = [
  { id: "claude", label: "Claude Code (guion, investigación, verificación)", run: async () => { const v = await claudeVersion(); return v ? { state: "ok", detail: v } : { state: "fail", detail: "No encontrado. Instálalo y ejecuta «claude» una vez para iniciar sesión." }; } },
  { id: "ffmpeg", label: "ffmpeg (montaje)", run: async () => { const v = await ffmpegVersion(); return v ? { state: "ok", detail: v } : { state: "fail", detail: "No encontrado" }; } },
  { id: "encoder", label: "Codificador de video", run: async () => { const e = await pickEncoder(); return { state: "ok", detail: e.name === "h264_qsv" ? "Intel Quick Sync (aceleración por hardware)" : e.name }; } },
  { id: "google", label: "Google Cloud TTS", run: async () => {
    const k = await secrets.get(SECRET.googleApiKey); if (!k) return { state: "warn", detail: "Sin clave" };
    const r = await requestJson<any>("Google TTS", { url: `https://texttospeech.googleapis.com/v1/voices?languageCode=en-US&key=${encodeURIComponent(k)}` }, 0);
    const v = getSettings().tts.google.voice; const has = (r.voices ?? []).some((x: any) => x.name === v);
    return has ? { state: "ok", detail: `Voz «${v}» disponible` } : { state: "warn", detail: `La voz «${v}» ya no aparece en la lista; elige otra en Ajustes → Voz` };
  } },
  { id: "ytdata", label: "YouTube Data API (lectura de referentes)", run: async () => {
    const k = await secrets.get(SECRET.googleApiKey); if (!k) return { state: "warn", detail: "Sin clave" };
    await requestJson<any>("YouTube Data API", { url: `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@YouTube&key=${encodeURIComponent(k)}` }, 0);
    return { state: "ok", detail: "Responde" };
  } },
  { id: "gemini", label: "Gemini (imágenes)", run: async () => {
    const k = await secrets.get(SECRET.geminiApiKey); if (!k) return { state: "warn", detail: "Sin clave" };
    const m = getSettings().images.gemini.model;
    await requestJson<any>("Gemini", { url: `https://generativelanguage.googleapis.com/v1beta/models/${m}?key=${encodeURIComponent(k)}` }, 0);
    return { state: "ok", detail: `Modelo «${m}» disponible` };
  } },
  { id: "wikimedia", label: "Wikimedia Commons (archivo libre)", run: async () => { await requestJson<any>("Wikimedia", { url: "https://commons.wikimedia.org/w/api.php?action=query&meta=siteinfo&format=json" }, 0); return { state: "ok", detail: "Responde" }; } },
  { id: "youtube", label: "YouTube (publicación y métricas)", run: async () => {
    if (!(await secrets.get(SECRET.youtubeRefreshToken))) return { state: "warn", detail: "No conectado (puedes exportar paquetes y subir a mano)" };
    const c = await myChannel(); return c ? { state: "ok", detail: `${c.snippet.title}${c.status?.longUploadsStatus === "allowed" ? " · verificado" : " · verifica el canal por teléfono para miniaturas y videos largos"}` } : { state: "warn", detail: "Sin canal" };
  } },
  { id: "disk", label: "Espacio en disco", run: async () => { const p = await appPaths(); const f = await fs.diskFree(p.data); return { state: f > 20 * 1024 ** 3 ? "ok" : f > 5 * 1024 ** 3 ? "warn" : "fail", detail: `${fmtBytes(f)} libres en la carpeta de datos` }; } },
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
      <PageHeader kicker="Sistema" title="Diagnóstico" subtitle="Comprueba cada servicio por separado para encontrar rápido qué se rompió."
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
      <Card title="Registro de eventos" actions={<>
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
