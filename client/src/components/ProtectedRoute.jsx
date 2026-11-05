import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { accountHome, ROLE_HOMES } from '../utils/authFlow';
import IsoLoader from './iso/IsoLoader';

const WRONG_WORKSPACE = {
  ADMIN: 'This page is for administrators. You have been returned to your home.',
  TEACHER: 'This page is for teachers. You have been returned to your home.',
  STUDENT: 'This page is for students. You have been returned to your home.'
};

/**
 * Role guard for workspace routes (FR-01..04, NFR-01). The server enforces the same
 * boundaries on every API call; this only keeps people in the right workspace.
 *
 * @param {'ADMIN'|'TEACHER'|'STUDENT'} role - The role the page requires.
 */
export function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <IsoLoader variant="page">Checking your session</IsoLoader>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // Unverified accounts, and students without an approved class, finish setup first.
  if (!user.email_verified || (user.role === 'STUDENT' && user.enrollment_status !== 'APPROVED')) {
    return <Navigate to={accountHome(user)} replace />;
  }

  if (user.role !== role) {
    return <Navigate to={ROLE_HOMES[user.role] || '/login'} state={{ unauthorizedNotice: WRONG_WORKSPACE[role] }} replace />;
  }

  return children;
}

export default ProtectedRoute;
