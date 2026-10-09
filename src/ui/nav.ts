import { useSyncExternalStore } from "react";

export type Page = "inicio" | "produccion" | "videos" | "video" | "tiktok" | "instrucciones" | "biblioteca" | "ajustes";
export interface Route { page: Page; id?: string; tab?: string }

let route: Route = { page: "inicio" };
const subs = new Set<() => void>();

export function navigate(r: Route) { route = r; subs.forEach((f) => f()); document.getElementById("main-scroll")?.scrollTo({ top: 0 }); }
export function useRoute(): Route {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => route);
}
