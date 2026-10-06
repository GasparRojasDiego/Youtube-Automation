import { useEffect, useState, type ReactNode } from "react";
import { KeyRound, Bot, Mic, Image as ImageIcon, Music2, Film, MonitorPlay, Wallet, Factory, Tv, Trash2, Plus, Check, Play, Shuffle, Eye, Palette } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { secrets, fs, appPaths, fileUrl } from "../lib/ipc";
import { useBus } from "../lib/bus";
import { getSettings, saveSettings, SECRET, type AppSettings, type StageModelKey } from "../lib/settings";
import { listChannels, createChannel, updateChannel, listMusic, addTrack, updateTrack, deleteTrack, type Channel, type Track } from "../lib/repo";
import { PageHeader, Card, Field, Toggle, Tabs, AsyncButton, Chip } from "../ui/kit";
import { requestJson } from "../providers/net";
import { listGoogleVoices, synthesize } from "../providers/tts";
import { connectYouTube, disconnectYouTube, myChannel } from "../providers/youtube";
import { claudeVersion } from "../providers/claude";
import { probeDuration } from "../providers/ffmpeg";
import { toast, logError } from "../lib/events";
import { joinPath, uid, baseName } from "../lib/util";

type Tab = "channel" | "keys" | "claude" | "voice" | "images" | "music" | "montage" | "youtube" | "budget" | "production" | "look";
const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "channel", label: "Canal", icon: Tv }, { id: "keys", label: "Credenciales", icon: KeyRound }, { id: "claude", label: "Claude Code", icon: Bot },
  { id: "voice", label: "Voz", icon: Mic }, { id: "images", label: "Imágenes", icon: ImageIcon }, { id: "music", label: "Música", icon: Music2 },
  { id: "montage", label: "Montaje", icon: Film }, { id: "youtube", label: "YouTube", icon: MonitorPlay }, { id: "budget", label: "Presupuesto", icon: Wallet },
  { id: "production", label: "Producción", icon: Factory }, { id: "look", label: "Apariencia", icon: Palette },
];

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
  <input type="number" className="input" value={v} step={step} min={min} max={max} onChange={(e) => on(Number(e.target.value))} />;
const Txt = ({ v, on, placeholder, mono }: { v: string; on: (s: string) => void; placeholder?: string; mono?: boolean }) =>
  <input className={`input ${mono ? "font-mono text-xs" : ""}`} value={v} placeholder={placeholder} onChange={(e) => on(e.target.value)} />;
const Grid = ({ children, cols = 2 }: { children: ReactNode; cols?: number }) => <div className={`grid gap-4 ${cols === 3 ? "grid-cols-3" : "grid-cols-2"}`}>{children}</div>;

export function SettingsPage({ tab: initial }: { tab?: string }) {
  const [tab, setTab] = useState<Tab>((initial as Tab) ?? "channel");
  useEffect(() => { if (initial) setTab(initial as Tab); }, [initial]);
  return (
    <div>
      <PageHeader kicker="Sistema" title="Ajustes" subtitle="Todo lo que cambia con el tiempo (modelos, precios, voces) se ajusta aquí sin reprogramar." />
      <div className="mb-5"><Tabs tabs={TABS} value={tab} onChange={setTab} /></div>
      {tab === "channel" && <ChannelTab />}
      {tab === "keys" && <KeysTab />}
      {tab === "claude" && <ClaudeTab />}
      {tab === "voice" && <VoiceTab />}
      {tab === "images" && <ImagesTab />}
      {tab === "music" && <MusicTab />}
      {tab === "montage" && <MontageTab />}
      {tab === "youtube" && <YouTubeTab />}
      {tab === "budget" && <BudgetTab />}
      {tab === "production" && <ProductionTab />}
      {tab === "look" && <LookTab />}
    </div>
  );
}

function ChannelTab() {
  const tick = useBus("channels", "settings");
  const [list, setList] = useState<Channel[]>([]);
  const [name, setName] = useState("");
  useEffect(() => { void listChannels().then(setList); }, [tick]);
  const active = getSettings().activeChannelId;
  return (
    <Card title="Canales" icon={Tv}>
      <div className="space-y-2">
        {list.map((c) => (
          <div key={c.id} className="flex items-center gap-3">
            <input className="input flex-1" defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && void updateChannel(c.id, { name: e.target.value.trim() })} />
            <input className="input flex-[2]" defaultValue={c.description} placeholder="Concepto del canal (opcional)" onBlur={(e) => e.target.value !== c.description && void updateChannel(c.id, { description: e.target.value })} />
            {active === c.id ? <Chip tone="primary"><Check size={11} /> Activo</Chip> : <button className="btn-ghost btn-sm" onClick={() => void saveSettings({ activeChannelId: c.id })}>Activar</button>}
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del nuevo canal" />
          <button className="btn-brand" disabled={!name.trim()} onClick={async () => { await createChannel(name.trim()); setName(""); }}><Plus size={14} /> Crear</button>
        </div>
        <div className="text-[11px] text-muted-foreground">Cada canal tiene sus temas, videos, referentes y habilidades. Las habilidades marcadas como «globales» se comparten.</div>
      </div>
    </Card>
  );
}

function SecretRow({ k, label, hint, test }: { k: string; label: string; hint: ReactNode; test?: (v: string) => Promise<string> }) {
  const [has, setHas] = useState<boolean | null>(null);
  const [val, setVal] = useState("");
  useEffect(() => { void secrets.get(k).then((v) => setHas(!!v)); }, [k]);
  return (
    <div className="grid grid-cols-[220px_1fr_auto] gap-3 items-start py-3 border-b border-border/60 last:border-0">
      <div><div className="text-sm font-medium">{label}</div><div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div></div>
      <input className="input font-mono text-xs" type="password" value={val} placeholder={has ? "•••••••• (guardada; escribe para reemplazar)" : "Pega la clave aquí"} onChange={(e) => setVal(e.target.value)} />
      <div className="flex gap-1.5">
        <AsyncButton className="btn-brand btn-sm" disabled={!val.trim()} onClick={async () => { await secrets.set(k, val.trim()); setVal(""); setHas(true); toast("success", `${label} guardada en el Administrador de credenciales`); }}>Guardar</AsyncButton>
        {test && <AsyncButton className="btn-ghost btn-sm" disabled={!has} onClick={async () => { try { const v = await secrets.get(k); toast("success", `${label}: funciona`, await test(v!)); } catch (e) { await logError(e, null, `${label}`); } }}>Probar</AsyncButton>}
        {has && <button className="btn-ghost btn-sm" onClick={async () => { await secrets.remove(k); setHas(false); }}><Trash2 size={13} /></button>}
      </div>
    </div>
  );
}

function KeysTab() {
  return (
    <Card title="Credenciales" icon={KeyRound}>
      <div className="text-xs text-muted-foreground mb-2">Se guardan cifradas en el Administrador de credenciales de Windows, nunca en archivos ni en el repositorio. Las cuentas deben estar a nombre del titular adulto.</div>
      <SecretRow k={SECRET.googleApiKey} label="Google Cloud (clave de API)" hint="Para Text-to-Speech y YouTube Data API (lectura de referentes). Habilita ambas APIs en tu proyecto."
        test={async (v) => { const r = await requestJson<any>("Google TTS", { url: `https://texttospeech.googleapis.com/v1/voices?languageCode=en-US&key=${encodeURIComponent(v)}` }); return `${r.voices?.length ?? 0} voces disponibles`; }} />
      <SecretRow k={SECRET.geminiApiKey} label="Gemini (clave de API)" hint="De Google AI Studio, con facturación activa en el proyecto. Imágenes y voz Gemini."
        test={async (v) => { const r = await requestJson<any>("Gemini", { url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(v)}` }); return `${r.models?.length ?? 0} modelos accesibles`; }} />
      <SecretRow k={SECRET.openaiApiKey} label="OpenAI (opcional)" hint="Alternativa para imágenes."
        test={async (v) => { await requestJson<any>("OpenAI", { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${v}` } }); return "Clave válida"; }} />
      <SecretRow k={SECRET.elevenlabsApiKey} label="ElevenLabs (opcional)" hint="Alternativa de voz de mayor calidad (requiere plan de pago)."
        test={async (v) => { const r = await requestJson<any>("ElevenLabs", { url: "https://api.elevenlabs.io/v1/user", headers: { "xi-api-key": v } }); return `Plan: ${r.subscription?.tier ?? "?"}`; }} />
      <SecretRow k={SECRET.youtubeClientId} label="YouTube · ID de cliente OAuth" hint="Tipo «App de escritorio» en Google Cloud → Credenciales." />
      <SecretRow k={SECRET.youtubeClientSecret} label="YouTube · secreto de cliente" hint="Del mismo cliente OAuth." />
    </Card>
  );
}

const STAGE_LABEL: Record<StageModelKey, string> = { topics: "Banco de temas", research: "Investigación", script: "Guion", verify: "Verificación", plan: "Plan visual", package: "Miniatura y metadatos", analysis: "Referentes y métricas" };

function ClaudeTab() {
  const { s, set } = useSetting();
  const [ver, setVer] = useState<string | null | undefined>(undefined);
  return (
    <div className="space-y-4">
      <Card title="Claude Code" icon={Bot} actions={<AsyncButton className="btn-brand btn-sm" onClick={async () => setVer(await claudeVersion())}>Comprobar</AsyncButton>}>
        <Grid>
          <Field label="Programa" hint="«claude» si está en el PATH, o la ruta completa a claude.exe"><Txt v={s.claude.path} on={(v) => set("claude.path", v)} mono /></Field>
          <Field label="Tiempo máximo por tarea (min)"><Num v={s.claude.timeoutMin} on={(v) => set("claude.timeoutMin", v)} min={5} /></Field>
          <Field label="Argumentos extra (avanzado)" hint="Se añaden al final; útil si una versión futura del CLI cambia algo. Ej.: --fallback-model sonnet"><Txt v={s.claude.extraArgs} on={(v) => set("claude.extraArgs", v)} mono /></Field>
        </Grid>
        {ver !== undefined && <div className="mt-3">{ver ? <Chip tone="green">{ver}</Chip> : <Chip tone="red">No se encontró Claude Code</Chip>}</div>}
      </Card>
      <Card title="Modelo y esfuerzo por etapa">
        <div className="text-xs text-muted-foreground mb-3">Usa alias («opus», «sonnet», «haiku») o nombres completos. Opus consume más límite del plan; reservarlo para guion y verificación suele ser el mejor equilibrio.</div>
        <div className="space-y-2">
          {(Object.keys(STAGE_LABEL) as StageModelKey[]).map((k) => (
            <div key={k} className="grid grid-cols-[220px_1fr_160px] gap-3 items-center">
              <span className="text-sm">{STAGE_LABEL[k]}</span>
              <input className="input font-mono text-xs" value={s.claude.models[k]} onChange={(e) => set(`claude.models.${k}`, e.target.value)} />
              <select className="input" value={s.claude.effort[k]} onChange={(e) => set(`claude.effort.${k}`, e.target.value)}>
                {["", "low", "medium", "high", "xhigh", "max"].map((x) => <option key={x} value={x}>{x || "por defecto"}</option>)}
              </select>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function VoiceTab() {
  const { s, set } = useSetting();
  const [voices, setVoices] = useState<string[]>([]);
  const [pick, setPick] = useState<string[]>([]);
  const [sample, setSample] = useState("In 2022, Harvard published a report about its own past. Most people never read it. This is what it says.");
  const [blind, setBlind] = useState<{ label: string; voice: string; path: string }[]>([]);
  const [reveal, setReveal] = useState(false);
  return (
    <div className="space-y-4">
      <Card title="Proveedor de voz" icon={Mic}>
        <Grid>
          <Field label="Proveedor">
            <select className="input" value={s.tts.provider} onChange={(e) => set("tts.provider", e.target.value)}>
              <option value="google">Google Cloud TTS (Chirp 3 HD) — 1 M caracteres/mes gratis</option>
              <option value="gemini">Gemini TTS (estilo por instrucción)</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>
          </Field>
          <div className="text-[11px] text-muted-foreground self-end">La voz propia se elige por video (Hoy → «Mi propia voz»). Una habilidad puede fijar la voz con un bloque atril:voz.</div>
        </Grid>
      </Card>
      {s.tts.provider === "google" && <Card title="Google Cloud TTS"><Grid cols={3}>
        <Field label="Voz"><Txt v={s.tts.google.voice} on={(v) => set("tts.google.voice", v)} mono /></Field>
        <Field label="Velocidad"><Num v={s.tts.google.speakingRate} step={0.05} on={(v) => set("tts.google.speakingRate", v)} /></Field>
        <Field label="Precio USD / 1 M caracteres"><Num v={s.tts.google.priceUsdPerMChars} on={(v) => set("tts.google.priceUsdPerMChars", v)} /></Field>
        <Field label="Caracteres gratis al mes"><Num v={s.tts.google.freeCharsPerMonth} step={100000} on={(v) => set("tts.google.freeCharsPerMonth", v)} /></Field>
      </Grid></Card>}
      {s.tts.provider === "gemini" && <Card title="Gemini TTS"><Grid>
        <Field label="Modelo"><Txt v={s.tts.gemini.model} on={(v) => set("tts.gemini.model", v)} mono /></Field>
        <Field label="Voz"><Txt v={s.tts.gemini.voice} on={(v) => set("tts.gemini.voice", v)} mono /></Field>
        <Field label="Instrucción de estilo"><Txt v={s.tts.gemini.style} on={(v) => set("tts.gemini.style", v)} /></Field>
        <Field label="Precio USD / 1 M tokens de audio"><Num v={s.tts.gemini.priceUsdPerMAudioTokens} on={(v) => set("tts.gemini.priceUsdPerMAudioTokens", v)} /></Field>
      </Grid></Card>}
      {s.tts.provider === "elevenlabs" && <Card title="ElevenLabs"><Grid cols={3}>
        <Field label="ID de voz"><Txt v={s.tts.elevenlabs.voiceId} on={(v) => set("tts.elevenlabs.voiceId", v)} mono /></Field>
        <Field label="Modelo"><Txt v={s.tts.elevenlabs.modelId} on={(v) => set("tts.elevenlabs.modelId", v)} mono /></Field>
        <Field label="USD / 1.000 caracteres"><Num v={s.tts.elevenlabs.priceUsdPer1kChars} step={0.01} on={(v) => set("tts.elevenlabs.priceUsdPer1kChars", v)} /></Field>
        <Field label="Estabilidad"><Num v={s.tts.elevenlabs.stability} step={0.05} on={(v) => set("tts.elevenlabs.stability", v)} /></Field>
        <Field label="Similitud"><Num v={s.tts.elevenlabs.similarity} step={0.05} on={(v) => set("tts.elevenlabs.similarity", v)} /></Field>
        <Field label="Velocidad"><Num v={s.tts.elevenlabs.speed} step={0.05} on={(v) => set("tts.elevenlabs.speed", v)} /></Field>
      </Grid></Card>}
      {s.tts.provider === "google" && (
        <Card title="Escucha a ciegas" icon={Shuffle}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <AsyncButton className="btn-ghost btn-sm" onClick={async () => { try { setVoices((await listGoogleVoices()).map((v) => v.name).filter((n) => /Chirp3-HD|Studio|Neural2/.test(n))); } catch (e) { await logError(e, null, "Voces"); } }}>Cargar voces</AsyncButton>
              <span className="text-xs text-muted-foreground self-center">Elige 3–5 y escúchalas sin saber cuál es cuál.</span>
            </div>
            {voices.length > 0 && <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">{voices.map((v) => <button key={v} onClick={() => setPick(pick.includes(v) ? pick.filter((x) => x !== v) : pick.length < 5 ? [...pick, v] : pick)} className={`chip ${pick.includes(v) ? "bg-primary text-white border-primary" : "border-border"}`}>{v.replace("en-US-", "")}</button>)}</div>}
            <textarea className="input text-sm min-h-16" value={sample} onChange={(e) => setSample(e.target.value)} />
            <AsyncButton className="btn-brand" disabled={pick.length < 2} onClick={async () => {
              const dir = joinPath((await appPaths()).data, "audition"); await fs.mkdir(dir);
              const res: { label: string; voice: string; path: string }[] = [];
              for (const v of [...pick].sort(() => Math.random() - 0.5)) {
                const r = await synthesize({ text: sample, outPath: joinPath(dir, uid("a_")), override: { voice: v, provider: "google" } });
                res.push({ label: String.fromCharCode(65 + res.length), voice: v, path: r.path });
              }
              setBlind(res); setReveal(false);
            }}><Play size={14} /> Generar muestras</AsyncButton>
            {blind.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="font-bold text-primary w-6">{b.label}</span>
                <audio controls src={fileUrl(b.path)} className="h-8 flex-1" />
                {reveal ? <span className="font-mono text-xs w-56">{b.voice}</span> : <span className="w-56" />}
                <button className="btn-ghost btn-sm" onClick={() => { void set("tts.google.voice", b.voice); setReveal(true); toast("success", `Voz elegida: ${b.label}`, b.voice); }}>Elegir</button>
              </div>
            ))}
            {blind.length > 0 && !reveal && <button className="btn-ghost btn-sm" onClick={() => setReveal(true)}><Eye size={13} /> Revelar nombres</button>}
          </div>
        </Card>
      )}
    </div>
  );
}

function ImagesTab() {
  const { s, set } = useSetting();
  return (
    <Card title="Imágenes" icon={ImageIcon}>
      <Grid>
        <Field label="Proveedor de imágenes generadas">
          <select className="input" value={s.images.provider} onChange={(e) => set("images.provider", e.target.value)}>
            <option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="none">Ninguno (solo archivo libre y tarjetas)</option>
          </select>
        </Field>
        <Field label="Buscar en Wikimedia Commons (gratis, con licencia registrada)"><Toggle checked={s.images.useWikimedia} onChange={(v) => set("images.useWikimedia", v)} /></Field>
        <Field label="Máx. imágenes generadas · estándar"><Num v={s.images.maxGenerated.standard} on={(v) => set("images.maxGenerated.standard", v)} min={0} /></Field>
        <Field label="Máx. imágenes generadas · premium"><Num v={s.images.maxGenerated.premium} on={(v) => set("images.maxGenerated.premium", v)} min={0} /></Field>
        <Field label="Candidatas de miniatura"><Num v={s.images.thumbnailCandidates} on={(v) => set("images.thumbnailCandidates", v)} min={1} max={5} /></Field>
      </Grid>
      <div className="h-px bg-border my-4" />
      <Grid cols={3}>
        <Field label="Gemini · modelo"><Txt v={s.images.gemini.model} on={(v) => set("images.gemini.model", v)} mono /></Field>
        <Field label="Gemini · USD por imagen"><Num v={s.images.gemini.priceUsd} step={0.001} on={(v) => set("images.gemini.priceUsd", v)} /></Field>
        <div />
        <Field label="OpenAI · modelo"><Txt v={s.images.openai.model} on={(v) => set("images.openai.model", v)} mono /></Field>
        <Field label="OpenAI · calidad"><Txt v={s.images.openai.quality} on={(v) => set("images.openai.quality", v)} mono /></Field>
        <Field label="OpenAI · USD por imagen"><Num v={s.images.openai.priceUsd} step={0.001} on={(v) => set("images.openai.priceUsd", v)} /></Field>
      </Grid>
      <div className="text-[11px] text-muted-foreground mt-3">El resto de las tomas se cubre con archivo libre y tarjetas (fuente en pantalla, títulos, citas) dibujadas por la app sin costo. Los precios cambian: ajústalos aquí para que el registro de costos sea exacto.</div>
    </Card>
  );
}

function MusicTab() {
  const tick = useBus("music");
  const [list, setList] = useState<Track[]>([]);
  useEffect(() => { void listMusic().then(setList); }, [tick]);
  return (
    <Card title="Biblioteca de música" icon={Music2} actions={
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
      }}><Plus size={13} /> Añadir archivos</AsyncButton>}>
      <div className="text-xs text-muted-foreground mb-3">Solo música de uso libre para monetización (p. ej., Biblioteca de Audio de YouTube). Si la licencia exige atribución, escríbela: se añade sola a la descripción.</div>
      <div className="space-y-2">
        {list.map((t) => (
          <div key={t.id} className="grid grid-cols-[auto_1fr_1fr_1fr_1.4fr_auto] gap-2 items-center">
            <Toggle checked={!!t.enabled} onChange={(v) => void updateTrack(t.id, { enabled: v ? 1 : 0 })} />
            <input className="input text-xs" defaultValue={t.title} onBlur={(e) => void updateTrack(t.id, { title: e.target.value })} />
            <input className="input text-xs" defaultValue={t.artist} placeholder="Artista" onBlur={(e) => void updateTrack(t.id, { artist: e.target.value })} />
            <input className="input text-xs" defaultValue={t.license} placeholder="Licencia" onBlur={(e) => void updateTrack(t.id, { license: e.target.value })} />
            <input className="input text-xs" defaultValue={t.attribution} placeholder="Atribución (si la licencia la exige)" onBlur={(e) => void updateTrack(t.id, { attribution: e.target.value })} />
            <button className="btn-ghost btn-sm" onClick={async () => { await deleteTrack(t.id); await fs.remove(t.path).catch(() => null); }}><Trash2 size={13} /></button>
          </div>
        ))}
        {list.length === 0 && <div className="text-sm text-muted-foreground">Sin pistas. Los videos se montarán sin música.</div>}
      </div>
    </Card>
  );
}

function MontageTab() {
  const { s, set } = useSetting();
  return (
    <Card title="Montaje" icon={Film}>
      <Grid cols={3}>
        <Field label="Codificador" hint="«Automático» prueba Intel Quick Sync y, si falla, x264.">
          <select className="input" value={s.ffmpeg.encoder} onChange={(e) => set("ffmpeg.encoder", e.target.value)}>
            <option value="auto">Automático</option><option value="h264_qsv">Intel Quick Sync</option><option value="libx264">x264 (CPU)</option><option value="h264_mf">Media Foundation</option>
          </select>
        </Field>
        <Field label="Calidad (menor = mejor, 18–26)"><Num v={s.ffmpeg.quality} on={(v) => set("ffmpeg.quality", v)} min={14} max={32} /></Field>
        <div />
        <Field label="Ruta de ffmpeg (opcional)"><Txt v={s.ffmpeg.path} on={(v) => set("ffmpeg.path", v)} mono placeholder="Incluido con ATRIL" /></Field>
        <Field label="Ruta de ffprobe (opcional)"><Txt v={s.ffmpeg.ffprobePath} on={(v) => set("ffmpeg.ffprobePath", v)} mono placeholder="Incluido con ATRIL" /></Field>
      </Grid>
      <div className="text-[11px] text-muted-foreground mt-3">Las reglas estéticas del montaje (duración de tomas, transiciones, Ken Burns, música, rótulos) se ajustan en tus habilidades con un bloque <code className="font-mono">atril:montaje</code>.</div>
    </Card>
  );
}

function YouTubeTab() {
  const { s, set } = useSetting();
  const [ch, setCh] = useState<string | null | undefined>(undefined);
  useEffect(() => { void secrets.get(SECRET.youtubeRefreshToken).then(async (t) => { if (!t) { setCh(null); return; } try { setCh((await myChannel())?.snippet?.title ?? "(conectado)"); } catch { setCh("(conectado; no se pudo leer el canal)"); } }); }, []);
  return (
    <div className="space-y-4">
      <Card title="Conexión con YouTube" icon={MonitorPlay}>
        <div className="flex items-center gap-3">
          {ch === undefined ? <Chip>Comprobando…</Chip> : ch ? <Chip tone="green"><Check size={11} /> {ch}</Chip> : <Chip tone="amber">No conectado</Chip>}
          <AsyncButton className="btn-primary btn-sm" onClick={async () => { try { setCh(await connectYouTube()); toast("success", "YouTube conectado"); } catch (e) { await logError(e, null, "YouTube"); } }}>{ch ? "Reconectar" : "Conectar"}</AsyncButton>
          {ch && <button className="btn-ghost btn-sm" onClick={async () => { await disconnectYouTube(); setCh(null); }}>Desconectar</button>}
        </div>
        <div className="text-xs text-muted-foreground mt-3 space-y-1">
          <div>Requisitos (ver Guía): proyecto de Google Cloud con YouTube Data API v3, YouTube Analytics API y YouTube Reporting API habilitadas; cliente OAuth «App de escritorio»; pantalla de consentimiento en modo «En producción» (si queda en «Prueba», la autorización caduca cada 7 días).</div>
          <div><b>Importante:</b> hasta que Google apruebe la auditoría de tu proyecto, todo video subido por API queda privado. Mientras tanto usa «Exportar paquete» y súbelo a mano en YouTube Studio.</div>
          <button className="text-primary hover:underline" onClick={() => void openUrl("https://support.google.com/youtube/contact/yt_api_form")}>Formulario de auditoría de la API de YouTube</button>
        </div>
      </Card>
      <Card title="Publicación">
        <Grid cols={3}>
          <Field label="Zona horaria del público"><Txt v={s.publishing.timeZone} on={(v) => set("publishing.timeZone", v)} mono /></Field>
          <Field label="Hora de publicación por defecto"><input type="time" className="input" value={s.publishing.time} onChange={(e) => set("publishing.time", e.target.value)} /></Field>
          <Field label="Categoría (27 = Educación)"><Txt v={s.publishing.categoryId} on={(v) => set("publishing.categoryId", v)} mono /></Field>
          <Field label="Idioma"><Txt v={s.publishing.defaultLanguage} on={(v) => set("publishing.defaultLanguage", v)} mono /></Field>
          <Field label="URL de la política de privacidad (para la auditoría)"><Txt v={s.publishing.privacyPolicyUrl} on={(v) => set("publishing.privacyPolicyUrl", v)} /></Field>
        </Grid>
        <div className="mt-4"><Field label="Aviso de IA que se añade a cada descripción"><textarea className="input min-h-16 text-sm" value={s.publishing.aiDisclosure} onChange={(e) => set("publishing.aiDisclosure", e.target.value)} /></Field></div>
      </Card>
    </div>
  );
}

function BudgetTab() {
  const { s, set } = useSetting();
  return (
    <Card title="Presupuesto" icon={Wallet}>
      <Grid cols={3}>
        <Field label="Presupuesto mensual (S/)"><Num v={s.budget.monthlyPen} on={(v) => set("budget.monthlyPen", v)} /></Field>
        <Field label="Soles por dólar" hint="Actualízalo de vez en cuando."><Num v={s.budget.penPerUsd} step={0.01} on={(v) => set("budget.penPerUsd", v)} /></Field>
        <Field label="Avisar al llegar al (%)"><Num v={s.budget.warnAtPct} on={(v) => set("budget.warnAtPct", v)} /></Field>
      </Grid>
      <div className="mt-4"><Toggle checked={s.budget.hardStop} onChange={(v) => set("budget.hardStop", v)} label="Tope duro: no gastar por encima del presupuesto (las etapas se pausan con aviso)" /></div>
    </Card>
  );
}

function ProductionTab() {
  const { s, set } = useSetting();
  const p = s.production;
  return (
    <Card title="Producción" icon={Factory}>
      <Grid cols={3}>
        <Field label="Minutos objetivo · estándar (mín.)"><Num v={p.targetMinutes.standard[0]} on={(v) => set("production.targetMinutes.standard", [v, p.targetMinutes.standard[1]])} /></Field>
        <Field label="Minutos objetivo · estándar (máx.)"><Num v={p.targetMinutes.standard[1]} on={(v) => set("production.targetMinutes.standard", [p.targetMinutes.standard[0], v])} /></Field>
        <Field label="Pasadas de guion · estándar"><Num v={p.scriptPasses.standard} on={(v) => set("production.scriptPasses.standard", v)} min={1} max={3} /></Field>
        <Field label="Minutos objetivo · premium (mín.)"><Num v={p.targetMinutes.premium[0]} on={(v) => set("production.targetMinutes.premium", [v, p.targetMinutes.premium[1]])} /></Field>
        <Field label="Minutos objetivo · premium (máx.)"><Num v={p.targetMinutes.premium[1]} on={(v) => set("production.targetMinutes.premium", [p.targetMinutes.premium[0], v])} /></Field>
        <Field label="Pasadas de guion · premium"><Num v={p.scriptPasses.premium} on={(v) => set("production.scriptPasses.premium", v)} min={1} max={4} /></Field>
        <Field label="Meta de revisión diaria (min)"><Num v={s.review.dailyMinutesGoal} on={(v) => set("review.dailyMinutesGoal", v)} /></Field>
      </Grid>
      <div className="mt-4"><Toggle checked={p.autoRunToReview} onChange={(v) => set("production.autoRunToReview", v)} label="Al abrir la app, reanudar automáticamente los videos en curso hasta el siguiente punto de revisión" /></div>
    </Card>
  );
}

function LookTab() {
  const { s, set } = useSetting();
  return (
    <Card title="Apariencia" icon={Palette}>
      <div className="flex gap-2">
        <button className={s.theme === "dark" ? "btn-primary" : "btn-secondary"} onClick={() => set("theme", "dark")}>Grafito (oscuro)</button>
        <button className={s.theme === "light" ? "btn-primary" : "btn-secondary"} onClick={() => set("theme", "light")}>Arena (claro)</button>
      </div>
    </Card>
  );
}

export type { AppSettings };
