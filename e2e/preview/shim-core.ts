// Vista previa en navegador: invoke() viaja a un servidor Node que usa una copia de la base de datos.
export async function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch("/__ipc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cmd, args }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `ipc ${cmd}`);
  return j.value as T;
}
export const convertFileSrc = (p: string) => `/__file?p=${encodeURIComponent(p)}`;
(window as any).__TAURI_INTERNALS__ = {};
