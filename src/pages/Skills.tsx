// Instrucciones: directrices de contenido (guion, títulos, descripción) arriba y
// directrices visuales (imágenes, animaciones, montaje, miniatura) abajo, en una
// sola página. Se inyectan como reglas obligatorias.
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Plus, Upload, Download, History, Trash2, Save, AlertTriangle, RotateCcw, Wand2, Check, Type, Eye } from "lucide-react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { fs } from "../lib/ipc";
import { useBus } from "../lib/bus";
import { activeChannel, type Channel } from "../lib/repo";
import { listSkills, saveSkill, deleteSkill, setSkillEnabled, skillVersions, parseSkillFile, serializeSkillFile, parseParamBlocks, skillKindOf, stageSizes, KIND_SCOPES, SKILL_TEMPLATES, type Skill, type SkillKind } from "../lib/skills";
import { Card, Empty, Toggle, Chip, Modal, Field, AsyncButton } from "../ui/kit";
import { lineDiff, fmtDate, slugify } from "../lib/util";
import { refineSkill } from "../pipeline/extras";
import { toast, logError } from "../lib/events";

export function Skills() {
  return (
    <div className="space-y-10">
      <SkillEditor kind="script" />
      <SkillEditor kind="visual" />
    </div>
  );
}

const KIND_TEXT: Record<SkillKind, { title: string; icon: typeof Type; hint: string; empty: string }> = {
  script: { title: "Directrices de contenido", icon: Type, hint: "Guion, títulos y descripción: gancho, estructura, tono, qué evitar.", empty: "Sin directrices de contenido" },
  visual: { title: "Directrices visuales", icon: Eye, hint: "Imágenes, animaciones, montaje, sonido y miniatura.", empty: "Sin directrices visuales" },
};

type Draft = { id?: string; name: string; content: string; enabled: boolean };

function SkillEditor({ kind }: { kind: SkillKind }) {
  const tick = useBus("skills", "channels", "settings");
  const [ch, setCh] = useState<Channel | null>(null);
  const [all, setAll] = useState<Skill[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<{ version: number; content: string; note: string; created_at: number }[] | null>(null);
  const [diffWith, setDiffWith] = useState<string | null>(null);
  const [refine, setRefine] = useState(false);
  const [request, setRequest] = useState("");
  const [proposal, setProposal] = useState<{ summary_es: string; new_content: string } | null>(null);

  useEffect(() => { void (async () => { const c = await activeChannel(); setCh(c); setAll(await listSkills(c?.id ?? null)); })(); }, [tick]);
  const skills = all.filter((s) => skillKindOf(s.scopes) === kind);
  useEffect(() => {
    const s = skills.find((x) => x.id === sel);
    if (s) setDraft({ id: s.id, name: s.name, content: s.content, enabled: s.enabled });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, all]);

  const paramErrors = useMemo(() => (draft ? parseParamBlocks(draft.content).errors : []), [draft?.content]);
  const sizes = useMemo(() => (draft ? stageSizes(draft.content, KIND_SCOPES[kind]) : []), [draft?.content, kind]);
  const current = skills.find((x) => x.id === sel);
  const dirty = !!draft && (!current || draft.content !== current.content || draft.name !== current.name);

  const persist = async (d: Draft, note = "") => {
    if (!d.name.trim()) { toast("warn", "Ponle un nombre."); return; }
    const s = await saveSkill({ id: d.id, name: d.name.trim(), scopes: KIND_SCOPES[kind], content: d.content, enabled: d.enabled, channel_id: current ? current.channel_id : ch?.id ?? null }, note);
    setSel(s.id); toast("success", "Guardado", `Versión ${s.version}`);
  };

  const importFile = async () => {
    const path = await openDialog({ multiple: true, filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }] });
    const list = Array.isArray(path) ? path : path ? [path] : [];
    for (const p of list) {
      try {
        const f = parseSkillFile(await fs.readText(p));
        const name = f.name || p.split(/[\\/]/).pop()!.replace(/\.(md|markdown|txt)$/i, "");
        const s = await saveSkill({ name, description: f.description ?? "", scopes: KIND_SCOPES[kind], content: f.body, enabled: true, channel_id: ch?.id ?? null }, "importada");
        setSel(s.id);
      } catch (e) { await logError(e, null, "Importar"); }
    }
  };

  const K = KIND_TEXT[kind];
  return (
    <section>
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2"><K.icon size={18} className="text-primary" />{K.title}</h2>
          <div className="text-sm text-muted-foreground mt-0.5">{K.hint}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => void importFile()}><Upload size={15} /> Importar .md</button>
          <button className="btn-primary" onClick={() => { setSel(null); setDraft({ name: kind === "script" ? "Guion" : "Estilo visual", content: SKILL_TEMPLATES[kind], enabled: true }); }}><Plus size={15} /> Nueva</button>
        </div>
      </div>
      <div className="grid grid-cols-[300px_1fr] gap-4 items-start">
        <Card pad={false}>
          {skills.length === 0 ? <Empty icon={Sparkles} title={K.empty} /> : (
            <div className="divide-y divide-border/60">
              {skills.map((s) => (
                <div key={s.id} onClick={() => setSel(s.id)} className={`px-3 py-2.5 cursor-pointer flex items-center gap-2.5 ${sel === s.id ? "bg-primary/10" : "hover:bg-accent/40"}`}>
                  <div onClick={(e) => e.stopPropagation()}><Toggle checked={s.enabled} onChange={(v) => void setSkillEnabled(s.id, v)} /></div>
                  <div className={`min-w-0 flex-1 text-sm font-medium truncate ${s.enabled ? "" : "text-muted-foreground"}`}>{s.name}</div>
                  <span className="text-[10px] text-muted-foreground tabular">v{s.version}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        {draft ? (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input className="input flex-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nombre" />
                <Toggle checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label="Activa" />
              </div>
              <textarea className="input font-mono text-[12.5px] leading-relaxed min-h-[44vh]" spellCheck={false} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
              {paramErrors.map((e) => <div key={e} className="text-xs text-red-600 dark:text-red-500 flex items-center gap-1.5"><AlertTriangle size={12} /> {e}</div>)}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span title="Pon etiquetas al final de un título para mandar esa sección solo a esas etapas, p. ej. «## Efectos [animaciones]». Etiquetas: temas, investigación, guion, paquete, miniatura, plan, montaje, retoques, animaciones, todas.">Llega a:</span>
                {sizes.filter((x) => x.chars > 0).map((x) => <span key={x.scope} className="rounded-full border border-border/70 px-2 py-0.5 tabular">{x.label} · {(x.chars / 1000).toFixed(1)} k</span>)}
                <span className="ml-1">Dirige una sección con «## Título [animaciones]».</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <AsyncButton className="btn-primary" disabled={!dirty} onClick={() => persist(draft)}><Save size={14} /> Guardar</AsyncButton>
                  <button className="btn-brand" onClick={() => { setProposal(null); setRefine(true); }}><Wand2 size={14} /> Mejorar con IA</button>
                  {current && <button className="btn-ghost" onClick={async () => setHistory(await skillVersions(current.id))}><History size={14} /> Historial</button>}
                  {current && <button className="btn-ghost" onClick={async () => {
                    const p = await saveDialog({ defaultPath: `${slugify(current.name)}.md`, filters: [{ name: "Markdown", extensions: ["md"] }] });
                    if (p) { await fs.writeText(p, serializeSkillFile(current)); toast("success", "Exportada", p); }
                  }}><Download size={14} /> Exportar</button>}
                </div>
                {current && <button className="btn-ghost text-red-600 dark:text-red-500" onClick={async () => { if (confirm(`¿Eliminar «${current.name}»?`)) { await deleteSkill(current.id); setSel(null); setDraft(null); } }}><Trash2 size={14} /></button>}
              </div>
            </div>
          </Card>
        ) : <Card><Empty icon={Sparkles} title="Elige o crea una" /></Card>}
      </div>
      <Modal open={refine && !!draft} onClose={() => setRefine(false)} title="Mejorar con IA" wide
        footer={<>
          <button className="btn-ghost" onClick={() => setRefine(false)}>Cerrar</button>
          {!proposal ? (
            <AsyncButton className="btn-primary" disabled={!request.trim()} onClick={async () => {
              try { setProposal(await refineSkill(draft!.name, draft!.content, request, ch?.id ?? null)); }
              catch (e) { await logError(e, null, "Mejorar habilidad"); }
            }}><Wand2 size={14} /> Proponer</AsyncButton>
          ) : (
            <button className="btn-primary" onClick={() => { setDraft({ ...draft!, content: proposal.new_content }); setRefine(false); setRequest(""); }}><Check size={14} /> Usar</button>
          )}
        </>}>
        {!proposal ? (
          <div className="space-y-3">
            <Field label="¿Qué quieres cambiar?"><textarea className="input min-h-32" value={request} onChange={(e) => setRequest(e.target.value)} placeholder="Ej.: ganchos más sobrios" /></Field>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm">{proposal.summary_es}</div>
            <DiffView a={draft?.content ?? ""} b={proposal.new_content} />
          </div>
        )}
      </Modal>
      <Modal open={!!history} onClose={() => { setHistory(null); setDiffWith(null); }} title="Historial" wide>
        {history && history.length === 0 && <div className="text-sm text-muted-foreground">Sin versiones anteriores.</div>}
        <div className="grid grid-cols-[200px_1fr] gap-4">
          <div className="space-y-1">
            {history?.map((h) => (
              <button key={h.version} onClick={() => setDiffWith(h.content)} className={`w-full text-left rounded-md px-2.5 py-2 text-xs ${diffWith === h.content ? "bg-primary/10 border border-primary/40" : "hover:bg-accent"}`}>
                <b>v{h.version}</b> · {fmtDate(h.created_at)}
              </button>
            ))}
          </div>
          {diffWith !== null && current && (
            <div>
              <div className="flex justify-between mb-2"><Chip>Cambios hasta hoy</Chip>
                <AsyncButton className="btn-brand btn-sm" onClick={async () => { await saveSkill({ ...current, content: diffWith }, "restaurada"); setHistory(null); setDiffWith(null); }}><RotateCcw size={13} /> Restaurar</AsyncButton></div>
              <DiffView a={diffWith} b={current.content} />
            </div>
          )}
        </div>
      </Modal>
    </section>
  );
}

function DiffView({ a, b }: { a: string; b: string }) {
  return (
    <pre className="text-[11.5px] font-mono max-h-[55vh] overflow-auto rounded-md bg-secondary/60 p-3">
      {lineDiff(a, b).map((d, i) => <div key={i} className={d.type === "add" ? "text-green-700 dark:text-green-500 bg-green-500/10" : d.type === "del" ? "text-red-600 dark:text-red-500 bg-red-500/10 line-through" : "text-muted-foreground"}>{d.type === "add" ? "+ " : d.type === "del" ? "- " : "  "}{d.text}</div>)}
    </pre>
  );
}
