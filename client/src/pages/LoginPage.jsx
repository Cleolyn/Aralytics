import React, { useEffect } from 'react';
import { SignIn, useSignIn, useUser } from '@clerk/react';
import { Link, useLocation } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import { Notice } from '../components/ui/Feedback';
import { useAuth } from '../context/AuthContext';
import GoogleAuthButton from '../components/GoogleAuthButton';
import { afterAuthPath, authErrorMessage, intentFromSearch, isAuthStart, readAuthIntent, rememberAuthIntent, withIntent } from '../utils/authFlow';

export const authAppearance = { elements: {
  rootBox: { width: '100%' }, cardBox: { width: '100%', boxShadow: 'none' },
  card: { boxShadow: 'none', background: 'transparent', padding: '24px 0' },
  header: { display: 'none' }, formFieldInput: { minHeight: '44px', fontSize: '16px' },
  socialButtons: { display: 'none' }, dividerRow: { display: 'none' },
  footer: { background: 'transparent', backgroundImage: 'none' },
  formButtonPrimary: { minHeight: '44px', backgroundColor: 'var(--colors-primary)', backgroundImage: 'none', boxShadow: 'none' }
} };

/**
 * The door someone came in through: `?role=TEACHER|STUDENT` on the link wins and is remembered,
 * so it survives Clerk's step pages and the Google redirect; otherwise the remembered one.
 */
export function useAuthIntent() {
  const { search } = useLocation();
  const fromLink = intentFromSearch(search);
  useEffect(() => { if (fromLink) rememberAuthIntent(fromLink); }, [fromLink]);
  return fromLink || readAuthIntent();
}

export function AuthFrame({ register = false, intent, children }) {
  const teacher = intent === 'TEACHER';
  return <PublicLayout account><div className="account-layout">
    {teacher ? <section className="account-intro"><h1>{register ? 'Teach with Aralytics.' : 'Welcome back, teacher.'}</h1>
      <p>Manage your Araling Panlipunan 10 classes, lessons, quizzes and grades.</p>
      <ol className="enrollment-journey"><li>Sign in with Google or your school email</li><li>Submit your instructor details</li><li>An administrator verifies your access</li></ol>
      <p className="account-note">Already verified? Sign in and you’ll go straight to your teacher workspace.</p>
      <p className="account-note">Not a teacher? <Link className="text-action" to={withIntent(register ? '/register' : '/login', 'STUDENT')}>Continue as a student</Link></p>
    </section> : <section className="account-intro"><h1>{register ? 'A place in your class.' : 'Back to learning.'}</h1>
      <p>Araling Panlipunan 10, with your adviser and your classmates.</p>
      <ol className="enrollment-journey"><li>Sign in with Google or email</li><li>Join with your adviser’s class code</li><li>Complete your profile for adviser approval</li></ol>
      <p className="account-note">You can create an account now and join your class when your adviser shares a code.</p>
      <p className="account-note">Instructors: <Link className="text-action" to={withIntent(register ? '/register' : '/login', 'TEACHER')}>{register ? 'create an instructor account' : 'sign in as an instructor'}</Link>. An administrator verifies every instructor.</p>
    </section>}
    <section className="account-form" aria-label={register ? 'Create an account' : 'Sign in'}>{children}</section>
  </div></PublicLayout>;
}

export default function LoginPage() {
  const { authError, refreshUser, logout, refreshing } = useAuth();
  const { isSignedIn } = useUser();
  const { errors } = useSignIn();
  const location = useLocation();
  const intent = useAuthIntent();
  const teacher = intent === 'TEACHER';
  return <AuthFrame intent={intent}><h2>{teacher ? 'Instructor sign in' : 'Sign in to Aralytics'}</h2><p>{teacher ? 'Existing instructors go to their workspace. New instructors continue to verification.' : 'Use Google or your verified email address.'}</p><Notice error>{authError || (errors?.global ? authErrorMessage(errors.global) : '')}</Notice>
    {isSignedIn ? <div className="account-recovery"><p>Your account is signed in. Retry to connect to your {teacher ? 'workspace' : 'class'}.</p><button className="btn btn-primary" disabled={refreshing} onClick={refreshUser}>{refreshing ? 'Checking account…' : 'Try again'}</button><button className="text-action" onClick={logout}>Sign out</button></div> :
      <>{isAuthStart(location.pathname) && <GoogleAuthButton intent={intent} />}<SignIn routing="path" path="/login" signUpUrl={withIntent('/register', intent)} forceRedirectUrl={afterAuthPath(intent)} appearance={authAppearance} /></>}
  </AuthFrame>;
}
