import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export default function OfflineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const Icon = online ? Wifi : WifiOff;
  return <span className={`connection ${online ? '' : 'offline'}`} role="status" title={online ? 'Connected to the internet' : 'Offline. Open previously downloaded lessons; quizzes require internet.'}><Icon size={16} aria-hidden="true" /><span>{online ? 'Online' : 'Offline · lessons only'}</span></span>;
}
