import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Constellation, AtrilLogo } from "../ui/Constellation";
import { createChannel } from "../lib/repo";
import { saveSettings } from "../lib/settings";
import { navigate } from "../ui/nav";

export function Welcome() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    const ch = await createChannel(name.trim() || "Mi canal");
    await saveSettings({ activeChannelId: ch.id, onboarded: true });
    navigate({ page: "ajustes" });
  };
  return (
    <div className="relative h-full flex items-center justify-center overflow-hidden isolate">
      <Constellation />
      <div className="card bg-card/95 backdrop-blur max-w-md w-full p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <AtrilLogo size={56} className="text-primary mb-3" />
          <div className="font-extrabold tracking-[0.35em] pl-[0.35em] text-2xl">ATRIL</div>
          <p className="text-sm text-muted-foreground mt-3">La app produce; tú revisas y apruebas. Nada se publica sin tu permiso.</p>
        </div>
        <div className="mt-7 space-y-2">
          <label className="label">Nombre del canal</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi canal" onKeyDown={(e) => e.key === "Enter" && void start()} />
        </div>
        <button className="btn-primary w-full mt-4 h-10" disabled={busy} onClick={() => void start()}>
          Empezar <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
