import React, { createContext, useContext, useEffect, useCallback, useState } from 'react';
import { useUser, useAuth as useClerkAuth } from '@clerk/react';
import { setTokenGetter } from '../services/api';

const AuthContext = createContext(null);
export const PENDING_ROLE_KEY = 'aralytics:pending-role';
export const AUTH_ERROR_KEY = 'aralytics:auth-error';

/**
 * AuthProvider
 * Enforces strict, immutable role separation between TEACHER and STUDENT accounts.
 *
 * Exposed shape:
 *   { user, loading, logout, isTeacher, isStudent, authError, clearAuthError }
 *
 * user shape:
 *   { id, first_name, last_name, email, role, section }
 */
export function AuthProvider({ children }) {
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut, getToken } = useClerkAuth();
  const [syncingRole, setSyncingRole] = useState(true);
  const [verifiedRole, setVerifiedRole] = useState(null);
  const [authError, setAuthError] = useState(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(AUTH_ERROR_KEY) || '';
  });

  const clearAuthError = useCallback(() => {
    sessionStorage.removeItem(AUTH_ERROR_KEY);
    setAuthError('');
  }, []);

  // Wire Clerk's async getToken into api.js so every request automatically
  // attaches the current Clerk session JWT as the Bearer token.
  useEffect(() => {
    setTokenGetter(() => getToken());
  }, [getToken]);

  // After sign-in, verify the user's immutable role with the server (/api/auth/sync).
  // If a student attempts to log in through the Teacher portal (or vice-versa),
  // the server rejects with 403 ROLE_MISMATCH and we immediately sign out the session.
  useEffect(() => {
    if (!isLoaded) return;
    if (!clerkUser) {
      setVerifiedRole(null);
      setSyncingRole(false);
      return;
    }

    let cancelled = false;
    setSyncingRole(true);

    async function verifyAndSyncRole() {
      const pendingRole = sessionStorage.getItem(PENDING_ROLE_KEY);
      const requestedRole =
        pendingRole === 'TEACHER' || pendingRole === 'STUDENT' ? pendingRole : null;

      try {
        const token = await getToken();
        const res = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ role: requestedRole })
        });

        const data = await res.json().catch(() => ({}));
        sessionStorage.removeItem(PENDING_ROLE_KEY);

        if (res.status === 403 && data.code === 'ROLE_MISMATCH') {
          const msg =
            data.message ||
            'Access Denied: You cannot sign in using the wrong account role portal.';
          sessionStorage.setItem(AUTH_ERROR_KEY, msg);
          if (!cancelled) {
            setAuthError(msg);
            setVerifiedRole(null);
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
          }
          if (clerkUser.publicMetadata?.role !== data.role) {
            await clerkUser.reload();
          }
        } else {
          if (!cancelled) {
            setVerifiedRole(clerkUser.publicMetadata?.role || 'STUDENT');
          }
        }
      } catch (err) {
        console.error('[Auth] Failed to verify user role:', err);
        if (!cancelled) {
          setVerifiedRole(clerkUser.publicMetadata?.role || 'STUDENT');
        }
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
    sessionStorage.removeItem(PENDING_ROLE_KEY);
    setVerifiedRole(null);
    return signOut();
  }, [signOut]);

  const resolvedRole = verifiedRole || clerkUser?.publicMetadata?.role || null;

  // Map Clerk user → app user shape only once the role is verified
  const user =
    isLoaded && !syncingRole && clerkUser && resolvedRole
      ? {
          id: clerkUser.id,
          first_name: clerkUser.firstName,
          last_name: clerkUser.lastName,
          email: clerkUser.primaryEmailAddress?.emailAddress,
          role: resolvedRole, // 'TEACHER' | 'STUDENT' (immutable)
          section:
            clerkUser.publicMetadata?.section ||
            (resolvedRole === 'STUDENT' ? '10-Rizal' : null),
          lrn_or_id: clerkUser.publicMetadata?.lrn_or_id,
        }
      : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: !isLoaded || syncingRole,
        logout,
        authError,
        clearAuthError,
        isTeacher: user?.role === 'TEACHER',
        isStudent: user?.role === 'STUDENT',
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
