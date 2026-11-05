import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks whether the quiz can talk to the API: the browser's online flag plus a
 * /api/health handshake. `onReconnect` runs when the browser comes back online.
 */
export default function useServerConnection({ onReconnect } = {}) {
  const [online, setOnline] = useState(navigator.onLine);
  const [handshakeOk, setHandshakeOk] = useState(navigator.onLine);
  const reconnectRef = useRef(onReconnect);
  reconnectRef.current = onReconnect;

  const checkHandshake = useCallback(async () => {
    if (!navigator.onLine) {
      setOnline(false);
      setHandshakeOk(false);
      return false;
    }
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      setOnline(res.ok);
      setHandshakeOk(res.ok);
      return res.ok;
    } catch {
      setOnline(false);
      setHandshakeOk(false);
      return false;
    }
  }, []);

  useEffect(() => {
    const update = () => {
      const isOnline = navigator.onLine;
      setOnline(isOnline);
      if (isOnline) {
        reconnectRef.current?.();
        checkHandshake();
      } else {
        setHandshakeOk(false);
      }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [checkHandshake]);

  return { online, handshakeOk, blocked: !online || !handshakeOk, checkHandshake };
}
