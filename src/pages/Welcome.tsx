import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Constellation, AtrilLogo } from "../ui/Constellation";
import { createChannel } from "../lib/repo";
import { saveSettings } from "../lib/settings";
import { saveSkill, SKILL_TEMPLATE, parseSkillFile } from "../lib/skills";
import { navigate } from "../ui/nav";

export function Welcome() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    const ch = await createChannel(name.trim() || "Mi canal");
    // Una habilidad de ejemplo, desactivada: solo enseña el formato.
    const f = parseSkillFile(SKILL_TEMPLATE);
    await saveSkill({ channel_id: ch.id, name: "Ejemplo de formato (desactivada)", description: "Plantilla para crear tus habilidades", scopes: ["script"], content: f.body, enabled: false });
    await saveSettings({ activeChannelId: ch.id, onboarded: true });
    navigate({ page: "guia" });
  };
  return (
    <div className="relative h-full flex items-center justify-center overflow-hidden isolate">
      <Constellation />
      <div className="card bg-card/95 backdrop-blur max-w-md w-full p-8 shadow-2xl">
        <div className="flex justify-between text-[10.5px] uppercase tracking-[0.2em] text-muted-foreground mb-6">
          <span>VT Asvent</span><span>2026 · v1.0.0</span>
        </div>
        <div className="flex flex-col items-center text-center">
          <AtrilLogo size={56} className="text-primary mb-3" />
          <div className="font-extrabold tracking-[0.35em] pl-[0.35em] text-2xl">ATRIL</div>
          <p className="text-sm text-muted-foreground mt-3">
            Estudio de producción asistida: la app hace el trabajo repetitivo y tú decides en cada punto de revisión. Nada se publica sin tu aprobación.
          </p>
        </div>
        <div className="mt-7 space-y-2">
          <label className="label">Nombre del primer canal (puedes cambiarlo luego)</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Canal 1" onKeyDown={(e) => e.key === "Enter" && void start()} />
        </div>
        <button className="btn-primary w-full mt-4 h-10" disabled={busy} onClick={() => void start()}>
          Empezar <ArrowRight size={16} />
        </button>
        <p className="text-[11px] text-muted-foreground text-center mt-4">Te llevaré a la guía de configuración inicial.</p>
      </div>
    </div>
  );
}
