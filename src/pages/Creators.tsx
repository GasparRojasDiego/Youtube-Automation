import { useEffect, useState } from "react";
import { Users, Plus, Download, Brain, Copy, Wand2, Trash2, FileUp, ExternalLink, Info } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fs } from "../lib/ipc";
import { useBus } from "../lib/bus";
import { activeChannel, type Channel } from "../lib/repo";
import { listCreators, addCreators, updateCreator, deleteCreator, fetchCreatorVideos, creatorVideos, analyzeCreator, distillCreators, type Creator } from "../pipeline/extras";
import { NOTEBOOK_RUBRIC } from "../pipeline/prompts";
import { PageHeader, Card, Empty, Chip, Modal, Field, AsyncButton, Markdown, Tabs } from "../ui/kit";
import { fmtDate } from "../lib/util";
import { toast, logError } from "../lib/events";
import { navigate } from "../ui/nav";

export function Creators() {
  const tick = useBus("creators", "channels", "settings");
  const [ch, setCh] = useState<Channel | null>(null);
  const [list, setList] = useState<Creator[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState("");
  const [goal, setGoal] = useState("");
  const [distillOpen, setDistillOpen] = useState(false);

  useEffect(() => { void (async () => { const c = await activeChannel(); setCh(c); setList(await listCreators(c?.id ?? null)); })(); }, [tick]);
  const analyzed = list.filter((c) => c.profile_json).length;
  const current = list.find((c) => c.id === sel);

  return (
    <div>
      <PageHeader kicker="Fase cero" title="Referentes" subtitle={<>Base de conocimiento consultable: {list.length} canales, {analyzed} analizados. Retención y CTR de canales ajenos no son públicos: las conclusiones son correlaciones parciales.</>}
        actions={<>
          <button className="btn-ghost" onClick={() => { void navigator.clipboard.writeText(NOTEBOOK_RUBRIC); toast("success", "Rúbrica copiada", "Pégala en NotebookLM para que todos los perfiles sean comparables."); }}><Copy size={15} /> Copiar rúbrica para NotebookLM</button>
          <button className="btn-brand" onClick={() => setAdding(true)}><Plus size={15} /> Añadir canales</button>
          <button className="btn-primary" disabled={!analyzed} onClick={() => setDistillOpen(true)}><Wand2 size={15} /> Destilar</button>
        </>} />
      <Card className="mb-4">
        <div className="flex gap-3 text-xs text-muted-foreground">
          <Info size={16} className="text-primary shrink-0" />
          <div>Flujo: 1) añade canales; 2) en NotebookLM crea un cuaderno por canal con sus videos y pega la <b>rúbrica</b>; 3) importa aquí el resultado; 4) «Analizar» separa lo distintivo de lo transferible; 5) «Destilar» propone <b>borradores de habilidades</b> (desactivados) que tú editas y activas. Los datos públicos de YouTube se borran a los 30 días, como exigen sus políticas; los perfiles escritos se conservan.</div>
        </div>
      </Card>
      <div className="grid grid-cols-[340px_1fr] gap-4 items-start">
        <Card pad={false}>
          {list.length === 0 ? <Empty icon={Users} title="Sin referentes" /> : (
            <div className="divide-y divide-border/60 max-h-[70vh] overflow-y-auto">
              {list.map((c) => (
                <button key={c.id} onClick={() => setSel(c.id)} className={`w-full text-left px-3 py-2.5 flex items-center gap-2 ${sel === c.id ? "bg-primary/10" : "hover:bg-accent/40"}`}>
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{c.name}</div><div className="text-[11px] text-muted-foreground truncate">{c.url}</div></div>
                  <span className="text-[10px] tabular text-muted-foreground">peso {c.weight}</span>
                  {c.profile_json ? <Chip tone="green">analizado</Chip> : c.notebook_md ? <Chip tone="primary">cuaderno</Chip> : <Chip>pendiente</Chip>}
                </button>
              ))}
            </div>
          )}
        </Card>
        {current ? <CreatorDetail key={current.id} c={current} onDelete={() => setSel(null)} /> : <Card><Empty icon={Users} title="Elige un referente" /></Card>}
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Añadir canales" echo="referentes"
        footer={<><button className="btn-ghost" onClick={() => setAdding(false)}>Cancelar</button>
          <AsyncButton className="btn-primary" disabled={!bulk.trim()} onClick={async () => { await addCreators(ch?.id ?? null, bulk.split("\n")); setBulk(""); setAdding(false); }}>Añadir</AsyncButton></>}>
        <Field label="Un canal por línea: @usuario o URL; opcionalmente «| peso» (1–5)" hint="Ej.: @FaridDieck | 5">
          <textarea className="input min-h-48 font-mono text-xs" value={bulk} onChange={(e) => setBulk(e.target.value)} />
        </Field>
      </Modal>
      <Modal open={distillOpen} onClose={() => setDistillOpen(false)} title="Destilar referentes" echo="destilar"
        footer={<><button className="btn-ghost" onClick={() => setDistillOpen(false)}>Cancelar</button>
          <AsyncButton className="btn-primary" onClick={async () => {
            try { const r = await distillCreators(ch?.id ?? null, goal); toast("success", `${r.created} borradores de habilidades creados`, r.overview_es); setDistillOpen(false); navigate({ page: "habilidades" }); }
            catch (e) { await logError(e, null, "Destilar"); }
          }}>Destilar {analyzed} perfiles</AsyncButton></>}>
        <Field label="¿Qué buscas para este canal?" hint="La destilación no promedia estilos: conserva principios fuertes y deja las decisiones de voz como opciones para ti.">
          <textarea className="input min-h-28" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ej.: narración analítica tipo ensayo, giros frecuentes, fuentes siempre visibles…" />
        </Field>
      </Modal>
    </div>
  );
}

function CreatorDetail({ c, onDelete }: { c: Creator; onDelete: () => void }) {
  const [tab, setTab] = useState<"profile" | "notebook" | "videos">(c.profile_json ? "profile" : "notebook");
  const [nb, setNb] = useState(c.notebook_md);
  const [vids, setVids] = useState<any[]>([]);
  const tick = useBus("creators");
  useEffect(() => { void creatorVideos(c.id).then(setVids); }, [c.id, tick]);
  return (
    <Card title={c.name} actions={<>
      <select className="input h-8 py-0 w-24 text-xs" value={c.weight} onChange={(e) => void updateCreator(c.id, { weight: +e.target.value })}>{[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>Peso {w}</option>)}</select>
      <button className="btn-ghost btn-sm" onClick={() => void openUrl(c.url.startsWith("http") ? c.url : `https://www.youtube.com/${c.url.startsWith("@") ? c.url : "@" + c.url}`)}><ExternalLink size={13} /></button>
      <button className="btn-ghost btn-sm text-red-500" onClick={async () => { if (confirm("¿Eliminar este referente?")) { await deleteCreator(c.id); onDelete(); } }}><Trash2 size={13} /></button>
    </>}>
      <div className="flex items-center justify-between mb-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: "profile", label: "Perfil" }, { id: "notebook", label: "Cuaderno (NotebookLM)" }, { id: "videos", label: `Videos (${vids.length})` }]} />
        <div className="flex gap-2">
          <AsyncButton className="btn-ghost btn-sm" onClick={async () => { try { const n = await fetchCreatorVideos(c); toast("success", `${n} videos leídos de YouTube`); } catch (e) { await logError(e, null, "YouTube Data API"); } }}><Download size={13} /> Leer videos</AsyncButton>
          <AsyncButton className="btn-brand btn-sm" disabled={!c.notebook_md && !vids.length} onClick={async () => { try { await analyzeCreator(c); toast("success", "Perfil actualizado"); setTab("profile"); } catch (e) { await logError(e, null, "Análisis"); } }}><Brain size={13} /> Analizar</AsyncButton>
        </div>
      </div>
      {tab === "profile" && (c.profile_json ? (
        <div className="space-y-3">
          <div className="text-[11px] text-muted-foreground">Analizado {fmtDate(c.analyzed_at)}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-3"><div className="label mb-1">Distintivo (no copiar)</div><ul className="text-xs list-disc pl-4 space-y-0.5">{c.profile_json.distinctive_es?.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>
            <div className="rounded-md border border-primary/40 p-3"><div className="label mb-1 text-primary">Principios transferibles</div><ul className="text-xs list-disc pl-4 space-y-0.5">{c.profile_json.principles_es?.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>
          </div>
          <Markdown text={c.profile_md} />
        </div>
      ) : <Empty icon={Brain} title="Sin analizar">Importa el cuaderno y/o lee sus videos, luego pulsa «Analizar».</Empty>)}
      {tab === "notebook" && (
        <div className="space-y-2">
          <textarea className="input min-h-[46vh] font-mono text-xs" value={nb} onChange={(e) => setNb(e.target.value)} placeholder="Pega aquí el documento que generó NotebookLM con la rúbrica…" />
          <div className="flex gap-2">
            <AsyncButton className="btn-primary btn-sm" onClick={() => updateCreator(c.id, { notebook_md: nb })}>Guardar</AsyncButton>
            <AsyncButton className="btn-ghost btn-sm" onClick={async () => {
              const p = await openDialog({ filters: [{ name: "Markdown/Texto", extensions: ["md", "txt"] }] });
              if (p && !Array.isArray(p)) { const t = await fs.readText(p); setNb(t); await updateCreator(c.id, { notebook_md: t }); }
            }}><FileUp size={13} /> Importar archivo</AsyncButton>
          </div>
        </div>
      )}
      {tab === "videos" && (
        <div className="max-h-[56vh] overflow-y-auto">
          {vids.length === 0 ? <div className="text-sm text-muted-foreground">Pulsa «Leer videos» (usa tu clave de Google con la YouTube Data API habilitada).</div> : (
            <table className="w-full text-xs">
              <thead><tr className="label text-left"><th className="py-1.5">Título</th><th className="text-right">Vistas</th><th className="text-right">Min</th><th className="text-right">Fecha</th></tr></thead>
              <tbody>{vids.map((v) => <tr key={v.id} className="border-t border-border/50"><td className="py-1.5 pr-2">{v.title}</td><td className="text-right tabular">{v.views.toLocaleString("es-PE")}</td><td className="text-right tabular">{Math.round(v.duration_s / 60)}</td><td className="text-right text-muted-foreground">{v.published_at.slice(0, 10)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}
