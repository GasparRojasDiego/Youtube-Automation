import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AtrilLogo } from "../ui/Logo";
import { createChannel } from "../lib/repo";
import { getSettings, saveSettings } from "../lib/settings";
import { useBus } from "../lib/bus";
import { appVersion } from "../lib/updater";
import { AccentPicker } from "../ui/AccentPicker";
import { resolveDark } from "../ui/theme";
import { navigate } from "../ui/nav";

export function Welcome() {
  useBus("settings");
  const s = getSettings();
  const [name, setName] = useState("");
  const [ver, setVer] = useState("");
  useEffect(() => { void appVersion().then(setVer); }, []);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    const ch = await createChannel(name.trim() || "Mi canal");
    await saveSettings({ activeChannelId: ch.id, onboarded: true });
    navigate({ page: "ajustes" });
  };
  return (
    <div className="relative h-full flex items-center justify-center overflow-hidden isolate">
      <div className="card max-w-md w-full p-8 shadow-xl">
        {/* Como la entrada de Frame: la entidad a la izquierda y el año y la versión a la derecha */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-6"><span>VT Asvent</span><span className="tabular">2026{ver ? ` · v${ver}` : ""}</span></div>
        <div className="flex flex-col items-center text-center">
          <AtrilLogo size={56} className="text-primary mb-3" />
          <div className="font-extrabold tracking-[0.35em] pl-[0.35em] text-2xl">ATRIL</div>
          <p className="text-sm text-muted-foreground mt-3">La app produce; tú revisas y apruebas. Nada se publica sin tu permiso.</p>
        </div>
        <div className="mt-7 space-y-2">
          <label className="label">Nombre del canal</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi canal" onKeyDown={(e) => e.key === "Enter" && void start()} />
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="label">Color de la app</span>
          <AccentPicker value={s.accent} dark={resolveDark(s.theme)} onChange={(a) => void saveSettings({ accent: a })} size={20} />
        </div>
        <button className="btn-primary w-full mt-5 h-10" disabled={busy} onClick={() => void start()}>
          Empezar <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
