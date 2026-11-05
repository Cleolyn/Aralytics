import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Maximize2 } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import useRemoteData from '../../hooks/useRemoteData';
import { EmptyState, Loading, Notice } from '../../components/ui/Feedback';
import { cleanText, formatEventType } from '../../utils/learning';
import useServerConnection from './useServerConnection';
import useQuizSession from './useQuizSession';
import useCountdown from './useCountdown';
import useProctoring from './useProctoring';
import OfflineLock from './OfflineLock';
import QuizResult from './QuizResult';
import QuestionStep from './QuestionStep';
import ReviewStep from './ReviewStep';
import QuizSidebar from './QuizSidebar';
import QuizProgress from './QuizProgress';
import { isAnswered } from './quizUtils';

/**
 * Focused, timed quiz for a learner. Answers and the deadline are kept on the
 * device; the timer keeps running through connection loss; submission is graded
 * on the server and blocked from repeating.
 */
export default function QuizRunner({ quizId, onBackToDashboard, onNavigateToRemedial }) {
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [focusNotice, setFocusNotice] = useState('');
  const submitting = useRef(false);
  const autoSubmitAttempted = useRef(false);

  const connection = useServerConnection({ onReconnect: () => { autoSubmitAttempted.current = false; } });
  const { checkHandshake } = connection;

  const { data, loading, error, refresh } = useRemoteData(async () => {
    if (!(await checkHandshake())) throw new Error('You need an internet connection to take this quiz. Please reconnect to continue.');
    return api.getQuizById(quizId);
  }, [quizId, checkHandshake]);

  const quiz = data?.quiz;
  const submitted = quiz?.currentSubmission?.status === 'SUBMITTED';
  const finished = Boolean(result) || submitted;
  const questions = quiz?.questions || [];
  const question = questions[index];

  const session = useQuizSession(`aralytics:quiz-session:${user.id}:${quizId}`, finished);
  const { answers, deadline, setDeadline, events, flags, clear: clearSession } = session;
  const remaining = useCountdown(deadline, !finished);
  const answeredCount = questions.filter(q => isAnswered(answers[q.id])).length;

  useEffect(() => {
    if (quiz && !submitted && !deadline) setDeadline(Date.now() + (quiz.time_limit_minutes || 20) * 60000);
  }, [quiz, submitted, deadline, setDeadline]);

  useProctoring({
    enabled: Boolean(quiz) && !finished && connection.online,
    isPaused: () => submitting.current,
    onEvent: event => {
      session.addEvent(event);
      setFocusNotice(
        `Reminder (${formatEventType(event.event_type)}): Leaving the quiz screen was recorded at ${new Date(event.timestamp).toLocaleTimeString()}. Please stay on this page.`
      );
      api.logSecurityEventAsync({ quiz_id: quiz.id, student_id: user.id, event_type: event.event_type, timestamp: event.timestamp }).catch(() => {});
    }
  });

  const submit = useCallback(async () => {
    if (submitting.current || finished || !quiz || !navigator.onLine) return;
    if (!(await checkHandshake())) return;
    submitting.current = true;
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
      clearSession();
    } catch (err) {
      setActionError(`${err.message} Your answers are still saved here. Please try submitting again.`);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }, [finished, quiz, checkHandshake, user.id, events, questions, answers, clearSession]);

  // Submit once when time runs out (retried after reconnecting).
  useEffect(() => {
    if (quiz && deadline && remaining === 0 && !finished && connection.online && !autoSubmitAttempted.current) {
      autoSubmitAttempted.current = true;
      submit();
    }
  }, [quiz, deadline, remaining, finished, connection.online, submit]);

  const goTo = i => {
    setIndex(i);
    setReviewing(false);
  };
  const answer = value => {
    if (remaining > 0 && !busy && !connection.blocked) session.setAnswer(question.id, value);
  };
  const retryConnection = () => checkHandshake().then(ok => { if (ok && !quiz) refresh(); });
  const blocked = connection.blocked;

  let content;
  if (loading) {
    content = <Loading>Opening your quiz…</Loading>;
  } else if (error || !quiz) {
    content = (
      <>
        <Notice error>{error || 'This quiz could not be opened.'}</Notice>
        <button className="text-action" disabled={blocked} onClick={refresh}>Try again</button>
        <Link className="text-action" style={{ marginLeft: 24 }} to="/student/activities">Back to activities</Link>
      </>
    );
  } else if (submitted && !result) {
    content = (
      <>
        <div className="page-heading">
          <div>
            <h1>{cleanText(quiz.title)}</h1>
            <p>You have already finished this quiz.</p>
          </div>
        </div>
        <Link className="btn btn-primary" to="/student/progress">See your score <ArrowRight size={16} /></Link>
      </>
    );
  } else if (result) {
    content = <QuizResult quiz={quiz} result={result} eventCount={events.length} onNavigateToRemedial={onNavigateToRemedial} onBackToDashboard={onBackToDashboard} />;
  } else if (!questions.length) {
    content = (
      <>
        <EmptyState title="This quiz has no questions yet">Ask your teacher to check this quiz.</EmptyState>
        <Link to="/student/activities">Back to activities</Link>
      </>
    );
  } else {
    content = (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">Araling Panlipunan · Quiz</span>
            <h1 style={{ marginTop: 12 }}>{cleanText(quiz.title)}</h1>
            <p>{cleanText(quiz.instructions || 'Read each question carefully and choose the best answer.')}</p>
          </div>
          <button
            className="text-action"
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => setActionError('Full screen is not available in this browser. You can continue here.'))}
          >
            <Maximize2 size={16} />
            Full screen
          </button>
        </div>
        <Notice error>{actionError || session.storageError}</Notice>
        <Notice>{focusNotice}</Notice>
        {remaining === 0 && (
          <Notice>Time is up. {connection.online ? 'Click Submit quiz below to save your final answers.' : 'Reconnect to the internet to submit your answers.'}</Notice>
        )}
        <div className="quiz-layout">
          <section>
            <QuizProgress reviewing={reviewing} index={index} total={questions.length} answeredCount={answeredCount} remaining={remaining} />
            {reviewing ? (
              <ReviewStep questions={questions} answers={answers} flags={flags} answeredCount={answeredCount} busy={busy} disabled={blocked} onSelect={goTo} onSubmit={submit} />
            ) : (
              <QuestionStep
                question={question}
                answer={answers[question.id]}
                flagged={flags.includes(question.id)}
                isFirst={index === 0}
                isLast={index === questions.length - 1}
                inputDisabled={busy || remaining === 0 || blocked}
                navDisabled={blocked}
                onAnswer={answer}
                onPrevious={() => goTo(index - 1)}
                onToggleFlag={() => session.toggleFlag(question.id)}
                onNext={() => (index === questions.length - 1 ? setReviewing(true) : goTo(index + 1))}
              />
            )}
          </section>
          <QuizSidebar
            questions={questions}
            answers={answers}
            flags={flags}
            currentIndex={index}
            reviewing={reviewing}
            events={events}
            storageError={session.storageError}
            disabled={blocked}
            onSelect={goTo}
            onReview={() => setReviewing(true)}
          />
        </div>
      </>
    );
  }

  return (
    <div className="container">
      {blocked && <OfflineLock onRetry={retryConnection} />}
      {content}
    </div>
  );
}
