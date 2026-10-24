import React, { createContext, useContext, useEffect, useCallback, useState, useRef } from 'react';
import { useUser, useAuth as useClerkAuth } from '@clerk/react';
import { setTokenGetter } from '../services/api';

const AuthContext = createContext(null);
export const PENDING_ROLE_KEY = 'aralytics:pending-role';
export const PENDING_PROFILE_KEY = 'aralytics:pending-profile';
export const AUTH_ERROR_KEY = 'aralytics:auth-error';
export const LOGIN_INTENT_KEY = 'aralytics:login-intent';

/**
 * AuthProvider
 * Enforces strict, immutable role separation between TEACHER and STUDENT accounts.
 */
export function AuthProvider({ children }) {
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut, getToken } = useClerkAuth();
  const [syncingRole, setSyncingRole] = useState(true);
  const [verifiedRole, setVerifiedRole] = useState(null);
  const [verifiedProfile, setVerifiedProfile] = useState(null);
  const [studentSession, setStudentSession] = useState(null);
  const initialBootHandledRef = useRef(false);

  const [authError, setAuthError] = useState(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(AUTH_ERROR_KEY) || '';
  });

  const clearAuthError = useCallback(() => {
    sessionStorage.removeItem(AUTH_ERROR_KEY);
    setAuthError('');
  }, []);

  // Wire either the active Clerk token or the Student JWT into api.js
  useEffect(() => {
    setTokenGetter(async () => {
      try {
        const clerkTok = await getToken();
        if (clerkTok) return clerkTok;
      } catch {
        // Fallback to studentSession token
      }
      return studentSession?.token || null;
    });
  }, [getToken, studentSession?.token]);

  // Clerk-connected Student Login using LRN, Class Section, First Name, and Last Name
  const loginStudent = useCallback(async ({ lrn_or_id, section, first_name, last_name }) => {
    clearAuthError();
    sessionStorage.setItem(LOGIN_INTENT_KEY, String(Date.now()));
    sessionStorage.setItem(PENDING_ROLE_KEY, 'STUDENT');
    sessionStorage.setItem(
      PENDING_PROFILE_KEY,
      JSON.stringify({ lrn_or_id, section, first_name, last_name })
    );

    const res = await fetch('/api/auth/student-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lrn_or_id, section, first_name, last_name })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      const msg = data.message || 'Could not sign in. Please check your LRN, section, and name.';
      setAuthError(msg);
      throw new Error(msg);
    }
    setStudentSession({ user: data.user, token: data.token });
    return data;
  }, [clearAuthError]);

  useEffect(() => {
    if (!isLoaded) return;

    // On initial page load / refresh, clear any stale Clerk session unless a recent login intent exists
    if (!initialBootHandledRef.current) {
      initialBootHandledRef.current = true;
      const isReload =
        typeof window !== 'undefined' &&
        window.performance?.getEntriesByType?.('navigation')?.[0]?.type === 'reload';
      const intentVal = sessionStorage.getItem(LOGIN_INTENT_KEY);
      const intentTs = Number(intentVal || 0);
      const hasRecentLoginIntent =
        !isReload &&
        (intentVal === 'redirecting' || (intentTs > 0 && Date.now() - intentTs < 60000));

      if (isReload) {
        sessionStorage.removeItem(LOGIN_INTENT_KEY);
      }

      if (clerkUser && !hasRecentLoginIntent) {
        sessionStorage.removeItem(LOGIN_INTENT_KEY);
        setVerifiedRole(null);
        setVerifiedProfile(null);
        setSyncingRole(true);
        Promise.resolve(signOut())
          .catch(() => {})
          .finally(() => {
            setSyncingRole(false);
          });
        return;
      }
    }

    if (!clerkUser) {
      setVerifiedRole(null);
      setVerifiedProfile(null);
      setSyncingRole(false);
      return;
    }

    let cancelled = false;
    setSyncingRole(true);

    async function verifyAndSyncRole() {
      const pendingRole = sessionStorage.getItem(PENDING_ROLE_KEY);
      const requestedRole =
        pendingRole === 'TEACHER' || pendingRole === 'STUDENT' ? pendingRole : null;
      let pendingProfile = {};
      try {
        pendingProfile = JSON.parse(sessionStorage.getItem(PENDING_PROFILE_KEY)) || {};
      } catch {
        pendingProfile = {};
      }

      try {
        const token = await getToken();
        const res = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ role: requestedRole, ...pendingProfile })
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 403 && data.code === 'ROLE_MISMATCH') {
          const msg =
            data.message ||
            'Access Denied: You cannot sign in using the wrong account role portal.';
          sessionStorage.setItem(AUTH_ERROR_KEY, msg);
          sessionStorage.removeItem(LOGIN_INTENT_KEY);
          if (!cancelled) {
            setAuthError(msg);
            setVerifiedRole(null);
            setVerifiedProfile(null);
            setSyncingRole(false);
          }
          await signOut();
          return;
        }

        if (res.ok && data.role) {
          sessionStorage.removeItem(AUTH_ERROR_KEY);
          if (!cancelled) {
            setAuthError('');
            setVerifiedRole(data.role);
            setVerifiedProfile(data.user || null);
          }
          if (clerkUser.publicMetadata?.role !== data.role) {
            await clerkUser.reload().catch(() => {});
          }
        } else {
          const errMsg = data.message || 'Could not verify your account role.';
          sessionStorage.removeItem(LOGIN_INTENT_KEY);
          if (!cancelled) {
            setAuthError(errMsg);
            setVerifiedRole(null);
            setVerifiedProfile(null);
          }
          await signOut();
        }
      } catch (err) {
        console.error('[Auth] Failed to verify user role:', err);
        sessionStorage.removeItem(LOGIN_INTENT_KEY);
        if (!cancelled) {
          setVerifiedRole(null);
          setVerifiedProfile(null);
        }
        await signOut();
      } finally {
        if (!cancelled) {
          setSyncingRole(false);
        }
      }
    }

    verifyAndSyncRole();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, clerkUser?.id, getToken, signOut]);

  const logout = useCallback(() => {
    sessionStorage.removeItem(LOGIN_INTENT_KEY);
    sessionStorage.removeItem(PENDING_ROLE_KEY);
    sessionStorage.removeItem(PENDING_PROFILE_KEY);
    setStudentSession(null);
    setVerifiedRole(null);
    setVerifiedProfile(null);
    if (clerkUser) {
      return signOut();
    }
    return Promise.resolve();
  }, [clerkUser, signOut]);

  const resolvedRole = verifiedRole;

  const user = studentSession?.user
    ? studentSession.user
    : isLoaded && !syncingRole && clerkUser && resolvedRole
    ? {
        id: clerkUser.id,
        first_name: verifiedProfile?.first_name || clerkUser.firstName || clerkUser.publicMetadata?.first_name,
        last_name: verifiedProfile?.last_name || clerkUser.lastName || clerkUser.publicMetadata?.last_name,
        email: clerkUser.primaryEmailAddress?.emailAddress,
        role: resolvedRole, // 'TEACHER' | 'STUDENT' (immutable)
        section:
          verifiedProfile?.section ||
          clerkUser.publicMetadata?.section ||
          (resolvedRole === 'STUDENT' ? '10-Rizal' : null),
        lrn_or_id: verifiedProfile?.lrn_or_id || clerkUser.publicMetadata?.lrn_or_id
      }
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: (!isLoaded || syncingRole) && !studentSession?.user,
        logout,
        loginStudent,
        authError,
        clearAuthError,
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
