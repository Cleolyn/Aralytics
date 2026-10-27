import React from 'react';
import { SignIn, useSignIn, useUser } from '@clerk/react';
import { useLocation } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import { Notice } from '../components/ui/Feedback';
import { useAuth } from '../context/AuthContext';
import GoogleAuthButton from '../components/GoogleAuthButton';
import { authErrorMessage, isAuthStart } from '../utils/authFlow';

export const authAppearance = { elements: {
  rootBox: { width: '100%' }, cardBox: { width: '100%', boxShadow: 'none' },
  card: { boxShadow: 'none', background: 'transparent', padding: '24px 0' },
  header: { display: 'none' }, formFieldInput: { minHeight: '44px', fontSize: '16px' },
  socialButtons: { display: 'none' }, dividerRow: { display: 'none' },
  footer: { background: 'transparent', backgroundImage: 'none' },
  formButtonPrimary: { minHeight: '44px', backgroundColor: 'var(--colors-primary)', backgroundImage: 'none', boxShadow: 'none' }
} };

export function AuthFrame({ register = false, children }) {
  return <PublicLayout account><div className="account-layout">
    <section className="account-intro"><h1>{register ? 'A place in your class.' : 'Back to learning.'}</h1>
      <p>Araling Panlipunan 10, with your adviser and your classmates.</p>
      <ol className="enrollment-journey"><li>Sign in with Google or email</li><li>Join with your adviser’s class code</li><li>Complete your profile for adviser approval</li></ol>
      <p className="account-note">You can create an account now and join your class when your adviser shares a code.</p>
    </section><section className="account-form" aria-label={register ? 'Create an account' : 'Sign in'}>{children}</section>
  </div></PublicLayout>;
}

export default function LoginPage() {
  const { authError, refreshUser, logout, refreshing } = useAuth();
  const { isSignedIn } = useUser();
  const { errors } = useSignIn();
  const location = useLocation();
  return <AuthFrame><h2>Sign in to Aralytics</h2><p>Use Google or your verified email address.</p><Notice error>{authError || (errors?.global ? authErrorMessage(errors.global) : '')}</Notice>
    {isSignedIn ? <div className="account-recovery"><p>Your account is signed in. Retry to connect to your class.</p><button className="btn btn-primary" disabled={refreshing} onClick={refreshUser}>{refreshing ? 'Checking account…' : 'Try again'}</button><button className="text-action" onClick={logout}>Sign out</button></div> :
      <>{isAuthStart(location.pathname) && <GoogleAuthButton />}<SignIn routing="path" path="/login" signUpUrl="/register" forceRedirectUrl="/onboarding" appearance={authAppearance} /></>}
  </AuthFrame>;
}
