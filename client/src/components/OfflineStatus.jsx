import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export default function OfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return (
      <span className="badge" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', fontSize: '0.72rem' }}>
        <Wifi size={13} /> Online Sync Active
      </span>
    );
  }

  return (
    <span className="badge" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: '0.72rem' }}>
      <WifiOff size={13} /> Offline Mode (Materials Only)
    </span>
  );
}
