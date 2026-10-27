import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { ShieldAlert, Maximize2, AlertTriangle } from './icons';

export default function ProctoringGuard({ submissionId, maxBlurLimit = 3, onAutoSubmit, isQuizActive }) {
  const [blurCount, setBlurCount] = useState(0);
  const [isWarningActive, setIsWarningActive] = useState(false);
  const [lastWarningText, setLastWarningText] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lastBlurRef = useRef(0);

  // Monitor Fullscreen status
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = Boolean(document.fullscreenElement);
      setIsFullscreen(isFull);
      if (!isFull && isQuizActive) {
        handleProctorViolation('FULLSCREEN_EXIT', 'You left full screen mode during the quiz.');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isQuizActive]);

  // Handle Proctor Violation Event
  const handleProctorViolation = async (eventType, message) => {
    if (!isQuizActive || !submissionId) return;

    const now = Date.now();
    // Debounce violation triggers within 1.5 seconds locally
    if (now - lastBlurRef.current < 1500) return;
    lastBlurRef.current = now;

    try {
      const res = await api.logProctoringEvent({
        submission_id: submissionId,
        event_type: eventType,
        duration_unfocused_ms: 500
      });

      if (res.success && !res.debounced) {
        setBlurCount(res.blur_count);
        setIsWarningActive(true);
        setLastWarningText(message);

        if (res.is_flagged_for_cheating) {
          alert(`Quiz Alert: You reached the limit of ${maxBlurLimit} tab switches. Your quiz will be flagged for review and submitted.`);
          if (onAutoSubmit) {
            onAutoSubmit();
          }
        }
      }
    } catch (err) {
      console.warn('[Proctoring Guard Log Warning]', err);
    }
  };

  // Window Blur and Visibility Change Handlers
  useEffect(() => {
    if (!isQuizActive) return;

    const handleWindowBlur = () => {
      handleProctorViolation('WINDOW_BLUR', 'The quiz window lost focus.');
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleProctorViolation('TAB_HIDDEN', 'You switched browser tabs during the quiz.');
      }
    };

    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isQuizActive, submissionId]);

  const requestFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Proctoring Status Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'rgba(15, 23, 42, 0.9)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '12px',
        marginBottom: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldAlert size={18} color="#ef4444" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
            Quiz Monitor Active:
          </span>
          <span style={{ fontSize: '0.82rem', color: blurCount > 0 ? '#f87171' : '#34d399', fontWeight: 700 }}>
            {blurCount} / {maxBlurLimit} Tab switches
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isFullscreen && (
            <button
              onClick={requestFullscreen}
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.75rem', padding: '4px 10px', borderColor: 'rgba(59, 130, 246, 0.4)' }}
            >
              <Maximize2 size={13} /> Use Full Screen
            </button>
          )}
          <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            Online Quiz
          </span>
        </div>
      </div>

      {/* Immediate Warning Overlay Banner */}
      {isWarningActive && (
        <div className="proctor-banner" style={{ marginBottom: '14px' }}>
          <AlertTriangle size={24} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              Please stay on this quiz tab ({blurCount} / {maxBlurLimit})
            </div>
            <div style={{ fontSize: '0.82rem', opacity: 0.95 }}>
              {lastWarningText} Switching tabs or windows is recorded for your teacher.
            </div>
          </div>
          <button
            onClick={() => setIsWarningActive(false)}
            className="btn btn-sm"
            style={{ background: 'rgba(0, 0, 0, 0.3)', color: 'white', border: 'none', padding: '4px 10px', fontSize: '0.75rem' }}
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
