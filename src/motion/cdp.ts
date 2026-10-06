// Cliente mínimo del protocolo DevTools (CDP) sobre WebSocket. Funciona en la
// vista web de la app y en Node (pruebas), sin dependencias.

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; method: string };

export class Cdp {
  private ws: WebSocket;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(method: string, params: any, sessionId?: string) => void>();
  private closed = false;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (ev) => {
      let m: any;
      try { m = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)); } catch { return; }
      if (m.id != null) {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        if (m.error) p.reject(new Error(`${p.method}: ${m.error.message ?? JSON.stringify(m.error)}`));
        else p.resolve(m.result ?? {});
      } else if (m.method) {
        this.listeners.forEach((fn) => { try { fn(m.method, m.params, m.sessionId); } catch { /* noop */ } });
      }
    };
    ws.onclose = () => {
      this.closed = true;
      this.pending.forEach((p) => p.reject(new Error("El navegador cerró la conexión")));
      this.pending.clear();
    };
  }

  static connect(url: string, timeoutMs = 15000): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const t = setTimeout(() => { try { ws.close(); } catch { /* noop */ } reject(new Error("No se pudo conectar con el navegador (tiempo agotado)")); }, timeoutMs);
      ws.onopen = () => { clearTimeout(t); resolve(new Cdp(ws)); };
      ws.onerror = () => { clearTimeout(t); reject(new Error("No se pudo conectar con el navegador")); };
    });
  }

  get isClosed() { return this.closed; }

  send<T = any>(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = 60000): Promise<T> {
    if (this.closed) return Promise.reject(new Error("Conexión con el navegador cerrada"));
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: tiempo agotado`)); }, timeoutMs);
      this.pending.set(id, { method, resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  on(fn: (method: string, params: any, sessionId?: string) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  close() { try { this.ws.close(); } catch { /* noop */ } }
}
