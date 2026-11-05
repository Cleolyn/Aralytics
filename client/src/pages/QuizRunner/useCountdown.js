import { useEffect, useState } from 'react';

/** Whole seconds left until `deadline` (ms timestamp), ticking every second while `running`. */
export default function useCountdown(deadline, running) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (deadline) setNow(Date.now());
  }, [deadline]);

  useEffect(() => {
    if (!deadline || !running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline, running]);

  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
