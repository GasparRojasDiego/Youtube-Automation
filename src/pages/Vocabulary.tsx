// Aprendizaje de inglés: repaso espaciado de las expresiones que aparecieron
// en tus propios guiones. Opcional y breve (2–3 minutos).
import { useEffect, useState } from "react";
import { Languages, Eye, Trash2 } from "lucide-react";
import { db } from "../lib/ipc";
import { useBus, emit } from "../lib/bus";
import { srsNext } from "../pipeline/logic";
import { PageHeader, Card, Empty, Stat } from "../ui/kit";

interface Card_ { id: string; term: string; meaning_es: string; example_en: string; note: string; due: number; interval_d: number; ease: number; reps: number; lapses: number }

export function Vocabulary() {
  const tick = useBus("vocab");
  const [due, setDue] = useState<Card_[]>([]);
  const [all, setAll] = useState<Card_[]>([]);
  const [show, setShow] = useState(false);
  useEffect(() => { void (async () => {
    setDue(await db.query<Card_>("SELECT * FROM vocab WHERE due<=? ORDER BY due LIMIT 20", [Date.now()]));
    setAll(await db.query<Card_>("SELECT * FROM vocab ORDER BY created_at DESC LIMIT 500"));
  })(); }, [tick]);
  const card = due[0];
  const grade = async (g: 0 | 1 | 2) => {
    const n = srsNext(card, g);
    await db.execute("UPDATE vocab SET interval_d=?, ease=?, reps=?, lapses=lapses+?, due=? WHERE id=?", [n.interval_d, n.ease, n.reps, g === 0 ? 1 : 0, Date.now() + n.dueInDays * 86400000, card.id]);
    setShow(false); emit("vocab");
  };
  const learned = all.filter((c) => c.interval_d >= 21).length;
  return (
    <div className="space-y-5">
      <PageHeader kicker="Inglés" title="Repaso de vocabulario" subtitle="Expresiones reales de tus guiones. Primero intenta recordar el significado; luego compruébalo." />
      <div className="grid grid-cols-3 gap-4">
        <Card><Stat label="Para hoy" value={due.length} /></Card>
        <Card><Stat label="En tu colección" value={all.length} /></Card>
        <Card><Stat label="Consolidadas (≥ 21 días)" value={learned} tone="green" /></Card>
      </div>
      {card ? (
        <Card>
          <div className="text-center py-6 space-y-4">
            <div className="text-3xl font-bold text-primary">{card.term}</div>
            <div className="text-lg italic text-muted-foreground max-w-2xl mx-auto" style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>“{card.example_en}”</div>
            {!show ? <button className="btn-brand" onClick={() => setShow(true)}><Eye size={15} /> Mostrar significado</button> : (
              <div className="space-y-3">
                <div className="text-lg font-semibold">{card.meaning_es}</div>
                {card.note && <div className="text-sm text-muted-foreground">{card.note}</div>}
                <div className="flex justify-center gap-2">
                  <button className="btn-secondary" onClick={() => void grade(0)}>No lo sabía</button>
                  <button className="btn-secondary" onClick={() => void grade(1)}>Con dudas</button>
                  <button className="btn-primary" onClick={() => void grade(2)}>Lo sabía</button>
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : <Card><Empty icon={Languages} title="Estás al día">Las nuevas expresiones llegan con cada guion verificado.</Empty></Card>}
      {all.length > 0 && (
        <Card title="Colección">
          <div className="grid grid-cols-2 gap-x-6">
            {all.map((c) => (
              <div key={c.id} className="flex items-center gap-2 py-1.5 border-b border-border/50 text-sm">
                <span className="font-medium text-primary">{c.term}</span><span className="text-muted-foreground truncate flex-1">— {c.meaning_es}</span>
                <span className="text-[10px] tabular text-muted-foreground">{c.interval_d ? `${Math.round(c.interval_d)} d` : "nueva"}</span>
                <button className="btn-ghost btn-sm h-6 px-1" onClick={async () => { await db.execute("DELETE FROM vocab WHERE id=?", [c.id]); emit("vocab"); }}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
