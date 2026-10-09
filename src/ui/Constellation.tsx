// Identidad: constelación de fondo (respeta «reducir movimiento» y se pausa
// cuando la ventana no está visible) y el logotipo.
import { useEffect, useRef } from "react";

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

/** Capa de fondo de la app: constelación tenue y dos halos de color. */
export function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[640px] h-[640px] rounded-full bg-primary/[.07] blur-3xl" />
      <div className="absolute -bottom-56 right-[-10%] w-[720px] h-[720px] rounded-full bg-primary/[.05] blur-3xl" />
      <Constellation density={42000} max={45} link={130} alpha={0.55} />
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
