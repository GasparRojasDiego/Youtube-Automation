import { useSyncExternalStore } from "react";

export type Page = "hoy" | "produccion" | "video" | "temas" | "habilidades" | "referentes" | "metricas" | "vocabulario" | "costos" | "ajustes" | "diagnostico" | "guia";
export interface Route { page: Page; id?: string; tab?: string }

let route: Route = { page: "hoy" };
const subs = new Set<() => void>();

export function navigate(r: Route) { route = r; subs.forEach((f) => f()); document.getElementById("main-scroll")?.scrollTo({ top: 0 }); }
export function useRoute(): Route {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => route);
}
