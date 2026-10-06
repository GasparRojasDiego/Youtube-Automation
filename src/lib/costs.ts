// Libro de costos: cada llamada de pago deja un asiento. El costo por video
// y el gasto del mes son siempre visibles, con tope opcional.
import { db } from "./ipc";
import { emit } from "./bus";
import { getSettings } from "./settings";
import { now } from "./util";
import { UserError } from "./events";

export interface CostEntry {
  videoId?: string | null; channelId?: string | null; provider: string; item: string;
  units?: number; usd: number; apiEquivUsd?: number;
}

export async function addCost(c: CostEntry) {
  await db.execute(
    "INSERT INTO costs(video_id,channel_id,provider,item,units,usd,api_equiv_usd,created_at) VALUES(?,?,?,?,?,?,?,?)",
    [c.videoId ?? null, c.channelId ?? null, c.provider, c.item, c.units ?? 0, c.usd, c.apiEquivUsd ?? 0, now()],
  );
  emit("costs");
}

export function monthStart(d = new Date()): number {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export async function monthSpendUsd(): Promise<number> {
  const r = await db.query<{ s: number }>("SELECT COALESCE(SUM(usd),0) AS s FROM costs WHERE created_at>=?", [monthStart()]);
  return r[0]?.s ?? 0;
}

export async function monthUnits(provider: string, item: string): Promise<number> {
  const r = await db.query<{ s: number }>(
    "SELECT COALESCE(SUM(units),0) AS s FROM costs WHERE created_at>=? AND provider=? AND item=?",
    [monthStart(), provider, item]);
  return r[0]?.s ?? 0;
}

export async function videoCost(videoId: string): Promise<{ usd: number; apiEquiv: number }> {
  const r = await db.query<{ s: number; e: number }>(
    "SELECT COALESCE(SUM(usd),0) AS s, COALESCE(SUM(api_equiv_usd),0) AS e FROM costs WHERE video_id=?", [videoId]);
  return { usd: r[0]?.s ?? 0, apiEquiv: r[0]?.e ?? 0 };
}

export function budgetUsd(): number {
  const b = getSettings().budget;
  return b.penPerUsd > 0 ? b.monthlyPen / b.penPerUsd : 0;
}

/** Lanza un error si el gasto previsto supera el presupuesto mensual (con tope activado). */
export async function assertBudget(expectedUsd: number, what: string) {
  const s = getSettings().budget;
  if (!s.hardStop || expectedUsd <= 0) return;
  const spent = await monthSpendUsd();
  const limit = budgetUsd();
  if (spent + expectedUsd > limit) {
    throw new UserError(
      `Presupuesto mensual alcanzado: ${what} costaría ~$${expectedUsd.toFixed(2)} y ya llevas $${spent.toFixed(2)} de $${limit.toFixed(2)}.`,
      "Sube el presupuesto o desactiva el tope en Ajustes → Presupuesto, o usa un proveedor más barato.",
      "presupuesto", false);
  }
}
