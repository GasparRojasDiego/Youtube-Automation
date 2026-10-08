// Efectos de sonido sintetizados con ffmpeg (sin descargas ni licencias):
// cada tipo es una receta de señales y filtros, con variantes para no repetir.
// Se usan cuando no hay un efecto mejor en la biblioteca, Freesound o ElevenLabs.
import { ffmpeg } from "../providers/ffmpeg";
import { fs } from "../lib/ipc";

export const SFX_KINDS = ["whoosh", "swoosh", "riser", "impact", "boom", "hit", "thud", "sub drop", "glitch", "click", "pop", "ding", "bell",
  "camera shutter", "typewriter", "paper", "heartbeat", "clock ticking", "radio static", "wind", "rain", "drone"] as const;
export type SfxKind = (typeof SFX_KINDS)[number];

const RULES: [RegExp, SfxKind][] = [
  [/sub ?drop|bass ?drop|low ?drop/, "sub drop"], [/riser|rising|build ?up|tension rise|uplifter/, "riser"], [/swoosh|swipe|slide|swish/, "swoosh"],
  [/whoosh|woosh|transition|fly ?by|pass ?by/, "whoosh"], [/boom|explosion|thunder|blast/, "boom"], [/impact|slam|punch|reveal|braam|hit/, "impact"],
  [/thud|knock|stomp|drop|footstep/, "thud"], [/glitch|digital|error|data|corrupt|record scratch/, "glitch"], [/camera|shutter|photo|snapshot/, "camera shutter"],
  [/typewriter|typing|keyboard|keys/, "typewriter"], [/paper|page|rustle|document/, "paper"], [/heart/, "heartbeat"], [/clock|tick/, "clock ticking"],
  [/radio|static|interference|white noise/, "radio static"], [/wind|breeze|air/, "wind"], [/rain|storm|drizzle/, "rain"], [/drone|hum|ambient|atmos|bed|pad/, "drone"],
  [/ding|chime|success|correct|cash/, "ding"], [/bell|gong/, "bell"], [/pop|bubble|blip|notification|ui|appear/, "pop"], [/click|tap|button|switch/, "click"],
];

/** Tipo sintetizable más cercano a una descripción libre ("cinematic whoosh short" → whoosh). */
export function sfxKind(type: string, query = ""): SfxKind {
  const t = `${type} ${query}`.toLowerCase();
  const exact = SFX_KINDS.find((k) => type.toLowerCase().trim() === k);
  if (exact) return exact;
  for (const [re, k] of RULES) if (re.test(t)) return k;
  return "whoosh";
}

interface Recipe { d: number; offset: number; src: string; chain: string }

/** Receta de cada efecto. `v` cambia ligeramente tono y ruido (variantes). */
export function sfxRecipe(kind: SfxKind, v = 0): Recipe {
  const k = 1 + ((v * 37) % 11 - 5) * 0.012;       // ±6 % de tono
  const f = (x: number) => (x * k).toFixed(2);
  const noise = (d: number, color = "pink", amp = 0.8) => `anoisesrc=d=${d}:c=${color}:r=48000:a=${amp}:s=${7 + v}`;
  const ev = (d: number, expr: string) => `aevalsrc='${expr}':s=48000:d=${d}`;
  switch (kind) {
    case "whoosh": return { d: 1.0, offset: -0.42, src: noise(1.0, "pink", 0.9),
      chain: `asplit=3[a][b][c];[a]bandpass=f=${f(350)}:w=1.2:t=o,volume='exp(-pow((t-0.40)/0.17,2))':eval=frame[a1];[b]bandpass=f=${f(1400)}:w=1.2:t=o,volume='exp(-pow((t-0.48)/0.14,2))':eval=frame[b1];[c]highpass=f=${f(3500)},volume='0.5*exp(-pow((t-0.55)/0.12,2))':eval=frame[c1];[a1][b1][c1]amix=inputs=3:normalize=0,aeval='val(0)*(0.5+0.45*cos(PI*t/1.0))|val(0)*(0.5-0.45*cos(PI*t/1.0))':c=stereo` };
    case "swoosh": return { d: 0.55, offset: -0.22, src: noise(0.55, "white", 0.8),
      chain: `highpass=f=${f(1800)},bandpass=f=${f(3800)}:w=1.5:t=o,volume='exp(-pow((t-0.24)/0.09,2))':eval=frame,aeval='val(0)*(1-t/0.55)|val(0)*(t/0.55)':c=stereo` };
    case "riser": return { d: 2.2, offset: -2.0, src: ev(2.2, `0.45*sin(2*PI*(${f(180)}*t+${f(900)}*t*t/4.4))*pow(t/2.2,2)+0.25*(random(0)*2-1)*pow(t/2.2,3)`),
      chain: `highpass=f=120,afade=t=out:st=2.12:d=0.08,aecho=0.6:0.5:60:0.3` };
    case "impact": return { d: 1.8, offset: 0, src: ev(1.8, `0.95*sin(2*PI*${f(52)}*t*(1+0.6*exp(-6*t)))*exp(-3.2*t)+0.7*(random(0)*2-1)*exp(-16*t)`),
      chain: `lowpass=f=${f(2400)},aecho=0.7:0.55:90|180:0.35|0.2,alimiter=limit=0.95` };
    case "hit": return { d: 0.9, offset: 0, src: ev(0.9, `0.9*sin(2*PI*${f(85)}*t)*exp(-7*t)+0.8*(random(0)*2-1)*exp(-30*t)`),
      chain: `lowpass=f=${f(3500)},aecho=0.6:0.4:40:0.25` };
    case "boom": return { d: 3.0, offset: 0, src: ev(3.0, `0.95*sin(2*PI*${f(60)}*exp(-0.9*t)*t)*exp(-1.4*t)+0.6*(random(0)*2-1)*exp(-3*t)`),
      chain: `lowpass=f=${f(420)},aecho=0.8:0.6:120|260:0.4|0.25,alimiter=limit=0.95` };
    case "thud": return { d: 0.6, offset: 0, src: ev(0.6, `0.95*sin(2*PI*${f(70)}*t*(1-0.3*t))*exp(-11*t)+0.4*(random(0)*2-1)*exp(-40*t)`), chain: `lowpass=f=${f(700)}` };
    case "sub drop": return { d: 1.8, offset: 0, src: ev(1.8, `0.95*sin(2*PI*(${f(130)}*t-${f(55)}*t*t))*exp(-1.3*t)`), chain: `lowpass=f=300,afade=t=in:d=0.01` };
    case "glitch": return { d: 0.55, offset: 0, src: ev(0.55, `0.55*gt(sin(floor(t*42)*78.233+${v}),-0.2)*(sgn(sin(2*PI*(220+1600*abs(sin(floor(t*28)*12.9898+${v})))*t))*0.7+(random(0)*2-1)*0.3)`),
      chain: `acrusher=bits=6:samples=6:mix=0.8,highpass=f=150` };
    case "click": return { d: 0.08, offset: 0, src: ev(0.08, `(random(0)*2-1)*exp(-180*t)+0.6*sin(2*PI*${f(2200)}*t)*exp(-120*t)`), chain: `highpass=f=900` };
    case "pop": return { d: 0.22, offset: 0, src: ev(0.22, `0.8*sin(2*PI*(${f(900)}*t-${f(1100)}*t*t))*exp(-24*t)`), chain: `afade=t=in:d=0.003` };
    case "ding": return { d: 1.8, offset: 0, src: ev(1.8, `(0.6*sin(2*PI*${f(1318)}*t)+0.25*sin(2*PI*${f(2637)}*t)*exp(-2*t)+0.1*sin(2*PI*${f(3951)}*t)*exp(-4*t))*exp(-2.6*t)`), chain: `afade=t=in:d=0.004,aecho=0.6:0.4:80:0.2` };
    case "bell": return { d: 3.0, offset: 0, src: ev(3.0, `(0.5*sin(2*PI*${f(440)}*t)*exp(-1.1*t)+0.3*sin(2*PI*${f(1214)}*t)*exp(-1.8*t)+0.2*sin(2*PI*${f(2376)}*t)*exp(-2.6*t)+0.12*sin(2*PI*${f(3929)}*t)*exp(-3.5*t))`), chain: `afade=t=in:d=0.004,aecho=0.7:0.5:110:0.3` };
    case "camera shutter": return { d: 0.4, offset: 0, src: ev(0.4, `(random(0)*2-1)*(exp(-90*t)+0.8*exp(-120*abs(t-0.11))*gte(t,0.11))+0.5*sin(2*PI*${f(140)}*t)*exp(-30*t)`), chain: `bandpass=f=${f(2800)}:w=2.2:t=o,volume=2.2` };
    case "typewriter": return { d: 1.7, offset: 0, src: ev(1.7, `(random(0)*2-1)*exp(-260*mod(t+0.025*sin(t*9.1),0.118))*(0.7+0.3*sin(t*31))`), chain: `bandpass=f=${f(2400)}:w=2:t=o,volume=2.5,afade=t=out:st=1.55:d=0.15` };
    case "paper": return { d: 0.9, offset: 0, src: ev(0.9, `(random(0)*2-1)*(0.25+0.75*abs(sin(t*41)*sin(t*17.3)))*sin(PI*t/0.9)`), chain: `bandpass=f=${f(3200)}:w=2.5:t=o,volume=1.8` };
    case "heartbeat": return { d: 1.9, offset: 0, src: ev(1.9, `0.95*sin(2*PI*${f(48)}*t)*(exp(-22*mod(t,0.95))+0.75*exp(-22*abs(mod(t,0.95)-0.27))*gte(mod(t,0.95),0.27))`), chain: `lowpass=f=180,volume=1.6` };
    case "clock ticking": return { d: 3.0, offset: 0, src: ev(3.0, `(random(0)*2-1)*exp(-420*mod(t,0.5))*(0.7+0.3*eq(mod(floor(t*2),2),0))`), chain: `bandpass=f=${f(3600)}:w=1.5:t=o,volume=2.5` };
    case "radio static": return { d: 1.6, offset: 0, src: noise(1.6, "white", 0.6), chain: `bandpass=f=${f(1800)}:w=3:t=o,acrusher=bits=8:samples=3:mix=0.5,volume='0.6+0.4*sin(t*23)*sin(t*7)':eval=frame,afade=t=in:d=0.05,afade=t=out:st=1.45:d=0.15` };
    case "wind": return { d: 4.5, offset: 0, src: noise(4.5, "brown", 0.9), chain: `lowpass=f=${f(700)},highpass=f=60,volume='0.6+0.4*sin(2*PI*0.27*t)':eval=frame,afade=t=in:d=0.8,afade=t=out:st=3.6:d=0.9` };
    case "rain": return { d: 4.5, offset: 0, src: noise(4.5, "white", 0.5), chain: `highpass=f=900,lowpass=f=7500,afade=t=in:d=0.6,afade=t=out:st=3.7:d=0.8` };
    case "drone": return { d: 6.0, offset: 0, src: ev(6.0, `0.35*sin(2*PI*${f(55)}*t)+0.3*sin(2*PI*${f(55.6)}*t)+0.18*sin(2*PI*${f(110.3)}*t)+0.08*sin(2*PI*${f(164.8)}*t)*(0.5+0.5*sin(t*0.7))`), chain: `lowpass=f=900,afade=t=in:d=1.5,afade=t=out:st=4.5:d=1.5` };
  }
}

/** Ganancia (dB) para que todos los tipos queden a un nivel parecido. */
const GAIN: Partial<Record<SfxKind, number>> = { whoosh: 13, swoosh: 5, riser: 9, impact: 5, boom: 3, hit: 9, ding: 13, bell: 7, "radio static": 6, wind: 5, rain: 4, pop: 3 };

/** Argumentos de ffmpeg para sintetizar un efecto en WAV estéreo 48 kHz. */
export function synthArgs(kind: SfxKind, out: string, v = 0): string[] {
  const r = sfxRecipe(kind, v);
  const graph = `[0:a]${r.chain},aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${GAIN[kind] ?? 0}dB,alimiter=limit=0.89:level=false[out]`;
  return ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", r.src, "-filter_complex", graph, "-map", "[out]", "-t", String(r.d), "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", out];
}

/** Sintetiza (o reutiliza) un efecto. Devuelve su ruta, duración y desfase sugerido. */
export async function synthSfx(type: string, out: string, v = 0, query = ""): Promise<{ path: string; duration: number; offset: number; kind: SfxKind }> {
  const kind = sfxKind(type, query);
  const r = sfxRecipe(kind, v);
  if (!(await fs.exists(out))) await ffmpeg(synthArgs(kind, out, v));
  return { path: out, duration: r.d, offset: r.offset, kind };
}
