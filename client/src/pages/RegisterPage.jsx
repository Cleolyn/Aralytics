import React from 'react';
import { SignUp, useSignUp, useUser } from '@clerk/react';
import { useLocation } from 'react-router-dom';
import { AuthFrame, authAppearance } from './LoginPage';
import { useAuth } from '../context/AuthContext';
import GoogleAuthButton from '../components/GoogleAuthButton';
import { Notice } from '../components/ui/Feedback';
import { authErrorMessage, isAuthStart } from '../utils/authFlow';

export default function RegisterPage() {
  const { isSignedIn } = useUser();
  const { refreshUser, logout, authError, refreshing } = useAuth();
  const { errors } = useSignUp();
  const location = useLocation();
  return <AuthFrame register><h2>Create your account</h2><p>Verify your email first. You’ll enter your class code next.</p>
    <Notice error>{authError || (errors?.global ? authErrorMessage(errors.global) : '')}</Notice>
    {isSignedIn ? <div><p>Your account is signed in. Continue to connect to your class.</p><button className="btn btn-primary" disabled={refreshing} onClick={refreshUser}>{refreshing ? 'Checking account…' : 'Continue'}</button><button className="text-action" onClick={logout}>Sign out</button></div> :
      <>{isAuthStart(location.pathname) && <GoogleAuthButton register />}<SignUp routing="path" path="/register" signInUrl="/login" forceRedirectUrl="/onboarding" appearance={authAppearance} /></>}
  </AuthFrame>;
}
