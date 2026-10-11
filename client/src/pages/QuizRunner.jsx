import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock, Flag, Maximize2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';

function answered(question, answer) {
  if (question.question_type === 'MATCHING') return Boolean(question.options?.premises?.length && question.options.premises.every(p => answer?.[p.id]));
  return typeof answer === 'string' && answer.trim().length > 0;
}
const timeText = seconds => `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${(seconds % 60).toString().padStart(2,'0')}`;

export default function QuizRunner({ quizId, onBackToDashboard, onNavigateToRemedial }) {
  const { user } = useAuth();
  const sessionKey = `aralytics:quiz-session:${user.id}:${quizId}`;
  const restored = useRef(null);
  if (!restored.current) { try { restored.current = JSON.parse(localStorage.getItem(sessionKey)) || {}; } catch { restored.current = {}; } }
  const [answers,setAnswers] = useState(restored.current.answers || {});
  const [deadline,setDeadline] = useState(restored.current.deadline || 0);
  const [events,setEvents] = useState(restored.current.events || []);
  const [flags,setFlags] = useState(restored.current.flags || []);
  const [index,setIndex] = useState(0);
  const [review,setReview] = useState(false);
  const [now,setNow] = useState(Date.now());
  const [online,setOnline] = useState(navigator.onLine);
  const [result,setResult] = useState(null);
  const [busy,setBusy] = useState(false);
  const [actionError,setActionError] = useState('');
  const [storageError,setStorageError] = useState('');
  const [focusNotice,setFocusNotice] = useState('');
  const lock = useRef(false);
  const lastFocus = useRef(0);
  const autoAttempt = useRef(false);
  const { data, loading, error, refresh } = useRemoteData(() => api.getQuizById(quizId), [quizId]);
  const quiz = data?.quiz;
  const submitted = quiz?.currentSubmission?.status === 'SUBMITTED';
  const questions = quiz?.questions || [];
  const question = questions[index];
  const remaining = Math.max(0,Math.ceil((deadline - now) / 1000));
  const count = questions.filter(q => answered(q,answers[q.id])).length;
  useEffect(() => { if (quiz && !submitted && !deadline) setDeadline(Date.now() + (quiz.time_limit_minutes || 20) * 60000); }, [quiz,submitted,deadline]);
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); if (navigator.onLine) autoAttempt.current = false; };
    window.addEventListener('online',update); window.addEventListener('offline',update);
    return () => { window.removeEventListener('online',update); window.removeEventListener('offline',update); };
  }, []);
  useEffect(() => { if (!deadline || result || submitted) return; const timer = setInterval(() => setNow(Date.now()),1000); return () => clearInterval(timer); }, [deadline,result,submitted]);
  useEffect(() => {
    if (!deadline || result || submitted) return;
    try { localStorage.setItem(sessionKey,JSON.stringify({ answers,deadline,events,flags })); } catch { setStorageError('Your browser could not save answers on this device. Keep this page open until submission.'); }
  }, [answers,deadline,events,flags,result,submitted,sessionKey]);
  useEffect(() => {
    if (!quiz || result || submitted || !online) return;
    const record = type => {
      if (Date.now() - lastFocus.current < 1200 || lock.current) return;
      lastFocus.current = Date.now();
      const event = { event_type: type,timestamp: new Date().toISOString() };
      setEvents(prev => [...prev,event]);
      setFocusNotice('A focus change was recorded. Please keep the quiz window active; your teacher can review this record.');
    };
    const blur = () => record('WINDOW_BLUR');
    const visibility = () => { if (document.hidden) record('TAB_SWITCH'); };
    window.addEventListener('blur',blur); document.addEventListener('visibilitychange',visibility);
    return () => { window.removeEventListener('blur',blur); document.removeEventListener('visibilitychange',visibility); };
  }, [quiz,result,submitted,online]);
  const submit = useCallback(async () => {
    if (lock.current || result || !quiz || submitted || !navigator.onLine) return;
    lock.current = true; setBusy(true); setActionError('');
    try {
      const response = await api.submitAssessmentAttempt({ quiz_id: quiz.id,student_id: user.id,score: 0,total_points: quiz.total_points,tab_switch_count: events.length,security_events: events,answers: questions.map(q => ({ question_id: q.id,selected_answer: answers[q.id] ?? '' })) });
      if (!response.success) throw new Error(response.message || 'Could not submit the assessment.');
      setResult(response); localStorage.removeItem(sessionKey);
    } catch (err) { setActionError(`${err.message} Your answers remain on this page. You can try submitting again.`); }
    finally { lock.current = false; setBusy(false); }
  }, [result,quiz,submitted,user.id,events,questions,answers,sessionKey]);
  useEffect(() => { if (quiz && deadline && remaining === 0 && !result && !submitted && online && !autoAttempt.current) { autoAttempt.current = true; submit(); } }, [quiz,deadline,remaining,result,submitted,online,submit]);
  const go = value => { setIndex(value); setReview(false); };
  function setAnswer(value) { if (remaining > 0 && !busy) setAnswers(prev => ({ ...prev,[question.id]: value })); }
  if (loading) return <div className="container"><Loading>Opening your assessment…</Loading></div>;
  if (error || !quiz) return <div className="container"><Notice error>{error || 'This quiz could not be opened.'}</Notice><button className="text-action" onClick={refresh}>Try again</button><Link className="text-action" style={{ marginLeft: 24 }} to="/student/activities">Back to activities</Link></div>;
  if (submitted && !result) return <div className="container"><div className="page-heading"><div><h1>{quiz.title}</h1><p>You have already submitted this quiz.</p></div></div><Link className="btn btn-primary" to="/student/progress">View your result <ArrowRight size={16} /></Link></div>;
  if (result) return <div className="container" style={{ maxWidth: 900 }}><span className="eyebrow">Assessment complete</span><h1 style={{ marginTop: 16 }}>{result.attempt.is_passed ? 'Mahusay! Keep learning.' : 'Every attempt is a step forward.'}</h1><p className="muted" style={{ marginTop: 12 }}>{quiz.title}</p><section className="section"><div className="section-heading"><h2>Your score</h2><strong style={{ fontSize: 28 }}>{result.attempt.score} / {result.attempt.total_points}</strong></div><p>{result.attempt.percentage}% · <Status tone={result.attempt.is_passed ? 'good' : 'pending'}>{result.attempt.is_passed ? 'Completed' : 'Practice suggested'}</Status></p><p className="muted" style={{ marginTop: 16 }}>Your result has been recorded. Review your answers in My Progress.</p></section>{result.intervention?.triggered && <section className="section"><h2>Your next step</h2><p style={{ marginTop: 16 }}>Practice has been suggested to strengthen your understanding.</p><button className="text-action" onClick={onNavigateToRemedial}>Open Pagsulong <ArrowRight size={16} /></button></section>}<div className="hero-actions"><Link className="btn btn-primary" to="/student/progress">Review your result <ArrowRight size={16} /></Link><button className="btn btn-secondary" onClick={onBackToDashboard}>Back to overview</button></div></div>;
  if (!questions.length) return <div className="container"><EmptyState title="This quiz has no questions">Ask your teacher for an updated assessment.</EmptyState><Link to="/student/activities">Back to activities</Link></div>;
  const choiceTypes = ['MULTIPLE_CHOICE','TRUE_FALSE','SITUATIONAL','PISA_LIKE'];
  const options = question?.question_type === 'TRUE_FALSE' ? [{ id: 'TRUE',text: 'True / Tama' },{ id: 'FALSE',text: 'False / Mali' }] : Array.isArray(question?.options) ? question.options : [];
  return <div className="container"><div className="page-heading"><div><span className="eyebrow">Araling Panlipunan · Assessment</span><h1 style={{ marginTop: 12 }}>{quiz.title}</h1><p>{quiz.instructions || 'Read each question carefully and choose your answer.'}</p></div><button className="text-action" onClick={() => document.documentElement.requestFullscreen?.().catch(() => setActionError('Full screen is unavailable in this browser. You can continue here.'))}><Maximize2 size={16} />Full screen</button></div>
    <Notice error>{actionError || storageError}</Notice><Notice error={!online}>{!online && 'You are offline. Your answers remain on this device, but the timer continues. Reconnect to submit your assessment.'}</Notice><Notice>{focusNotice}</Notice>{remaining === 0 && <Notice>The time limit has ended. {online ? 'Submit your saved answers if automatic submission has not completed.' : 'Reconnect to submit your saved answers.'}</Notice>}
    <div className="quiz-layout"><section><div className="quiz-toolbar"><span><strong>{review ? 'Review your answers' : `Question ${index + 1} of ${questions.length}`}</strong> · {count} answered</span><span style={{ display: 'flex', alignItems: 'center', gap: 10, color: remaining < 60 ? 'var(--status-critical)' : 'var(--colors-primary)', fontSize: 22 }} aria-label={`${timeText(remaining)} remaining`}><Clock size={22} />{timeText(remaining)}<small>remaining</small></span></div><div className="progress-track" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={count}><span style={{ width: `${count / questions.length * 100}%` }} /></div>
      {review ? <section className="section"><h2>Ready to submit?</h2><p className="muted" style={{ marginTop: 12 }}>{questions.length - count} unanswered · {flags.length} flagged for review. You can open any question before submitting.</p><div className="review-list">{questions.map((q,i) => <button key={q.id} onClick={() => go(i)}><span>{i + 1}. {q.question_text}</span><Status tone={answered(q,answers[q.id]) ? 'good' : 'pending'}>{answered(q,answers[q.id]) ? 'Answered' : 'Unanswered'}{flags.includes(q.id) ? ' · Flagged' : ''}</Status></button>)}</div><button className="btn btn-primary" style={{ marginTop: 24 }} onClick={submit} disabled={busy || !online}>{busy ? 'Submitting…' : 'Submit assessment'}<ArrowRight size={16} /></button><p className="muted" style={{ fontSize: 14, marginTop: 12 }}>Submitting records your final answers and ends this attempt.</p></section> : <>
        <fieldset className="quiz-question" disabled={busy || remaining === 0}><legend>{question.question_text}</legend>
          {choiceTypes.includes(question.question_type) && options.map(o => <label key={o.id} className="answer-option"><input type="radio" name={question.id} value={o.id} checked={answers[question.id] === o.id} onChange={() => setAnswer(o.id)} /><span><strong>{o.id}.</strong> {o.text}</span></label>)}
          {question.question_type === 'MATCHING' && question.options?.premises?.map(p => <div className="field" key={p.id}><label htmlFor={`match-${p.id}`}>{p.text}</label><select id={`match-${p.id}`} className="form-input" value={answers[question.id]?.[p.id] || ''} onChange={e => setAnswer({ ...(answers[question.id] || {}),[p.id]: e.target.value })}><option value="">Choose a match</option>{question.options.responses?.map(r => <option key={r.id} value={r.id}>{r.text}</option>)}</select></div>)}
          {!choiceTypes.includes(question.question_type) && question.question_type !== 'MATCHING' && <div className="field"><label htmlFor="written-answer">Your answer</label><input id="written-answer" className="form-input" value={answers[question.id] || ''} onChange={e => setAnswer(e.target.value)} autoComplete="off" maxLength={2000} /></div>}
        </fieldset><div className="quiz-toolbar"><button className="text-action" disabled={index === 0} onClick={() => go(index - 1)}><ArrowLeft size={16} />Previous</button><button className="text-action" aria-pressed={flags.includes(question.id)} onClick={() => setFlags(prev => prev.includes(question.id) ? prev.filter(id => id !== question.id) : [...prev,question.id])}><Flag size={16} />{flags.includes(question.id) ? 'Unflag question' : 'Flag for review'}</button><button className="btn btn-primary" onClick={() => index === questions.length - 1 ? setReview(true) : go(index + 1)}>{index === questions.length - 1 ? 'Review answers' : 'Next question'}<ArrowRight size={16} /></button></div>
      </>}
    </section><aside className="aside"><section><h2>Question navigator</h2><div className="question-nav">{questions.map((q,i) => <button key={q.id} onClick={() => go(i)} className={i === index && !review ? 'current' : answered(q,answers[q.id]) ? 'answered' : ''} aria-label={`Question ${i + 1}, ${answered(q,answers[q.id]) ? 'answered' : 'unanswered'}${flags.includes(q.id) ? ', flagged' : ''}`} aria-current={i === index && !review ? 'step' : undefined}>{i + 1}{flags.includes(q.id) ? '*' : ''}</button>)}</div><p><Status tone="good">Answered</Status> · * Flagged</p><p>{storageError ? 'Keep this page open until you submit.' : 'Answers are saved on this device until you submit.'}</p><button className="btn btn-secondary" onClick={() => setReview(true)}>Review answers</button></section><section><h3>Assessment guidance</h3><p>Internet is required for submission. Keep this window active; focus changes are recorded for teacher review.</p><p>{events.length} focus changes recorded</p><Link className="text-action" to="/student/activities">Back to activities</Link></section></aside></div>
  </div>;
}
