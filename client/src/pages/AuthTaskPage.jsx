import React from 'react';
import { TaskChooseOrganization, TaskResetPassword, TaskSetupMFA, useSession } from '@clerk/react';
import { Navigate } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import { useAuth } from '../context/AuthContext';
import { AUTH_PATHS } from '../utils/authFlow';

const tasks = { 'choose-organization': TaskChooseOrganization, 'reset-password': TaskResetPassword, 'setup-mfa': TaskSetupMFA };
export default function AuthTaskPage() {
  const { session, isLoaded } = useSession();
  const { logout } = useAuth();
  if (!isLoaded) return <div className="container" role="status">Loading account verification…</div>;
  if (!session) return <Navigate to={AUTH_PATHS.signIn} replace />;
  if (!session.currentTask) return <Navigate to={AUTH_PATHS.afterAuth} replace />;
  const Task = tasks[session.currentTask.key];
  return <PublicLayout account><section className="join-sheet" style={{ maxWidth: 600, margin: '40px auto' }}><h1>Finish account setup</h1>
    {Task ? <Task redirectUrlComplete={AUTH_PATHS.afterAuth} /> : <p>This account requires an additional setup step. Contact your adviser for help.</p>}
    <button className="text-action" onClick={logout}>Sign out</button>
  </section></PublicLayout>;
}
