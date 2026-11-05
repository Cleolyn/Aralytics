import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from '../../components/icons';
import { Status } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';

/** Score summary shown right after a successful submission. */
export default function QuizResult({ quiz, result, eventCount, onNavigateToRemedial, onBackToDashboard }) {
  const { attempt } = result;
  return (
    <div style={{ maxWidth: 900 }}>
      <span className="eyebrow">Quiz finished</span>
      <h1 style={{ marginTop: 16 }}>{attempt.is_passed ? 'Great job! You passed.' : 'Good try! Keep practicing.'}</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        {cleanText(quiz.title)}
      </p>
      <section className="section">
        <div className="section-heading">
          <h2>Your score</h2>
          <strong style={{ fontSize: 28 }}>
            {attempt.score} / {attempt.total_points}
          </strong>
        </div>
        <p>
          {attempt.percentage}% ·{' '}
          <Status tone={attempt.is_passed ? 'good' : 'pending'}>{attempt.is_passed ? 'Passed' : 'Needs practice'}</Status>
        </p>
        <p className="muted" style={{ marginTop: 16 }}>
          Your score and screen activity ({eventCount} screen changes) have been saved. You can review your answers in My Progress.
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
  );
}
