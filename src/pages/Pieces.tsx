// Repositorio de piezas listas (Instrucciones): cada pieza con su vista previa renderizada,
// qué hace, cuándo usarla, sus opciones y el código que la crea. Son las mismas que usa
// Claude en Motion: tal cual, modificando una parte o como referencia para crear desde cero.
import { useMemo, useState } from "react";
import { Blocks, Copy, Check, Play } from "lucide-react";
import { PIECES, pieceSource, pieceUsage, type PieceGroup, type PieceMeta } from "../motion/pieces";
import { Card, Chip, Modal, Tabs } from "../ui/kit";

const GROUPS: (PieceGroup | "Todas")[] = ["Todas", "Apertura y estructura", "Cifras y datos", "Tiempo y lugar", "Relaciones y procesos", "Texto y evidencia", "Con imágenes", "Sobre el video"];

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="btn-ghost btn-sm" onClick={() => { void navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}>
      {ok ? <Check size={13} /> : <Copy size={13} />} {ok ? "Copiado" : "Copiar"}
    </button>
  );
}

function PieceCard({ p, onOpen }: { p: PieceMeta; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="card text-left overflow-hidden group transition-transform duration-200 ease-frame hover:-translate-y-0.5">
      <div className="relative aspect-video bg-black">
        <video src={`/piezas/${p.id}.mp4`} poster={`/piezas/${p.id}.jpg`} muted loop playsInline preload="none" className="w-full h-full object-cover"
          onMouseEnter={(e) => { void e.currentTarget.play().catch(() => undefined); }} onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} />
        <span className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-80 group-hover:opacity-0 transition-opacity"><Play size={13} /></span>
      </div>
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <b className="text-[13px] truncate">{p.name}</b>
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">P.{p.id} · {p.dur} s</span>
        </div>
        <p className="text-[11.5px] text-muted-foreground line-clamp-2">{p.use}</p>
      </div>
    </button>
  );
}

export function PieceLibrary() {
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("Todas");
  const [open, setOpen] = useState<PieceMeta | null>(null);
  const [code, setCode] = useState<"uso" | "pieza">("uso");
  const list = useMemo(() => PIECES.filter((p) => group === "Todas" || p.group === group), [group]);
  const src = open ? pieceSource(open.id) ?? "" : "";
  const usage = open ? pieceUsage(open) : "";
  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="icon-box w-9 h-9"><Blocks size={16} /></span>
          <div>
            <h2 className="font-semibold tracking-tight">Piezas listas <span className="text-muted-foreground font-normal">({PIECES.length})</span></h2>
            <p className="text-xs text-muted-foreground">Animaciones completas y universales. En cada animación, Claude elige: usar una tal cual (solo cambia textos, cifras, íconos e imágenes), modificar una parte, o crear desde cero.</p>
          </div>
        </div>
      </div>
      <Tabs value={group} onChange={setGroup} tabs={GROUPS.map((g) => ({ id: g, label: g }))} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
        {list.map((p) => <PieceCard key={p.id} p={p} onOpen={() => { setOpen(p); setCode("uso"); }} />)}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.name} · P.${open.id}` : ""} wide>
        {open && (
          <div className="space-y-4">
            <video key={open.id} src={`/piezas/${open.id}.mp4`} poster={`/piezas/${open.id}.jpg`} autoPlay muted loop playsInline controls className="w-full rounded-lg bg-black aspect-video" />
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="primary">{open.group}</Chip>
              <Chip>{open.kind === "overlay" ? "Sobre el video (fondo transparente)" : "Pantalla completa"}</Chip>
              <Chip>{open.dur} s por defecto</Chip>
              {open.libs?.length ? <Chip tone="amber">Necesita: {open.libs.join(", ")}</Chip> : null}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Qué hace</div><p>{open.desc}</p></div>
              <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Cuándo usarla</div><p>{open.use}</p>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-3 mb-1">Opciones</div><code className="font-mono text-[12px] break-words">{open.opts}</code>
                <p className="text-[11px] text-muted-foreground mt-1">Todas aceptan además <code className="font-mono">dur</code>, <code className="font-mono">enter</code> (transición de entrada) y <code className="font-mono">bg</code> (fondo).</p></div>
            </div>
            <Card title="Código" actions={<><Tabs value={code} onChange={setCode} tabs={[{ id: "uso", label: "Usarla tal cual" }, { id: "pieza", label: "Código de la pieza" }]} /><CopyBtn text={code === "uso" ? usage : src} /></>} pad={false}>
              <pre className="font-mono text-[11.5px] leading-relaxed p-4 overflow-auto max-h-80 bg-secondary/40 rounded-b-xl whitespace-pre">{code === "uso" ? usage : src}</pre>
            </Card>
          </div>
        )}
      </Modal>
    </section>
  );
}
