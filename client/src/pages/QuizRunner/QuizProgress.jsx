import React from 'react';
import { Clock } from '../../components/icons';
import { timeText } from './quizUtils';

/** Position, answered count, countdown, and progress bar above the question. */
export default function QuizProgress({ reviewing, index, total, answeredCount, remaining }) {
  return (
    <>
      <div className="quiz-toolbar">
        <span>
          <strong>{reviewing ? 'Check your answers' : `Question ${index + 1} of ${total}`}</strong> · {answeredCount} answered
        </span>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 10, color: remaining < 60 ? 'var(--status-critical)' : 'var(--colors-primary)', fontSize: 22 }}
          aria-label={`${timeText(remaining)} left`}
        >
          <Clock size={22} />
          {timeText(remaining)}
          <small>left</small>
        </span>
      </div>
      <div className="progress-track" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answeredCount}>
        <span style={{ width: `${(answeredCount / total) * 100}%` }} />
      </div>
    </>
  );
}
