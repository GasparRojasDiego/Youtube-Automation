// Ajustes en un solo collage: perfil y tema arriba; debajo, cada apartado
// reducido a lo esencial. Si hubo errores, su informe completo aparece primero.
import { useEffect, useState, type ReactNode } from "react";
import {
  KeyRound, Bot, Mic, Image as ImageIcon, Music2, Film, Sparkles, Factory, Trash2, Plus, Check, Copy, Sun, Moon, Camera,
  FolderOpen, Download, AlertTriangle, ClipboardCopy, Wand2, Info, MonitorPlay, type LucideIcon,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { registerOpenverse } from "../media/sources";
import { libraryRoot } from "../media/library";
import { findBrowser } from "../motion/host";
import { secrets, fs, appPaths } from "../lib/ipc";
import { useBus } from "../lib/bus";
import { getSettings, saveSettings, isDark, SECRET, type AppSettings, type StageModelKey } from "../lib/settings";
import { listMusic, addTrack, updateTrack, deleteTrack, type Track } from "../lib/repo";
import { Card, Toggle, AsyncButton, Chip, Avatar } from "../ui/kit";
import { UpdateDialog } from "../ui/Update";
import { requestJson } from "../providers/net";
import { OPENAI_IMAGE_MODELS, GEMINI_IMAGE_MODELS } from "../providers/images";
import { connectYouTube, disconnectYouTube, myChannel } from "../providers/youtube";
import { claudeVersion } from "../providers/claude";
import { probeDuration } from "../providers/ffmpeg";
import { monthUnits } from "../lib/costs";
import { openErrors, clearErrors, buildReport, type ErrorRow } from "../lib/report";
import { appVersion, updateState } from "../lib/updater";
import { toast, logError } from "../lib/events";
import { joinPath, uid, baseName } from "../lib/util";
import { fmtK } from "../lib/usage";

/** Edita un valor anidado de los ajustes por ruta («tts.google.voice»). */
function useSetting() {
  useBus("settings");
  const s = getSettings();
  const set = (path: string, value: unknown) => saveSettings((cur) => {
    const keys = path.split("."); let o: any = cur;
    for (const k of keys.slice(0, -1)) o = o[k];
    o[keys[keys.length - 1]] = value; return cur;
  });
  return { s, set };
}

const Num = ({ v, on, step = 1, min, max }: { v: number; on: (n: number) => void; step?: number; min?: number; max?: number }) =>
  <input type="number" className="input h-9 py-1.5" value={v} step={step} min={min} max={max} onChange={(e) => on(Number(e.target.value))} />;
const Txt = ({ v, on, placeholder, mono }: { v: string; on: (s: string) => void; placeholder?: string; mono?: boolean }) =>
  <input className={`input h-9 py-1.5 ${mono ? "font-mono text-xs" : ""}`} value={v} placeholder={placeholder} onChange={(e) => on(e.target.value)} />;
const Sel = ({ v, on, opts }: { v: string; on: (s: string) => void; opts: [string, string][] }) =>
  <select className="input h-9 py-1.5" value={v} onChange={(e) => on(e.target.value)}>{opts.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>;

/** Fila etiqueta + control, alineada en todo el collage. */
const Row = ({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-center gap-3 py-1.5">
    <div className="min-w-0"><div className="text-[13px] font-medium leading-tight">{label}</div>{hint && <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{hint}</div>}</div>
    <div className="min-w-0 flex justify-end">{children}</div>
  </div>
);

/** Tarjeta del collage. */
const Tile = ({ title, icon, className = "", actions, children }: { title: string; icon: LucideIcon; className?: string; actions?: ReactNode; children: ReactNode }) => (
  <Card title={title} icon={icon} actions={actions} className={`h-full ${className}`}>{children}</Card>
);

export function SettingsPage() {
  return (
    <div className="space-y-5">
      <ProfileHeader />
      <ErrorReport />
      <div className="grid grid-cols-12 gap-4 grid-flow-row-dense">
        <ClaudeTile className="col-span-7 row-span-2" />
        <VoiceTile className="col-span-5" />
        <MotionTile className="col-span-5" />
        <KeysTile className="col-span-6" />
        <MediaTile className="col-span-6" />
        <ProductionTile className="col-span-4" />
        <MontageTile className="col-span-4" />
        <AboutTile className="col-span-4" />
        <MusicTile className="col-span-12" />
      </div>
    </div>
  );
}

// ---------- Perfil, ID y tema ----------
function ProfileHeader() {
  const { s, set } = useSetting();
  const [name, setName] = useState(s.profile.name);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setName(s.profile.name); }, [s.profile.name]);
  const dark = isDark(s.theme);
  const pickPhoto = async () => {
    const f = await openDialog({ filters: [{ name: "Imagen", extensions: ["png", "jpg", "jpeg", "webp"] }] });
    if (!f || Array.isArray(f)) return;
    const dest = joinPath((await appPaths()).data, "perfil", `foto.${f.split(".").pop()!.toLowerCase()}`);
    await fs.copy(f, dest);
    await set("profile.avatar", `${dest}?${Date.now()}`);
  };
  const themeBtn = (id: "light" | "dark", I: LucideIcon, label: string) => {
    const on = id === "dark" ? dark : !dark;
    return (
      <button onClick={() => void set("theme", id)} aria-pressed={on} title={label}
        className={`w-11 h-9 grid place-items-center rounded-lg transition-all duration-200 ${on ? "bg-primary-strong text-white shadow-[0_6px_16px_-8px_hsl(var(--primary-strong))]" : "text-muted-foreground hover:text-foreground"}`}>
        <I size={17} />
      </button>
    );
  };
  return (
    <section className="card relative overflow-hidden">
      <div className="absolute -top-28 -left-20 w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="relative flex items-center gap-5 px-6 py-5">
        <button onClick={() => void pickPhoto()} className="group relative rounded-full shrink-0" title="Cambiar foto">
          <Avatar size={68} />
          <span className="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center text-white"><Camera size={18} /></span>
        </button>
        <div className="min-w-0 flex-1">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== s.profile.name && void set("profile.name", name.trim())}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label="Nombre de usuario"
            className="block w-full max-w-md bg-transparent text-[22px] font-bold tracking-tight outline-none rounded-md px-1 -mx-1 border border-transparent hover:border-border focus:border-primary/60" />
          <button className="mt-1 inline-flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground hover:text-foreground" title="Copiar ID"
            onClick={async () => { await navigator.clipboard.writeText(s.profile.id); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            ID · <span className="tracking-[0.12em]">{s.profile.id}</span>{copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
          </button>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="inline-flex p-1 rounded-lg bg-secondary/70 border border-border/70">{themeBtn("light", Sun, "Modo claro")}{themeBtn("dark", Moon, "Modo oscuro")}</div>
          {s.theme === "system" && <span className="text-[10.5px] text-muted-foreground">Según el dispositivo</span>}
        </div>
      </div>
    </section>
  );
}

// ---------- Informe de errores ----------
function ErrorReport() {
  const tick = useBus("events");
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [report, setReport] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { void openErrors().then(async (e) => { setErrors(e); setReport(e.length ? await buildReport(e) : ""); }); }, [tick]);
  if (!errors.length) return null;
  return (
    <Card title={`Informe de errores · ${errors.length}`} icon={AlertTriangle} className="border-red-500/40"
      actions={<>
        <button className="btn-ghost btn-sm" onClick={async () => { await clearErrors(); setErrors([]); }}><Check size={13} /> Marcar como resuelto</button>
        <button className="btn-primary btn-sm" disabled={!report} onClick={async () => { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
          {copied ? <Check size={14} /> : <ClipboardCopy size={14} />} {copied ? "Copiado" : "Copiar informe"}
        </button>
      </>}>
      <div className="text-xs text-muted-foreground mb-2">Cópialo y pégalo tal cual en el chat: trae el detalle completo de cada error y no incluye claves.</div>
      <pre className="font-mono text-[11px] leading-relaxed bg-input border border-border rounded-lg p-3 max-h-80 overflow-auto whitespace-pre-wrap">{report || "Preparando el informe…"}</pre>
    </Card>
  );
}

// ---------- Claude ----------
const STAGE_LABEL: [StageModelKey, string][] = [["research", "Investigación"], ["script", "Guion"], ["verify", "Datos"], ["storyboard", "Storyboard"], ["vision", "Visión"],
  ["polish", "Retoques"], ["motion", "Animaciones"], ["critique", "Revisión visual"], ["package", "Metadatos"], ["topics", "Temas"], ["analysis", "Instrucciones IA"]];
const MODELS: [string, string][] = [["opus", "Opus"], ["sonnet", "Sonnet"], ["haiku", "Haiku"]];
const EFFORTS: [string, string][] = [["low", "Bajo"], ["medium", "Medio"], ["high", "Alto"], ["xhigh", "Muy alto"], ["max", "Máximo"]];

function Seg({ v, on, opts }: { v: string; on: (s: string) => void; opts: [string, string][] }) {
  return (
    <div className="inline-flex p-0.5 rounded-lg bg-secondary/70 border border-border/70">
      {opts.map(([id, l]) => <button key={id} onClick={() => on(id)} className={`h-7 px-2.5 rounded-md text-[11.5px] font-medium transition-colors ${v === id ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>)}
    </div>
  );
}

function ClaudeTile({ className }: { className: string }) {
  const { s, set } = useSetting();
  const [ver, setVer] = useState<string | null | undefined>(undefined);
  return (
    <Tile title="Claude" icon={Bot} className={className}
      actions={<>{ver !== undefined && (ver ? <Chip tone="green">{ver.split(" ")[0]}</Chip> : <Chip tone="red">No encontrado</Chip>)}<AsyncButton className="btn-ghost btn-sm" onClick={async () => setVer(await claudeVersion())}>Comprobar</AsyncButton></>}>
      <div className="rounded-lg border border-primary/30 bg-primary/[.06] px-4 py-3 mb-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold"><Wand2 size={14} className="text-primary" /> Corrección de animaciones</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 mb-2.5">Quién corrige una animación cuando la revisión visual encuentra defectos, y con cuánto esfuerzo.</div>
        <div className="flex flex-wrap items-center gap-3">
          <Seg v={s.claude.models.fix} on={(v) => void set("claude.models.fix", v)} opts={MODELS} />
          <Seg v={s.claude.effort.fix || "high"} on={(v) => void set("claude.effort.fix", v)} opts={EFFORTS} />
        </div>
      </div>
      <div className="label mb-1.5">Modelo y esfuerzo por etapa</div>
      <div className="grid grid-cols-2 gap-x-5">
        {STAGE_LABEL.map(([k, l]) => (
          <div key={k} className="grid grid-cols-[minmax(0,1fr)_88px_92px] items-center gap-1.5 py-1">
            <span className="text-[12.5px] truncate">{l}</span>
            <select className="input select-sm h-8 py-0 text-xs" value={s.claude.models[k]} onChange={(e) => void set(`claude.models.${k}`, e.target.value)}>{MODELS.map(([id, x]) => <option key={id} value={id}>{x}</option>)}</select>
            <select className="input select-sm h-8 py-0 text-xs" value={s.claude.effort[k] || ""} onChange={(e) => void set(`claude.effort.${k}`, e.target.value)}><option value="">Auto</option>{EFFORTS.map(([id, x]) => <option key={id} value={id}>{x}</option>)}</select>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-5 mt-3 pt-3 border-t border-border/60">
        <Row label="Programa" hint="«claude» o la ruta a claude.exe"><Txt v={s.claude.path} on={(v) => void set("claude.path", v)} mono /></Row>
        <Row label="Tiempo máximo" hint="Minutos por tarea"><Num v={s.claude.timeoutMin} on={(v) => void set("claude.timeoutMin", v)} min={5} /></Row>
      </div>
    </Tile>
  );
}

// ---------- Voz ----------
function VoiceTile({ className }: { className: string }) {
  const { s, set } = useSetting();
  const tick = useBus("costs");
  const [used, setUsed] = useState(0);
  useEffect(() => { void monthUnits("google-tts", "caracteres").then(setUsed); }, [tick]);
  const free = s.tts.google.freeCharsPerMonth; const k = Math.min(1, used / Math.max(1, free));
  return (
    <Tile title="Voz" icon={Mic} className={className}>
      <Row label="Proveedor"><Sel v={s.tts.provider} on={(v) => void set("tts.provider", v)} opts={[["google", "Google (Chirp 3 HD)"], ["gemini", "Gemini TTS"], ["elevenlabs", "ElevenLabs"]]} /></Row>
      {s.tts.provider === "google" && <>
        <Row label="Voz"><Txt v={s.tts.google.voice} on={(v) => void set("tts.google.voice", v)} mono /></Row>
        <Row label="Velocidad"><Num v={s.tts.google.speakingRate} step={0.05} on={(v) => void set("tts.google.speakingRate", v)} /></Row>
      </>}
      {s.tts.provider === "gemini" && <>
        <Row label="Voz"><Txt v={s.tts.gemini.voice} on={(v) => void set("tts.gemini.voice", v)} mono /></Row>
        <Row label="Estilo" hint="Instrucción de lectura"><Txt v={s.tts.gemini.style} on={(v) => void set("tts.gemini.style", v)} /></Row>
      </>}
      {s.tts.provider === "elevenlabs" && <>
        <Row label="ID de voz"><Txt v={s.tts.elevenlabs.voiceId} on={(v) => void set("tts.elevenlabs.voiceId", v)} mono /></Row>
        <Row label="Velocidad"><Num v={s.tts.elevenlabs.speed} step={0.05} on={(v) => void set("tts.elevenlabs.speed", v)} /></Row>
      </>}
      <div className="mt-4 rounded-lg border border-border/80 bg-secondary/40 px-4 py-3">
        <div className="flex items-baseline justify-between"><span className="label">Cuota gratuita de Google este mes</span><span className="text-[11px] text-muted-foreground tabular">{fmtK(used)} / {fmtK(free)}</span></div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2"><div className={`h-full rounded-full ${k >= 0.9 ? "bg-red-500" : k >= 0.7 ? "bg-amber-500" : "bg-teal-500"}`} style={{ width: `${k * 100}%` }} /></div>
        <div className="text-[11px] text-muted-foreground mt-1.5">Caracteres narrados por ATRIL. Pasado el límite, Google cobra por carácter.</div>
      </div>
    </Tile>
  );
}

// ---------- Claves y cuentas ----------
function KeyRow({ k, label, hint, test }: { k: string; label: string; hint: ReactNode; test?: (v: string) => Promise<string> }) {
  const [has, setHas] = useState<boolean | null>(null);
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState("");
  useEffect(() => { void secrets.get(k).then((v) => setHas(!!v)); }, [k]);
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0 min-h-[46px]">
      <span className={`w-2 h-2 rounded-full shrink-0 ${has ? "bg-green-500" : "bg-muted-foreground/35"}`} title={has ? "Guardada" : "Sin clave"} />
      <div className="min-w-0 flex-1"><div className="text-[13px] font-medium leading-tight">{label}</div><div className="text-[11px] text-muted-foreground truncate">{hint}</div></div>
      {edit ? (
        <div className="flex items-center gap-1.5">
          <input autoFocus className="input h-8 py-1 w-44 font-mono text-xs" type="password" value={val} placeholder="Pega la clave" onChange={(e) => setVal(e.target.value)} />
          <AsyncButton className="btn-brand btn-sm" disabled={!val.trim()} onClick={async () => { await secrets.set(k, val.trim()); setVal(""); setHas(true); setEdit(false); toast("success", `${label} guardada`); }}>Guardar</AsyncButton>
          <button className="btn-ghost btn-sm" onClick={() => { setEdit(false); setVal(""); }}>Cancelar</button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          {has && test && <AsyncButton className="btn-ghost btn-sm" onClick={async () => { try { const v = await secrets.get(k); toast("success", `${label}: funciona`, await test(v!)); } catch (e) { await logError(e, null, label); } }}>Probar</AsyncButton>}
          <button className="btn-ghost btn-sm" onClick={() => setEdit(true)}>{has ? "Cambiar" : "Añadir"}</button>
          {has && <button className="btn-ghost btn-sm px-2" title="Borrar" onClick={async () => { await secrets.remove(k); setHas(false); }}><Trash2 size={13} /></button>}
        </div>
      )}
    </div>
  );
}

function YouTubeRow() {
  const [ch, setCh] = useState<string | null | undefined>(undefined);
  useEffect(() => { void secrets.get(SECRET.youtubeRefreshToken).then(async (t) => { if (!t) { setCh(null); return; } try { setCh((await myChannel())?.snippet?.title ?? "conectado"); } catch { setCh("conectado"); } }); }, []);
  return (
    <div className="flex items-center gap-3 py-2 min-h-[46px]">
      <span className={`w-2 h-2 rounded-full shrink-0 ${ch ? "bg-green-500" : "bg-muted-foreground/35"}`} />
      <div className="min-w-0 flex-1"><div className="text-[13px] font-medium leading-tight flex items-center gap-1.5"><MonitorPlay size={13} className="text-primary" /> Cuenta de YouTube</div><div className="text-[11px] text-muted-foreground truncate">{ch === undefined ? "Comprobando…" : ch ?? "No conectada: puedes subir a mano"}</div></div>
      <AsyncButton className="btn-ghost btn-sm" onClick={async () => { try { setCh(await connectYouTube()); toast("success", "YouTube conectado"); } catch (e) { await logError(e, null, "YouTube"); } }}>{ch ? "Reconectar" : "Conectar"}</AsyncButton>
      {ch && <button className="btn-ghost btn-sm" onClick={async () => { await disconnectYouTube(); setCh(null); }}>Desconectar</button>}
    </div>
  );
}

function KeysTile({ className }: { className: string }) {
  const link = (url: string, text: string) => <button className="text-primary hover:underline" onClick={() => void openUrl(url)}>{text}</button>;
  return (
    <Tile title="Claves y cuentas" icon={KeyRound} className={className} actions={<span className="text-[11px] text-muted-foreground">Cifradas en Windows</span>}>
      <KeyRow k={SECRET.googleApiKey} label="Google Cloud" hint="Voz (Text-to-Speech)"
        test={async (v) => { const r = await requestJson<any>("Google TTS", { url: "https://texttospeech.googleapis.com/v1/voices?languageCode=en-US", headers: { "x-goog-api-key": v } }); return `${r.voices?.length ?? 0} voces disponibles`; }} />
      <KeyRow k={SECRET.openaiApiKey} label="OpenAI" hint="Imágenes con IA (de pago)"
        test={async (v) => { const r = await requestJson<any>("OpenAI", { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${v}` } }); const ids: string[] = (r.data ?? []).map((x: any) => x.id); return OPENAI_IMAGE_MODELS.find((x) => ids.includes(x)) ?? "Clave válida"; }} />
      <KeyRow k={SECRET.geminiApiKey} label="Gemini" hint="Imágenes y voz Gemini (de pago)"
        test={async (v) => { const r = await requestJson<any>("Gemini", { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", headers: { "x-goog-api-key": v } }); const ids: string[] = (r.models ?? []).map((x: any) => String(x.name).replace("models/", "")); return GEMINI_IMAGE_MODELS.find((x) => ids.includes(x)) ?? `${ids.length} modelos`; }} />
      <KeyRow k={SECRET.elevenlabsApiKey} label="ElevenLabs" hint="Otra voz y efectos creados (opcional)"
        test={async (v) => { const r = await requestJson<any>("ElevenLabs", { url: "https://api.elevenlabs.io/v1/user", headers: { "xi-api-key": v } }); return `Plan: ${r.subscription?.tier ?? "?"}`; }} />
      <KeyRow k={SECRET.pexelsApiKey} label="Pexels" hint={link("https://www.pexels.com/api/", "Gratis · pexels.com/api")}
        test={async (v) => { const r = await requestJson<any>("Pexels", { url: "https://api.pexels.com/v1/search?query=city&per_page=1", headers: { Authorization: v } }); return `${r.total_results ?? 0} resultados`; }} />
      <KeyRow k={SECRET.pixabayApiKey} label="Pixabay" hint={link("https://pixabay.com/api/docs/", "Gratis · pixabay.com/api")}
        test={async (v) => { const r = await requestJson<any>("Pixabay", { url: `https://pixabay.com/api/?key=${encodeURIComponent(v)}&q=city&per_page=3` }); return `${r.totalHits ?? 0} resultados`; }} />
      <KeyRow k={SECRET.freesoundApiKey} label="Freesound" hint={link("https://freesound.org/apiv2/apply/", "Gratis · efectos de sonido")}
        test={async (v) => { const r = await requestJson<any>("Freesound", { url: "https://freesound.org/apiv2/search/text/?query=whoosh&page_size=1", headers: { Authorization: `Token ${v}` } }); return `${r.count ?? 0} sonidos`; }} />
      <KeyRow k={SECRET.youtubeClientId} label="YouTube · ID de cliente" hint="Cliente OAuth «App de escritorio»" />
      <KeyRow k={SECRET.youtubeClientSecret} label="YouTube · secreto" hint="Del mismo cliente" />
      <YouTubeRow />
    </Tile>
  );
}

// ---------- Medios ----------
function MediaTile({ className }: { className: string }) {
  const { s, set } = useSetting();
  const [root, setRoot] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => { void libraryRoot().then(setRoot); }, [s.media.libraryDir]);
  const SRC: [keyof AppSettings["media"]["sources"], string][] = [["pexels", "Pexels"], ["pixabay", "Pixabay"], ["wikimedia", "Wikimedia"], ["openverse", "Openverse"], ["nasa", "NASA"], ["met", "The Met"], ["freesound", "Freesound"]];
  return (
    <Tile title="Medios" icon={ImageIcon} className={className}>
      <div className="label mb-2">Fuentes libres (después de tu biblioteca)</div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {SRC.map(([k, l]) => {
          const on = s.media.sources[k];
          return <button key={k} onClick={() => void set(`media.sources.${k}`, !on)} className={`chip h-7 px-3 transition-colors ${on ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{on && <Check size={11} />}{l}</button>;
        })}
      </div>
      <Row label="Biblioteca" hint={<span className="font-mono break-all">{root}</span>}>
        <div className="flex gap-1.5">
          <button className="btn-ghost btn-sm" onClick={async () => { const d = await openDialog({ directory: true }); if (d && !Array.isArray(d)) void set("media.libraryDir", d); }}><FolderOpen size={13} /> Cambiar</button>
          <button className="btn-ghost btn-sm" onClick={() => void openPath(root)}>Abrir</button>
        </div>
      </Row>
      <Row label="Imágenes con IA" hint="Para escenas sin material libre"><div className="flex items-center gap-2"><Sel v={s.images.provider} on={(v) => void set("images.provider", v)} opts={[["auto", "Automático"], ["openai", "OpenAI"], ["gemini", "Gemini"], ["none", "Ninguno"]]} /><Toggle checked={s.media.allowGenerated} onChange={(v) => void set("media.allowGenerated", v)} /></div></Row>
      <Row label="Máx. imágenes con IA por video"><Num v={s.images.perVideo} on={(v) => void set("images.perVideo", v)} min={0} max={60} /></Row>
      <Row label="Candidatos por toma"><Num v={s.media.candidatesPerBeat} on={(v) => void set("media.candidatesPerBeat", v)} min={1} max={6} /></Row>
      <Row label="Efectos creados con ElevenLabs" hint="Solo con plan de pago"><div className="flex items-center gap-2"><Num v={s.sfx.maxGenerated} on={(v) => void set("sfx.maxGenerated", v)} min={0} max={80} /><Toggle checked={s.sfx.elevenlabs} onChange={(v) => void set("sfx.elevenlabs", v)} /></div></Row>
      <Row label="Openverse" hint="Regístrate para más búsquedas">
        <div className="flex gap-1.5"><input className="input h-8 py-1 text-xs w-40" value={email} placeholder="Tu correo" onChange={(e) => setEmail(e.target.value)} />
          <AsyncButton className="btn-ghost btn-sm" disabled={!/@/.test(email)} onClick={async () => { await registerOpenverse(email.trim()); toast("success", "Registrado en Openverse", "Confirma el correo."); }}>Registrar</AsyncButton></div>
      </Row>
    </Tile>
  );
}

// ---------- Animaciones, producción y montaje ----------
function MotionTile({ className }: { className: string }) {
  const { s, set } = useSetting();
  const [found, setFound] = useState<string | null | undefined>(undefined);
  return (
    <Tile title="Animaciones" icon={Sparkles} className={className}>
      <Row label="Activadas"><Toggle checked={s.motion.enabled} onChange={(v) => void set("motion.enabled", v)} /></Row>
      <Row label="Por video" hint="Nunca menos de una por minuto"><Num v={s.motion.perVideo} on={(v) => void set("motion.perVideo", v)} min={0} max={30} /></Row>
      <Row label="Revisión visual" hint="Y corrección si hay defectos"><Toggle checked={s.motion.critique} onChange={(v) => void set("motion.critique", v)} /></Row>
      <Row label="A la vez" hint="Las que Claude diseña en paralelo"><Num v={s.motion.parallel} on={(v) => void set("motion.parallel", v)} min={1} max={8} /></Row>
      <Row label="Renders a la vez" hint="Más usa más memoria (2 para 16 GB)"><Num v={s.motion.renders} on={(v) => void set("motion.renders", v)} min={1} max={4} /></Row>
      <Row label="Correcciones" hint="Máximo por animación"><Num v={s.motion.maxFixes} on={(v) => void set("motion.maxFixes", v)} min={0} max={4} /></Row>
      <Row label="Navegador" hint={found === undefined ? "Edge o Chrome" : found ? <span className="text-green-600 dark:text-green-500">Encontrado</span> : <span className="text-red-600 dark:text-red-500">No encontrado</span>}>
        <AsyncButton className="btn-ghost btn-sm" onClick={async () => setFound(await findBrowser())}>Detectar</AsyncButton>
      </Row>
    </Tile>
  );
}

function ProductionTile({ className }: { className: string }) {
  const { s, set } = useSetting();
  const p = s.production;
  return (
    <Tile title="Producción" icon={Factory} className={className}>
      <Row label="Duración" hint="Minutos (mín. – máx.)"><div className="flex items-center gap-1.5 w-full"><Num v={p.targetMinutes[0]} on={(v) => void set("production.targetMinutes", [v, p.targetMinutes[1]])} /><span className="text-muted-foreground">–</span><Num v={p.targetMinutes[1]} on={(v) => void set("production.targetMinutes", [p.targetMinutes[0], v])} /></div></Row>
      <Row label="Pasadas de guion"><Num v={p.scriptPasses} on={(v) => void set("production.scriptPasses", v)} min={1} max={3} /></Row>
      <Row label="Revisión de datos"><Sel v={p.verifyMode} on={(v) => void set("production.verifyMode", v)} opts={[["auto", "Automática"], ["off", "Desactivada"]]} /></Row>
      <Row label="Reanudar al abrir"><Toggle checked={p.autoRunToReview} onChange={(v) => void set("production.autoRunToReview", v)} /></Row>
      <Row label="Búsquedas a la vez" hint="Medios que se buscan en paralelo"><Num v={s.assets.parallel} on={(v) => void set("assets.parallel", v)} min={1} max={8} /></Row>
    </Tile>
  );
}

function MontageTile({ className }: { className: string }) {
  const { s, set } = useSetting();
  return (
    <Tile title="Montaje" icon={Film} className={className}>
      <Row label="Codificador"><Sel v={s.ffmpeg.encoder} on={(v) => void set("ffmpeg.encoder", v)} opts={[["auto", "Automático"], ["h264_qsv", "Intel Quick Sync"], ["libx264", "x264 (CPU)"], ["h264_mf", "Media Foundation"]]} /></Row>
      <Row label="Calidad" hint="Menor = mejor (14–32)"><Num v={s.ffmpeg.quality} on={(v) => void set("ffmpeg.quality", v)} min={14} max={32} /></Row>
      <Row label="ffmpeg" hint="Vacío = el incluido"><Txt v={s.ffmpeg.path} on={(v) => void set("ffmpeg.path", v)} mono placeholder="Incluido" /></Row>
    </Tile>
  );
}

// ---------- Música ----------
function MusicTile({ className }: { className: string }) {
  const tick = useBus("music");
  const [list, setList] = useState<Track[]>([]);
  useEffect(() => { void listMusic().then(setList); }, [tick]);
  return (
    <Tile title="Música" icon={Music2} className={className} actions={
      <AsyncButton className="btn-brand btn-sm" onClick={async () => {
        const sel = await openDialog({ multiple: true, filters: [{ name: "Audio", extensions: ["mp3", "wav", "m4a", "ogg", "flac"] }] });
        const files = Array.isArray(sel) ? sel : sel ? [sel] : [];
        const dir = joinPath((await appPaths()).data, "music");
        for (const f of files) {
          try {
            const dest = joinPath(dir, `${uid("m_")}-${baseName(f)}`);
            await fs.copy(f, dest);
            await addTrack({ title: baseName(f).replace(/\.[^.]+$/, ""), artist: "", path: dest, license: "YouTube Audio Library", attribution: "", duration_s: await probeDuration(dest).catch(() => 0), mood: "" });
          } catch (e) { await logError(e, null, "Importar música"); }
        }
      }}><Plus size={13} /> Añadir</AsyncButton>}>
      <div className="text-[11px] text-muted-foreground mb-2">Tus pistas van primero. Escribe su ambiente en inglés (dark, piano, tense…).</div>
      {list.length === 0 ? <div className="text-sm text-muted-foreground py-4 text-center">Sin pistas propias.</div> : (
        <div className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-1.5">
          {list.map((t) => (
            <div key={t.id} className="grid grid-cols-[auto_1.4fr_1fr_1.4fr_auto] gap-2 items-center">
              <Toggle checked={!!t.enabled} onChange={(v) => void updateTrack(t.id, { enabled: v ? 1 : 0 })} />
              <input className="input h-8 py-1 text-xs" defaultValue={t.title} onBlur={(e) => void updateTrack(t.id, { title: e.target.value })} />
              <input className="input h-8 py-1 text-xs" defaultValue={t.mood} placeholder="Ambiente" onBlur={(e) => void updateTrack(t.id, { mood: e.target.value })} />
              <input className="input h-8 py-1 text-xs" defaultValue={t.attribution} placeholder="Atribución" onBlur={(e) => void updateTrack(t.id, { attribution: e.target.value })} />
              <button className="btn-ghost btn-sm px-2" onClick={async () => { await deleteTrack(t.id); await fs.remove(t.path).catch(() => null); }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </Tile>
  );
}

// ---------- Acerca de ----------
function AboutTile({ className }: { className: string }) {
  useBus("update");
  const [ver, setVer] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { void appVersion().then(setVer); }, []);
  const up = updateState();
  return (
    <Tile title="ATRIL" icon={Info} className={className}>
      <Row label="Versión"><span className="font-mono text-sm tabular">{ver || "—"}</span></Row>
      <Row label="Actualizaciones" hint={up.available ? `Disponible: ${up.version}` : "Al día"}>
        {up.available ? <button className="btn-brand btn-sm" onClick={() => setOpen(true)}><Download size={13} /> Ver</button> : <Chip tone="green"><Check size={11} /> Al día</Chip>}
      </Row>
      <Row label="Datos de la app" hint="Base de datos, videos y caché"><button className="btn-ghost btn-sm" onClick={async () => void openPath((await appPaths()).data)}><FolderOpen size={13} /> Abrir</button></Row>
      <UpdateDialog open={open} onClose={() => setOpen(false)} />
    </Tile>
  );
}
