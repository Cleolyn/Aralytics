import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setToken, getToken } from '../services/api';

const PROFILE_KEY = 'aralytics:offline-profile';
function saveProfile(user) { localStorage.setItem(PROFILE_KEY, JSON.stringify({ user, token: getToken() })); }
function offlineProfile(token) {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
    const expiry = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp;
    return saved?.token === token && expiry * 1000 > Date.now() ? saved.user : null;
  } catch { return null; }
}
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.getCurrentUser();
        if (res.success) {
          setUser(res.user); saveProfile(res.user);
        } else {
          setToken(null);
        }
      } catch (err) {
        const saved = !navigator.onLine && offlineProfile(token);
        if (saved) setUser(saved);
        else setToken(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();

    const handleExpired = () => {
      setUser(null); localStorage.removeItem(PROFILE_KEY);
    };

    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  const login = async (identifier, password) => {
    const res = await api.login(identifier, password);
    if (res.success) {
      setToken(res.token);
      setUser(res.user); saveProfile(res.user);
    }
    return res;
  };

  const register = async (payload) => {
    const res = await api.register(payload);
    if (res.success) { setToken(res.token); setUser(res.user); saveProfile(res.user); }
    return res;
  };

  const logout = () => {
    setToken(null);
    setUser(null); localStorage.removeItem(PROFILE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        register,
        isTeacher: user?.role === 'TEACHER',
        isStudent: user?.role === 'STUDENT'
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
