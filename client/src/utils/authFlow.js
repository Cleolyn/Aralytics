export const AUTH_PATHS = Object.freeze({ signIn: '/login', signUp: '/register', callback: '/sso-callback', afterAuth: '/onboarding' });
export const AUTH_TASK_PATHS = Object.freeze({
  'choose-organization': '/auth/tasks/choose-organization',
  'reset-password': '/auth/tasks/reset-password',
  'setup-mfa': '/auth/tasks/setup-mfa'
});

export function accountHome(user) {
  if (!user) return AUTH_PATHS.signIn;
  if (!user.email_verified) return AUTH_PATHS.afterAuth;
  if (user.role === 'TEACHER') return '/teacher/dashboard';
  return user.enrollment_status === 'APPROVED' ? '/student/dashboard' : AUTH_PATHS.afterAuth;
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
