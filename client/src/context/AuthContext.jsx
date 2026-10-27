import React, { createContext, useContext, useEffect, useCallback, useState, useRef } from 'react';
import { useUser, useSession, useAuth as useClerkAuth } from '@clerk/react';
import { setTokenGetter } from '../services/api';
import { syncVerifiedAccount } from '../services/auth';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const { user: clerkUser, isLoaded } = useUser();
  const { session } = useSession();
  const { signOut, getToken } = useClerkAuth();
  const [user, setUser] = useState(null);
  const [syncing, setSyncing] = useState(true);
  const [authError, setAuthError] = useState('');
  const [revision, setRevision] = useState(0);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const profileRef = useRef(null);
  const syncGenerationRef = useRef(0);
  const sessionTask = session?.currentTask?.key || null;
  const refreshUser = useCallback(() => setRevision(value => value + 1), []);
  const clearAuthError = useCallback(() => setAuthError(''), []);

  useEffect(() => {
    if (isLoaded) { setLoadTimedOut(false); return; }
    const timer = setTimeout(() => {
      setLoadTimedOut(true); setSyncing(false);
      setAuthError('Sign-in could not load. Check your connection and reload the page.');
    }, 12000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  useEffect(() => {
    setTokenGetter(getToken);
    return () => setTokenGetter(null);
  }, [getToken]);

  useEffect(() => {
    const expired = () => refreshUser();
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, [refreshUser]);

  useEffect(() => {
    if (!isLoaded) return;
    const generation = ++syncGenerationRef.current;
    let cancelled = false;
    const active = () => !cancelled && generation === syncGenerationRef.current;
    if (!clerkUser || sessionTask) { profileRef.current = null; setUser(null); setSyncing(false); setRefreshing(false); return; }
    if (profileRef.current?.id !== clerkUser.id) { setUser(null); setSyncing(true); }
    setRefreshing(true);
    const sync = async () => {
      try {
        const profile = await syncVerifiedAccount(clerkUser, getToken);
        if (active()) { profileRef.current = profile; setUser(profile); setAuthError(''); }
      } catch (err) {
        if (active()) { profileRef.current = null; setUser(null); setAuthError(err.message); }
      } finally { if (active()) { setSyncing(false); setRefreshing(false); } }
    };
    sync();
    return () => { cancelled = true; };
  }, [isLoaded, clerkUser?.id, clerkUser?.primaryEmailAddress?.verification?.status, session?.id, sessionTask, getToken, revision]);

  const logout = useCallback(async () => {
    syncGenerationRef.current++;
    profileRef.current = null; setUser(null); setAuthError(''); setSyncing(false); setRefreshing(false); setTokenGetter(getToken);
    try { await signOut(); }
    catch { setAuthError('Could not finish signing out. Check your connection and try signing out again.'); }
  }, [signOut, getToken]);
  return <AuthContext.Provider value={{ user, loading: (!isLoaded && !loadTimedOut) || syncing, refreshing, sessionTask, logout, authError,
    clearAuthError, refreshUser, isTeacher: user?.role === 'TEACHER', isStudent: user?.role === 'STUDENT' }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
