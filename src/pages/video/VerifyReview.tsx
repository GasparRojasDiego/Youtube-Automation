// Revisión del guion verificado: pensada para decidir rápido y entender el
// inglés (B1) sin perder rigor. Cada afirmación muestra su fuente y su cita.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Wrench, Undo2, ExternalLink, Eye, ShieldAlert, Sparkles, Languages, CheckCircle2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Video, StageRow } from "../../lib/repo";
import { addReview } from "../../lib/repo";
import type { VerifyOut, ScriptOut, ResearchOut, ClaimCheck, Severity } from "../../pipeline/types";
import { saveVerification, approveScript, applyScriptFixes } from "../../pipeline/runner";
import * as L from "../../pipeline/logic";
import { Card, Chip, ReviewTimer, AsyncButton } from "../../ui/kit";
import { toast } from "../../lib/events";

const ISSUE: Record<string, string> = {
  unsourced: "Sin fuente", source_mismatch: "La fuente no dice eso", defamation_risk: "Riesgo de difamación",
  inference_as_fact: "Inferencia como hecho", overpromise: "Promete de más", outdated: "Desactualizado", other: "Otro",
};
const VERDICT: Record<string, string> = { supported: "Respaldada", partially: "Parcial", unsupported: "Sin respaldo", mismatch: "No coincide" };
const sevTone = (s: Severity) => (s === "block" ? "red" : s === "warn" ? "amber" : "green") as "red" | "amber" | "green";
const sevBg = (s: Severity, resolved: boolean) => resolved ? "bg-green-500/10 decoration-green-500/60" :
  s === "block" ? "bg-red-500/15 decoration-red-500" : s === "warn" ? "bg-amber-500/15 decoration-amber-500" : "decoration-primary/40";

type Sel = { type: "claim"; id: string } | { type: "unlinked"; idx: number } | null;

export function VerifyReview({ video, row, script, research }: { video: Video; row: StageRow; script: ScriptOut; research: ResearchOut }) {
  const [v, setV] = useState<VerifyOut>(row.output);
  const [sel, setSel] = useState<Sel>(null);
  const [notes, setNotes] = useState("");
  const [showGloss, setShowGloss] = useState<Record<string, boolean>>({});
  const [segGloss, setSegGloss] = useState<Record<string, boolean>>({});
  const secs = useRef(0);
  const editable = row.status === "review";
  const blocks = L.openBlocks(v), fixes = L.pendingFixes(v);
  const counts = useMemo(() => ({
    block: v.claims.filter((c) => c.severity === "block").length + v.unlinked.filter((u) => u.severity === "block").length,
    warn: v.claims.filter((c) => c.severity === "warn").length + v.unlinked.filter((u) => u.severity === "warn").length,
    ok: v.claims.filter((c) => c.severity === "ok").length,
  }), [v]);

  const update = async (next: VerifyOut) => { setV(next); await saveVerification(video.id, next); };
  const resolveClaim = (id: string, resolution: ClaimCheck["resolution"], user_note?: string) =>
    update({ ...v, claims: v.claims.map((c) => (c.claim_id === id ? { ...c, resolution, user_note: user_note ?? c.user_note } : c)) });
  const resolveUnlinked = (idx: number, resolution: "accepted" | "fix" | null, user_note?: string) =>
    update({ ...v, unlinked: v.unlinked.map((u, i) => (i === idx ? { ...u, resolution, user_note: user_note ?? u.user_note } : u)) });

  const allClaims = script.segments.flatMap((s) => s.claims);
  const selectedClaim = sel?.type === "claim" ? v.claims.find((c) => c.claim_id === sel.id) : null;
  const selectedUnlinked = sel?.type === "unlinked" ? v.unlinked[sel.idx] : null;

  const nextIssue = () => {
    const pend = v.claims.find((c) => c.severity !== "ok" && !c.resolution);
    if (pend) setSel({ type: "claim", id: pend.claim_id });
    else { const i = v.unlinked.findIndex((u) => u.severity !== "ok" && !u.resolution); if (i >= 0) setSel({ type: "unlinked", idx: i }); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2 min-w-0">
            <div className="text-sm leading-relaxed">{v.overall_es}</div>
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="red"><ShieldAlert size={11} /> {counts.block} bloqueantes</Chip>
              <Chip tone="amber">{counts.warn} avisos</Chip>
              <Chip tone="green">{counts.ok} respaldadas</Chip>
              <Chip tone={v.originality.verdict === "ok" ? "green" : "amber"}><Sparkles size={11} /> Aporte propio: {v.originality.verdict === "ok" ? "suficiente" : "débil"}</Chip>
              {v.rounds && v.rounds > 1 && <Chip>Ronda {v.rounds}</Chip>}
            </div>
            {v.originality.verdict !== "ok" && <div className="text-xs text-amber-500">{v.originality.note_es}</div>}
          </div>
          <div className="text-right shrink-0 space-y-2">
            {editable && <ReviewTimer onTick={(s) => (secs.current = s)} />}
            <div><button className="btn-brand btn-sm" onClick={nextIssue}><Eye size={13} /> Siguiente pendiente</button></div>
          </div>
        </div>
        {v.title_checks.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-1.5">
            {v.title_checks.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <Chip tone={t.verdict === "ok" ? "green" : "amber"}>{t.verdict === "ok" ? "Título honesto" : "Promete de más"}</Chip>
                <span className="font-medium">{t.title}</span>
                <span className="text-muted-foreground truncate">— {t.note_es}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-[1fr_400px] gap-4 items-start">
        <div className="space-y-3">
          {script.segments.map((seg) => {
            const gloss = v.segment_glosses.find((g) => g.segment_id === seg.id)?.summary_es;
            return (
              <Card key={seg.id} title={seg.title} actions={gloss && <button className="btn-ghost btn-sm" onClick={() => setSegGloss((x) => ({ ...x, [seg.id]: !x[seg.id] }))}><Languages size={13} /> {segGloss[seg.id] ? "Ocultar" : "Resumen en español"}</button>}>
                {segGloss[seg.id] && <div className="text-xs text-muted-foreground border-l-2 border-primary/50 pl-3 mb-3">{gloss}</div>}
                <p className="text-[15px] leading-8" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
                  {highlight(seg.text_en, seg.claims.map((c) => {
                    const chk = v.claims.find((x) => x.claim_id === c.id);
                    return { text: c.text_en, key: c.id, sev: chk?.severity ?? "warn", resolved: !!chk?.resolution, onClick: () => setSel({ type: "claim", id: c.id }), active: sel?.type === "claim" && sel.id === c.id };
                  }).concat(v.unlinked.map((u, i) => ({ u, i })).filter(({ u }) => u.segment_id === seg.id).map(({ u, i }) => ({
                    text: u.text_en, key: `u${i}`, sev: u.severity, resolved: !!u.resolution, onClick: () => setSel({ type: "unlinked", idx: i }), active: sel?.type === "unlinked" && sel.idx === i,
                  }))))}
                </p>
              </Card>
            );
          })}
          {v.vocab?.length > 0 && (
            <Card title="Inglés de este guion" icon={Languages}>
              <div className="text-xs text-muted-foreground mb-2">Se añadieron a tu repaso. Intenta deducir el significado antes de mirarlo.</div>
              <div className="grid grid-cols-2 gap-2">
                {v.vocab.map((w) => (
                  <details key={w.term} className="rounded-md border border-border p-2.5 group">
                    <summary className="cursor-pointer text-sm font-semibold text-primary list-none">{w.term}</summary>
                    <div className="text-xs mt-1.5"><b>{w.meaning_es}</b></div>
                    <div className="text-xs italic text-muted-foreground mt-1">“{w.example_en}”</div>
                    {w.note_es && <div className="text-[11px] mt-1">{w.note_es}</div>}
                  </details>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="sticky top-2 space-y-3">
          <Card title={selectedClaim ? `Afirmación ${selectedClaim.claim_id}` : selectedUnlinked ? "Frase sin fuente marcada" : "Detalle"}>
            {!selectedClaim && !selectedUnlinked && <div className="text-sm text-muted-foreground">Toca una frase resaltada. Rojo: bloquea la aprobación. Ámbar: aviso. Subrayado azul: respaldada.</div>}
            {selectedClaim && (() => {
              const c = allClaims.find((x) => x.id === selectedClaim.claim_id);
              const facts = research.facts.filter((f) => c?.fact_ids.includes(f.id));
              const key = selectedClaim.claim_id;
              return (
                <div className="space-y-3 text-sm">
                  <div className="font-medium leading-relaxed" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>“{c?.text_en}”</div>
                  {selectedClaim.gloss_es && (showGloss[key]
                    ? <div className="text-xs border-l-2 border-primary/50 pl-2.5">{selectedClaim.gloss_es}</div>
                    : <button className="btn-ghost btn-sm" onClick={() => setShowGloss((x) => ({ ...x, [key]: true }))}><Languages size={13} /> Primero intenta entenderla · Ver traducción</button>)}
                  <div className="flex flex-wrap gap-1.5">
                    <Chip tone={sevTone(selectedClaim.severity)}>{VERDICT[selectedClaim.verdict] ?? selectedClaim.verdict}</Chip>
                    {c?.kind && c.kind !== "fact" && <Chip tone="primary">{c.kind === "inference" ? "Inferencia" : "Opinión"}</Chip>}
                    {selectedClaim.issues.map((i) => <Chip key={i} tone={sevTone(selectedClaim.severity)}>{ISSUE[i] ?? i}</Chip>)}
                  </div>
                  {selectedClaim.note_es && <div className="text-xs">{selectedClaim.note_es}</div>}
                  {facts.map((f) => {
                    const srcs = research.sources.filter((s) => f.source_ids.includes(s.id));
                    return (
                      <div key={f.id} className="rounded-md bg-secondary/60 p-2.5 space-y-1.5">
                        <div className="text-xs italic" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>“{f.quote}”</div>
                        {selectedClaim.quote_gloss_es && showGloss[key] && <div className="text-[11px] text-muted-foreground">{selectedClaim.quote_gloss_es}</div>}
                        {srcs.map((s) => (
                          <button key={s.id} className="flex items-center gap-1.5 text-[11px] text-primary hover:underline text-left" onClick={() => void openUrl(s.url)}>
                            <ExternalLink size={11} className="shrink-0" /> {s.publisher} — {s.title} {s.type === "primary" && <Chip tone="green">primaria</Chip>}
                          </button>
                        ))}
                        <div className="text-[10px] text-muted-foreground">{f.quote_location}</div>
                      </div>
                    );
                  })}
                  {!facts.length && <div className="text-xs text-red-500">Ningún hecho de la investigación respalda esta frase.</div>}
                  {selectedClaim.suggested_fix_en && <div className="text-xs"><span className="label">Propuesta</span><div className="mt-1" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>{selectedClaim.suggested_fix_en}</div></div>}
                  {editable && <ResolveBar resolution={selectedClaim.resolution ?? null} note={selectedClaim.user_note ?? ""}
                    onAccept={(n) => void resolveClaim(key, "accepted", n)} onFix={(n) => void resolveClaim(key, "fix", n)} onUndo={() => void resolveClaim(key, null)} />}
                </div>
              );
            })()}
            {selectedUnlinked && sel?.type === "unlinked" && (
              <div className="space-y-3 text-sm">
                <div className="font-medium" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>“{selectedUnlinked.text_en}”</div>
                <Chip tone={sevTone(selectedUnlinked.severity)}>Sin fuente vinculada</Chip>
                <div className="text-xs">{selectedUnlinked.issue_es}</div>
                {editable && <ResolveBar resolution={selectedUnlinked.resolution ?? null} note={selectedUnlinked.user_note ?? ""}
                  onAccept={(n) => void resolveUnlinked(sel.idx, "accepted", n)} onFix={(n) => void resolveUnlinked(sel.idx, "fix", n)} onUndo={() => void resolveUnlinked(sel.idx, null)} />}
              </div>
            )}
          </Card>

          {editable && (
            <Card>
              <div className="space-y-2.5">
                <div className="flex gap-1.5 flex-wrap">
                  <Chip tone={blocks ? "red" : "green"}>{blocks} bloqueos abiertos</Chip>
                  <Chip tone={fixes ? "amber" : "muted"}>{fixes} correcciones pedidas</Chip>
                </div>
                <textarea className="input min-h-20 text-xs" placeholder="Notas generales para corregir el guion (en español está bien): «el gancho es lento», «quita el chiste del segmento 3»…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <div className="flex gap-2">
                  <AsyncButton className="btn-brand flex-1" disabled={!fixes && !notes.trim() && !blocks}
                    onClick={async () => { await addReview(video.id, "verify", "fixes", notes, secs.current); await applyScriptFixes(video.id, notes); setNotes(""); }}>
                    <Wrench size={14} /> Aplicar correcciones
                  </AsyncButton>
                  <AsyncButton className="btn-primary flex-1" disabled={blocks > 0 || fixes > 0}
                    onClick={async () => { try { await addReview(video.id, "verify", "approved", notes, secs.current); await approveScript(video.id); toast("success", "Guion aprobado", "Sigue la voz, las imágenes y el montaje."); } catch (e) { toast("warn", String((e as Error).message)); } }}>
                    <CheckCircle2 size={14} /> Aprobar guion
                  </AsyncButton>
                </div>
                {blocks > 0 && <div className="text-[11px] text-muted-foreground">Para aprobar, resuelve cada marca roja: acéptala con una nota (asumes el riesgo) o pide su corrección.</div>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ResolveBar({ resolution, note, onAccept, onFix, onUndo }: { resolution: "accepted" | "fix" | null; note: string; onAccept: (n: string) => void; onFix: (n: string) => void; onUndo: () => void }) {
  const [n, setN] = useState(note);
  if (resolution) return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
      <Chip tone={resolution === "accepted" ? "green" : "amber"}>{resolution === "accepted" ? "Aceptada" : "Corrección pedida"}</Chip>
      {note && <span className="text-[11px] text-muted-foreground truncate flex-1">{note}</span>}
      <button className="btn-ghost btn-sm" onClick={onUndo}><Undo2 size={13} /> Deshacer</button>
    </div>
  );
  return (
    <div className="space-y-2">
      <input className="input text-xs" placeholder="Nota (opcional): por qué la aceptas o qué cambiar" value={n} onChange={(e) => setN(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm flex-1" onClick={() => onAccept(n)}><Check size={13} /> Está bien</button>
        <button className="btn-brand btn-sm flex-1" onClick={() => onFix(n)}><Wrench size={13} /> Pedir corrección</button>
      </div>
    </div>
  );
}

function highlight(text: string, marks: { text: string; key: string; sev: Severity; resolved: boolean; onClick: () => void; active: boolean }[]): ReactNode[] {
  const lower = text.toLowerCase();
  const spans = marks.map((m) => { const i = lower.indexOf(m.text.toLowerCase().trim()); return { ...m, start: i, end: i + m.text.trim().length }; })
    .filter((m) => m.start >= 0).sort((a, b) => a.start - b.start);
  const out: ReactNode[] = []; let pos = 0;
  for (const m of spans) {
    if (m.start < pos) continue;
    if (m.start > pos) out.push(text.slice(pos, m.start));
    out.push(
      <span key={m.key} onClick={m.onClick}
        className={`cursor-pointer rounded px-0.5 underline decoration-2 underline-offset-4 transition-colors ${sevBg(m.sev, m.resolved)} ${m.active ? "ring-2 ring-primary" : ""}`}>
        {text.slice(m.start, m.end)}
      </span>,
    );
    pos = m.end;
  }
  out.push(text.slice(pos));
  return out;
}
