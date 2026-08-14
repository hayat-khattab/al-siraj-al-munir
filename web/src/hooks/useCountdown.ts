import { useEffect, useRef, useState } from 'react';

export interface Countdown {
  remaining: number;
  expired: boolean;
}

export function useCountdown(remainingSeconds: number | null): Countdown {
  const [now, setNow] = useState<number>(() => performance.now() / 1000);
  const startedAtRef = useRef<number | null>(null);
  const remainRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (remainingSeconds === null) return;
    const t0 = performance.now() / 1000;
    // anchor: assume server-reported remaining is exact at mount time.
    // From here on we count down using monotonic performance.now() so device
    // clock changes cannot interfere.
    startedAtRef.current = t0;
    remainRef.current = remainingSeconds;
    const tick = () => {
      if (!startedAtRef.current || remainRef.current === null) return;
      const elapsed = performance.now() / 1000 - startedAtRef.current;
      setNow(performance.now() / 1000);
      remainRef.current = Math.max(0, remainingSeconds - elapsed);
      if (remainRef.current > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [remainingSeconds]);

  const remaining = remainRef.current ?? remainingSeconds ?? 0;
  return { remaining: Math.ceil(Math.max(0, remaining)), expired: remaining <= 0 };
}

export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}