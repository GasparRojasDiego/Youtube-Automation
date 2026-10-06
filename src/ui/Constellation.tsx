// Constelación (§8.1): puntos que derivan y se enlazan; color del primario.
import { useEffect, useRef } from "react";

export function Constellation({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0; let w = 0, h = 0;
    let pts: { x: number; y: number; vx: number; vy: number; r: number; d: number }[] = [];
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const color = () => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "228 100% 73%";
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(90, Math.floor((w * h) / 19000));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.55, vy: (Math.random() - 0.5) * 0.55, r: 0.9 + Math.random() * 1.5, d: 0.35 + Math.random() * 0.65 }));
    };
    const onMove = (e: MouseEvent) => { const r = c.getBoundingClientRect(); mouse.tx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 34; mouse.ty = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 34; };
    const draw = () => {
      const col = color();
      mouse.x += (mouse.tx - mouse.x) * 0.07; mouse.y += (mouse.ty - mouse.y) * 0.07;
      ctx.clearRect(0, 0, w, h);
      if (!reduce) for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      const pos = pts.map((p) => ({ x: p.x + mouse.x * p.d, y: p.y + mouse.y * p.d, r: p.r }));
      ctx.lineWidth = 0.7;
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y; const d = Math.hypot(dx, dy);
        if (d < 150) { ctx.strokeStyle = `hsl(${col} / ${(1 - d / 150) * 0.3})`; ctx.beginPath(); ctx.moveTo(pos[i].x, pos[i].y); ctx.lineTo(pos[j].x, pos[j].y); ctx.stroke(); }
      }
      ctx.fillStyle = `hsl(${col} / 0.62)`;
      for (const p of pos) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      if (document.visibilityState === "visible") raf = requestAnimationFrame(draw); else setTimeout(() => { raf = requestAnimationFrame(draw); }, 500);
    };
    resize(); draw();
    window.addEventListener("resize", resize); window.addEventListener("mousemove", onMove);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("mousemove", onMove); };
  }, []);
  return <canvas ref={ref} aria-hidden className={`absolute inset-0 w-full h-full -z-10 ${className}`} />;
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
