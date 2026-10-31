// Logotipo de ATRIL: el aro toma un tono claro del color de la app (--logo-ring) y el centro, el color del texto que lo rodea.
export function AtrilLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size} className={className} aria-hidden>
      <path d="M 744 300 A 300 300 0 1 0 812 512" fill="none" style={{ stroke: "hsl(var(--logo-ring))" }} strokeWidth="72" strokeLinecap="round" />
      <path d="M 440 380 L 640 512 L 440 644 Z" fill="currentColor" stroke="currentColor" strokeWidth="28" strokeLinejoin="round" />
      <circle cx="812" cy="300" r="44" fill="currentColor" />
    </svg>
  );
}
