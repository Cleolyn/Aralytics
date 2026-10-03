import React, { useEffect, useReducer, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
  WifiOff, 
  ShieldAlert, 
  AlertTriangle, 
  Clock, 
  Award, 
  CheckCircle, 
  XCircle, 
  ArrowRight, 
  ArrowLeft, 
  Send, 
  BookOpen, 
  RotateCcw,
  Sparkles,
  Maximize2
} from 'lucide-react';

// =====================================================================
// COMPONENT REDUCER (Clean State Management Architecture)
// =====================================================================

const initialState = {
  quiz: null,
  loading: true,
  error: null,
  isOffline: !navigator.onLine,
  answers: {}, // { [questionId]: sanitizedAnswerString }
  currentQuestionIndex: 0,
  tabSwitchCount: 0,
  securityEvents: [], // [{ event_type, timestamp }]
  securityToast: null, // { message, id, count }
  isSubmitting: false,
  submissionResult: null,
  timeLeftSeconds: 0
};

function quizReducer(state, action) {
  switch (action.type) {
    case 'SET_QUIZ':
      return {
        ...state,
        quiz: action.payload,
        timeLeftSeconds: (action.payload.time_limit_mins || action.payload.time_limit_minutes || 15) * 60,
        loading: false,
        error: null
      };

    case 'SET_OFFLINE':
      return {
        ...state,
        isOffline: action.payload
      };

    case 'SET_ANSWER':
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.questionId]: action.answer
        }
      };

    case 'SET_CURRENT_QUESTION':
      return {
        ...state,
        currentQuestionIndex: action.payload
      };

    case 'TICK_TIMER':
      return {
        ...state,
        timeLeftSeconds: Math.max(0, state.timeLeftSeconds - 1)
      };

    case 'RECORD_SECURITY_VIOLATION':
      return {
        ...state,
        tabSwitchCount: state.tabSwitchCount + 1,
        securityEvents: [...state.securityEvents, action.event],
        securityToast: action.toast
      };

    case 'DISMISS_TOAST':
      return {
        ...state,
        securityToast: null
      };

    case 'SET_SUBMITTING':
      return {
        ...state,
        isSubmitting: action.payload
      };

    case 'SUBMISSION_SUCCESS':
      return {
        ...state,
        isSubmitting: false,
        submissionResult: action.payload
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        loading: false,
        isSubmitting: false
      };

    default:
      return state;
  }
}

// Input sanitizer helper
function sanitizeInput(val) {
  if (typeof val !== 'string') return '';
  return val.replace(/[<>]/g, '').trim();
}

export default function QuizRunner({ quizId, onBackToDashboard, onNavigateToRemedial }) {
  const { user, isStudent } = useAuth();

  // STRICT RBAC: Only enrolled students can take assessments
  if (!isStudent || user?.role !== 'STUDENT') {
    return null;
  }

  const [state, dispatch] = useReducer(quizReducer, initialState);

  const lastViolationRef = useRef(0);
  const timerRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  // 1. ONLINE BOUNDARY VALIDATION
  useEffect(() => {
    const handleOnline = () => dispatch({ type: 'SET_OFFLINE', payload: false });
    const handleOffline = () => dispatch({ type: 'SET_OFFLINE', payload: true });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (!navigator.onLine) {
      dispatch({ type: 'SET_OFFLINE', payload: true });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load Quiz Data
  useEffect(() => {
    if (!quizId || state.isOffline) return;

    let isMounted = true;
    async function loadQuiz() {
      try {
        const res = await api.getQuizById(quizId);
        if (isMounted) {
          if (res.success && res.quiz) {
            dispatch({ type: 'SET_QUIZ', payload: res.quiz });
          } else {
            dispatch({ type: 'SET_ERROR', payload: res.message || 'Nabigo sa pagkuha ng pagsusulit.' });
          }
        }
      } catch (err) {
        if (isMounted) {
          dispatch({ type: 'SET_ERROR', payload: err.message || 'Network error fetching quiz data.' });
        }
      }
    }

    loadQuiz();
    return () => {
      isMounted = false;
    };
  }, [quizId, state.isOffline]);

  // 2. SECURITY EVENT TRACKING: Active Window Focus & Visibility Monitoring
  const handleSecurityViolation = useCallback((eventType, alertText) => {
    // Debounce violation triggers locally within 1200ms
    const now = Date.now();
    if (now - lastViolationRef.current < 1200) return;
    lastViolationRef.current = now;

    const isoTimestamp = new Date().toISOString();
    const eventRecord = {
      event_type: eventType,
      timestamp: isoTimestamp
    };

    // Update local state and trigger alert toast
    dispatch({
      type: 'RECORD_SECURITY_VIOLATION',
      event: eventRecord,
      toast: {
        id: now,
        message: alertText,
        type: eventType
      }
    });

    // Auto-dismiss alert toast after 4 seconds
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      dispatch({ type: 'DISMISS_TOAST' });
    }, 4000);

    // Asynchronously post event timestamps to /api/security/log-event
    api.logSecurityEventAsync({
      quiz_id: quizId,
      student_id: user?.id,
      event_type: eventType,
      timestamp: isoTimestamp
    }).catch((err) => {
      console.warn('[Security Watchdog] Asynchronous event post warning:', err.message);
    });
  }, [quizId, user?.id]);

  // Attach event listeners for blur and visibilitychange
  useEffect(() => {
    if (!state.quiz || state.submissionResult || state.isOffline) return;

    const onBlur = () => {
      handleSecurityViolation('WINDOW_BLUR', 'Nawala ang pokus sa bintana ng pagsusulit! Bawal lumipat ng application.');
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        handleSecurityViolation('TAB_SWITCH', 'Nakitang lumipat ka ng tab ng browser! Naitatala ito sa security audit.');
      }
    };

    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [state.quiz, state.submissionResult, state.isOffline, handleSecurityViolation]);

  // Countdown Timer Heartbeat
  useEffect(() => {
    if (!state.quiz || state.submissionResult || state.isOffline) return;

    timerRef.current = setInterval(() => {
      dispatch({ type: 'TICK_TIMER' });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.quiz, state.submissionResult, state.isOffline]);

  // Auto-submit when time reaches zero
  useEffect(() => {
    if (state.quiz && state.timeLeftSeconds === 0 && !state.submissionResult && !state.loading) {
      handleSubmit();
    }
  }, [state.timeLeftSeconds]);

  // 3. SUBMISSION PROTOCOL: Sanitize Input and POST to /api/assessment/submit
  const handleSubmit = useCallback(async () => {
    if (state.isSubmitting || state.submissionResult || !state.quiz) return;

    dispatch({ type: 'SET_SUBMITTING', payload: true });

    try {
      // 1. Calculate Score locally based on multi-type sanitized answers (FR-16)
      const questions = state.quiz.questions || [];
      let calculatedScore = 0;
      let totalPossiblePoints = 0;
      const answersArray = [];

      for (const q of questions) {
        const qPoints = Number(q.points) || 1;
        totalPossiblePoints += qPoints;

        const rawAnswer = state.answers[q.id];
        let isCorrect = false;

        if (q.question_type === 'IDENTIFICATION') {
          const sNorm = String(rawAnswer || '').toLowerCase().replace(/['".,]/g, '').trim();
          if (q.correct_answer) {
            const aliases = String(q.correct_answer).split('|').map(s => s.toLowerCase().replace(/['".,]/g, '').trim());
            isCorrect = aliases.includes(sNorm);
          }
        } else if (q.question_type === 'MATCHING') {
          try {
            const sObj = typeof rawAnswer === 'object' ? rawAnswer : JSON.parse(rawAnswer || '{}');
            const cObj = typeof q.correct_answer === 'object' ? q.correct_answer : JSON.parse(q.correct_answer || '{}');
            let allMatch = true;
            for (const k of Object.keys(cObj)) {
              if (String(sObj[k] || '').trim().toLowerCase() !== String(cObj[k] || '').trim().toLowerCase()) {
                allMatch = false;
                break;
              }
            }
            isCorrect = allMatch;
          } catch (e) {
            isCorrect = false;
          }
        } else if (q.question_type === 'TRUE_FALSE') {
          const sNorm = String(rawAnswer || '').toUpperCase();
          const cNorm = String(q.correct_answer || '').toUpperCase();
          const isTrueEquiv = (v) => v === 'TRUE' || v === 'TAMA' || v === 'T' || v === '1';
          const isFalseEquiv = (v) => v === 'FALSE' || v === 'MALI' || v === 'F' || v === '0';
          isCorrect = (isTrueEquiv(sNorm) && isTrueEquiv(cNorm)) || (isFalseEquiv(sNorm) && isFalseEquiv(cNorm));
        } else {
          // MULTIPLE_CHOICE, SITUATIONAL, PISA_LIKE
          if (q.correct_answer && rawAnswer) {
            isCorrect = String(q.correct_answer).trim().toLowerCase() === String(rawAnswer).trim().toLowerCase();
          }
        }

        if (isCorrect) {
          calculatedScore += qPoints;
        }

        answersArray.push({
          question_id: q.id,
          selected_answer: typeof rawAnswer === 'object' ? JSON.stringify(rawAnswer) : String(rawAnswer || '')
        });
      }

      if (totalPossiblePoints === 0) totalPossiblePoints = 1;

      // 2. Prepare payload for /api/assessment/submit with answers array
      const payload = {
        quiz_id: state.quiz.id,
        student_id: user?.id,
        score: calculatedScore,
        total_points: state.quiz.total_points || totalPossiblePoints,
        tab_switch_count: state.tabSwitchCount,
        security_events: state.securityEvents,
        answers: answersArray
      };


      // 3. Execute POST to /api/assessment/submit
      const result = await api.submitAssessmentAttempt(payload);

      if (result.success) {
        dispatch({
          type: 'SUBMISSION_SUCCESS',
          payload: {
            ...result,
            competency_id: state.quiz.competency_id,
            competency_title: state.quiz.topic_title || state.quiz.title,
            melc_code: state.quiz.melc_code || 'AP10DRE-Ic-3',
            ilaw_category: state.quiz.ilaw_category || state.quiz.ilaw_tag || 'ASSESSMENT'
          }
        });

        // Trigger celebratory confetti on clean pass
        if (result.attempt.is_passed && result.attempt.percentage >= 80) {
          confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 }
          });
        }
      } else {
        throw new Error(result.message || 'Submission was rejected by the engine.');
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Error submitting assessment attempt.' });
    }
  }, [state.isSubmitting, state.submissionResult, state.quiz, state.answers, state.tabSwitchCount, state.securityEvents, user?.id]);

  // Format timer MM:SS
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Full-screen convenience helper
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // =====================================================================
  // VIEW 1: ONLINE BOUNDARY VIOLATION (Offline Guard)
  // =====================================================================
  if (state.isOffline) {
    return (
      <div className="container" style={{ padding: '60px 20px', textAlign: 'center' }}>
        <div className="glass-panel" style={{
          maxWidth: '560px',
          margin: '0 auto',
          padding: '40px 32px',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          background: 'var(--colors-canvas-soft)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--status-critical-bg)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px',
            boxShadow: 'none'
          }}>
            <WifiOff size={32} />
          </div>

          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--status-critical)', marginBottom: '10px' }}>
            Online Assessment Boundary Enforced
          </h2>

          <p style={{
            color: 'var(--colors-ink)',
            fontSize: '1rem',
            fontWeight: 600,
            marginBottom: '14px',
            lineHeight: 1.5
          }}>
            "Quizzes require an active internet connection to ensure assessment integrity"
          </p>

          <p style={{ color: 'var(--colors-body)', fontSize: '0.86rem', marginBottom: '24px', lineHeight: 1.5 }}>
            Upang maiwasan ang manipulasyon sa mga marka at proctoring security watchdog, kailangan mong kumonekta sa internet bago magpatuloy sa pagsusulit.
          </p>

          <button onClick={onBackToDashboard} className="btn btn-secondary">
            Bumalik sa Dashboard
          </button>
        </div>
      </div>
    );
  }

  // =====================================================================
  // VIEW 2: LOADING OR ERROR
  // =====================================================================
  if (state.loading) {
    return (
      <div className="container" style={{ padding: '80px 20px', textAlign: 'center', color: 'var(--colors-body)' }}>
        Inihahanda ang secure assessment environment...
      </div>
    );
  }

  if (state.error && !state.submissionResult) {
    return (
      <div className="container" style={{ padding: '60px 20px', textAlign: 'center' }}>
        <div className="glass-panel" style={{ maxWidth: '500px', margin: '0 auto', padding: '30px' }}>
          <AlertTriangle size={36} color="#ef4444" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Pagsusulit Error</h2>
          <p style={{ color: 'var(--colors-body)', marginBottom: '18px' }}>{state.error}</p>
          <button onClick={onBackToDashboard} className="btn btn-secondary">Bumalik</button>
        </div>
      </div>
    );
  }

  // =====================================================================
  // VIEW 3: IMMEDIATE SCORE FEEDBACK & TAGGED COMPETENCY REVIEW
  // =====================================================================
  if (state.submissionResult) {
    const res = state.submissionResult;
    const attempt = res.attempt;
    const isPassed = attempt.is_passed;
    const isInterventionTriggered = res.intervention?.triggered;
    const recommendedMat = res.intervention?.recommended_material;

    return (
      <div className="container" style={{ maxWidth: '680px', padding: '40px 20px' }}>
        <div className="glass-panel" style={{ padding: '36px 30px', textAlign: 'center' }}>
          
          {/* Header Icon */}
          <div style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: isPassed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: isPassed ? '#10b981' : '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: `0 0 25px ${isPassed ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`
          }}>
            {isPassed ? <Award size={40} /> : <XCircle size={40} />}
          </div>

          <h2 style={{ fontSize: '1.65rem', fontWeight: 800, marginBottom: '6px' }}>
            {isPassed ? 'Maligayang Pagbati! Naipasa ang Pagsusulit' : 'Pagsusulit Natapos - Kailangan ng Pagbawi'}
          </h2>
          <p style={{ color: 'var(--colors-body)', fontSize: '0.88rem', marginBottom: '24px' }}>
            {state.quiz.title} • DepEd MELC Assessment
          </p>

          {/* Score Metrics Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            marginBottom: '24px'
          }}>
            <div style={{ background: 'var(--colors-canvas-soft)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--colors-body-mid)', fontWeight: 600 }}>Nakuhang Iskor</div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--colors-ink)', marginTop: '4px' }}>
                {attempt.score} / {attempt.total_points}
              </div>
            </div>

            <div style={{ background: 'var(--colors-canvas-soft)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--colors-body-mid)', fontWeight: 600 }}>Bahagdan (%)</div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: isPassed ? '#10b981' : '#f87171', marginTop: '4px' }}>
                {attempt.percentage}%
              </div>
            </div>

            <div style={{ background: 'var(--colors-canvas-soft)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--colors-body-mid)', fontWeight: 600 }}>Katayuan</div>
              <div style={{ marginTop: '6px' }}>
                <span className={`badge ${isPassed ? 'badge-mastered' : 'badge-critical'}`}>
                  {isPassed ? 'PASSED' : 'FAILED'}
                </span>
              </div>
            </div>
          </div>

          {/* Security Proctoring Summary */}
          <div style={{
            background: 'var(--colors-canvas-soft)',
            padding: '12px 16px',
            borderRadius: '10px',
            border: '1px solid var(--border-glass)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
            fontSize: '0.82rem'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--colors-body)' }}>
              <ShieldAlert size={16} color={attempt.tab_switch_count > 0 ? '#ef4444' : '#10b981'} />
              Naitalang Window / Tab Switches:
            </span>
            <span style={{ fontWeight: 700, color: attempt.tab_switch_count >= 3 ? '#f87171' : 'var(--colors-ink)' }}>
              {attempt.tab_switch_count} violation(s) {attempt.tab_switch_count >= 3 && '(FLAGGED FOR REVIEW)'}
            </span>
          </div>

          {/* Tagged Competencies Requiring Review */}
          <div style={{
            background: isInterventionTriggered ? 'rgba(255,79,0,0.08)' : 'var(--status-mastered-bg)',
            border: `1px solid ${isInterventionTriggered ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.3)'}`,
            borderRadius: '14px',
            padding: '20px',
            textAlign: 'left',
            marginBottom: '26px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Sparkles size={16} color={isInterventionTriggered ? 'var(--colors-primary)' : '#34d399'} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: isInterventionTriggered ? 'var(--colors-primary)' : '#34d399' }}>
                {isInterventionTriggered
                  ? 'Mga Kasanayang Nangangailangan ng Pagbawi (Ways Forward)'
                  : 'Pagsusuri sa Competency Mastery'}
              </h3>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--colors-ink)', marginBottom: '8px', fontWeight: 600 }}>
              [{res.melc_code || 'AP10MELC'}] {state.quiz.topic_title || state.quiz.title}
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--colors-body)', lineHeight: 1.4, marginBottom: isInterventionTriggered ? '14px' : '0' }}>
              {isInterventionTriggered
                ? 'Dahil ang iyong marka ay mas mababa sa 75%, awtomatikong itinalaga ang remedial reviewer sa iyong Ways Forward hub.'
                : 'Lahat ng pamantayan sa pagkatuto para sa araling ito ay matagumpay mong nakamit!'}
            </p>

            {/* Recommended Remedial Material Card */}
            {isInterventionTriggered && recommendedMat && (
              <div style={{
                background: 'var(--colors-canvas-soft)',
                padding: '10px 14px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1px solid var(--border-glass)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <BookOpen size={16} color="var(--colors-primary)" />
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--colors-body-mid)' }}>Inirekomendang Babasahin:</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--colors-ink)' }}>
                      {recommendedMat.title}
                    </div>
                  </div>
                </div>
                <button onClick={onNavigateToRemedial} className="btn btn-primary btn-sm">
                  Buksan <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Action Navigation */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button onClick={onBackToDashboard} className="btn btn-secondary">
              Bumalik sa Dashboard
            </button>
            {isInterventionTriggered && (
              <button onClick={onNavigateToRemedial} className="btn btn-primary">
                Pumunta sa Ways Forward <ArrowRight size={15} />
              </button>
            )}
          </div>

        </div>
      </div>
    );
  }

  // =====================================================================
  // VIEW 4: ACTIVE SECURE QUIZ RUNNER INTERFACE
  // =====================================================================
  const questions = state.quiz?.questions || [];
  const currentQ = questions[state.currentQuestionIndex];
  const isLastQuestion = state.currentQuestionIndex === questions.length - 1;

  return (
    <div className="container" style={{ maxWidth: '840px', padding: '24px 20px', position: 'relative' }}>
      
      {/* Subtle Security Toast Notification */}
      {state.securityToast && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '24px',
          zIndex: 999,
          background: 'var(--status-critical-bg)',
          border: '1px solid #ef4444',
          color: 'var(--status-critical)',
          padding: '12px 18px',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          maxWidth: '380px',
          animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <ShieldAlert size={20} color="var(--status-critical)" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '0.82rem', lineHeight: 1.3 }}>
            <strong style={{ display: 'block', color: 'var(--status-critical)' }}>
              Security Event ({state.tabSwitchCount})
            </strong>
            {state.securityToast.message}
          </div>
        </div>
      )}

      {/* Proctoring Header & Status Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'var(--colors-canvas-soft)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldAlert size={18} color="#ef4444" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--colors-ink)' }}>
            Active Focus Monitoring:
          </span>
          <span style={{
            fontSize: '0.82rem',
            fontWeight: 700,
            color: state.tabSwitchCount > 0 ? '#f87171' : '#34d399'
          }}>
            {state.tabSwitchCount} Tab / Window Blur Event(s)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleToggleFullscreen}
            className="btn btn-sm btn-secondary"
            style={{ fontSize: '0.75rem', padding: '4px 10px', borderColor: 'var(--border-subtle)' }}
          >
            <Maximize2 size={13} /> Full Screen
          </button>
          <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            STRICT ONLINE VALIDATION
          </span>
        </div>
      </div>

      {/* Quiz Top bar: Title + Timer */}
      <div className="glass-panel" style={{
        padding: '16px 20px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <span className="badge badge-ilaw-assessment" style={{ marginBottom: '4px' }}>
            {state.quiz.ilaw_category || state.quiz.ilaw_tag || 'ASSESSMENT'} • {state.quiz.melc_code || 'AP10'}
          </span>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
            {state.quiz.title}
          </h2>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: state.timeLeftSeconds < 180 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.15)',
          border: `1px solid ${state.timeLeftSeconds < 180 ? '#ef4444' : 'rgba(245, 158, 11, 0.4)'}`,
          color: state.timeLeftSeconds < 180 ? '#f87171' : '#fbbf24',
          padding: '8px 14px',
          borderRadius: '10px',
          fontWeight: 700,
          fontSize: '1rem'
        }}>
          <Clock size={18} /> {formatTime(state.timeLeftSeconds)}
        </div>
      </div>

      {/* Active Question Box */}
      {currentQ && (() => {
        const qType = currentQ.question_type || 'MULTIPLE_CHOICE';

        // Parse options for matching if needed
        let matchingData = null;
        if (qType === 'MATCHING') {
          if (currentQ.options && currentQ.options.premises) {
            matchingData = currentQ.options;
          } else if (typeof currentQ.options_json === 'string') {
            try { matchingData = JSON.parse(currentQ.options_json); } catch (e) { matchingData = null; }
          }
        }

        // Parse options array for choice-based questions
        let choiceOptions = Array.isArray(currentQ.options) ? currentQ.options : [];
        if (qType === 'TRUE_FALSE' && choiceOptions.length === 0) {
          choiceOptions = [
            { id: 'TRUE', text: 'Tama (True)' },
            { id: 'FALSE', text: 'Mali (False)' }
          ];
        }

        // Get current answer
        const currentAns = state.answers[currentQ.id];

        return (
          <div className="glass-panel" style={{ padding: '28px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--colors-body-mid)', textTransform: 'uppercase' }}>
                Tanong {state.currentQuestionIndex + 1} sa {questions.length} ({currentQ.points || 1} Puntos)
              </span>
              <span className={`badge ${
                qType === 'PISA_LIKE' ? 'badge-critical' :
                qType === 'SITUATIONAL' ? 'badge-mastered' :
                qType === 'MATCHING' ? 'badge-ilaw-learning' : 'badge-secondary'
              }`} style={{ fontSize: '0.74rem', letterSpacing: '0.04em' }}>
                {qType.replace('_', ' ')}
              </span>
            </div>

            {/* Stimulus Context Banner for SITUATIONAL or PISA_LIKE */}
            {qType === 'SITUATIONAL' && (
              <div style={{
                background: 'rgba(255,79,0,0.05)',
                border: '1px solid rgba(255,79,0,0.2)',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <Sparkles size={18} color="var(--colors-primary)" />
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#93c5fd' }}>
                  SITWASYON / KONTEKSTO NG ARALIN (Critical Decision Analysis)
                </span>
              </div>
            )}

            {qType === 'PISA_LIKE' && (
              <div style={{
                background: 'rgba(255,79,0,0.05)',
                border: '1px solid rgba(255,79,0,0.2)',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <BookOpen size={18} color="#c084fc" />
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#e9d5ff' }}>
                  PISA-STYLE STIMULUS & DATA-DRIVEN REASONING (Scientific Literacy)
                </span>
              </div>
            )}

            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, lineHeight: 1.5, marginBottom: '24px' }}>
              {currentQ.question_text}
            </h3>

            {/* Question Type: IDENTIFICATION */}
            {qType === 'IDENTIFICATION' && (
              <div style={{ marginTop: '14px' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--colors-body)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  I-type ang iyong kasagutan sa patlang (Exact / Case-Insensitive):
                </label>
                <input
                  type="text"
                  value={currentAns || ''}
                  onChange={(e) => dispatch({
                    type: 'SET_ANSWER',
                    questionId: currentQ.id,
                    answer: e.target.value
                  })}
                  placeholder="Halimbawa: Paris Agreement..."
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    background: 'var(--colors-canvas)',
                    border: '1px solid rgba(59, 130, 246, 0.5)',
                    color: 'var(--colors-ink)',
                    fontSize: '1.05rem',
                    outline: 'none',
                    transition: 'border 0.2s ease',
                    
                  }}
                />
              </div>
            )}

            {/* Question Type: MATCHING */}
            {qType === 'MATCHING' && matchingData && matchingData.premises && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ fontSize: '0.84rem', color: 'var(--colors-body)', marginBottom: '4px' }}>
                  Pagtambalin ang bawat item sa Column A gamit ang kaukulang pagpipilian sa Column B:
                </p>

                {matchingData.premises.map((premise) => {
                  let parsedMap = {};
                  try {
                    parsedMap = typeof currentAns === 'object' ? currentAns : JSON.parse(currentAns || '{}');
                  } catch (e) { parsedMap = {}; }
                  const selectedRespId = parsedMap[premise.id] || '';

                  return (
                    <div
                      key={premise.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 1fr',
                        gap: '14px',
                        alignItems: 'center',
                        background: 'var(--colors-canvas-soft)',
                        border: '1px solid var(--border-glass)',
                        padding: '12px 16px',
                        borderRadius: '10px'
                      }}
                    >
                      <div style={{ fontSize: '0.92rem', color: 'var(--colors-ink)', fontWeight: 500 }}>
                        {premise.text}
                      </div>

                      <select
                        value={selectedRespId}
                        onChange={(e) => {
                          const updated = { ...parsedMap, [premise.id]: e.target.value };
                          dispatch({
                            type: 'SET_ANSWER',
                            questionId: currentQ.id,
                            answer: updated
                          });
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'var(--colors-canvas)',
                          border: `1px solid ${selectedRespId ? 'var(--colors-primary)' : 'var(--border-subtle)'}`,
                          color: 'var(--colors-ink)',
                          fontSize: '0.88rem',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">-- Piliin ang Katambal --</option>
                        {matchingData.responses.map((resp) => (
                          <option key={resp.id} value={resp.id}>
                            {resp.text}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Standard Choice-based Question Types: MULTIPLE_CHOICE, TRUE_FALSE, SITUATIONAL, PISA_LIKE */}
            {qType !== 'IDENTIFICATION' && qType !== 'MATCHING' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {choiceOptions.map((opt) => {
                  const isSelected = currentAns === opt.id;

                  return (
                    <div
                      key={opt.id}
                      onClick={() => dispatch({
                        type: 'SET_ANSWER',
                        questionId: currentQ.id,
                        answer: sanitizeInput(opt.id)
                      })}
                      style={{
                        padding: '14px 18px',
                        borderRadius: '10px',
                        background: isSelected ? 'rgba(255,79,0,0.1)' : 'var(--colors-canvas-soft)',
                        border: `1px solid ${isSelected ? '#f59e0b' : 'var(--border-glass)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        border: `2px solid ${isSelected ? 'var(--colors-primary)' : 'var(--colors-body-mid)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: isSelected ? 'var(--colors-primary)' : 'var(--colors-body-mid)'
                      }}>
                        {opt.id}
                      </div>
                      <span style={{ fontSize: '0.94rem', color: isSelected ? 'var(--colors-ink)' : 'var(--colors-body)' }}>
                        {opt.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        );
      })()}


      {/* Bottom Navigation & Submission Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={() => dispatch({ type: 'SET_CURRENT_QUESTION', payload: Math.max(0, state.currentQuestionIndex - 1) })}
          className="btn btn-secondary"
          disabled={state.currentQuestionIndex === 0}
        >
          <ArrowLeft size={16} /> Nakaraang Tanong
        </button>

        {/* Question Selector Numbers */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {questions.map((q, idx) => (
            <div
              key={q.id}
              onClick={() => dispatch({ type: 'SET_CURRENT_QUESTION', payload: idx })}
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: idx === state.currentQuestionIndex
                  ? 'var(--colors-primary)'
                  : state.answers[q.id]
                  ? 'rgba(21, 128, 61, 0.15)'
                  : 'var(--colors-canvas-soft)',
                color: idx === state.currentQuestionIndex ? '#fffefb' : 'var(--colors-ink)',
                border: state.answers[q.id] ? '1px solid #bbf7d0' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--rounded-sm)'
              }}
            >
              {idx + 1}
            </div>
          ))}
        </div>

        {isLastQuestion ? (
          <button
            onClick={handleSubmit}
            className="btn btn-primary"
            disabled={state.isSubmitting}
          >
            <Send size={16} /> {state.isSubmitting ? 'Isinusumite...' : 'Tapusin at Isumite'}
          </button>
        ) : (
          <button
            onClick={() => dispatch({ type: 'SET_CURRENT_QUESTION', payload: Math.min(questions.length - 1, state.currentQuestionIndex + 1) })}
            className="btn btn-secondary"
          >
            Susunod <ArrowRight size={16} />
          </button>
        )}
      </div>

    </div>
  );
}
