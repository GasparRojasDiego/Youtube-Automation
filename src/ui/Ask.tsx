// Confirmaciones y preguntas dentro de la app. No se usan window.confirm ni
// window.prompt: en Tauri, el plugin de diálogos reemplaza window.confirm por
// una versión asíncrona que llama a un comando que ya no existe (falla por
// permisos y, como devuelve una promesa, el «si» se cumplía siempre).
import { useEffect, useRef, useState } from "react";
import { Modal } from "./kit";

interface Req { title: string; body?: string; confirm: string; danger?: boolean; input?: string; resolve: (v: string | boolean | null) => void }
let show: ((r: Req) => void) | null = null;

/** Pide confirmación; sin la ventana montada responde «no» (lo seguro). */
export function askConfirm(title: string, o: { body?: string; confirm?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => (show ? show({ title, body: o.body, confirm: o.confirm ?? "Aceptar", danger: o.danger, resolve: (v) => resolve(v === true) }) : resolve(false)));
}

/** Pide un texto; null si se cancela. */
export function askText(title: string, o: { body?: string; value?: string; confirm?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => (show ? show({ title, body: o.body, confirm: o.confirm ?? "Aceptar", input: o.value ?? "", resolve: (v) => resolve(typeof v === "string" ? v : null) }) : resolve(null)));
}

export function AskHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { show = (r) => { setText(r.input ?? ""); setReq(r); }; return () => { show = null; }; }, []);
  useEffect(() => { if (req?.input != null) setTimeout(() => input.current?.select(), 30); }, [req]);
  const done = (v: string | boolean | null) => { req?.resolve(v); setReq(null); };
  const accept = () => done(req?.input != null ? text.trim() : true);
  return (
    <Modal open={!!req} onClose={() => done(req?.input != null ? null : false)} title={req?.title ?? ""}
      footer={<>
        <button className="btn-ghost" onClick={() => done(req?.input != null ? null : false)}>Cancelar</button>
        <button className={req?.danger ? "btn-danger" : "btn-primary"} autoFocus={req?.input == null} onClick={accept}>{req?.confirm}</button>
      </>}>
      {req?.body && <p className="text-sm text-muted-foreground">{req.body}</p>}
      {req?.input != null && <input ref={input} className="input mt-2" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") accept(); }} />}
    </Modal>
  );
}
