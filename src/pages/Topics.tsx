import { useEffect, useState } from "react";
import { Lightbulb, Plus, Sparkles, Check, X, ArrowUp, ArrowDown, Trash2, ExternalLink, Undo2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useBus } from "../lib/bus";
import { activeChannel, listTopics, addTopic, updateTopic, deleteTopic, type Topic, type Channel } from "../lib/repo";
import { suggestTopics } from "../pipeline/extras";
import { PageHeader, Card, Empty, Chip, Modal, Field, AsyncButton } from "../ui/kit";
import { toast, logError } from "../lib/events";

const Score = ({ label, v, invert = false }: { label: string; v?: number; invert?: boolean }) => {
  const val = v ?? 0; const good = invert ? val <= 2 : val >= 4; const bad = invert ? val >= 4 : val <= 2;
  return <span className={`text-[11px] tabular ${good ? "text-green-500" : bad ? "text-red-500" : "text-muted-foreground"}`}>{label} {val || "–"}</span>;
};

export function Topics() {
  const tick = useBus("topics", "channels", "settings");
  const [ch, setCh] = useState<Channel | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", angle: "", notes: "", sources: "" });
  const [hint, setHint] = useState("");
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void (async () => { const c = await activeChannel(); setCh(c); if (c) setTopics(await listTopics(c.id)); })(); }, [tick]);
  if (!ch) return null;
  const approved = topics.filter((t) => t.status === "approved");
  const candidates = topics.filter((t) => t.status === "candidate");
  const others = topics.filter((t) => t.status === "used" || t.status === "rejected");

  const move = async (t: Topic, dir: -1 | 1) => {
    const i = approved.findIndex((x) => x.id === t.id); const j = i + dir;
    if (j < 0 || j >= approved.length) return;
    await updateTopic(t.id, { position: approved[j].position }); await updateTopic(approved[j].id, { position: t.position });
  };

  const row = (t: Topic, actions: React.ReactNode) => (
    <div key={t.id} className="flex items-start gap-3 py-3 border-b border-border/60 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="font-medium">{t.title}</span>{t.origin === "ai" && <Chip tone="primary">IA</Chip>}</div>
        {t.angle && <div className="text-xs text-muted-foreground mt-0.5">{t.angle}</div>}
        <div className="flex flex-wrap gap-x-3 mt-1">
          <Score label="Interés" v={t.potential.interest} /><Score label="Competencia" v={t.potential.competition} invert /><Score label="Fuentes" v={t.potential.sources} />
          <Score label="R. legal" v={t.risk.legal} invert /><Score label="R. políticas" v={t.risk.policy} invert /><Score label="R. verificación" v={t.risk.verification} invert />
        </div>
        {t.sources.length > 0 && <div className="flex flex-wrap gap-2 mt-1">{t.sources.slice(0, 4).map((s) => <button key={s} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 max-w-[260px] truncate" onClick={() => void openUrl(s)}><ExternalLink size={10} />{s.replace(/^https?:\/\//, "")}</button>)}</div>}
      </div>
      <Chip tone={t.score >= 5 ? "green" : t.score >= 3 ? "primary" : "amber"}>{t.score.toFixed(1)}</Chip>
      <div className="flex gap-1 shrink-0">{actions}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader kicker="Etapa 1" title="Banco de temas" subtitle="Elige y preaprueba varios días de temas para no frenar el ritmo. La puntuación combina potencial y riesgo."
        actions={<button className="btn-brand" onClick={() => setAdding(true)}><Plus size={15} /> Añadir tema</button>} />
      <Card title="Sugerir temas con IA" icon={Sparkles}>
        <div className="flex gap-2">
          <input className="input flex-1" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Pista opcional: «instituciones educativas de EE. UU.», «empresas tecnológicas»…" />
          <input type="number" className="input w-20" min={3} max={20} value={count} onChange={(e) => setCount(+e.target.value)} />
          <button className="btn-primary" disabled={busy} onClick={async () => {
            setBusy(true);
            try { const n = await suggestTopics(ch.id, count, hint); toast("success", `${n} temas nuevos para revisar`); }
            catch (e) { await logError(e, null, "Sugerir temas"); } finally { setBusy(false); }
          }}>{busy ? "Investigando…" : "Sugerir"}</button>
        </div>
        <div className="text-[11px] text-muted-foreground mt-2">Usa las habilidades activas con alcance «Banco de temas» y comprueba en la web si hay fuentes sólidas y cuánta competencia existe.</div>
      </Card>
      <Card title={`Aprobados · en orden de producción (${approved.length})`} icon={Check}>
        {approved.length === 0 ? <Empty icon={Lightbulb} title="Ningún tema aprobado" /> :
          approved.map((t, i) => row(t, <>
            <button className="btn-ghost btn-sm" disabled={i === 0} onClick={() => void move(t, -1)}><ArrowUp size={13} /></button>
            <button className="btn-ghost btn-sm" disabled={i === approved.length - 1} onClick={() => void move(t, 1)}><ArrowDown size={13} /></button>
            <button className="btn-ghost btn-sm" title="Volver a candidatos" onClick={() => void updateTopic(t.id, { status: "candidate" })}><Undo2 size={13} /></button>
          </>))}
      </Card>
      <Card title={`Candidatos (${candidates.length})`} icon={Lightbulb}>
        {candidates.length === 0 ? <div className="text-sm text-muted-foreground">No hay candidatos pendientes.</div> :
          candidates.map((t) => row(t, <>
            <button className="btn-brand btn-sm" onClick={() => void updateTopic(t.id, { status: "approved", position: Date.now() })}><Check size={13} /> Aprobar</button>
            <button className="btn-ghost btn-sm" onClick={() => void updateTopic(t.id, { status: "rejected" })}><X size={13} /></button>
          </>))}
      </Card>
      {others.length > 0 && <Card title="Usados y descartados">{others.map((t) => row(t, <>
        {t.status === "rejected" && <button className="btn-ghost btn-sm" onClick={() => void updateTopic(t.id, { status: "candidate" })}><Undo2 size={13} /></button>}
        <button className="btn-ghost btn-sm" onClick={() => void deleteTopic(t.id)}><Trash2 size={13} /></button>
      </>))}</Card>}
      <Modal open={adding} onClose={() => setAdding(false)} title="Nuevo tema" echo="tema"
        footer={<><button className="btn-ghost" onClick={() => setAdding(false)}>Cancelar</button>
          <AsyncButton className="btn-primary" disabled={!form.title.trim()} onClick={async () => {
            await addTopic({ channel_id: ch.id, title: form.title.trim(), angle: form.angle, notes: form.notes, sources: form.sources.split(/\s+/).filter((x) => /^https?:/.test(x)), status: "approved" });
            setForm({ title: "", angle: "", notes: "", sources: "" }); setAdding(false);
          }}>Añadir como aprobado</AsyncButton></>}>
        <div className="space-y-3">
          <Field label="Tema"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Ángulo (qué hecho documentado y poco conocido)"><input className="input" value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })} /></Field>
          <Field label="Notas"><textarea className="input min-h-20" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Field label="Fuentes sugeridas (URLs separadas por espacios)"><textarea className="input min-h-16 text-xs" value={form.sources} onChange={(e) => setForm({ ...form, sources: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
