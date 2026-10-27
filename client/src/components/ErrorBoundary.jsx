import React from 'react';
import { ShieldAlert, RefreshCw } from './icons';

/**
 * Universal React Error Boundary to prevent white screen of death
 * Styled in Zapier Warm-Cream & Deep Coffee-Ink design system.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ARALYTICS RUNTIME CRASH CAUGHT BY ERROR BOUNDARY]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--colors-canvas)',
          color: 'var(--colors-ink)',
          padding: '24px',
          fontFamily: 'var(--font-body)'
        }}>
          <div style={{
            maxWidth: '560px',
            width: '100%',
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-glass)',
            borderRadius: 'var(--rounded-md)',
            padding: '40px 32px',
            boxShadow: 'var(--shadow-md)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--rounded-md)',
              backgroundColor: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#b91c1c'
            }}>
              <ShieldAlert size={32} />
            </div>
            <h2 style={{
              fontSize: '1.4rem',
              fontWeight: 500,
              fontFamily: 'var(--font-display)',
              marginBottom: '8px',
              color: 'var(--colors-ink)'
            }}>
              May Naganap na Runtime Error
            </h2>
            <p style={{ color: 'var(--colors-body)', fontSize: '0.92rem', marginBottom: '20px', lineHeight: 1.5 }}>
              Hindi maipakita nang buo ang bahaging ito dahil sa isang runtime exception. Paki-refresh o i-reset ang sesyon.
            </p>
            {this.state.error && (
              <pre style={{
                backgroundColor: 'var(--colors-canvas-soft)',
                padding: '14px',
                borderRadius: 'var(--rounded-sm)',
                fontSize: '0.82rem',
                color: '#991b1b',
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: '24px',
                maxHeight: '180px',
                border: '1px solid var(--border-subtle)'
              }}>
                {this.state.error.toString()}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px'
              }}
            >
              <RefreshCw size={16} /> I-reload ang Aralytics Platform
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
