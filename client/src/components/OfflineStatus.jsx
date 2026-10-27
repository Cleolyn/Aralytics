import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from './icons';
import { useAuth } from '../context/AuthContext';
import { syncReading } from '../utils/offlineLearning';

export default function OfflineStatus() {
  const { user } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const update = () => {
      const isOnline = navigator.onLine;
      setOnline(isOnline);
      if (isOnline && user?.id) {
        syncReading(user.id).catch(() => {});
      }
    };
    const onSyncStatus = e => {
      setToast(e.detail);
      if (e.detail?.state === 'synced' || e.detail?.state === 'queued') {
        setTimeout(() => setToast(null), 4000);
      }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('aralytics:sync-status', onSyncStatus);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('aralytics:sync-status', onSyncStatus);
    };
  }, [user?.id]);

  const Icon = online ? Wifi : WifiOff;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      {toast && (
        <span
          role="status"
          aria-live="polite"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 4,
            background: 'var(--colors-canvas-soft)',
            border: '1px solid var(--border-subtle)',
            fontSize: 12,
            color: 'var(--colors-ink)'
          }}
        >
          {toast.state === 'syncing' ? <RefreshCw size={13} /> : <CheckCircle2 size={13} />}
          <span>{toast.message}</span>
        </span>
      )}
      <span
        className={`connection ${online ? '' : 'offline'}`}
        role="status"
        title={
          online
            ? 'Connected to the internet'
            : 'Offline. You can open saved lessons. Quizzes need internet.'
        }
      >
        <Icon size={16} aria-hidden="true" />
        <span>{online ? 'Online' : 'Offline · saved lessons only'}</span>
      </span>
    </span>
  );
}
