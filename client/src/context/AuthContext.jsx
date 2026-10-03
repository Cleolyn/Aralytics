import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setToken, getToken } from '../services/api';

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
          setUser(res.user);
        } else {
          setToken(null);
        }
      } catch (err) {
        setToken(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();

    const handleExpired = () => {
      setUser(null);
    };

    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  const login = async (identifier, password) => {
    const res = await api.login(identifier, password);
    if (res.success) {
      setToken(res.token);
      setUser(res.user);
    }
    return res;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
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
