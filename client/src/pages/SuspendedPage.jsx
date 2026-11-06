import React from 'react';
import { Navigate } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import { useAuth } from '../context/AuthContext';
import { accountHome } from '../utils/authFlow';
import { cleanText } from '../utils/learning';

/** Shown to signed-in accounts an admin has suspended. Nothing else in the app is reachable. */
export default function SuspendedPage() {
  const { user, loading, logout, refreshUser, refreshing } = useAuth();
  if (loading) return <div className="container" role="status">Checking your account…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status !== 'SUSPENDED') return <Navigate to={accountHome(user)} replace />;
  return (
    <PublicLayout account>
      <section className="join-sheet" style={{ maxWidth: 600, margin: '40px auto' }}>
        <h1>Your account is suspended</h1>
        <p>You cannot use Aralytics while your account is suspended.</p>
        {user.suspended_reason && (
          <div className="notice notice-error" role="status">
            <div><strong>Reason:</strong> {cleanText(user.suspended_reason)}</div>
          </div>
        )}
        <p>Contact your school administrator to ask about restoring access.</p>
        <div className="hero-actions">
          <button className="btn btn-secondary" disabled={refreshing} onClick={refreshUser}>{refreshing ? 'Checking…' : 'Check again'}</button>
          <button className="text-action" onClick={logout}>Log out</button>
        </div>
        <p className="account-note">Signed in as {user.email}</p>
      </section>
    </PublicLayout>
  );
}
