import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Home, Clapperboard, Sparkles, Smartphone, MonitorPlay, Library, Download, type LucideIcon } from "lucide-react";
import { navigate, useRoute, type Page } from "./ui/nav";
import { AtrilLogo } from "./ui/Logo";
import { Toaster } from "./ui/Toaster";
import { Avatar } from "./ui/kit";
import { UpdateDialog, UpdateRing } from "./ui/Update";
import { useBus } from "./lib/bus";
import { getSettings, isDark } from "./lib/settings";
import { runningVideoId } from "./pipeline/runner";
import { Today } from "./pages/Today";
import { VideosPage } from "./pages/Videos";
import { VideoDetail } from "./pages/VideoDetail";
import { Skills } from "./pages/Skills";
import { StudioPage } from "./pages/Studio";
import { LibraryPage } from "./pages/Library";
import { TikTokPage } from "./pages/TikTok";
import { SettingsPage } from "./pages/Settings";
import { Welcome } from "./pages/Welcome";
import { startUpdateChecks, updateState } from "./lib/updater";
import { AskHost } from "./ui/Ask";

const NAV: { id: Page; label: string; icon: LucideIcon }[][] = [
  [
    { id: "inicio", label: "Inicio", icon: Home },
    { id: "produccion", label: "Producción", icon: MonitorPlay },
    { id: "videos", label: "Videos", icon: Clapperboard },
    { id: "tiktok", label: "TikTok", icon: Smartphone },
  ],
  [
    { id: "instrucciones", label: "Instrucciones", icon: Sparkles },
    { id: "biblioteca", label: "Biblioteca", icon: Library },
  ],
];

export default function App() {
  const route = useRoute();
  useBus("settings", "jobs", "update");
  const s = getSettings();
  const [collapsed, setCollapsed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const items = useRef<Record<string, HTMLButtonElement | null>>({});
  const [ind, setInd] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => { startUpdateChecks(); }, []);
  // Tema: claro, oscuro o el del dispositivo (y sigue sus cambios)
  useEffect(() => {
    const apply = () => document.documentElement.classList.toggle("dark", isDark(s.theme));
    apply();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [s.theme]);

  const activeId = route.page === "video" ? "videos" : route.page;
  // Indicador que se desliza hasta la opción activa
  useLayoutEffect(() => {
    const measure = () => {
      const el = items.current[activeId]; const nav = navRef.current;
      if (!el || !nav) { setInd(null); return; }
      const a = el.getBoundingClientRect(), b = nav.getBoundingClientRect();
      setInd({ top: a.top - b.top + nav.scrollTop, height: a.height });
    };
    measure();
    void document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    if (navRef.current) ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [activeId, collapsed, s.onboarded]);

  if (!s.onboarded) return (<><Welcome /><Toaster /><AskHost /></>);

  const up = updateState();
  const running = !!runningVideoId();
  const onSettings = route.page === "ajustes";
  const name = s.profile.name || "Tu perfil";

  const page = (() => {
    switch (route.page) {
      case "inicio": return <Today />;
      case "produccion": return <StudioPage />;
      case "videos": return <VideosPage />;
      case "video": return <VideoDetail key={route.id} id={route.id!} />;
      case "tiktok": return <TikTokPage />;
      case "instrucciones": return <Skills />;
      case "biblioteca": return <LibraryPage />;
      case "ajustes": return <SettingsPage />;
    }
  })();

  return (
    <div className="relative h-full flex isolate">
      <aside className={`${collapsed ? "w-[72px]" : "w-[236px]"} relative z-10 shrink-0 border-r border-border/70 bg-card/55 backdrop-blur-xl flex flex-col transition-[width] duration-300 ease-frame`}>
        <div className="h-[72px] flex items-center justify-center px-3">
          <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Mostrar menú" : "Ocultar menú"}
            className="flex items-center justify-center gap-3 rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent/50">
            <AtrilLogo size={collapsed ? 32 : 36} className="text-primary shrink-0" />
            {!collapsed && <span className="font-bold tracking-[0.3em] -mr-[0.3em] text-[19px]">ATRIL</span>}
          </button>
        </div>
        <div className="mx-4 h-px bg-border" />
        <nav ref={navRef} className="relative flex-1 overflow-y-auto no-scrollbar px-3 pt-2 pb-3">
          {ind && <span aria-hidden className="absolute left-3 right-3 rounded-md bg-nav-active transition-[top,height] duration-300 ease-frame" style={{ top: ind.top, height: ind.height }} />}
          {NAV.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="mx-2.5 my-3 h-px bg-border" />}
              <div className="space-y-0.5">
                {group.map(({ id, label, icon: I }) => {
                  const on = activeId === id;
                  return (
                    <button key={id} ref={(el) => { items.current[id] = el; }} onClick={() => navigate({ page: id })} title={collapsed ? label : undefined}
                      className={`relative z-10 w-full flex items-center gap-3 px-2.5 h-9 text-[13.5px] transition-colors duration-200 ${collapsed ? "justify-center" : ""} ${on ? "rounded-md text-nav-active-foreground font-semibold" : "rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50"}`}>
                      <I size={17} className="shrink-0" />
                      {!collapsed && <span className="truncate">{label}</span>}
                      {id === "produccion" && running && <span className={`${collapsed ? "absolute top-1.5 right-2" : "ml-auto"} relative w-2 h-2`}><span className="absolute inset-0 rounded-full bg-primary" /><span className="absolute inset-0 rounded-full animate-pulse-dot bg-primary" /></span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-border/60">
          <div className={`relative flex items-center ${onSettings ? "rounded-md bg-soft text-soft-foreground" : "rounded-lg hover:bg-accent/50"} transition-colors`}>
            <button onClick={() => navigate({ page: "ajustes" })} title={collapsed ? `${name} · Ajustes` : "Ajustes"}
              className={`flex-1 min-w-0 flex items-center gap-3 h-12 px-2 ${collapsed ? "justify-center" : ""}`}>
              <span className="relative shrink-0">
                <Avatar size={30} />
                {collapsed && up.available && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-card" />}
              </span>
              {!collapsed && <span className="truncate text-left text-[13.5px] font-medium">{name}</span>}
            </button>
            {!collapsed && up.available && (
              <button onClick={() => setUpdating(true)} title={up.busy ? "Actualizando…" : `Actualizar a la versión ${up.version}`} aria-label="Actualizar ATRIL"
                className="relative mr-2 w-8 h-8 shrink-0 rounded-full grid place-items-center bg-primary/15 text-primary hover:bg-primary/25 transition-colors">
                {up.busy ? <UpdateRing /> : <Download size={15} strokeWidth={2.2} />}
              </button>
            )}
          </div>
        </div>
      </aside>
      <main id="main-scroll" className="relative z-10 flex-1 min-w-0 overflow-y-auto">
        <div key={`${route.page}:${route.id ?? ""}`} className="max-w-[1240px] mx-auto px-8 py-8 animate-page-in">{page}</div>
      </main>
      <UpdateDialog open={updating} onClose={() => setUpdating(false)} />
      <Toaster />
      <AskHost />
    </div>
  );
}
