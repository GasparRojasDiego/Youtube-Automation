// Efectos de identidad: constelación, líneas curvas que fluyen, texto que se
// descifra y eco de palabra. Todos respetan «reducir movimiento» y se pausan
// cuando la ventana no está visible.
import { useEffect, useRef, useState } from "react";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const primaryHsl = () => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "228 100% 73%";

/** Constelación: puntos que derivan y se enlazan; reaccionan suavemente al ratón. */
export function Constellation({ className = "", density = 19000, max = 90, link = 150, alpha = 1 }: { className?: string; density?: number; max?: number; link?: number; alpha?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    const reduce = reduceMotion();
    let raf = 0; let w = 0, h = 0; let last = 0; let alive = true;
    let pts: { x: number; y: number; vx: number; vy: number; r: number; d: number }[] = [];
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(max, Math.floor((w * h) / density));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, r: 0.8 + Math.random() * 1.4, d: 0.35 + Math.random() * 0.65 }));
    };
    const onMove = (e: MouseEvent) => { const r = c.getBoundingClientRect(); mouse.tx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 30; mouse.ty = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 30; };
    const draw = (t: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(draw);
      if (document.visibilityState !== "visible" || t - last < 33) return; // ~30 fps
      last = t;
      const col = primaryHsl();
      mouse.x += (mouse.tx - mouse.x) * 0.06; mouse.y += (mouse.ty - mouse.y) * 0.06;
      ctx.clearRect(0, 0, w, h);
      if (!reduce) for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      const pos = pts.map((p) => ({ x: p.x + mouse.x * p.d, y: p.y + mouse.y * p.d, r: p.r }));
      ctx.lineWidth = 0.6;
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y; const d = Math.hypot(dx, dy);
        if (d < link) { ctx.strokeStyle = `hsl(${col} / ${(1 - d / link) * 0.28 * alpha})`; ctx.beginPath(); ctx.moveTo(pos[i].x, pos[i].y); ctx.lineTo(pos[j].x, pos[j].y); ctx.stroke(); }
      }
      ctx.fillStyle = `hsl(${col} / ${0.6 * alpha})`;
      for (const p of pos) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    };
    resize(); raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(resize); ro.observe(c);
    window.addEventListener("mousemove", onMove);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("mousemove", onMove); };
  }, [density, max, link, alpha]);
  return <canvas ref={ref} aria-hidden className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} />;
}

/** Onda periódica que cubre `width` unidades: desplazarla un múltiplo del período es un bucle sin saltos. */
function wavePath(width: number, y: number, amp: number, period: number, phase: number) {
  const n = Math.ceil(width / period) + 1;
  let d = `M ${-period + phase} ${y}`;
  for (let i = -1; i < n; i++) {
    const x0 = i * period + phase;
    d += ` C ${x0 + period * 0.25} ${y - amp}, ${x0 + period * 0.25} ${y - amp}, ${x0 + period * 0.5} ${y}`;
    d += ` S ${x0 + period * 0.75} ${y + amp}, ${x0 + period} ${y}`;
  }
  return d;
}

/** Líneas curvas finas que fluyen lentamente (fondo). */
export function FlowLines({ className = "", lines = 7, opacity = 1 }: { className?: string; lines?: number; opacity?: number }) {
  const W = 1600, H = 900;
  const specs = Array.from({ length: lines }, (_, i) => ({
    y: H * (0.18 + (i / Math.max(1, lines - 1)) * 0.68),
    amp: 18 + ((i * 37) % 50),
    period: 520 + ((i * 131) % 380),
    phase: (i * 97) % 300,
    dur: 46 + ((i * 17) % 40),
    alpha: (0.07 + ((i * 13) % 9) / 100) * opacity,
    w: i % 3 === 0 ? 1.2 : 0.8,
  }));
  return (
    <svg aria-hidden className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice"
      style={{ maskImage: "linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)" }}>
      {specs.map((s, i) => {
        const shift = s.period * Math.max(1, Math.round(800 / s.period));
        return (
          <g key={i} className="flow-line" style={{ animationDuration: `${s.dur}s`, animationDirection: i % 2 ? "reverse" : "normal", ["--shift" as string]: `${shift}px` }}>
            <path d={wavePath(W + shift + s.period, s.y, s.amp, s.period, s.phase)} fill="none" stroke="hsl(var(--primary))" strokeOpacity={s.alpha} strokeWidth={s.w} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
  );
}

/** Capa de fondo de la app: constelación tenue + líneas que fluyen. */
export function Ambient({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[640px] h-[640px] rounded-full bg-primary/[.07] blur-3xl" />
      <div className="absolute -bottom-56 right-[-10%] w-[720px] h-[720px] rounded-full bg-primary/[.05] blur-3xl" />
      <FlowLines opacity={0.9} />
      <Constellation density={42000} max={45} link={130} alpha={0.55} />
    </div>
  );
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·";

/** Texto que se «descifra» letra a letra al aparecer o cambiar. */
export function Scramble({ text, className = "", duration = 650 }: { text: string; className?: string; duration?: number }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (reduceMotion()) { setOut(text); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const reveal = Math.floor(k * text.length);
      let s = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        s += i < reveal || ch === " " ? ch : GLYPHS[(Math.floor(t / 40) + i * 7) % GLYPHS.length];
      }
      setOut(s);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, duration]);
  return <span className={className} aria-label={text}>{out}</span>;
}

/** Eco de palabra: la palabra replicada en contorno, derivando detrás de un título. */
export function EchoWord({ word, className = "" }: { word: string; className?: string }) {
  const unit = `${word.toUpperCase()}  ·  `;
  const row = unit.repeat(Math.max(4, Math.ceil(60 / Math.max(1, unit.length))));
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-x-0 overflow-hidden select-none whitespace-nowrap ${className}`}>
      <div className="echo-row w-max font-extrabold text-[64px] leading-[0.95] echo-text">{row}{row}</div>
      <div className="echo-row rev w-max font-extrabold text-[64px] leading-[0.95] echo-text opacity-60 -translate-x-24">{row}{row}</div>
    </div>
  );
}

export function AtrilLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size} className={className} aria-hidden>
      <path d="M 744 300 A 300 300 0 1 0 812 512" fill="none" stroke="#9DB0F1" strokeWidth="72" strokeLinecap="round" />
      <path d="M 440 380 L 640 512 L 440 644 Z" fill="currentColor" stroke="currentColor" strokeWidth="28" strokeLinejoin="round" />
      <circle cx="812" cy="300" r="44" fill="currentColor" />
    </svg>
  );
}
