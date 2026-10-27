import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Keeps a splash screen up for at least `min` ms so its animation can finish, and reports progress from 0 to 100.
// Progress eases toward 92% over `min`, then creeps slowly while the app is still loading, and snaps to 100%
// once loading ends. The splash lingers for `exit` ms at 100% before `show` turns false.
export default function useSplash(loading, { min = 2800, exit = 450 } = {}) {
  const [state, setState] = useState({ show: true, progress: 0 });
  const start = useRef(performance.now());
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const minMs = useRef(prefersReducedMotion() ? Math.min(min, 600) : min);

  useEffect(() => {
    let leaveAt = null;
    const timer = setInterval(() => {
      const now = performance.now();
      const elapsed = now - start.current;
      if (leaveAt) {
        if (now >= leaveAt) { clearInterval(timer); setState({ show: false, progress: 100 }); }
        return;
      }
      if (!loadingRef.current && elapsed >= minMs.current) {
        leaveAt = now + exit;
        setState({ show: true, progress: 100 });
        return;
      }
      const t = Math.min(elapsed / minMs.current, 1);
      const eased = 1 - Math.pow(1 - t, 2);
      const creep = elapsed > minMs.current ? Math.min(4, (elapsed - minMs.current) / 2500) : 0;
      setState({ show: true, progress: eased * 92 + creep });
    }, 50);
    return () => clearInterval(timer);
  }, [exit]);

  return state;
}
