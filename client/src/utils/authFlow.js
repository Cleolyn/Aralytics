export const AUTH_PATHS = Object.freeze({ signIn: '/login', signUp: '/register', callback: '/sso-callback', afterAuth: '/onboarding' });
export const AUTH_TASK_PATHS = Object.freeze({
  'choose-organization': '/auth/tasks/choose-organization',
  'reset-password': '/auth/tasks/reset-password',
  'setup-mfa': '/auth/tasks/setup-mfa'
});

export const ROLE_HOMES = Object.freeze({ ADMIN: '/admin', TEACHER: '/teacher/dashboard', STUDENT: '/student/dashboard' });
export const INSTRUCTOR_APPLICATION_PATH = '/instructor/apply';
export const SUSPENDED_PATH = '/suspended';

// Which door someone came in through ("Start as Student" or "I am a Teacher"). It is only a routing
// hint for brand-new accounts: roles still come from the server, and TEACHER needs admin approval.
// Kept in localStorage so it survives the Google redirect and Clerk's multi-step sign-in pages.
const INTENT_KEY = 'aralytics:auth-intent';
export const AUTH_INTENTS = Object.freeze(['STUDENT', 'TEACHER']);

export function intentFromSearch(search) {
  const role = new URLSearchParams(search || '').get('role')?.toUpperCase();
  return AUTH_INTENTS.includes(role) ? role : null;
}
export function readAuthIntent() {
  try { const value = window.localStorage.getItem(INTENT_KEY); return AUTH_INTENTS.includes(value) ? value : null; }
  catch { return null; }
}
export function rememberAuthIntent(intent) {
  try {
    if (AUTH_INTENTS.includes(intent)) window.localStorage.setItem(INTENT_KEY, intent);
    else window.localStorage.removeItem(INTENT_KEY);
  } catch { /* storage unavailable: fall back to the student flow */ }
}
export function clearAuthIntent() { rememberAuthIntent(null); }

/** Where Clerk should land after sign-in or sign-up for this intent. */
export function afterAuthPath(intent = readAuthIntent()) {
  return intent === 'TEACHER' ? INSTRUCTOR_APPLICATION_PATH : AUTH_PATHS.afterAuth;
}
/** Adds the intent to an auth link so the Clerk sign-in/sign-up switch keeps it. */
export function withIntent(path, intent) {
  return intent ? `${path}?role=${intent}` : path;
}

export function accountHome(user, intent = readAuthIntent()) {
  if (!user) return AUTH_PATHS.signIn;
  if (!user.email_verified) return AUTH_PATHS.afterAuth;
  if (user.status === 'SUSPENDED') return SUSPENDED_PATH;
  if (user.role === 'ADMIN' || user.role === 'TEACHER') return ROLE_HOMES[user.role];
  if (user.enrollment_status === 'APPROVED') return ROLE_HOMES.STUDENT;
  // A student account mid-enrollment stays on the class flow even if it once clicked "I am a Teacher".
  if (user.enrollment_status === 'PENDING' || (user.enrollment_status === 'REJECTED' && !user.instructor_application)) return AUTH_PATHS.afterAuth;
  if (intent === 'TEACHER') return INSTRUCTOR_APPLICATION_PATH;
  return user.instructor_application && intent !== 'STUDENT' ? INSTRUCTOR_APPLICATION_PATH : AUTH_PATHS.afterAuth;
}

export function authErrorMessage(error, fallback = 'Could not complete sign-in. Please try again.') {
  if (error instanceof TypeError) return fallback;
  const issue = error?.errors?.[0] || error;
  if (issue?.code === 'protect_check_script_load_failed') return 'Security verification could not load. Check your connection and allow the Clerk and Cloudflare verification scripts, then try again.';
  if (/protect_check|captcha/.test(issue?.code || '')) return 'Security verification was not completed. Please try again and complete the verification when prompted.';
  if (issue?.code === 'session_exists') return 'This account is already signed in. Continue to your class or sign out to use another account.';
  return issue?.longMessage || issue?.message || fallback;
}

export function isAuthStart(pathname) {
  return /^\/(login|register)\/?$/.test(pathname);
}

export function localAuthPath(destination, origin) {
  const url = new URL(destination, origin);
  if (url.origin !== origin) throw new Error('Sign-in returned an unexpected destination.');
  return url.pathname + url.search + url.hash;
}
