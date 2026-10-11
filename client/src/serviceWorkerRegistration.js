export function register(config = {}) {
  if (!('serviceWorker' in navigator)) return;
  const start = () => navigator.serviceWorker.register('/sw.js').then(registration => {
    registration.onupdatefound = () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.onstatechange = () => {
        if (worker.state === 'installed') (navigator.serviceWorker.controller ? config.onUpdate : config.onSuccess)?.(registration);
      };
    };
  }).catch(error => console.warn('Offline setup unavailable:', error.message));
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
export async function unregister() {
  if ('serviceWorker' in navigator) for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
}
