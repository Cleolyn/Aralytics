import { ClerkProvider } from '@clerk/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('[ARALYTICS CRITICAL ERROR] Element with id="root" was not found in the HTML document.');
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ClerkProvider afterSignOutUrl="/">
        <BrowserRouter>
          <ErrorBoundary>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </ClerkProvider>
    </React.StrictMode>
  );
}