// Test adapter only: no Google account, real email, CAPTCHA, or live application data is used.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
const Context = createContext(null);
const stored = () => JSON.parse(sessionStorage.getItem('auth-fixture') || 'null');
const response = data => new Response(JSON.stringify(data), { status: 200 });
export function ClerkProvider({ children, ...options }) {
  const [account, setAccount] = useState(stored);
  const [challenge, setChallenge] = useState(false);
  const [loaded, setLoaded] = useState(!new URLSearchParams(location.search).has('delaySdk'));
  const [task, setTask] = useState(null);
  const [errors, setErrors] = useState({});
  const current = useRef(account); current.current = account;
  window.__authProviderOptions = { signInUrl: options.signInUrl, signUpUrl: options.signUpUrl, taskUrls: options.taskUrls, prefetchUI: options.prefetchUI };
  window.__authCalls = window.__authCalls || [];
  const save = useCallback(next => { sessionStorage.setItem('auth-fixture', JSON.stringify(next)); setAccount(next); }, []);
  const getToken = useCallback(async () => current.current ? 'isolated-session-token' : null, []);
  const signOut = useCallback(async () => { save(null); options.routerReplace('/login'); }, [save, options.routerReplace]);
  const finish = useCallback((role = 'STUDENT', verified = true) => save({ id: 'user_fixture', role, verified, enrollment: null }), [save]);
  const sso = async params => {
    setErrors({});
    window.__authCalls.push({ method: 'sso', params });
    if (window.__ssoFailure) { const error = { code: window.__ssoFailure }; setErrors({ global: error }); return { error }; }
    setChallenge(true); options.routerPush(params.redirectCallbackUrl); return { error: null };
  };
  window.__authFixture = {
    ready: () => setLoaded(true), finish,
    approve: () => save({ ...current.current, enrollment: { ...current.current.enrollment, status: 'APPROVED' } }),
    task: key => { finish(); setTask(key); options.routerPush('/onboarding'); },
    signOut
  };
  const nativeFetch = useRef(window.fetch);
  window.fetch = async (url, config = {}) => {
    if (typeof url !== 'string' || !url.startsWith('/api/')) return nativeFetch.current(url, config);
    window.__authCalls.push({ method: config.method || 'GET', url });
    const value = current.current;
    if (url === '/api/auth/sync') {
      if (window.__backendDown) return new Response('<html>Backend unavailable</html>', { status: 502 });
      return response({ success: true, user: { id: value.id, role: value.role, email_verified: value.verified, email: 'student@example.test', first_name: 'Test', last_name: 'Student', section: value.enrollment?.section, enrollment_status: value.enrollment?.status || 'NOT_ENROLLED', enrollment: value.enrollment } });
    }
    if (url === '/api/enrollment/validate-code') return response({ adviser_name: 'Test Adviser', school_year: '2026-2027', sections: ['10-Rizal'] });
    if (url === '/api/enrollment/request') {
      const details = JSON.parse(config.body);
      const enrollment = { ...details, status: 'PENDING', adviser_name: 'Test Adviser', school_year: '2026-2027' };
      save({ ...value, enrollment }); return response({ enrollment });
    }
    if (url === '/api/enrollment/status') return response({ enrollment: value?.enrollment });
    return response({ materials: [], logs: [], read_logs: [], tasks: [], quizzes: [], queue: [], classes: [], learners: [], interventions: [], scores: [], invitations: [], requests: [] });
  };
  const user = useMemo(() => account ? { id: account.id, firstName: 'Test', lastName: 'Student', primaryEmailAddress: { emailAddress: 'student@example.test', verification: { status: account.verified ? 'verified' : 'unverified' } }, reload: async () => ({ id: account.id, primaryEmailAddress: { emailAddress: 'student@example.test', verification: { status: current.current?.verified ? 'verified' : 'unverified' } } }) } : null, [account?.id, account?.verified]);
  const session = useMemo(() => account ? { id: 'session_fixture', status: task ? 'pending' : 'active', currentTask: task ? { key: task } : null } : null, [account?.id, task]);
  return <Context.Provider value={{ account, user, session, loaded, getToken, signOut, errors, sso, challenge, setChallenge, finish, setTask, save, options }}>{children}</Context.Provider>;
}
export const useUser = () => { const c = useContext(Context); return { user: c.user, isLoaded: c.loaded, isSignedIn: !!c.user }; };
export const useSession = () => { const c = useContext(Context); return { session: c.session, isLoaded: c.loaded }; };
export const useAuth = () => { const c = useContext(Context); return { getToken: c.getToken, signOut: c.signOut }; };
export const useClerk = () => { const c = useContext(Context); return { loaded: c.loaded, openUserProfile: () => c.save({ ...c.account, verified: true }) }; };
export const useSignIn = () => { const c = useContext(Context); return { signIn: { sso: c.sso }, fetchStatus: 'idle', errors: c.errors }; };
export const useSignUp = () => { const c = useContext(Context); return { signUp: { sso: c.sso }, fetchStatus: 'idle', errors: c.errors }; };
export const UserButton = () => <span>Test account</span>;
export function SignIn() {
  const c = useContext(Context);
  return <div data-testid="email-sign-in"><button onClick={() => c.finish()}>Complete simulated email sign-in</button></div>;
}
export function SignUp() {
  const c = useContext(Context);
  if (location.pathname.includes('protect-check')) return <div data-testid="signup-challenge">Security verification stays in Aralytics<button onClick={() => { c.finish(); c.options.routerReplace('/onboarding'); }}>Complete simulated verification</button></div>;
  if (location.pathname.includes('verify-email-address')) return <div><p>Verify your email address</p><button onClick={() => { c.finish(); c.options.routerReplace('/onboarding'); }}>Verify simulated email</button></div>;
  return <div data-testid="email-sign-up"><button onClick={() => c.options.routerPush('/register/verify-email-address')}>Start simulated email sign-up</button></div>;
}
export function HandleSSOCallback({ navigateToApp, navigateToSignIn, navigateToSignUp }) {
  const c = useContext(Context);
  useEffect(() => { window.__callbackActions = { navigateToSignIn, navigateToSignUp }; }, [navigateToSignIn, navigateToSignUp]);
  if (!c.loaded) return null;
  return <div data-testid="sso-handler"><p>Simulated Clerk Protect verification</p><button onClick={() => { c.setChallenge(false); c.finish(); navigateToApp({ session: { currentTask: null }, decorateUrl: path => new URL(path, location.origin).href }); }}>Complete simulated verification</button></div>;
}
function Task() { const c = useContext(Context); return <button onClick={() => { c.setTask(null); c.options.routerReplace('/onboarding'); }}>Complete simulated account task</button>; }
export const TaskChooseOrganization = Task;
export const TaskResetPassword = Task;
export const TaskSetupMFA = Task;
