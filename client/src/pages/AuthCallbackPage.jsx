import React, { useEffect, useState } from 'react';
import { HandleSSOCallback } from '@clerk/react';
import { Link, useNavigate } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import { AUTH_PATHS, AUTH_TASK_PATHS, localAuthPath } from '../utils/authFlow';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [takingLong, setTakingLong] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setTakingLong(true), 20000);
    return () => clearTimeout(timer);
  }, []);
  return <PublicLayout account><section className="join-sheet" style={{ maxWidth: 600, margin: '40px auto' }}>
    <h1>Complete your sign-in</h1><p role="status">Finishing your Google sign-in. Complete any security verification that appears.</p>
    <HandleSSOCallback
      navigateToApp={({ session, decorateUrl }) => {
        const destination = session?.currentTask ? AUTH_TASK_PATHS[session.currentTask.key] : AUTH_PATHS.afterAuth;
        try { navigate(localAuthPath(decorateUrl(destination || '/auth/tasks/unsupported'), window.location.origin), { replace: true }); }
        catch { setError('Could not return to Aralytics. Return to sign-in and try again.'); }
      }}
      navigateToSignIn={() => navigate(AUTH_PATHS.signIn, { replace: true })}
      navigateToSignUp={() => navigate(AUTH_PATHS.signUp, { replace: true })}
    />
    {(takingLong || error) && <div><p role="alert">{error || 'Still waiting? The security check may be blocked or the sign-in may have expired. Check your connection, then return to sign-in to try again.'}</p><Link className="text-action" to={AUTH_PATHS.signIn}>Return to sign-in</Link></div>}
  </section></PublicLayout>;
}
