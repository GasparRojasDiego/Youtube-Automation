import { useEffect, useMemo, useState } from "react";
import { Sparkles, Plus, Upload, Download, History, Trash2, Save, AlertTriangle, RotateCcw, Globe, Wand2, Check } from "lucide-react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { fs } from "../lib/ipc";
import { useBus } from "../lib/bus";
import { activeChannel, type Channel } from "../lib/repo";
import { listSkills, saveSkill, deleteSkill, setSkillEnabled, skillVersions, parseSkillFile, serializeSkillFile, parseParamBlocks, SCOPES, SKILL_TEMPLATE, type Skill, type Scope } from "../lib/skills";
import { PageHeader, Card, Empty, Toggle, Chip, Modal, Field, AsyncButton } from "../ui/kit";
import { lineDiff, fmtDate, slugify } from "../lib/util";
import { refineSkill } from "../pipeline/extras";
import { toast, logError } from "../lib/events";

type Draft = Pick<Skill, "name" | "description" | "scopes" | "content" | "enabled"> & { id?: string; global: boolean };

export function Skills() {
  const tick = useBus("skills", "channels", "settings");
  const [ch, setCh] = useState<Channel | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<{ version: number; content: string; note: string; created_at: number }[] | null>(null);
  const [diffWith, setDiffWith] = useState<string | null>(null);
  const [refine, setRefine] = useState(false);
  const [request, setRequest] = useState("");
  const [useProfiles, setUseProfiles] = useState(false);
  const [proposal, setProposal] = useState<{ summary_es: string; new_content: string } | null>(null);

  useEffect(() => { void (async () => { const c = await activeChannel(); setCh(c); setSkills(await listSkills(c?.id ?? null)); })(); }, [tick]);
  useEffect(() => {
    const s = skills.find((x) => x.id === sel);
    if (s) setDraft({ id: s.id, name: s.name, description: s.description, scopes: s.scopes, content: s.content, enabled: s.enabled, global: s.channel_id === null });
  }, [sel, skills]);

  const paramErrors = useMemo(() => (draft ? parseParamBlocks(draft.content).errors : []), [draft?.content]);
  const current = skills.find((x) => x.id === sel);
  const dirty = !!draft && !!current && (draft.content !== current.content || draft.name !== current.name || draft.description !== current.description || JSON.stringify(draft.scopes) !== JSON.stringify(current.scopes) || draft.global !== (current.channel_id === null));

  const persist = async (d: Draft, note = "") => {
    if (!d.name.trim()) { toast("warn", "La habilidad necesita un nombre."); return; }
    const s = await saveSkill({ id: d.id, name: d.name.trim(), description: d.description, scopes: d.scopes.length ? d.scopes : ["all"], content: d.content, enabled: d.enabled, channel_id: d.global ? null : ch?.id ?? null }, note);
    setSel(s.id); toast("success", "Habilidad guardada", `Versión ${s.version}`);
  };

  const importFile = async () => {
    const path = await openDialog({ multiple: true, filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }] });
    const list = Array.isArray(path) ? path : path ? [path] : [];
    for (const p of list) {
      try {
        const text = await fs.readText(p);
        const f = parseSkillFile(text);
        const name = f.name || p.split(/[\\/]/).pop()!.replace(/\.(md|markdown|txt)$/i, "");
        const s = await saveSkill({ name, description: f.description ?? "", scopes: f.scopes?.length ? f.scopes : ["all"], content: f.body, enabled: true, channel_id: ch?.id ?? null }, "importada");
        setSel(s.id);
      } catch (e) { await logError(e, null, "Importar habilidad"); }
    }
    if (list.length) toast("success", `${list.length} habilidad(es) importada(s)`);
  };

  return (
    <div>
      <PageHeader kicker="Identidad" title="Habilidades" subtitle="Tu identidad de canal, escrita por ti. Cada habilidad se inyecta en las etapas que elijas; actívalas, desactívalas y edítalas cuando quieras."
        actions={<>
          <button className="btn-ghost" onClick={() => void importFile()}><Upload size={15} /> Importar .md</button>
          <button className="btn-brand" onClick={() => { setSel(null); const f = parseSkillFile(SKILL_TEMPLATE); setDraft({ name: "Nueva habilidad", description: f.description ?? "", scopes: f.scopes ?? ["script"], content: f.body, enabled: true, global: false }); }}><Plus size={15} /> Nueva</button>
        </>} />
      <div className="grid grid-cols-[320px_1fr] gap-4 items-start">
        <Card pad={false}>
          {skills.length === 0 ? <Empty icon={Sparkles} title="Sin habilidades">Crea una o importa un SKILL.md.</Empty> : (
            <div className="divide-y divide-border/60">
              {skills.map((s) => (
                <div key={s.id} onClick={() => setSel(s.id)} className={`px-3 py-2.5 cursor-pointer flex items-start gap-2.5 ${sel === s.id ? "bg-primary/10" : "hover:bg-accent/40"}`}>
                  <div onClick={(e) => e.stopPropagation()} className="pt-0.5"><Toggle checked={s.enabled} onChange={(v) => void setSkillEnabled(s.id, v)} /></div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium truncate ${s.enabled ? "" : "text-muted-foreground"}`}>{s.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{s.scopes.map((x) => SCOPES.find((y) => y.id === x)?.label ?? x).join(" · ")}</div>
                  </div>
                  {s.channel_id === null && <Globe size={13} className="text-primary mt-1" aria-label="Global" />}
                  <span className="text-[10px] text-muted-foreground tabular mt-1">v{s.version}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        {draft ? (
          <Card>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
                <Field label="Descripción"><input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
              </div>
              <div>
                <div className="label mb-1.5">Se inyecta en</div>
                <div className="flex flex-wrap gap-1.5">
                  {SCOPES.map((sc) => {
                    const on = draft.scopes.includes(sc.id);
                    return <button key={sc.id} onClick={() => setDraft({ ...draft, scopes: on ? draft.scopes.filter((x) => x !== sc.id) : [...draft.scopes, sc.id as Scope] })}
                      className={`chip ${on ? "bg-primary text-white border-primary" : "border-border hover:bg-accent"}`}>{sc.label}</button>;
                  })}
                </div>
              </div>
              <div className="flex items-center gap-6">
                <Toggle checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label="Activa" />
                <Toggle checked={draft.global} onChange={(v) => setDraft({ ...draft, global: v })} label="Global (todos los canales)" />
              </div>
              <textarea className="input font-mono text-[12.5px] leading-relaxed min-h-[52vh]" spellCheck={false} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
              {paramErrors.map((e) => <div key={e} className="text-xs text-red-600 dark:text-red-500 flex items-center gap-1.5"><AlertTriangle size={12} /> {e}</div>)}
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <AsyncButton className="btn-primary" disabled={!!current && !dirty} onClick={() => persist(draft)}><Save size={14} /> Guardar</AsyncButton>
                  <button className="btn-brand" onClick={() => { setProposal(null); setRefine(true); }}><Wand2 size={14} /> Refinar con IA</button>
                  {current && <button className="btn-ghost" onClick={async () => setHistory(await skillVersions(current.id))}><History size={14} /> Historial</button>}
                  {current && <button className="btn-ghost" onClick={async () => {
                    const p = await saveDialog({ defaultPath: `${slugify(current.name)}.md`, filters: [{ name: "Markdown", extensions: ["md"] }] });
                    if (p) { await fs.writeText(p, serializeSkillFile(current)); toast("success", "Exportada", p); }
                  }}><Download size={14} /> Exportar</button>}
                </div>
                {current && <button className="btn-ghost text-red-600 dark:text-red-500" onClick={async () => { if (confirm(`¿Eliminar «${current.name}» y su historial?`)) { await deleteSkill(current.id); setSel(null); setDraft(null); } }}><Trash2 size={14} /> Eliminar</button>}
              </div>
              <div className="text-[11px] text-muted-foreground">Los bloques <code className="font-mono">```atril:montaje```</code>, <code className="font-mono">atril:visual</code>, <code className="font-mono">atril:miniatura</code>, <code className="font-mono">atril:guion</code> y <code className="font-mono">atril:voz</code> fijan parámetros que el motor lee directamente (ver Guía). El resto del texto llega tal cual al modelo.</div>
            </div>
          </Card>
        ) : <Card><Empty icon={Sparkles} title="Elige o crea una habilidad">Piensa en ellas como tus skills de Claude: un manual que tú escribes y la app aplica.</Empty></Card>}
      </div>
      <Modal open={refine && !!draft} onClose={() => setRefine(false)} title="Refinar con IA" echo="refinar" wide
        footer={<>
          <button className="btn-ghost" onClick={() => setRefine(false)}>Cerrar</button>
          {!proposal ? (
            <AsyncButton className="btn-primary" disabled={!request.trim()} onClick={async () => {
              try { setProposal(await refineSkill(draft!.name, draft!.content, request, ch?.id ?? null, useProfiles)); }
              catch (e) { await logError(e, null, "Refinar habilidad"); }
            }}><Wand2 size={14} /> Proponer cambios</AsyncButton>
          ) : (
            <button className="btn-primary" onClick={() => { setDraft({ ...draft!, content: proposal.new_content }); setRefine(false); setRequest(""); toast("info", "Cambios incorporados al editor", "Revísalos y pulsa Guardar para crear una nueva versión."); }}><Check size={14} /> Incorporar al editor</button>
          )}
        </>}>
        {!proposal ? (
          <div className="space-y-3">
            <Field label="¿Qué quieres corregir o añadir?" hint="Escribe en español, con tu criterio: «los ganchos suenan a clickbait, hazlos más sobrios», «añade ejemplos negativos de cierres».">
              <textarea className="input min-h-32" value={request} onChange={(e) => setRequest(e.target.value)} />
            </Field>
            <Toggle checked={useProfiles} onChange={setUseProfiles} label="Usar como referencia los perfiles analizados de tus referentes" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm">{proposal.summary_es}</div>
            <pre className="text-[11.5px] font-mono max-h-[55vh] overflow-auto rounded-md bg-secondary/60 p-3">
              {lineDiff(draft?.content ?? "", proposal.new_content).map((d, i) => <div key={i} className={d.type === "add" ? "text-green-700 dark:text-green-500 bg-green-500/10" : d.type === "del" ? "text-red-600 dark:text-red-500 bg-red-500/10 line-through" : "text-muted-foreground"}>{d.type === "add" ? "+ " : d.type === "del" ? "- " : "  "}{d.text}</div>)}
            </pre>
          </div>
        )}
      </Modal>
      <Modal open={!!history} onClose={() => { setHistory(null); setDiffWith(null); }} title="Historial de versiones" echo="versiones" wide>
        {history && history.length === 0 && <div className="text-sm text-muted-foreground">Aún no hay versiones anteriores.</div>}
        <div className="grid grid-cols-[220px_1fr] gap-4">
          <div className="space-y-1">
            {history?.map((h) => (
              <button key={h.version} onClick={() => setDiffWith(h.content)} className={`w-full text-left rounded-md px-2.5 py-2 text-xs ${diffWith === h.content ? "bg-primary/10 border border-primary/40" : "hover:bg-accent"}`}>
                <b>v{h.version}</b> · {fmtDate(h.created_at)}<div className="text-muted-foreground truncate">{h.note || "edición"}</div>
              </button>
            ))}
          </div>
          {diffWith !== null && current && (
            <div>
              <div className="flex justify-between mb-2"><Chip>Cambios desde esa versión hasta la actual</Chip>
                <AsyncButton className="btn-brand btn-sm" onClick={async () => { await saveSkill({ ...current, content: diffWith }, "restaurada"); setHistory(null); setDiffWith(null); }}><RotateCcw size={13} /> Restaurar esa versión</AsyncButton></div>
              <pre className="text-[11.5px] font-mono max-h-[60vh] overflow-auto rounded-md bg-secondary/60 p-3">
                {lineDiff(diffWith, current.content).map((d, i) => <div key={i} className={d.type === "add" ? "text-green-700 dark:text-green-500 bg-green-500/10" : d.type === "del" ? "text-red-600 dark:text-red-500 bg-red-500/10 line-through" : ""}>{d.type === "add" ? "+ " : d.type === "del" ? "- " : "  "}{d.text}</div>)}
              </pre>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
