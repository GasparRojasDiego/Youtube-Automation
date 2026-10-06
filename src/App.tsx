import { useEffect, useState } from "react";
import {
  Sun, Moon, Bell, Home, Clapperboard, Lightbulb, Sparkles, Users, BarChart3, Languages, Gauge, Settings, Stethoscope, BookOpen,
  PanelLeftClose, PanelLeftOpen, Loader2, MonitorPlay, Library, type LucideIcon,
} from "lucide-react";
import { navigate, useRoute, type Page } from "./ui/nav";
import { AtrilLogo } from "./ui/Constellation";
import { Toaster } from "./ui/Toaster";
import { useBus } from "./lib/bus";
import { getSettings, saveSettings } from "./lib/settings";
import { listChannels, type Channel } from "./lib/repo";
import { unreadCount } from "./lib/events";
import { runningVideoId, runningStage } from "./pipeline/runner";
import { STAGES } from "./lib/repo";
import { NotificationsPanel } from "./pages/Notifications";
import { Today } from "./pages/Today";
import { Production } from "./pages/Production";
import { VideoDetail } from "./pages/VideoDetail";
import { Topics } from "./pages/Topics";
import { Skills } from "./pages/Skills";
import { Creators } from "./pages/Creators";
import { Metrics } from "./pages/Metrics";
import { Vocabulary } from "./pages/Vocabulary";
import { UsagePage } from "./pages/Usage";
import { StudioPage } from "./pages/Studio";
import { LibraryPage } from "./pages/Library";
import { HeaderUsage } from "./ui/Usage";
import { SettingsPage } from "./pages/Settings";
import { Diagnostics } from "./pages/Diagnostics";
import { Guide } from "./pages/Guide";
import { Welcome } from "./pages/Welcome";

const NAV: { group: string; items: { id: Page; label: string; icon: LucideIcon }[] }[] = [
  { group: "Producción", items: [
    { id: "hoy", label: "Hoy", icon: Home },
    { id: "estudio", label: "Estudio en vivo", icon: MonitorPlay },
    { id: "produccion", label: "Videos", icon: Clapperboard },
    { id: "temas", label: "Temas", icon: Lightbulb },
  ] },
  { group: "Identidad y material", items: [
    { id: "habilidades", label: "Habilidades", icon: Sparkles },
    { id: "biblioteca", label: "Biblioteca", icon: Library },
    { id: "referentes", label: "Referentes", icon: Users },
  ] },
  { group: "Mejora", items: [
    { id: "metricas", label: "Métricas", icon: BarChart3 },
    { id: "vocabulario", label: "Inglés", icon: Languages },
    { id: "consumo", label: "Consumo", icon: Gauge },
  ] },
  { group: "Sistema", items: [
    { id: "ajustes", label: "Ajustes", icon: Settings },
    { id: "diagnostico", label: "Diagnóstico", icon: Stethoscope },
    { id: "guia", label: "Guía", icon: BookOpen },
  ] },
];

export default function App() {
  const route = useRoute();
  const tick = useBus("settings", "channels", "events", "jobs", "stages");
  const s = getSettings();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [unread, setUnread] = useState(0);
  const [bell, setBell] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { void listChannels().then(setChannels); void unreadCount().then(setUnread); }, [tick]);
  useEffect(() => { document.documentElement.classList.toggle("dark", s.theme === "dark"); }, [s.theme]);

  if (!s.onboarded) return (<><Welcome /><Toaster /></>);

  const running = runningVideoId();
  const rs = runningStage();

  const page = (() => {
    switch (route.page) {
      case "hoy": return <Today />;
      case "produccion": return <Production />;
      case "video": return <VideoDetail key={route.id} id={route.id!} />;
      case "temas": return <Topics />;
      case "habilidades": return <Skills />;
      case "referentes": return <Creators />;
      case "metricas": return <Metrics />;
      case "vocabulario": return <Vocabulary />;
      case "estudio": return <StudioPage />;
      case "biblioteca": return <LibraryPage />;
      case "consumo": case "costos": return <UsagePage />;
      case "ajustes": return <SettingsPage tab={route.tab} />;
      case "diagnostico": return <Diagnostics />;
      case "guia": return <Guide />;
    }
  })();

  return (
    <div className="h-full flex">
      <aside className={`${collapsed ? "w-[68px]" : "w-60"} shrink-0 border-r border-border bg-card/40 flex flex-col transition-[width] duration-300 ease-frame`}>
        <div className="h-16 flex items-center gap-2.5 px-4 border-b border-border">
          <AtrilLogo size={30} className="text-primary shrink-0" />
          {!collapsed && <span className="font-extrabold tracking-[0.35em] text-[15px]">ATRIL</span>}
        </div>
        <nav className="flex-1 overflow-y-auto no-scrollbar py-3 px-2.5 space-y-4">
          {NAV.map((g) => (
            <div key={g.group}>
              {!collapsed && <div className="label px-2 mb-1.5">{g.group}</div>}
              <div className="space-y-0.5">
                {g.items.map((it) => {
                  const active = route.page === it.id || (it.id === "produccion" && route.page === "video");
                  const I = it.icon;
                  return (
                    <button key={it.id} onClick={() => navigate({ page: it.id })} title={it.label}
                      className={`w-full flex items-center gap-3 rounded-md px-2.5 h-9 text-sm transition-colors duration-200 ${active ? "bg-primary text-primary-foreground font-medium" : "hover:bg-accent"}`}>
                      <I size={17} className={active ? "" : "text-primary"} />
                      {!collapsed && <span className="truncate">{it.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-2.5 flex items-center justify-between">
          {!collapsed && <span className="text-[10.5px] uppercase tracking-[0.2em] text-muted-foreground pl-1">VT Asvent · v2.0.0</span>}
          <button className="btn-ghost btn-sm" onClick={() => setCollapsed(!collapsed)} aria-label="Contraer menú">
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 border-b border-border flex items-center gap-3 px-6">
          <select className="input w-56 h-9 py-0" value={s.activeChannelId ?? ""} onChange={(e) => void saveSettings({ activeChannelId: e.target.value })}>
            {channels.length === 0 && <option value="">Sin canales</option>}
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex-1 flex justify-center">
            {running ? (
              <button onClick={() => navigate({ page: "estudio" })} className="chip border-primary/40 text-primary bg-primary/10 h-7 px-3 animate-glow">
                <Loader2 size={12} className="animate-spin" /> Trabajando: {STAGES.find((x) => x.id === rs)?.label ?? "…"}
              </button>
            ) : <span className="text-[11px] uppercase tracking-widest text-primary font-semibold">Estudio de producción asistida</span>}
          </div>
          <HeaderUsage />
          <button className="btn-brand w-9 px-0" onClick={() => void saveSettings({ theme: s.theme === "dark" ? "light" : "dark" })} aria-label="Cambiar tema">
            {s.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="btn-brand w-9 px-0 relative" onClick={() => setBell(!bell)} aria-label="Avisos">
            <Bell size={16} />
            {unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-[9px] font-bold text-white flex items-center justify-center">{unread > 99 ? "99+" : unread}</span>}
          </button>
        </header>
        <main id="main-scroll" className="flex-1 overflow-y-auto">
          <div className="max-w-[1280px] mx-auto px-6 py-6">{page}</div>
        </main>
      </div>
      {bell && <NotificationsPanel onClose={() => setBell(false)} />}
      <Toaster />
    </div>
  );
}
