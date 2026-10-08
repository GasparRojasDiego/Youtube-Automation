import { useEffect, useState, type ReactNode } from "react";
import { KeyRound, Bot, Mic, Image as ImageIcon, Music2, Film, MonitorPlay, Wallet, Factory, Tv, Trash2, Plus, Check, Play, Shuffle, Eye, Palette, Sparkles, Library, FolderOpen } from "lucide-react";
import { registerOpenverse } from "../media/sources";
import { libraryRoot } from "../media/library";
import { findBrowser } from "../motion/host";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { secrets, fs, appPaths, fileUrl } from "../lib/ipc";
import { useBus } from "../lib/bus";
import { getSettings, saveSettings, SECRET, type AppSettings, type StageModelKey } from "../lib/settings";
import { listChannels, createChannel, updateChannel, listMusic, addTrack, updateTrack, deleteTrack, type Channel, type Track } from "../lib/repo";
import { PageHeader, Card, Field, Toggle, Tabs, AsyncButton, Chip } from "../ui/kit";
import { requestJson } from "../providers/net";
import { GEMINI_IMAGE_MODELS, OPENAI_IMAGE_MODELS } from "../providers/images";
import { listGoogleVoices, synthesize } from "../providers/tts";
import { connectYouTube, disconnectYouTube, myChannel } from "../providers/youtube";
import { claudeVersion } from "../providers/claude";
import { probeDuration } from "../providers/ffmpeg";
import { toast, logError } from "../lib/events";
import { joinPath, uid, baseName } from "../lib/util";

type Tab = "channel" | "keys" | "claude" | "voice" | "images" | "motion" | "music" | "montage" | "youtube" | "budget" | "production" | "look";
const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "channel", label: "Canal", icon: Tv }, { id: "keys", label: "Credenciales", icon: KeyRound }, { id: "claude", label: "Claude Code", icon: Bot },
  { id: "voice", label: "Voz", icon: Mic }, { id: "images", label: "Medios", icon: ImageIcon }, { id: "motion", label: "Motion", icon: Sparkles }, { id: "music", label: "Música", icon: Music2 },
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
      <PageHeader title="Ajustes" />
      <div className="mb-5"><Tabs tabs={TABS} value={tab} onChange={setTab} /></div>
      {tab === "channel" && <ChannelTab />}
      {tab === "keys" && <KeysTab />}
      {tab === "claude" && <ClaudeTab />}
      {tab === "voice" && <VoiceTab />}
      {tab === "images" && <ImagesTab />}
      {tab === "motion" && <MotionTab />}
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
      <input className="input font-mono text-xs" type="password" value={val} placeholder={has ? "•••••••• guardada" : "Pega la clave"} onChange={(e) => setVal(e.target.value)} />
      <div className="flex gap-1.5">
        <AsyncButton className="btn-brand btn-sm" disabled={!val.trim()} onClick={async () => { await secrets.set(k, val.trim()); setVal(""); setHas(true); toast("success", `${label} guardada`); }}>Guardar</AsyncButton>
        {test && <AsyncButton className="btn-ghost btn-sm" disabled={!has} onClick={async () => { try { const v = await secrets.get(k); toast("success", `${label}: funciona`, await test(v!)); } catch (e) { await logError(e, null, `${label}`); } }}>Probar</AsyncButton>}
        {has && <button className="btn-ghost btn-sm" onClick={async () => { await secrets.remove(k); setHas(false); }}><Trash2 size={13} /></button>}
      </div>
    </div>
  );
}

function KeysTab() {
  return (
    <Card title="Credenciales" icon={KeyRound}>
      <div className="text-xs text-muted-foreground mb-2">Se guardan cifradas en Windows.</div>
      <SecretRow k={SECRET.googleApiKey} label="Google Cloud" hint="Para la voz (Text-to-Speech)."
        test={async (v) => { const r = await requestJson<any>("Google TTS", { url: `https://texttospeech.googleapis.com/v1/voices?languageCode=en-US&key=${encodeURIComponent(v)}` }); return `${r.voices?.length ?? 0} voces disponibles`; }} />
      <SecretRow k={SECRET.openaiApiKey} label="OpenAI" hint="Imágenes con IA (recomendado). De pago."
        test={async (v) => { const r = await requestJson<any>("OpenAI", { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${v}` } }); const ids: string[] = (r.data ?? []).map((x: any) => x.id); const m = OPENAI_IMAGE_MODELS.find((x) => ids.includes(x)); return m ? `Clave válida · ${m}` : "Clave válida (sin modelos de imagen: verifica tu organización)"; }} />
      <SecretRow k={SECRET.geminiApiKey} label="Gemini" hint="Imágenes con IA (alternativa) y voz Gemini. De pago."
        test={async (v) => { const r = await requestJson<any>("Gemini", { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", headers: { "x-goog-api-key": v } }); const ids: string[] = (r.models ?? []).map((x: any) => String(x.name).replace("models/", "")); const m = GEMINI_IMAGE_MODELS.find((x) => ids.includes(x)); return m ? `Clave válida · ${m}` : `${ids.length} modelos (ninguno de imagen)`; }} />
      <SecretRow k={SECRET.elevenlabsApiKey} label="ElevenLabs (opcional)" hint="Otra voz y efectos de sonido creados. De pago."
        test={async (v) => { const r = await requestJson<any>("ElevenLabs", { url: "https://api.elevenlabs.io/v1/user", headers: { "xi-api-key": v } }); return `Plan: ${r.subscription?.tier ?? "?"}`; }} />
      <SecretRow k={SECRET.youtubeClientId} label="YouTube · ID de cliente" hint="Cliente OAuth tipo «App de escritorio»." />
      <SecretRow k={SECRET.youtubeClientSecret} label="YouTube · secreto" hint="Del mismo cliente." />
    </Card>
  );
}

const STAGE_LABEL: Record<StageModelKey, string> = { topics: "Temas", research: "Investigación", script: "Guion", verify: "Verificación", storyboard: "Storyboard y casting", vision: "Visión", polish: "Retoques", motion: "Animaciones", critique: "Revisión de animaciones", package: "Metadatos", analysis: "Habilidades y referentes" };

function ClaudeTab() {
  const { s, set } = useSetting();
  const [ver, setVer] = useState<string | null | undefined>(undefined);
  return (
    <div className="space-y-4">
      <Card title="Claude Code" icon={Bot} actions={<AsyncButton className="btn-brand btn-sm" onClick={async () => setVer(await claudeVersion())}>Comprobar</AsyncButton>}>
        <Grid>
          <Field label="Programa" hint="«claude» o la ruta a claude.exe"><Txt v={s.claude.path} on={(v) => set("claude.path", v)} mono /></Field>
          <Field label="Tiempo máximo por tarea (min)"><Num v={s.claude.timeoutMin} on={(v) => set("claude.timeoutMin", v)} min={5} /></Field>
          <Field label="Argumentos extra (avanzado)"><Txt v={s.claude.extraArgs} on={(v) => set("claude.extraArgs", v)} mono /></Field>
        </Grid>
        {ver !== undefined && <div className="mt-3">{ver ? <Chip tone="green">{ver}</Chip> : <Chip tone="red">No se encontró Claude Code</Chip>}</div>}
      </Card>
      <Card title="Modelo y esfuerzo por etapa">
        <div className="text-xs text-muted-foreground mb-3">«opus», «sonnet» o «haiku». Opus gasta más límite.</div>
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
          <div className="text-[11px] text-muted-foreground self-end">«Mi voz» se elige en Hoy, por video.</div>
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
              <span className="text-xs text-muted-foreground self-center">Elige 3–5 y escúchalas a ciegas.</span>
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
  const [root, setRoot] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => { void libraryRoot().then(setRoot); }, [s.media.libraryDir]);
  const SRC: [keyof AppSettings["media"]["sources"], string, string][] = [
    ["pexels", "Pexels", "Fotos y videos."],
    ["pixabay", "Pixabay", "Fotos, ilustraciones y videos."],
    ["wikimedia", "Wikimedia Commons", "Archivo histórico, lugares, documentos."],
    ["openverse", "Openverse", "Imágenes y audio con licencia abierta."],
    ["nasa", "NASA", "Espacio y ciencia."],
    ["met", "The Met", "Arte y objetos históricos."],
    ["freesound", "Freesound", "Efectos de sonido."],
  ];
  return (
    <div className="space-y-4">
      <Card title="Fuentes de material libre" icon={Library}>
        <div className="text-xs text-muted-foreground mb-3">Solo licencias aptas para monetizar. Cada archivo guarda su licencia y origen.</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {SRC.map(([k, label, hint]) => (
            <div key={k} className="flex items-start gap-3 py-1"><Toggle checked={s.media.sources[k]} onChange={(v) => set(`media.sources.${k}`, v)} /><div><div className="text-sm font-medium">{label}</div><div className="text-[11px] text-muted-foreground">{hint}</div></div></div>
          ))}
        </div>
      </Card>
      <Card title="Claves (gratis)" icon={KeyRound}>
        <SecretRow k={SECRET.pexelsApiKey} label="Pexels" hint={<button className="text-primary hover:underline" onClick={() => void openUrl("https://www.pexels.com/api/")}>pexels.com/api</button>}
          test={async (v) => { const r = await requestJson<any>("Pexels", { url: "https://api.pexels.com/v1/search?query=city&per_page=1", headers: { Authorization: v } }); return `${r.total_results ?? 0} resultados de prueba`; }} />
        <SecretRow k={SECRET.pixabayApiKey} label="Pixabay" hint={<button className="text-primary hover:underline" onClick={() => void openUrl("https://pixabay.com/api/docs/")}>pixabay.com/api/docs</button>}
          test={async (v) => { const r = await requestJson<any>("Pixabay", { url: `https://pixabay.com/api/?key=${encodeURIComponent(v)}&q=city&per_page=3` }); return `${r.totalHits ?? 0} resultados de prueba`; }} />
        <SecretRow k={SECRET.freesoundApiKey} label="Freesound" hint={<button className="text-primary hover:underline" onClick={() => void openUrl("https://freesound.org/apiv2/apply/")}>freesound.org/apiv2/apply</button>}
          test={async (v) => { const r = await requestJson<any>("Freesound", { url: `https://freesound.org/apiv2/search/text/?query=whoosh&page_size=1&token=${encodeURIComponent(v)}` }); return `${r.count ?? 0} sonidos de prueba`; }} />
        <div className="grid grid-cols-[220px_1fr_auto] gap-3 items-start py-3">
          <div><div className="text-sm font-medium">Openverse</div><div className="text-[11px] text-muted-foreground mt-0.5">Regístrate para más búsquedas. Luego confirma el correo.</div></div>
          <input className="input text-sm" value={email} placeholder="Tu correo" onChange={(e) => setEmail(e.target.value)} />
          <AsyncButton className="btn-brand btn-sm" disabled={!/@/.test(email)} onClick={async () => { await registerOpenverse(email.trim()); toast("success", "Registrado en Openverse", "Confirma el correo."); }}>Registrar</AsyncButton>
        </div>
      </Card>
      <Card title="Biblioteca" icon={ImageIcon}>
        <Grid>
          <Field label="Carpeta" hint={<span className="font-mono">{root}</span>}>
            <div className="flex gap-2"><Txt v={s.media.libraryDir} on={(v) => set("media.libraryDir", v)} placeholder="Documentos\ATRIL\Biblioteca" mono />
              <button className="btn-ghost" onClick={async () => { const d = await openDialog({ directory: true }); if (d && !Array.isArray(d)) set("media.libraryDir", d); }}><FolderOpen size={14} /></button>
              <button className="btn-ghost" onClick={() => void openPath(root)}>Abrir</button></div>
          </Field>
          <Field label="Buscar primero en la biblioteca"><Toggle checked={s.media.libraryFirst} onChange={(v) => set("media.libraryFirst", v)} /></Field>
          <Field label="Candidatos por toma"><Num v={s.media.candidatesPerBeat} on={(v) => set("media.candidatesPerBeat", v)} min={1} max={6} /></Field>
          <Field label="Imágenes por llamada de visión"><Num v={s.media.visionBatch} on={(v) => set("media.visionBatch", v)} min={1} max={20} /></Field>
          <Field label="Clip máximo (s)"><Num v={s.media.maxClipSeconds} on={(v) => set("media.maxClipSeconds", v)} min={2} max={12} /></Field>
          <Field label="Imágenes con IA" hint="Para escenas difíciles y cuando no hay material libre."><Toggle checked={s.media.allowGenerated} onChange={(v) => set("media.allowGenerated", v)} /></Field>
        </Grid>
      </Card>
      <Card title="Imágenes con IA" icon={ImageIcon}>
        <Grid cols={3}>
          <Field label="Proveedor" hint="Automático = el que tenga clave (OpenAI primero).">
            <select className="input" value={s.images.provider} onChange={(e) => set("images.provider", e.target.value)}>
              <option value="auto">Automático</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="none">Ninguno</option>
            </select>
          </Field>
          <Field label="Máx. por video · estándar"><Num v={s.images.perVideo.standard} on={(v) => set("images.perVideo.standard", v)} min={0} max={60} /></Field>
          <Field label="Máx. por video · premium"><Num v={s.images.perVideo.premium} on={(v) => set("images.perVideo.premium", v)} min={0} max={80} /></Field>
          <Field label="Gemini · modelo"><Txt v={s.images.gemini.model} on={(v) => set("images.gemini.model", v)} mono /></Field>
          <Field label="Gemini · USD por imagen"><Num v={s.images.gemini.priceUsd} step={0.001} on={(v) => set("images.gemini.priceUsd", v)} /></Field>
          <Field label="OpenAI · modelo"><Txt v={s.images.openai.model} on={(v) => set("images.openai.model", v)} mono /></Field>
          <Field label="OpenAI · calidad">
            <select className="input" value={s.images.openai.quality} onChange={(e) => set("images.openai.quality", e.target.value)}>
              <option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option>
            </select>
          </Field>
          <Field label="OpenAI · USD por imagen"><Num v={s.images.openai.priceUsd} step={0.001} on={(v) => set("images.openai.priceUsd", v)} /></Field>
          <Field label="Miniaturas a proponer"><Num v={s.images.thumbnailCandidates} on={(v) => set("images.thumbnailCandidates", v)} min={1} max={5} /></Field>
        </Grid>
      </Card>
      <Card title="Efectos de sonido" icon={Music2}>
        <div className="text-xs text-muted-foreground mb-3">Orden: tu biblioteca → Freesound → ElevenLabs → síntesis propia. Ningún efecto se omite.</div>
        <Grid cols={3}>
          <Field label="Crear con ElevenLabs" hint="Solo con plan de pago (uso comercial)."><Toggle checked={s.sfx.elevenlabs} onChange={(v) => set("sfx.elevenlabs", v)} /></Field>
          <Field label="Máx. creados por video"><Num v={s.sfx.maxGenerated} on={(v) => set("sfx.maxGenerated", v)} min={0} max={80} /></Field>
          <Field label="USD por segundo (estimado)"><Num v={s.sfx.priceUsdPerSecond} step={0.001} on={(v) => set("sfx.priceUsdPerSecond", v)} /></Field>
        </Grid>
      </Card>
    </div>
  );
}

function MotionTab() {
  const { s, set } = useSetting();
  const [found, setFound] = useState<string | null | undefined>(undefined);
  return (
    <Card title="Animaciones (Opus)" icon={Sparkles}
      actions={<AsyncButton className="btn-brand btn-sm" onClick={async () => setFound(await findBrowser())}>Detectar navegador</AsyncButton>}>
      <div className="text-xs text-muted-foreground mb-3">Opus diseña las animaciones; Edge las graba.</div>
      <Grid cols={3}>
        <Field label="Activadas"><Toggle checked={s.motion.enabled} onChange={(v) => set("motion.enabled", v)} /></Field>
        <Field label="Por video · estándar" hint="Nunca menos de una por minuto."><Num v={s.motion.perVideo.standard} on={(v) => set("motion.perVideo.standard", v)} min={0} max={30} /></Field>
        <Field label="Por video · premium"><Num v={s.motion.perVideo.premium} on={(v) => set("motion.perVideo.premium", v)} min={0} max={40} /></Field>
        <Field label="Revisión visual" hint="Sonnet revisa y Opus corrige."><Toggle checked={s.motion.critique} onChange={(v) => set("motion.critique", v)} /></Field>
        <Field label="Por llamada a Opus"><Num v={s.motion.perCall} on={(v) => set("motion.perCall", v)} min={1} max={4} /></Field>
        <Field label="Navegador" hint="Vacío = Edge."><Txt v={s.motion.browserPath} on={(v) => set("motion.browserPath", v)} mono placeholder="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" /></Field>
      </Grid>
      {found !== undefined && <div className="mt-3">{found ? <Chip tone="green">{found}</Chip> : <Chip tone="red">No se encontró Edge ni Chrome</Chip>}</div>}
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
      <div className="text-xs text-muted-foreground mb-3">Tus pistas van primero. Escribe su ambiente en inglés. La Biblioteca de audio de YouTube es lo más seguro.</div>
      <div className="space-y-2">
        {list.map((t) => (
          <div key={t.id} className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1.4fr_auto] gap-2 items-center">
            <Toggle checked={!!t.enabled} onChange={(v) => void updateTrack(t.id, { enabled: v ? 1 : 0 })} />
            <input className="input text-xs" defaultValue={t.title} onBlur={(e) => void updateTrack(t.id, { title: e.target.value })} />
            <input className="input text-xs" defaultValue={t.mood} placeholder="Ambiente: dark, piano…" onBlur={(e) => void updateTrack(t.id, { mood: e.target.value })} />
            <input className="input text-xs" defaultValue={t.artist} placeholder="Artista" onBlur={(e) => void updateTrack(t.id, { artist: e.target.value })} />
            <input className="input text-xs" defaultValue={t.license} placeholder="Licencia" onBlur={(e) => void updateTrack(t.id, { license: e.target.value })} />
            <input className="input text-xs" defaultValue={t.attribution} placeholder="Atribución (si hace falta)" onBlur={(e) => void updateTrack(t.id, { attribution: e.target.value })} />
            <button className="btn-ghost btn-sm" onClick={async () => { await deleteTrack(t.id); await fs.remove(t.path).catch(() => null); }}><Trash2 size={13} /></button>
          </div>
        ))}
        {list.length === 0 && <div className="text-sm text-muted-foreground">Sin pistas.</div>}
      </div>
    </Card>
  );
}

function MontageTab() {
  const { s, set } = useSetting();
  return (
    <Card title="Montaje" icon={Film}>
      <Grid cols={3}>
        <Field label="Codificador">
          <select className="input" value={s.ffmpeg.encoder} onChange={(e) => set("ffmpeg.encoder", e.target.value)}>
            <option value="auto">Automático</option><option value="h264_qsv">Intel Quick Sync</option><option value="libx264">x264 (CPU)</option><option value="h264_mf">Media Foundation</option>
          </select>
        </Field>
        <Field label="Calidad (menor = mejor)"><Num v={s.ffmpeg.quality} on={(v) => set("ffmpeg.quality", v)} min={14} max={32} /></Field>
        <div />
        <Field label="ffmpeg (opcional)"><Txt v={s.ffmpeg.path} on={(v) => set("ffmpeg.path", v)} mono placeholder="Incluido con ATRIL" /></Field>
        <Field label="ffprobe (opcional)"><Txt v={s.ffmpeg.ffprobePath} on={(v) => set("ffmpeg.ffprobePath", v)} mono placeholder="Incluido con ATRIL" /></Field>
      </Grid>
    </Card>
  );
}

function YouTubeTab() {
  const { s, set } = useSetting();
  const [ch, setCh] = useState<string | null | undefined>(undefined);
  useEffect(() => { void secrets.get(SECRET.youtubeRefreshToken).then(async (t) => { if (!t) { setCh(null); return; } try { setCh((await myChannel())?.snippet?.title ?? "(conectado)"); } catch { setCh("(conectado; no se pudo leer el canal)"); } }); }, []);
  return (
    <div className="space-y-4">
      <Card title="YouTube" icon={MonitorPlay}>
        <div className="flex items-center gap-3">
          {ch === undefined ? <Chip>Comprobando…</Chip> : ch ? <Chip tone="green"><Check size={11} /> {ch}</Chip> : <Chip tone="amber">No conectado</Chip>}
          <AsyncButton className="btn-primary btn-sm" onClick={async () => { try { setCh(await connectYouTube()); toast("success", "YouTube conectado"); } catch (e) { await logError(e, null, "YouTube"); } }}>{ch ? "Reconectar" : "Conectar"}</AsyncButton>
          {ch && <button className="btn-ghost btn-sm" onClick={async () => { await disconnectYouTube(); setCh(null); }}>Desconectar</button>}
        </div>
        <div className="text-xs text-muted-foreground mt-3 space-y-1">
          <div>Sin auditoría de Google, los videos subidos quedan privados. Mientras tanto, exporta y sube a mano.</div>
          <button className="text-primary hover:underline" onClick={() => void openUrl("https://support.google.com/youtube/contact/yt_api_form")}>Pedir auditoría</button>
        </div>
      </Card>
      <Card title="Publicación">
        <Grid cols={3}>
          <Field label="Zona horaria"><Txt v={s.publishing.timeZone} on={(v) => set("publishing.timeZone", v)} mono /></Field>
          <Field label="Hora por defecto"><input type="time" className="input" value={s.publishing.time} onChange={(e) => set("publishing.time", e.target.value)} /></Field>
          <Field label="Categoría (27 = Educación)"><Txt v={s.publishing.categoryId} on={(v) => set("publishing.categoryId", v)} mono /></Field>
          <Field label="Idioma"><Txt v={s.publishing.defaultLanguage} on={(v) => set("publishing.defaultLanguage", v)} mono /></Field>
          <Field label="Política de privacidad (URL)"><Txt v={s.publishing.privacyPolicyUrl} on={(v) => set("publishing.privacyPolicyUrl", v)} /></Field>
        </Grid>
        <div className="mt-4"><Field label="Aviso de IA en la descripción"><textarea className="input min-h-16 text-sm" value={s.publishing.aiDisclosure} onChange={(e) => set("publishing.aiDisclosure", e.target.value)} /></Field></div>
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
        <Field label="Soles por dólar"><Num v={s.budget.penPerUsd} step={0.01} on={(v) => set("budget.penPerUsd", v)} /></Field>
        <Field label="Avisar al llegar al (%)"><Num v={s.budget.warnAtPct} on={(v) => set("budget.warnAtPct", v)} /></Field>
      </Grid>
      <div className="mt-4"><Toggle checked={s.budget.hardStop} onChange={(v) => set("budget.hardStop", v)} label="No gastar más del presupuesto" /></div>
    </Card>
  );
}

function ProductionTab() {
  const { s, set } = useSetting();
  const p = s.production;
  return (
    <Card title="Producción" icon={Factory}>
      <Grid cols={3}>
        <Field label="Minutos · estándar (mín.)"><Num v={p.targetMinutes.standard[0]} on={(v) => set("production.targetMinutes.standard", [v, p.targetMinutes.standard[1]])} /></Field>
        <Field label="Minutos · estándar (máx.)"><Num v={p.targetMinutes.standard[1]} on={(v) => set("production.targetMinutes.standard", [p.targetMinutes.standard[0], v])} /></Field>
        <Field label="Pasadas de guion · estándar"><Num v={p.scriptPasses.standard} on={(v) => set("production.scriptPasses.standard", v)} min={1} max={3} /></Field>
        <Field label="Minutos · premium (mín.)"><Num v={p.targetMinutes.premium[0]} on={(v) => set("production.targetMinutes.premium", [v, p.targetMinutes.premium[1]])} /></Field>
        <Field label="Minutos · premium (máx.)"><Num v={p.targetMinutes.premium[1]} on={(v) => set("production.targetMinutes.premium", [p.targetMinutes.premium[0], v])} /></Field>
        <Field label="Pasadas de guion · premium"><Num v={p.scriptPasses.premium} on={(v) => set("production.scriptPasses.premium", v)} min={1} max={4} /></Field>
      </Grid>
      <div className="mt-4 flex flex-wrap gap-6 items-center">
        <Toggle checked={p.autoRunToReview} onChange={(v) => set("production.autoRunToReview", v)} label="Reanudar videos al abrir la app" />
        <label className="flex items-center gap-2 text-sm">Revisión de datos
          <select className="input h-8 py-0 w-56" value={p.verifyMode} onChange={(e) => set("production.verifyMode", e.target.value)}>
            <option value="auto">Automática (corrige sola)</option><option value="off">Desactivada</option>
          </select>
        </label>
      </div>
    </Card>
  );
}

function LookTab() {
  const { s, set } = useSetting();
  return (
    <Card title="Apariencia" icon={Palette}>
      <div className="flex gap-2">
        <button className={s.theme === "dark" ? "btn-primary" : "btn-secondary"} onClick={() => set("theme", "dark")}>Oscuro</button>
        <button className={s.theme === "light" ? "btn-primary" : "btn-secondary"} onClick={() => set("theme", "light")}>Claro</button>
      </div>
    </Card>
  );
}

export type { AppSettings };
