// Ayudas HTTP comunes con errores comprensibles.
import { http, secrets, type HttpReq } from "../lib/ipc";
import { UserError } from "../lib/events";
import { sleep } from "../lib/util";

export async function requireSecret(key: string, label: string): Promise<string> {
  const v = await secrets.get(key);
  if (!v) throw new UserError(`Falta la clave de ${label}.`, "Agrégala en Ajustes → Credenciales.", label, false);
  return v;
}

function explain(service: string, status: number, body: string): UserError {
  let msg = "";
  try { const j = JSON.parse(body); msg = j.error?.message ?? j.error?.status ?? j.detail?.message ?? j.message ?? ""; if (typeof msg !== "string") msg = JSON.stringify(msg); } catch { msg = body.slice(0, 300); }
  const hint =
    status === 400 ? "La petición fue rechazada; puede que el servicio haya cambiado su formato o un parámetro (voz, modelo) ya no exista." :
    status === 401 || status === 403 ? "La clave o la autorización no es válida, no tiene permisos o el servicio no está habilitado en tu proyecto de Google Cloud." :
    status === 404 ? "El recurso o el modelo no existe (¿cambió de nombre?). Revisa el nombre en Ajustes." :
    status === 429 ? "Se superó la cuota o el límite de peticiones. Espera y reintenta." :
    status >= 500 ? "El servicio tuvo un fallo interno. Reintenta en unos minutos." : "";
  return new UserError(`${service}: error ${status}${msg ? ` — ${msg.slice(0, 220)}` : ""}`, `${hint}\n\n${body.slice(0, 3000)}`, service, status === 429 || status >= 500);
}

/** Petición con reintentos para 429/5xx y fallos de red. */
export async function requestJson<T = any>(service: string, r: HttpReq, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await http.request(r);
      if (res.status >= 200 && res.status < 300) {
        if (r.response === "base64") return res as unknown as T;
        return (res.body ? JSON.parse(res.body) : {}) as T;
      }
      const err = explain(service, res.status, res.body);
      if (!(res.status === 429 || res.status >= 500) || i === retries) throw err;
      lastErr = err;
    } catch (e) {
      if (e instanceof UserError && !e.retryable) throw e;
      if (e instanceof UserError && i === retries) throw e;
      lastErr = e instanceof UserError ? e : new UserError(`${service}: sin conexión o error de red.`, String(e), service);
      if (i === retries) throw lastErr;
    }
    await sleep(1500 * 2 ** i);
  }
  throw lastErr;
}

export const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
