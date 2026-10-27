import React, { useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { syncReading } from './utils/offlineLearning';
import AppRoutes from './routes/AppRoutes';
import { register } from './serviceWorkerRegistration';

export default function App() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || user.role !== 'STUDENT' || !user.email_verified || user.enrollment_status !== 'APPROVED') return;
    const sync = () => syncReading(user.id).catch(() => {});
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [user?.id, user?.role, user?.email_verified, user?.enrollment_status]);
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
