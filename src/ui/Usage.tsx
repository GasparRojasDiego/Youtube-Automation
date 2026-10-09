// Estado del plan de Claude (ventana de 5 h), con cuenta regresiva viva.
import { useEffect, useState } from "react";
import { useBus } from "../lib/bus";
import { getLimits, type ClaudeLimits } from "../lib/usage";

export function useLimits(): ClaudeLimits | null {
  const tick = useBus("usage");
  const [l, setL] = useState<ClaudeLimits | null>(null);
  const [, force] = useState(0);
  useEffect(() => { void getLimits().then(setL); }, [tick]);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 60_000); return () => clearInterval(t); }, []);
  return l;
}
