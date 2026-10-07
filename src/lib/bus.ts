// Bus mínimo de eventos para refrescar la interfaz cuando cambian los datos.
import { useEffect, useReducer } from "react";

type Topic = "settings" | "videos" | "stages" | "events" | "skills" | "topics" | "costs" | "creators" | "music" | "channels" | "jobs" | "activity" | "live" | "assets" | "usage";
const listeners = new Map<Topic, Set<() => void>>();

export function emit(...topics: Topic[]) {
  for (const t of topics) listeners.get(t)?.forEach((fn) => { try { fn(); } catch { /* noop */ } });
}

export function subscribe(topic: Topic, fn: () => void): () => void {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic)!.add(fn);
  return () => listeners.get(topic)!.delete(fn);
}

/** Fuerza re-render cuando cambian los temas indicados. Devuelve un contador útil como dependencia. */
export function useBus(...topics: Topic[]): number {
  const [n, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const offs = topics.map((t) => subscribe(t, bump));
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics.join(",")]);
  return n;
}
