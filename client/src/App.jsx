import React, { useEffect } from 'react';
import AppRoutes from './routes/AppRoutes';
import { register } from './serviceWorkerRegistration';

export default function App() {
  // Register PWA Service Worker for offline instructional capabilities
  useEffect(() => {
    register({
      onSuccess: () => {
        console.log('[ARALYTICS PWA] Content cached offline.');
      },
      onUpdate: () => {
        console.log('[ARALYTICS PWA] Content updated; refresh recommended.');
      }
    });
  }, []);

  return <AppRoutes />;
}
