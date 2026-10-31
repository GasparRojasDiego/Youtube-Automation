// Muestras del color de la app (como en Wire): una por acento, con su color real en el tema actual.
import { Check } from "lucide-react";
import { ACCENTS, type AccentId } from "./theme";

export function AccentPicker({ value, dark, onChange, size = 22 }: { value: AccentId; dark: boolean; onChange: (a: AccentId) => void; size?: number }) {
  return (
    <div role="radiogroup" aria-label="Color de la app" className="flex items-center gap-2">
      {ACCENTS.map((a) => {
        const on = value === a.id;
        return (
          <button key={a.id} type="button" role="radio" aria-checked={on} aria-label={a.name} title={a.name} onClick={() => onChange(a.id)}
            style={{ width: size, height: size, background: `hsl(${dark ? a.dark : a.light})` }}
            className={`rounded-full grid place-items-center outline outline-2 outline-offset-2 transition-[outline-color,transform] duration-200 hover:scale-110 ${on ? "outline-foreground/70" : "outline-transparent"}`}>
            {on && <Check size={Math.round(size * 0.55)} strokeWidth={3} className={dark ? "text-black/70" : "text-white"} />}
          </button>
        );
      })}
    </div>
  );
}
