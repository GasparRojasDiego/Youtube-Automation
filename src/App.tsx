import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Bell, Home, Clapperboard, Sparkles, Gauge, Settings, Stethoscope, Smartphone,
  PanelLeftClose, PanelLeftOpen, Loader2, MonitorPlay, Library, Download, type LucideIcon,
} from "lucide-react";
import { navigate, useRoute, type Page } from "./ui/nav";
import { AtrilLogo, Ambient } from "./ui/Constellation";
import { Toaster } from "./ui/Toaster";
import { useBus } from "./lib/bus";
import { getSettings } from "./lib/settings";
import { unreadCount } from "./lib/events";
import { runningVideoId, runningStage } from "./pipeline/runner";
import { STAGES } from "./lib/repo";
import { NotificationsPanel } from "./pages/Notifications";
import { Today } from "./pages/Today";
import { Production } from "./pages/Production";
import { VideoDetail } from "./pages/VideoDetail";
import { Skills } from "./pages/Skills";
import { UsagePage } from "./pages/Usage";
import { StudioPage } from "./pages/Studio";
import { LibraryPage } from "./pages/Library";
import { TikTokPage } from "./pages/TikTok";
import { HeaderUsage } from "./ui/Usage";
import { getLimits } from "./lib/usage";
import { refreshPlanUsage } from "./providers/claude";
import { SettingsPage } from "./pages/Settings";
import { Diagnostics } from "./pages/Diagnostics";
import { Welcome } from "./pages/Welcome";
import { appVersion, startUpdateChecks, updateState, installUpdate } from "./lib/updater";

const NAV: { group: string; items: { id: Page; label: string; icon: LucideIcon }[] }[] = [
  { group: "Producción", items: [
    { id: "hoy", label: "Hoy", icon: Home },
    { id: "estudio", label: "Estudio en vivo", icon: MonitorPlay },
    { id: "produccion", label: "Videos", icon: Clapperboard },
    { id: "tiktok", label: "TikTok", icon: Smartphone },
  ] },
  { group: "Identidad", items: [
    { id: "habilidades", label: "Habilidades", icon: Sparkles },
    { id: "biblioteca", label: "Biblioteca", icon: Library },
  ] },
  { group: "Control", items: [
    { id: "consumo", label: "Consumo", icon: Gauge },
    { id: "diagnostico", label: "Diagnóstico", icon: Stethoscope },
  ] },
];

const CRUMB: Record<Page, [string, string]> = {
  hoy: ["Producción", "Hoy"], estudio: ["Producción", "Estudio en vivo"], produccion: ["Producción", "Videos"], video: ["Producción", "Video"],
  tiktok: ["Producción", "TikTok"], habilidades: ["Identidad", "Habilidades"], biblioteca: ["Identidad", "Biblioteca"],
  consumo: ["Control", "Consumo"], diagnostico: ["Control", "Diagnóstico"], ajustes: ["Sistema", "Ajustes"],
};

function NavButton({ active, collapsed, label, icon: I, onClick, refCb }: { active: boolean; collapsed: boolean; label: string; icon: LucideIcon; onClick: () => void; refCb?: (el: HTMLButtonElement | null) => void }) {
  return (
    <button ref={refCb} onClick={onClick} title={collapsed ? label : undefined}
      className={`relative z-10 w-full flex items-center gap-3 rounded-lg px-2.5 h-9 text-[13.5px] transition-colors duration-200 ${active ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}>
      <I size={17} className={`shrink-0 transition-colors ${active ? "text-primary" : ""}`} />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

export default function App() {
  const route = useRoute();
  const tick = useBus("settings", "events", "jobs", "stages", "update");
  const s = getSettings();
  const [unread, setUnread] = useState(0);
  const [bell, setBell] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [version, setVersion] = useState("");
  const navRef = useRef<HTMLElement>(null);
  const items = useRef<Record<string, HTMLButtonElement | null>>({});
  const [ind, setInd] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => { void unreadCount().then(setUnread); }, [tick]);
  useEffect(() => { void appVersion().then(setVersion); startUpdateChecks(); }, []);
  // Lectura del plan: solo si hay una ventana de 5 h en curso (nunca abre una ventana nueva por su cuenta)
  useEffect(() => {
    const check = async () => {
      const l = await getLimits();
      const active = !!l?.fiveHour && l.fiveHour.resetsAt > Date.now();
      if (active && Date.now() - l!.updatedAt > 15 * 60_000 && !runningVideoId()) await refreshPlanUsage().catch(() => null);
    };
    void check();
    const t = setInterval(() => void check(), 15 * 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", s.theme === "dark"); }, [s.theme]);

  const activeId: Page = route.page === "video" ? "produccion" : route.page;
  // Indicador que se desliza hasta la opción activa (se vuelve a medir al cargar fuentes o cambiar tamaño)
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

  if (!s.onboarded) return (<><Welcome /><Toaster /></>);

  const running = runningVideoId();
  const rs = runningStage();
  const up = updateState();
  const crumb = CRUMB[route.page] ?? ["", ""];

  const page = (() => {
    switch (route.page) {
      case "hoy": return <Today />;
      case "produccion": return <Production tab={route.tab} />;
      case "video": return <VideoDetail key={route.id} id={route.id!} />;
      case "tiktok": return <TikTokPage />;
      case "habilidades": return <Skills />;
      case "estudio": return <StudioPage />;
      case "biblioteca": return <LibraryPage />;
      case "consumo": return <UsagePage />;
      case "ajustes": return <SettingsPage tab={route.tab} />;
      case "diagnostico": return <Diagnostics />;
    }
  })();

  return (
    <div className="relative h-full flex isolate">
      <Ambient enabled={s.ui.ambient} />
      <aside className={`${collapsed ? "w-[68px]" : "w-[232px]"} relative z-10 shrink-0 border-r border-border/70 bg-card/55 backdrop-blur-xl flex flex-col transition-[width] duration-300 ease-frame`}>
        <div className="h-14 flex items-center gap-2.5 px-4">
          <AtrilLogo size={28} className="text-primary shrink-0 drop-shadow-[0_0_10px_hsl(var(--primary)/.45)]" />
          {!collapsed && (
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-extrabold tracking-[0.32em] text-[15px]">ATRIL</span>
              {version && <span className="font-mono text-[10px] text-muted-foreground">v{version}</span>}
            </div>
          )}
        </div>
        <div className="hairline mx-3" />
        <nav ref={navRef} className="relative flex-1 overflow-y-auto no-scrollbar py-3 px-2.5 space-y-5">
          {ind && (
            <span aria-hidden className="absolute left-2.5 right-2.5 rounded-lg bg-primary/[.12] border border-primary/25 transition-[top,height] duration-300 ease-frame"
              style={{ top: ind.top, height: ind.height }}>
              <span className="absolute left-0 top-2 bottom-2 w-[3px] -translate-x-[1px] rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
            </span>
          )}
          {NAV.map((g) => (
            <div key={g.group}>
              {!collapsed && <div className="label px-2.5 mb-1.5">{g.group}</div>}
              <div className="space-y-0.5">
                {g.items.map((it) => (
                  <NavButton key={it.id} active={activeId === it.id} collapsed={collapsed} label={it.label} icon={it.icon}
                    onClick={() => navigate({ page: it.id })} refCb={(el) => { items.current[it.id] = el; }} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="px-2.5 pb-2.5 space-y-1.5">
          {up.available && (
            <button onClick={() => void installUpdate()} disabled={up.busy} title={`Actualizar a la versión ${up.version}`}
              className="relative w-full flex items-center gap-2.5 rounded-lg px-2.5 h-10 text-[13px] font-semibold text-primary-foreground overflow-hidden disabled:opacity-80"
              style={{ background: "linear-gradient(180deg, hsl(var(--primary)), hsl(var(--primary) / .82))", boxShadow: "0 8px 22px -10px hsl(var(--primary) / .8)" }}>
              {up.busy ? <Loader2 size={16} className="animate-spin shrink-0" /> : (
                <span className="relative shrink-0"><Download size={16} /><span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white"><span className="absolute inset-0 rounded-full bg-white animate-pulse-dot" /></span></span>
              )}
              {!collapsed && <span className="truncate">{up.busy ? up.progress || "Descargando…" : `Actualizar a ${up.version}`}</span>}
            </button>
          )}
          <div className="hairline" />
          <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
            <button onClick={() => navigate({ page: "ajustes" })} title={collapsed ? "Ajustes" : undefined}
              className={`flex-1 w-full flex items-center gap-3 rounded-lg px-2.5 h-9 text-[13.5px] transition-colors duration-200 ${route.page === "ajustes" ? "bg-primary/[.12] text-foreground font-medium ring-1 ring-primary/25" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"}`}>
              <Settings size={17} className={route.page === "ajustes" ? "text-primary" : ""} />
              {!collapsed && <span>Ajustes</span>}
            </button>
            <button className="btn-ghost btn-sm w-8 px-0" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expandir menú" : "Contraer menú"}>
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
        </div>
      </aside>
      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 border-b border-border/60 bg-background/55 backdrop-blur-xl flex items-center gap-4 px-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] min-w-0">
            <span className="text-muted-foreground">{crumb[0]}</span>
            <span className="text-primary/60">/</span>
            <span className="text-foreground truncate">{crumb[1]}</span>
          </div>
          <div className="flex-1 flex justify-center">
            {running && (
              <button onClick={() => navigate({ page: "estudio" })} className="group inline-flex items-center gap-2 h-7 pl-2 pr-3 rounded-full border border-primary/40 bg-primary/10 text-primary text-[11.5px] font-medium hover:bg-primary/15 transition-colors">
                <span className="relative w-2 h-2"><span className="absolute inset-0 rounded-full bg-primary" /><span className="absolute inset-0 rounded-full bg-primary animate-pulse-dot" /></span>
                Trabajando: {STAGES.find((x) => x.id === rs)?.label ?? "…"}
              </button>
            )}
          </div>
          <HeaderUsage />
          <button className="btn-ghost w-9 px-0 relative" onClick={() => setBell(!bell)} aria-label="Avisos">
            <Bell size={17} />
            {unread > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center ring-2 ring-background">{unread > 99 ? "99+" : unread}</span>}
          </button>
        </header>
        <main id="main-scroll" className="flex-1 overflow-y-auto">
          <div key={`${route.page}:${route.id ?? ""}`} className="max-w-[1240px] mx-auto px-8 py-7 animate-page-in">{page}</div>
        </main>
      </div>
      {bell && <NotificationsPanel onClose={() => setBell(false)} />}
      <Toaster />
    </div>
  );
}
