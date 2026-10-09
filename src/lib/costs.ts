// Libro de costos: cada llamada de pago deja un asiento (sirve, p. ej., para
// la cuota mensual gratuita de la voz).
import { db } from "./ipc";
import { emit } from "./bus";
import { now } from "./util";

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

export async function monthUnits(provider: string, item: string): Promise<number> {
  const r = await db.query<{ s: number }>(
    "SELECT COALESCE(SUM(units),0) AS s FROM costs WHERE created_at>=? AND provider=? AND item=?",
    [monthStart(), provider, item]);
  return r[0]?.s ?? 0;
}
