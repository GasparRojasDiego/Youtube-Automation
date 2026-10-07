// Habilidades: Instrucciones (guion), Visuales (imágenes, montaje, animaciones)
// y Referentes (puntos fuertes a replicar).
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Plus, Upload, Download, History, Trash2, Save, AlertTriangle, RotateCcw, Wand2, Check, FileText, Image as ImageIcon, Users, Copy, ExternalLink, Brain } from "lucide-react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fs } from "../lib/ipc";
import { useBus } from "../lib/bus";
import { activeChannel, type Channel } from "../lib/repo";
import { listSkills, saveSkill, deleteSkill, setSkillEnabled, skillVersions, parseSkillFile, serializeSkillFile, parseParamBlocks, skillKindOf, KIND_SCOPES, SKILL_TEMPLATES, type Skill, type SkillKind } from "../lib/skills";
import { PageHeader, Card, Empty, Toggle, Chip, Modal, Field, AsyncButton, Tabs } from "../ui/kit";
import { lineDiff, fmtDate, slugify } from "../lib/util";
import { refineSkill, listReferents, addReferent, updateReferent, deleteReferent, summarizeReferent, type Referent } from "../pipeline/extras";
import { NOTEBOOK_RUBRIC } from "../pipeline/prompts";
import { toast, logError } from "../lib/events";

type Tab = "script" | "visual" | "refs";

export function Skills() {
  const [tab, setTab] = useState<Tab>("script");
  return (
    <div>
      <PageHeader kicker="Identidad" title="Habilidades" />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[
        { id: "script", label: "Instrucciones", icon: FileText }, { id: "visual", label: "Visuales", icon: ImageIcon }, { id: "refs", label: "Referentes", icon: Users },
      ]} /></div>
      {tab === "refs" ? <Referents /> : <SkillEditor key={tab} kind={tab} />}
    </div>
  );
}

const KIND_TEXT: Record<SkillKind, { hint: string; empty: string }> = {
  script: { hint: "Cómo debe salir el guion: gancho, estructura, tono, qué evitar.", empty: "Sin instrucciones" },
  visual: { hint: "Cómo deben verse las imágenes, animaciones, montaje y miniatura.", empty: "Sin instrucciones visuales" },
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
  const [useRefs, setUseRefs] = useState(true);
  const [proposal, setProposal] = useState<{ summary_es: string; new_content: string } | null>(null);

  useEffect(() => { void (async () => { const c = await activeChannel(); setCh(c); setAll(await listSkills(c?.id ?? null)); })(); }, [tick]);
  const skills = all.filter((s) => skillKindOf(s.scopes) === kind);
  useEffect(() => {
    const s = skills.find((x) => x.id === sel);
    if (s) setDraft({ id: s.id, name: s.name, content: s.content, enabled: s.enabled });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, all]);

  const paramErrors = useMemo(() => (draft ? parseParamBlocks(draft.content).errors : []), [draft?.content]);
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

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-muted-foreground">{KIND_TEXT[kind].hint}</div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => void importFile()}><Upload size={15} /> Importar .md</button>
          <button className="btn-brand" onClick={() => { setSel(null); setDraft({ name: kind === "script" ? "Guion" : "Estilo visual", content: SKILL_TEMPLATES[kind], enabled: true }); }}><Plus size={15} /> Nueva</button>
        </div>
      </div>
      <div className="grid grid-cols-[300px_1fr] gap-4 items-start">
        <Card pad={false}>
          {skills.length === 0 ? <Empty icon={Sparkles} title={KIND_TEXT[kind].empty} /> : (
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
              <textarea className="input font-mono text-[12.5px] leading-relaxed min-h-[52vh]" spellCheck={false} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
              {paramErrors.map((e) => <div key={e} className="text-xs text-red-600 dark:text-red-500 flex items-center gap-1.5"><AlertTriangle size={12} /> {e}</div>)}
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
              try { setProposal(await refineSkill(draft!.name, draft!.content, request, ch?.id ?? null, useRefs)); }
              catch (e) { await logError(e, null, "Mejorar habilidad"); }
            }}><Wand2 size={14} /> Proponer</AsyncButton>
          ) : (
            <button className="btn-primary" onClick={() => { setDraft({ ...draft!, content: proposal.new_content }); setRefine(false); setRequest(""); }}><Check size={14} /> Usar</button>
          )}
        </>}>
        {!proposal ? (
          <div className="space-y-3">
            <Field label="¿Qué quieres cambiar?"><textarea className="input min-h-32" value={request} onChange={(e) => setRequest(e.target.value)} placeholder="Ej.: ganchos más sobrios" /></Field>
            <Toggle checked={useRefs} onChange={setUseRefs} label="Tener en cuenta los referentes" />
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
    </>
  );
}

function DiffView({ a, b }: { a: string; b: string }) {
  return (
    <pre className="text-[11.5px] font-mono max-h-[55vh] overflow-auto rounded-md bg-secondary/60 p-3">
      {lineDiff(a, b).map((d, i) => <div key={i} className={d.type === "add" ? "text-green-700 dark:text-green-500 bg-green-500/10" : d.type === "del" ? "text-red-600 dark:text-red-500 bg-red-500/10 line-through" : "text-muted-foreground"}>{d.type === "add" ? "+ " : d.type === "del" ? "- " : "  "}{d.text}</div>)}
    </pre>
  );
}

// ---------- Referentes ----------
function Referents() {
  const tick = useBus("creators", "channels", "settings");
  const [ch, setCh] = useState<Channel | null>(null);
  const [list, setList] = useState<Referent[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState("");
  useEffect(() => { void (async () => { const c = await activeChannel(); setCh(c); setList(await listReferents(c?.id ?? null)); })(); }, [tick]);
  const current = list.find((r) => r.id === sel);
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-muted-foreground">Canales que admiras. Sus puntos fuertes se recuerdan al escribir y editar.</div>
        <button className="btn-ghost" onClick={() => { void navigator.clipboard.writeText(NOTEBOOK_RUBRIC); toast("success", "Rúbrica copiada", "Pégala en NotebookLM."); }}><Copy size={15} /> Rúbrica NotebookLM</button>
      </div>
      <div className="grid grid-cols-[300px_1fr] gap-4 items-start">
        <Card pad={false}>
          <form className="flex gap-2 p-2.5 border-b border-border" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; const id = await addReferent(ch?.id ?? null, name.trim()); setName(""); setSel(id); }}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre o @canal" />
            <button className="btn-brand"><Plus size={15} /></button>
          </form>
          {list.length === 0 ? <Empty icon={Users} title="Sin referentes" /> : (
            <div className="divide-y divide-border/60">
              {list.map((r) => (
                <div key={r.id} onClick={() => setSel(r.id)} className={`px-3 py-2.5 cursor-pointer flex items-center gap-2.5 ${sel === r.id ? "bg-primary/10" : "hover:bg-accent/40"}`}>
                  <div onClick={(e) => e.stopPropagation()}><Toggle checked={!!r.enabled} onChange={(v) => void updateReferent(r.id, { enabled: v ? 1 : 0 })} /></div>
                  <div className={`min-w-0 flex-1 text-sm font-medium truncate ${r.enabled ? "" : "text-muted-foreground"}`}>{r.name}</div>
                  {!r.notes.trim() && <Chip tone="amber">vacío</Chip>}
                </div>
              ))}
            </div>
          )}
        </Card>
        {current ? <ReferentDetail key={current.id} r={current} onDelete={() => setSel(null)} /> : <Card><Empty icon={Users} title="Elige o añade uno" /></Card>}
      </div>
    </>
  );
}

function ReferentDetail({ r, onDelete }: { r: Referent; onDelete: () => void }) {
  const [form, setForm] = useState({ name: r.name, url: r.url, notes: r.notes, notebook: r.notebook_md });
  const dirty = form.name !== r.name || form.url !== r.url || form.notes !== r.notes || form.notebook !== r.notebook_md;
  return (
    <Card>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input className="input flex-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre" />
          <input className="input flex-1" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="Enlace del canal (opcional)" />
          {form.url && <button className="btn-ghost" onClick={() => void openUrl(form.url.startsWith("http") ? form.url : `https://www.youtube.com/${form.url.startsWith("@") ? form.url : "@" + form.url}`)}><ExternalLink size={14} /></button>}
        </div>
        <Field label="Puntos fuertes a replicar">
          <textarea className="input min-h-48 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={"- Gancho con una pregunta concreta en los primeros 5 s\n- Muestra la fuente en pantalla al citarla"} />
        </Field>
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">Extraer de notas (NotebookLM u otras)</summary>
          <div className="space-y-2 mt-2">
            <textarea className="input min-h-32 text-xs font-mono" value={form.notebook} onChange={(e) => setForm({ ...form, notebook: e.target.value })} placeholder="Pega aquí tus notas o el análisis de NotebookLM" />
            <AsyncButton className="btn-brand btn-sm" disabled={!form.notebook.trim()} onClick={async () => {
              try {
                await updateReferent(r.id, { notebook_md: form.notebook });
                const text = await summarizeReferent({ ...r, notebook_md: form.notebook });
                setForm((f) => ({ ...f, notes: text }));
              } catch (e) { await logError(e, null, "Extraer puntos fuertes"); }
            }}><Brain size={13} /> Extraer con Claude</AsyncButton>
          </div>
        </details>
        <div className="flex justify-between">
          <AsyncButton className="btn-primary" disabled={!dirty} onClick={() => updateReferent(r.id, { name: form.name.trim() || r.name, url: form.url.trim(), notes: form.notes, notebook_md: form.notebook })}><Save size={14} /> Guardar</AsyncButton>
          <button className="btn-ghost text-red-600 dark:text-red-500" onClick={async () => { if (confirm(`¿Eliminar «${r.name}»?`)) { await deleteReferent(r.id); onDelete(); } }}><Trash2 size={14} /></button>
        </div>
      </div>
    </Card>
  );
}
