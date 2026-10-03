/**
 * Aralytics PWA Service Worker Registration Module
 * Standard compliant service worker manager for offline caching (SRS NFR-02, FR-49, FR-50)
 */

const isLocalhost = Boolean(
  typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(
      /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
    )
  )
);

export function register(config) {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    const swUrl = '/sw.js';

    window.addEventListener('load', () => {
      if (isLocalhost) {
        // This is running on localhost. Check if service worker still exists.
        checkValidServiceWorker(swUrl, config);
        navigator.serviceWorker.ready
          .then(() => {
            console.log('[ARALYTICS PWA] Service Worker running on localhost with cache support.');
          })
          .catch((err) => {
            console.warn('[ARALYTICS PWA] Localhost SW readiness notice:', err);
          });
      } else {
        // Is not localhost. Just register service worker directly
        registerValidSW(swUrl, config);
      }
    });
  }
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              console.log('[ARALYTICS PWA] New version is available and will take effect after reload.');
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            } else {
              console.log('[ARALYTICS PWA] Core assets cached for offline learning (DepEd AP10).');
              if (config && config.onSuccess) {
                config.onSuccess(registration);
              }
            }
          }
        };
      };
    })
    .catch((error) => {
      console.warn('[ARALYTICS PWA] Error during service worker registration:', error);
    });
}

function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('[ARALYTICS PWA] No internet connection found. Operating in offline learning cache mode.');
    });
}

export function unregister() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error('[ARALYTICS PWA] Unregister error:', error.message);
      });
  }
}
