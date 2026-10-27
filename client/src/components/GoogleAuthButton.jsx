import React, { useState } from 'react';
import { useSignIn, useSignUp, useUser } from '@clerk/react';
import { Notice } from './ui/Feedback';
import { AUTH_PATHS, authErrorMessage } from '../utils/authFlow';

export default function GoogleAuthButton({ register = false }) {
  const { signIn, fetchStatus: signInStatus } = useSignIn();
  const { signUp, fetchStatus: signUpStatus } = useSignUp();
  const { isLoaded } = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const startGoogle = async () => {
    setBusy(true); setError('');
    try {
      const result = await (register ? signUp : signIn).sso({ strategy: 'oauth_google',
        redirectUrl: AUTH_PATHS.afterAuth, redirectCallbackUrl: AUTH_PATHS.callback });
      if (result?.error) setError(authErrorMessage(result.error));
    } catch (err) { setError(authErrorMessage(err, 'Could not connect to Google. Try again.')); }
    finally { setBusy(false); }
  };
  const working = busy || signInStatus === 'fetching' || signUpStatus === 'fetching';
  const ready = isLoaded && typeof (register ? signUp : signIn)?.sso === 'function';
  return <div className="google-auth"><Notice error>{error}</Notice><button type="button" className="btn btn-secondary" disabled={working || !ready} onClick={startGoogle}>{working ? 'Connecting to Google…' : 'Continue with Google'}</button><p>or continue with email</p></div>;
}
