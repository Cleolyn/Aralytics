import { ClerkProvider } from '@clerk/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { AUTH_PATHS, AUTH_TASK_PATHS, localAuthPath } from './utils/authFlow';

const PUBLISHABLE_KEY =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.CLERK_PUBLISHABLE_KEY;

function ConnectedApp() {
  const navigate = useNavigate();
  if (!PUBLISHABLE_KEY) return <div className="container" role="alert"><h1>Sign-in is unavailable</h1><p>The application’s Clerk publishable key is missing. Configure VITE_CLERK_PUBLISHABLE_KEY and restart the frontend.</p></div>;
  return <ClerkProvider publishableKey={PUBLISHABLE_KEY}
    signInUrl={AUTH_PATHS.signIn} signUpUrl={AUTH_PATHS.signUp}
    signInForceRedirectUrl={AUTH_PATHS.afterAuth} signUpForceRedirectUrl={AUTH_PATHS.afterAuth}
    signInFallbackRedirectUrl={AUTH_PATHS.afterAuth} signUpFallbackRedirectUrl={AUTH_PATHS.afterAuth}
    taskUrls={AUTH_TASK_PATHS} afterSignOutUrl="/" prefetchUI
    routerPush={to => navigate(localAuthPath(to, window.location.origin))}
    routerReplace={to => navigate(localAuthPath(to, window.location.origin), { replace: true })}>
    <AuthProvider><App /></AuthProvider>
  </ClerkProvider>;
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('[ARALYTICS CRITICAL ERROR] Element with id="root" was not found in the HTML document.');
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BrowserRouter><ErrorBoundary><ConnectedApp /></ErrorBoundary></BrowserRouter>
    </React.StrictMode>
  );
}
