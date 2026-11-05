import { useEffect, useRef } from 'react';

const DEBOUNCE_MS = 1000;

/**
 * Records leaving the quiz screen (window blur, hidden tab, exiting full screen)
 * while `enabled`. Events within a second of each other, or while `isPaused()`
 * returns true (e.g. during submission), are ignored.
 * `onEvent` receives a frozen { event_type, timestamp } record.
 */
export default function useProctoring({ enabled, isPaused, onEvent }) {
  const handlers = useRef({ isPaused, onEvent });
  handlers.current = { isPaused, onEvent };
  const lastEvent = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const record = type => {
      if (Date.now() - lastEvent.current < DEBOUNCE_MS || handlers.current.isPaused?.()) return;
      lastEvent.current = Date.now();
      handlers.current.onEvent(Object.freeze({ event_type: type, timestamp: new Date().toISOString() }));
    };
    const onBlur = () => record('WINDOW_MINIMIZE');
    const onVisibility = () => {
      if (document.hidden) record('TAB_SWITCH');
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) record('FULLSCREEN_EXIT');
    };

    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [enabled]);
}
