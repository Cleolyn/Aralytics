import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Immutable Role Protected Route Guard (FR-01..04, NFR-01)
 * Enforces server-verified authentication and role boundaries on every route transition.
 * 
 * @param {string} role - The required role ('TEACHER' or 'STUDENT').
 * @param {React.ReactNode} children - The protected workspace component.
 */
export function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // 1. Session verification in progress
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--colors-canvas)',
        color: 'var(--colors-body)',
        fontFamily: 'var(--font-body)'
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          border: '3px solid rgba(255, 79, 0, 0.2)',
          borderTopColor: 'var(--colors-primary)',
          borderRadius: '50%',
          animation: 'aralytics-spin 1s linear infinite',
          marginBottom: '16px'
        }} />
        <style>{`@keyframes aralytics-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        <span style={{ fontSize: '0.92rem', fontWeight: 500, color: 'var(--colors-ink)' }}>
          Sinusuri ang awtorisasyon at sesyon...
        </span>
      </div>
    );
  }

  // 2. Unauthenticated: Redirect immediately to /login with state preservation
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Teacher route attempted by Student -> Redirect with Unauthorized Alert (FR-03)
  if (role === 'TEACHER' && user.role !== 'TEACHER') {
    return (
      <Navigate
        to="/student/dashboard"
        state={{
          unauthorizedNotice: 'Hindi Awtorisadong Pag-access (Unauthorized Access): Ang pahinang hiniling ay para lamang sa mga guro ng Araling Panlipunan 10.'
        }}
        replace
      />
    );
  }

  // 4. Student route attempted by Teacher -> Redirect to Teacher Command Center (FR-04)
  if (role === 'STUDENT' && user.role !== 'STUDENT') {
    return <Navigate to="/teacher/dashboard" replace />;
  }

  // 5. Authorized session
  return children;
}

export default ProtectedRoute;
