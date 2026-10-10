import { useEffect, useState } from "react";
import { Play, Lightbulb, ArrowRight, Clapperboard, Plus, FileText, Library, Repeat, Bot, UserRound, X, Image as ImageIcon, Film, Music2 } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useBus } from "../lib/bus";
import { db } from "../lib/ipc";
import { activeChannel, getStages, listTopics, type Channel, type StageRow, type Video } from "../lib/repo";
import { startNextVideo, startFromPrompt, startPersonal, activeVideos, runVideo, isQueued } from "../pipeline/runner";
import { ACCEPT, SCRIPT_EXT, kindOf } from "../pipeline/personal";
import { navigate } from "../ui/nav";
import { Card, Empty, Chip, AsyncButton } from "../ui/kit";
import { StepStrip, awaiting } from "../ui/Steps";
import { TopicsPanel } from "./Topics";

type Mode = "auto" | "personal";
const DURATIONS: [number, string][] = [[0.5, "30 s"], [1, "1 min"], [2, "2 min"], [3, "3 min"], [5, "5 min"], [8, "8 min"], [12, "12 min"]];
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } } };
const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Interruptor compacto con ícono, para la barra del recuadro. */
function Pill({ on, onChange, icon: I, label, title }: { on: boolean; onChange: (v: boolean) => void; icon: typeof Plus; label: string; title: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} title={title} onClick={() => onChange(!on)}
      className={`h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border text-[12.5px] font-medium transition-colors ${on ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
      <I size={14} /> {label} <span className={`ml-0.5 w-6 h-3.5 rounded-full relative transition-colors ${on ? "bg-primary" : "bg-border"}`}><span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${on ? "left-3" : "left-0.5"}`} /></span>
    </button>
  );
}

export function Today() {
  const tick = useBus("videos", "stages", "topics", "channels", "jobs");
  const [ch, setCh] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<{ v: Video; stages: StageRow[] }[]>([]);
  const [hasTopics, setHasTopics] = useState(false);
  const [published, setPublished] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [mode, setModeState] = useState<Mode>(() => (store.get("atril.mode") === "personal" ? "personal" : "auto"));
  const setMode = (m: Mode) => { setModeState(m); store.set("atril.mode", m); };
  // Modo Personal
  const [description, setDescription] = useState("");
  const [minutes, setMinutes] = useState(2);
  const [language, setLanguage] = useState<"es" | "en">("es");
  const [useLibrary, setUseLibrary] = useState(true);
  const [iterate, setIterate] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [script, setScript] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const c = await activeChannel(); setCh(c);
      if (!c) return;
      const act = await activeVideos(c.id);
      setVideos(await Promise.all(act.map(async (v) => ({ v, stages: await getStages(v.id) }))));
      setHasTopics((await listTopics(c.id, "approved")).length > 0);
      setPublished((await db.query<{ n: number }>("SELECT COUNT(*) n FROM videos WHERE channel_id=? AND status IN ('published','scheduled') AND created_at>=?", [c.id, Date.now() - 30 * 86400000]))[0]?.n ?? 0);
    })();
  }, [tick]);

  if (!ch) return <Empty icon={Clapperboard} title="Sin canal">Vuelve a abrir ATRIL para crearlo.</Empty>;
  const personal = mode === "personal";
  const ready = personal ? !!(prompt.trim() || script) : !!prompt.trim();
  const create = async () => {
    if (!ready) return;
    const id = personal
      ? await startPersonal({ prompt, description, minutes, language, useLibrary, iterate, files, script })
      : await startFromPrompt(prompt);
    if (!id) return;
    setPrompt(""); setFiles([]); setScript(null); setDescription("");
    if (personal) navigate({ page: "video", id });
  };
  const pickFiles = async () => {
    const sel = await openDialog({ multiple: true, filters: [{ name: "Imágenes, videos, audio y documentos", extensions: Object.values(ACCEPT).flat() }] });
    const list = (Array.isArray(sel) ? sel : sel ? [sel] : []).filter((p) => kindOf(p));
    setFiles((f) => [...new Set([...f, ...list])]);
  };
  const pickScript = async () => {
    const sel = await openDialog({ multiple: false, filters: [{ name: "Guion", extensions: SCRIPT_EXT }] });
    if (typeof sel === "string") setScript(sel);
  };
  const KIND_ICON = { image: ImageIcon, video: Film, audio: Music2, document: FileText } as const;

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden">
        <div className="relative px-8 pt-7 pb-6">
          <div className="inline-flex p-0.5 rounded-lg border border-border bg-background/60 mb-4" role="tablist">
            {([["auto", "Automatización", Bot], ["personal", "Personal", UserRound]] as const).map(([id, label, I]) => (
              <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
                className={`h-8 px-3.5 rounded-md text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors ${mode === id ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}>
                <I size={14} /> {label}
              </button>
            ))}
          </div>
          <h1 className="text-[27px] leading-tight font-bold tracking-tight">¿Qué video hacemos hoy?</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {personal ? "Un video a tu medida: tarea, proyecto o promoción. Sube tus archivos o tu guion, describe cómo lo quieres y elige la duración."
              : "Escribe la idea o usa un tema investigado. La app hace todo y solo te pide revisar el video final."}
          </p>
          <div className="mt-4 rounded-lg border border-border/80 bg-background/90 focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/15 transition-all">
            <textarea className="w-full bg-transparent outline-none resize-none px-4 pt-3.5 pb-1 text-[15px] min-h-[76px] placeholder:text-muted-foreground/70" value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={personal ? (script ? "Opcional: indicaciones extra sobre tu guion" : "Ej.: Video para mi exposición de biología sobre la fotosíntesis") : "Ej.: ¿Qué pasaría si 200 soldados modernos aparecieran en la antigua Roma?"}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void create(); }} />
            {personal && (files.length > 0 || script) && (
              <div className="flex flex-wrap gap-1.5 px-3 pb-1">
                {script && <span className="chip text-primary border-primary/40 bg-primary/10"><FileText size={11} /> Guion: {fileName(script)}<button aria-label="Quitar guion" onClick={() => setScript(null)}><X size={11} /></button></span>}
                {files.map((f) => { const I = KIND_ICON[kindOf(f) ?? "document"]; return (
                  <span key={f} className="chip text-muted-foreground border-border"><I size={11} /> {fileName(f)}<button aria-label="Quitar" onClick={() => setFiles((x) => x.filter((y) => y !== f))}><X size={11} /></button></span>
                ); })}
              </div>
            )}
            <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
              {personal && (<>
                <button className="w-8 h-8 rounded-md border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors" title="Agregar archivos: imágenes, videos, audio o documentos" aria-label="Agregar archivos" onClick={() => void pickFiles()}><Plus size={16} /></button>
                <button className={`w-8 h-8 rounded-md border grid place-items-center transition-colors ${script ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"}`} title="Subir un guion ya escrito (se respeta tal cual)" aria-label="Subir guion" onClick={() => void pickScript()}><FileText size={15} /></button>
                <Pill on={useLibrary} onChange={setUseLibrary} icon={Library} label="Recursos" title={useLibrary ? "Activado: Claude puede usar tu biblioteca, buscar en internet y crear imágenes" : "Desactivado: solo tus archivos subidos (más animaciones y tarjetas)"} />
                <Pill on={iterate} onChange={setIterate} icon={Repeat} label="Mejora continua" title="Al terminar la primera versión, pides cambios y ATRIL los aplica, como en un chat" />
              </>)}
              <div className="flex-1" />
              {!personal && hasTopics && <button className="btn-ghost btn-sm" onClick={() => void startNextVideo()}><Lightbulb size={14} /> Usar el próximo tema</button>}
              <AsyncButton className="btn-primary h-9 px-4" disabled={!ready} onClick={create}>Crear video <ArrowRight size={15} /></AsyncButton>
            </div>
          </div>
          {personal && (
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-start">
              <textarea className="input min-h-[60px] resize-none text-[13.5px] bg-background/90" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Cómo será el video: para quién es, el tono, el estilo y qué debe lograr (distinto del guion)" aria-label="Descripción del video" />
              <label className="flex flex-col text-[11px] font-semibold text-muted-foreground">Duración
                <select className="input mt-1 h-9 w-28" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>{DURATIONS.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select>
              </label>
              <div className="flex flex-col text-[11px] font-semibold text-muted-foreground">Idioma
                <div className="mt-1 inline-flex h-9 p-0.5 rounded-md border border-border bg-background/60">
                  {([["es", "Español"], ["en", "Inglés"]] as const).map(([k, l]) => <button key={k} onClick={() => setLanguage(k)} className={`px-3 rounded text-[13px] font-medium ${language === k ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground"}`}>{l}</button>)}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <Card title="En curso" icon={Clapperboard} actions={<span className="text-[11px] text-muted-foreground tabular">Publicados en 30 días: <b className="text-foreground">{published}</b></span>}>
        {videos.length === 0 ? (
          <Empty icon={Play} title="Nada en curso">Escribe una idea arriba y pulsa «Crear video».</Empty>
        ) : (
          <div className="space-y-3">
            {videos.map(({ v, stages }) => {
              const a = awaiting(v, stages);
              return (
                <div key={v.id} className="rounded-lg border border-border/80 bg-background/30 p-4 hover:border-primary/40 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{v.title}</div>
                      <div className="mt-1"><Chip tone={a.tone === "muted" ? "muted" : a.tone}>{a.text.length > 70 ? `${a.text.slice(0, 69)}…` : a.text}</Chip></div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {a.action === "Continuar" && !isQueued(v.id) && <button className="btn-brand btn-sm" onClick={() => runVideo(v.id)}><Play size={13} /> Continuar</button>}
                      <button className={a.tone === "amber" || a.tone === "red" ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => navigate({ page: "video", id: v.id })}>
                        {a.action && a.action !== "Continuar" ? a.action : "Abrir"} <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3.5"><StepStrip stages={stages} /></div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <section>
        <h2 className="text-lg font-bold tracking-tight mb-3 flex items-center gap-2"><Lightbulb size={18} className="text-primary" /> Temas</h2>
        <TopicsPanel />
      </section>
    </div>
  );
}
