import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock, Flag, Maximize2, WifiOff } from '../components/icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import { cleanText, formatEventType } from '../utils/learning';

function answered(question, answer) {
  return typeof answer === 'string' && answer.trim().length > 0;
}
const timeText = seconds => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

export default function QuizRunner({ quizId, onBackToDashboard, onNavigateToRemedial }) {
  const { user } = useAuth();
  const sessionKey = `aralytics:quiz-session:${user.id}:${quizId}`;
  const restored = useRef(null);
  if (!restored.current) {
    try {
      restored.current = JSON.parse(localStorage.getItem(sessionKey)) || {};
    } catch {
      restored.current = {};
    }
  }
  const [answers, setAnswers] = useState(restored.current.answers || {});
  const [deadline, setDeadline] = useState(restored.current.deadline || 0);
  const [events, setEvents] = useState(restored.current.events || []);
  const [flags, setFlags] = useState(restored.current.flags || []);
  const [index, setIndex] = useState(0);
  const [review, setReview] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  const [handshakeOk, setHandshakeOk] = useState(navigator.onLine);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [focusNotice, setFocusNotice] = useState('');
  const lock = useRef(false);
  const lastFocus = useRef(0);
  const autoAttempt = useRef(false);

  const checkHandshake = useCallback(async () => {
    if (!navigator.onLine) {
      setOnline(false);
      setHandshakeOk(false);
      return false;
    }
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const ok = res.ok;
      setOnline(ok);
      setHandshakeOk(ok);
      return ok;
    } catch {
      setOnline(false);
      setHandshakeOk(false);
      return false;
    }
  }, []);

  const { data, loading, error, refresh } = useRemoteData(async () => {
    const connected = await checkHandshake();
    if (!connected) throw new Error('You need an internet connection to take this quiz. Please reconnect to continue.');
    return api.getQuizById(quizId);
  }, [quizId, checkHandshake]);

  const quiz = data?.quiz;
  const submitted = quiz?.currentSubmission?.status === 'SUBMITTED';
  const questions = quiz?.questions || [];
  const question = questions[index];
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const count = questions.filter(q => answered(q, answers[q.id])).length;

  useEffect(() => {
    if (quiz && !submitted && !deadline) {
      const started = Date.now();
      setNow(started);
      setDeadline(started + (quiz.time_limit_minutes || 20) * 60000);
    }
  }, [quiz, submitted, deadline]);

  useEffect(() => {
    const update = () => {
      const isOnline = navigator.onLine;
      setOnline(isOnline);
      if (isOnline) {
        autoAttempt.current = false;
        checkHandshake();
      } else {
        setHandshakeOk(false);
      }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [checkHandshake]);

  useEffect(() => {
    if (!deadline || result || submitted) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline, result, submitted]);

  useEffect(() => {
    if (!deadline || result || submitted) return;
    try {
      localStorage.setItem(sessionKey, JSON.stringify({ answers, deadline, events, flags }));
    } catch {
      setStorageError('Your browser could not save answers on this device. Keep this page open until you submit.');
    }
  }, [answers, deadline, events, flags, result, submitted, sessionKey]);

  useEffect(() => {
    if (!quiz || result || submitted || !online) return;
    const record = type => {
      if (Date.now() - lastFocus.current < 1000 || lock.current) return;
      lastFocus.current = Date.now();
      const event = Object.freeze({ event_type: type, timestamp: new Date().toISOString() });
      setEvents(prev => Object.freeze([...prev, event]));
      setFocusNotice(
        `Reminder (${formatEventType(type)}): Leaving the quiz screen was recorded at ${new Date(
          event.timestamp
        ).toLocaleTimeString()}. Please stay on this page.`
      );
      api
        .logSecurityEventAsync({
          quiz_id: quiz.id,
          student_id: user.id,
          event_type: type,
          timestamp: event.timestamp
        })
        .catch(() => {});
    };
    const onBlur = () => record('WINDOW_MINIMIZE');
    const onFocus = () => {};
    const onVisibility = () => {
      if (document.hidden) record('TAB_SWITCH');
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) record('FULLSCREEN_EXIT');
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [quiz, result, submitted, online, user.id]);

  const submit = useCallback(async () => {
    if (lock.current || result || !quiz || submitted || !navigator.onLine) return;
    const connected = await checkHandshake();
    if (!connected) return;
    lock.current = true;
    setBusy(true);
    setActionError('');
    try {
      const response = await api.submitAssessmentAttempt({
        quiz_id: quiz.id,
        student_id: user.id,
        score: 0,
        total_points: quiz.total_points,
        tab_switch_count: events.length,
        security_events: events,
        answers: questions.map(q => ({ question_id: q.id, selected_answer: String(answers[q.id] ?? '') }))
      });
      if (!response.success) throw new Error(response.message || 'Could not submit the quiz.');
      setResult(response);
      localStorage.removeItem(sessionKey);
    } catch (err) {
      setActionError(`${err.message} Your answers are still saved here. Please try submitting again.`);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [result, quiz, submitted, user.id, events, questions, answers, sessionKey, checkHandshake]);

  useEffect(() => {
    if (quiz && deadline && remaining === 0 && !result && !submitted && online && !autoAttempt.current) {
      autoAttempt.current = true;
      submit();
    }
  }, [quiz, deadline, remaining, result, submitted, online, submit]);

  const go = value => {
    setIndex(value);
    setReview(false);
  };
  function setAnswer(value) {
    if (remaining > 0 && !busy && online && handshakeOk) setAnswers(prev => ({ ...prev, [question.id]: value }));
  }

  const isOfflineBlocked = !online || !handshakeOk;

  const getMcqOptions = q => {
    if (!q) return [];
    if (Array.isArray(q.options) && q.options.length > 0) return q.options;
    if (q.question_type === 'TRUE_FALSE') {
      return [
        { id: 'TRUE', text: 'True / Tama' },
        { id: 'FALSE', text: 'False / Mali' }
      ];
    }
    return [
      { id: 'A', text: 'Option A' },
      { id: 'B', text: 'Option B' },
      { id: 'C', text: 'Option C' },
      { id: 'D', text: 'Option D' }
    ];
  };

  return (
    <div className="container">
      {isOfflineBlocked && (
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
              <button
                type="button"
                className="btn btn-primary"
                disabled={!navigator.onLine}
                onClick={() => {
                  checkHandshake().then(ok => {
                    if (ok && !quiz) refresh();
                  });
                }}
              >
                Check connection and continue
              </button>
              <Link className="btn btn-secondary" to="/student/materials">
                Open saved lessons
              </Link>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <Loading>Opening your quiz…</Loading>
      ) : error || !quiz ? (
        <>
          <Notice error>{error || 'This quiz could not be opened.'}</Notice>
          <button className="text-action" disabled={isOfflineBlocked} onClick={refresh}>
            Try again
          </button>
          <Link className="text-action" style={{ marginLeft: 24 }} to="/student/activities">
            Back to activities
          </Link>
        </>
      ) : submitted && !result ? (
        <>
          <div className="page-heading">
            <div>
              <h1>{cleanText(quiz.title)}</h1>
              <p>You have already finished this quiz.</p>
            </div>
          </div>
          <Link className="btn btn-primary" to="/student/progress">
            See your score <ArrowRight size={16} />
          </Link>
        </>
      ) : result ? (
        <div style={{ maxWidth: 900 }}>
          <span className="eyebrow">Quiz finished</span>
          <h1 style={{ marginTop: 16 }}>{result.attempt.is_passed ? 'Great job! You passed.' : 'Good try! Keep practicing.'}</h1>
          <p className="muted" style={{ marginTop: 12 }}>
            {cleanText(quiz.title)}
          </p>
          <section className="section">
            <div className="section-heading">
              <h2>Your score</h2>
              <strong style={{ fontSize: 28 }}>
                {result.attempt.score} / {result.attempt.total_points}
              </strong>
            </div>
            <p>
              {result.attempt.percentage}% ·{' '}
              <Status tone={result.attempt.is_passed ? 'good' : 'pending'}>
                {result.attempt.is_passed ? 'Passed' : 'Needs practice'}
              </Status>
            </p>
            <p className="muted" style={{ marginTop: 16 }}>
              Your score and screen activity ({events.length} screen changes) have been saved. You can review your answers in My Progress.
            </p>
          </section>
          {result.intervention?.triggered && (
            <section className="section">
              <h2>Next step</h2>
              <p style={{ marginTop: 16 }}>We prepared a review material to help you practice this topic.</p>
              <button className="text-action" onClick={onNavigateToRemedial}>
                Open practice <ArrowRight size={16} />
              </button>
            </section>
          )}
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/student/progress">
              See your answers <ArrowRight size={16} />
            </Link>
            <button className="btn btn-secondary" onClick={onBackToDashboard}>
              Back to home
            </button>
          </div>
        </div>
      ) : !questions.length ? (
        <>
          <EmptyState title="This quiz has no questions yet">Ask your teacher to check this quiz.</EmptyState>
          <Link to="/student/activities">Back to activities</Link>
        </>
      ) : (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">Araling Panlipunan · Quiz</span>
              <h1 style={{ marginTop: 12 }}>{cleanText(quiz.title)}</h1>
              <p>{cleanText(quiz.instructions || 'Read each question carefully and choose the best answer.')}</p>
            </div>
            <button
              className="text-action"
              onClick={() =>
                document.documentElement
                  .requestFullscreen?.()
                  .catch(() => setActionError('Full screen is not available in this browser. You can continue here.'))
              }
            >
              <Maximize2 size={16} />
              Full screen
            </button>
          </div>
          <Notice error>{actionError || storageError}</Notice>
          <Notice>{focusNotice}</Notice>
          {remaining === 0 && (
            <Notice>
              Time is up. {online ? 'Click Submit quiz below to save your final answers.' : 'Reconnect to the internet to submit your answers.'}
            </Notice>
          )}
          <div className="quiz-layout">
            <section>
              <div className="quiz-toolbar">
                <span>
                  <strong>{review ? 'Check your answers' : `Question ${index + 1} of ${questions.length}`}</strong> · {count} answered
                </span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: remaining < 60 ? 'var(--status-critical)' : 'var(--colors-primary)',
                    fontSize: 22
                  }}
                  aria-label={`${timeText(remaining)} left`}
                >
                  <Clock size={22} />
                  {timeText(remaining)}
                  <small>left</small>
                </span>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label="Questions answered"
                aria-valuemin={0}
                aria-valuemax={questions.length}
                aria-valuenow={count}
              >
                <span style={{ width: `${(count / questions.length) * 100}%` }} />
              </div>
              {review ? (
                <section className="section">
                  <h2>Ready to submit?</h2>
                  <p className="muted" style={{ marginTop: 12 }}>
                    {questions.length - count} not answered · {flags.length} marked for review. Click any question below if you want to change your answer.
                  </p>
                  <div className="review-list">
                    {questions.map((q, i) => (
                      <button key={q.id} onClick={() => go(i)} disabled={isOfflineBlocked}>
                        <span>
                          {i + 1}. {cleanText(q.question_text)}
                        </span>
                        <Status tone={answered(q, answers[q.id]) ? 'good' : 'pending'}>
                          {answered(q, answers[q.id]) ? `Answer: ${answers[q.id]}` : 'No answer'}
                          {flags.includes(q.id) ? ' · Marked' : ''}
                        </Status>
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: 24 }}
                    onClick={submit}
                    disabled={busy || isOfflineBlocked}
                  >
                    {busy ? 'Submitting…' : 'Submit quiz'}
                    <ArrowRight size={16} />
                  </button>
                  <p className="muted" style={{ fontSize: 14, marginTop: 12 }}>
                    Once you submit, your answers are final.
                  </p>
                </section>
              ) : (
                <>
                  <fieldset className="quiz-question" disabled={busy || remaining === 0 || isOfflineBlocked}>
                    <legend>{cleanText(question.question_text)}</legend>
                    {getMcqOptions(question).map(o => (
                      <label key={o.id} className="answer-option">
                        <input
                          type="radio"
                          name={question.id}
                          value={o.id}
                          checked={answers[question.id] === o.id}
                          onChange={() => setAnswer(o.id)}
                        />
                        <span>
                          <strong>{o.id}.</strong> {cleanText(o.text)}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="quiz-toolbar">
                    <button className="text-action" disabled={index === 0 || isOfflineBlocked} onClick={() => go(index - 1)}>
                      <ArrowLeft size={16} />
                      Previous
                    </button>
                    <button
                      className="text-action"
                      disabled={isOfflineBlocked}
                      aria-pressed={flags.includes(question.id)}
                      onClick={() =>
                        setFlags(prev =>
                          prev.includes(question.id) ? prev.filter(id => id !== question.id) : [...prev, question.id]
                        )
                      }
                    >
                      <Flag size={16} />
                      {flags.includes(question.id) ? 'Remove mark' : 'Mark for review'}
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled={isOfflineBlocked}
                      onClick={() => (index === questions.length - 1 ? setReview(true) : go(index + 1))}
                    >
                      {index === questions.length - 1 ? 'Check answers' : 'Next question'}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </>
              )}
            </section>
            <aside className="aside">
              <section>
                <h2>Questions</h2>
                <div className="question-nav">
                  {questions.map((q, i) => (
                    <button
                      key={q.id}
                      disabled={isOfflineBlocked}
                      onClick={() => go(i)}
                      className={i === index && !review ? 'current' : answered(q, answers[q.id]) ? 'answered' : ''}
                      aria-label={`Question ${i + 1}, ${answered(q, answers[q.id]) ? 'answered' : 'not answered'}${
                        flags.includes(q.id) ? ', marked' : ''
                      }`}
                      aria-current={i === index && !review ? 'step' : undefined}
                    >
                      {i + 1}
                      {flags.includes(q.id) ? '*' : ''}
                    </button>
                  ))}
                </div>
                <p>
                  <Status tone="good">Answered</Status> · * Marked
                </p>
                <p>{storageError ? 'Keep this page open until you submit.' : 'Your answers are saved while you work.'}</p>
                <button className="btn btn-secondary" disabled={isOfflineBlocked} onClick={() => setReview(true)}>
                  Check answers
                </button>
              </section>
              <section>
                <h3>Quiz Monitor</h3>
                <p>Please stay on this page while taking the quiz. Leaving the window or switching tabs is recorded for your teacher.</p>
                <p>
                  <strong>{events.length}</strong> screen change{events.length === 1 ? '' : 's'} recorded
                </p>
                {events.length > 0 && (
                  <ul className="simple-list" style={{ fontSize: 12, maxHeight: 160, overflowY: 'auto' }}>
                    {events.slice(-5).map((ev, idx) => (
                      <li key={`${ev.timestamp}-${idx}`} style={{ padding: '6px 0' }}>
                        <strong>{formatEventType(ev.event_type)}</strong> · {new Date(ev.timestamp).toLocaleTimeString()}
                      </li>
                    ))}
                  </ul>
                )}
                <Link className="text-action" to="/student/activities">
                  Back to activities
                </Link>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
