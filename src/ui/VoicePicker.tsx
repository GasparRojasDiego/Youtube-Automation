// Elegir voz: lista de voces del proveedor activo en un idioma, con «Probar» (una frase de muestra que
// se guarda para no volver a pagarla) y «Elegir». VoiceField muestra la voz actual con su botón.
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Check, Mic, RotateCcw } from "lucide-react";
import { fileUrl } from "../lib/ipc";
import { listVoices, previewVoice, shortVoiceName, defaultVoice, type VoiceInfo, type VoiceLang } from "../providers/voices";
import { ttsProviderName } from "../providers/tts";
import { toast } from "../lib/events";
import { Modal, Spinner } from "./kit";

const PROVIDER: Record<string, string> = { google: "Google · Chirp 3 HD", gemini: "Gemini TTS", elevenlabs: "ElevenLabs" };
const LANG: Record<VoiceLang, string> = { es: "español", en: "inglés" };

export function VoicePicker({ open, lang, value, onClose, onPick }: { open: boolean; lang: VoiceLang; value: string; onClose: () => void; onPick: (id: string) => void }) {
  const [voices, setVoices] = useState<VoiceInfo[] | null>(null);
  const [gender, setGender] = useState<"" | "F" | "M">("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const provider = ttsProviderName();
  useEffect(() => {
    if (!open) return;
    setVoices(null);
    void listVoices(lang).then(setVoices).catch((e) => { toast("warn", "No se pudo leer la lista de voces", String(e?.message ?? e)); setVoices([]); });
    return () => { audio.current?.pause(); setPlaying(null); };
  }, [open, lang]);
  const shown = useMemo(() => (voices ?? []).filter((v) => (!gender || v.gender === gender) && (!q.trim() || `${v.label} ${v.note ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [voices, gender, q]);
  const play = async (v: VoiceInfo) => {
    if (playing === v.id) { audio.current?.pause(); setPlaying(null); return; }
    setBusy(v.id);
    try {
      const path = await previewVoice(v, lang);
      audio.current?.pause();
      const a = new Audio(fileUrl(path));
      audio.current = a;
      a.onended = () => setPlaying(null);
      await a.play();
      setPlaying(v.id);
    } catch (e: any) { toast("warn", "No se pudo probar la voz", String(e?.userMessage ?? e?.message ?? e)); }
    finally { setBusy(null); }
  };
  return (
    <Modal open={open} onClose={onClose} wide title={`Voz en ${LANG[lang]} · ${PROVIDER[provider] ?? provider}`}
      footer={<span className="flex-1 text-[11.5px] text-muted-foreground">«Probar» narra una frase de muestra una sola vez (unos 100 caracteres) y la guarda para las siguientes.</span>}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input className="input flex-1 min-w-[180px]" placeholder="Buscar voz…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="inline-flex h-9 p-0.5 rounded-md border border-border bg-background/60">
          {([["", "Todas"], ["F", "Mujer"], ["M", "Hombre"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setGender(k)} className={`px-3 rounded text-[13px] font-medium ${gender === k ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
      </div>
      {voices === null ? <div className="py-10 grid place-items-center"><Spinner size={20} /></div>
        : !shown.length ? <div className="py-8 text-center text-sm text-muted-foreground">{provider === "elevenlabs" ? "Añade la clave de ElevenLabs en Ajustes → Claves para ver tus voces." : "Sin voces con ese filtro."}</div>
          : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 max-h-[56vh] overflow-auto pr-1">
              {shown.map((v) => {
                const on = v.id === value;
                return (
                  <div key={v.id} className={`rounded-lg border p-2.5 flex items-center gap-2 ${on ? "border-primary bg-primary/5" : "border-border"}`}>
                    <button type="button" onClick={() => void play(v)} disabled={!!busy && busy !== v.id} title="Probar"
                      className="w-9 h-9 shrink-0 rounded-full grid place-items-center bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50">
                      {busy === v.id ? <Spinner size={14} /> : playing === v.id ? <Square size={13} /> : <Play size={14} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium truncate">{v.label}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{v.gender === "F" ? "Mujer" : v.gender === "M" ? "Hombre" : ""}{v.note ? ` · ${v.note}` : ""}</div>
                    </div>
                    <button type="button" className={on ? "btn-brand btn-sm" : "btn-ghost btn-sm"} onClick={() => { onPick(v.id); onClose(); }}>{on ? <><Check size={13} /> Elegida</> : "Elegir"}</button>
                  </div>
                );
              })}
            </div>
          )}
    </Modal>
  );
}

/** Campo de voz: la elegida (o la de Ajustes) con «Elegir…» y, si es propia, «Quitar». */
export function VoiceField({ lang, value, onChange, disabled, inheritLabel }: { lang: VoiceLang; value: string | null | undefined; onChange: (id: string | null) => void; disabled?: boolean; inheritLabel?: string }) {
  const [open, setOpen] = useState(false);
  const shown = value ? shortVoiceName(value) : `${inheritLabel ?? "La de Ajustes"} (${shortVoiceName(defaultVoice(lang)) || "—"})`;
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-[13px] ${value ? "border-primary/40 bg-primary/5 text-foreground" : "border-border text-muted-foreground"}`}><Mic size={13} /> {shown}</span>
      <button type="button" className="btn-ghost btn-sm" disabled={disabled} onClick={() => setOpen(true)}>Elegir…</button>
      {value && !disabled && <button type="button" className="btn-ghost btn-sm" title="Volver a la voz de Ajustes" onClick={() => onChange(null)}><RotateCcw size={13} /></button>}
      <VoicePicker open={open} lang={lang} value={value ?? defaultVoice(lang)} onClose={() => setOpen(false)} onPick={(id) => onChange(id)} />
    </div>
  );
}
