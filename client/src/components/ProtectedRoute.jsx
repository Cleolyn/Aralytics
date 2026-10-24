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
  if (loading) return <div className="container" role="status">Checking your session…</div>;

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
          unauthorizedNotice: 'This page is for teachers. You can continue from your learner overview.'
        }}
        replace
      />
    );
  }

  // 4. Student route attempted by Teacher -> Redirect to Teacher Command Center (FR-04)
  if (role === 'STUDENT' && user.role !== 'STUDENT') {
    return (
      <Navigate
        to="/teacher/dashboard"
        state={{
          unauthorizedNotice: 'This page is for learners. You have been returned to your Instructor workspace.'
        }}
        replace
      />
    );
  }

  // 5. Authorized session
  return children;
}

export default ProtectedRoute;
