import React from 'react';
import { SignUp, useSignUp, useUser } from '@clerk/react';
import { useLocation } from 'react-router-dom';
import { AuthFrame, authAppearance, useAuthIntent } from './LoginPage';
import { useAuth } from '../context/AuthContext';
import GoogleAuthButton from '../components/GoogleAuthButton';
import { Notice } from '../components/ui/Feedback';
import { afterAuthPath, authErrorMessage, isAuthStart, withIntent } from '../utils/authFlow';

export default function RegisterPage() {
  const { isSignedIn } = useUser();
  const { refreshUser, logout, authError, refreshing } = useAuth();
  const { errors } = useSignUp();
  const location = useLocation();
  const intent = useAuthIntent();
  const teacher = intent === 'TEACHER';
  return <AuthFrame register intent={intent}><h2>{teacher ? 'Create your instructor account' : 'Create your account'}</h2><p>{teacher ? 'Verify your email first. You’ll submit your instructor details next.' : 'Verify your email first. You’ll enter your class code next.'}</p>
    <Notice error>{authError || (errors?.global ? authErrorMessage(errors.global) : '')}</Notice>
    {isSignedIn ? <div><p>Your account is signed in. Continue to {teacher ? 'your instructor application' : 'connect to your class'}.</p><button className="btn btn-primary" disabled={refreshing} onClick={refreshUser}>{refreshing ? 'Checking account…' : 'Continue'}</button><button className="text-action" onClick={logout}>Sign out</button></div> :
      <>{isAuthStart(location.pathname) && <GoogleAuthButton register intent={intent} />}<SignUp routing="path" path="/register" signInUrl={withIntent('/login', intent)} forceRedirectUrl={afterAuthPath(intent)} appearance={authAppearance} /></>}
  </AuthFrame>;
}
