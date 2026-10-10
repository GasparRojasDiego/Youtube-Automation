// Identidad: constelación de fondo (respeta «reducir movimiento» y se pausa
// cuando la ventana no está visible) y el logotipo.
import { useEffect, useRef } from "react";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const primaryHsl = () => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "228 100% 73%";

/**
 * Constelación: puntos repartidos de forma pareja (una celda de una cuadrícula
 * por punto, con desorden), que derivan, titilan y se enlazan; unos pocos son
 * estrellas brillantes. Reacciona suavemente al ratón.
 */
export function Constellation({ className = "", density = 6500, max = 150, link = 125, alpha = 1 }: { className?: string; density?: number; max?: number; link?: number; alpha?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    const reduce = reduceMotion();
    let raf = 0; let w = 0, h = 0; let last = 0; let alive = true;
    let pts: { x: number; y: number; vx: number; vy: number; r: number; d: number; ph: number; star: boolean }[] = [];
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Reparto parejo: cuadrícula con una celda por punto y posición al azar dentro de cada celda
      const n = Math.max(8, Math.min(max, Math.floor((w * h) / density)));
      const cols = Math.max(1, Math.round(Math.sqrt((n * w) / Math.max(1, h)))); const rows = Math.max(1, Math.ceil(n / cols));
      const cw = w / cols, ch = h / rows;
      pts = [];
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols && pts.length < n; k++) {
        const star = Math.random() < 0.08;
        pts.push({ x: (k + 0.15 + Math.random() * 0.7) * cw, y: (r + 0.15 + Math.random() * 0.7) * ch, vx: (Math.random() - 0.5) * 0.32, vy: (Math.random() - 0.5) * 0.32,
          r: star ? 2.2 + Math.random() * 1.1 : 1.1 + Math.random() * 1.2, d: 0.35 + Math.random() * 0.65, ph: Math.random() * Math.PI * 2, star });
      }
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
      // Al salir por un borde entra por el opuesto: el reparto sigue parejo (rebotar los amontona en los bordes)
      if (!reduce) for (const p of pts) { p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h; }
      const pos = pts.map((p) => ({ x: p.x + mouse.x * p.d, y: p.y + mouse.y * p.d, p }));
      ctx.lineWidth = 0.8;
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y; const d = Math.hypot(dx, dy);
        if (d < link) { ctx.strokeStyle = `hsl(${col} / ${(1 - d / link) * 0.42 * alpha})`; ctx.beginPath(); ctx.moveTo(pos[i].x, pos[i].y); ctx.lineTo(pos[j].x, pos[j].y); ctx.stroke(); }
      }
      for (const { x, y, p } of pos) {
        const tw = reduce ? 1 : 0.7 + 0.3 * Math.sin(t / 900 + p.ph);   // titileo suave
        if (p.star) { ctx.fillStyle = `hsl(${col} / ${0.16 * alpha * tw})`; ctx.beginPath(); ctx.arc(x, y, p.r * 3.2, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = `hsl(${col} / ${(p.star ? 0.95 : 0.78) * alpha * tw})`;
        ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    };
    resize(); raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(resize); ro.observe(c);
    window.addEventListener("mousemove", onMove);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("mousemove", onMove); };
  }, [density, max, link, alpha]);
  return <canvas ref={ref} aria-hidden className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} />;
}

/** Capa de fondo de la app: constelación repartida por toda la ventana. */
export function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <Constellation density={16000} max={110} link={140} alpha={0.55} />
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
