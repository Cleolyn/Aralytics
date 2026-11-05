import React from 'react';
import { Link } from 'react-router-dom';
import { WifiOff } from '../../components/icons';

/** Blocking overlay while the quiz cannot reach the server. */
export default function OfflineLock({ onRetry }) {
  return (
    <div
      className="dialog-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-quiz-lock-title"
      aria-describedby="offline-quiz-lock-desc"
    >
      <div className="dialog" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--status-critical)', marginBottom: 16 }}>
          <WifiOff size={28} aria-hidden="true" />
          <h2 id="offline-quiz-lock-title">Quiz Paused (No Internet)</h2>
        </div>
        <p id="offline-quiz-lock-desc" style={{ marginBottom: 20 }}>
          You need an internet connection to take this quiz. Please reconnect to the internet to continue.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" disabled={!navigator.onLine} onClick={onRetry}>
            Check connection and continue
          </button>
          <Link className="btn btn-secondary" to="/student/materials">
            Open saved lessons
          </Link>
        </div>
      </div>
    </div>
  );
}
