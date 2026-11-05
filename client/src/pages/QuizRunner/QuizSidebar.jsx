import React from 'react';
import { Link } from 'react-router-dom';
import { Status } from '../../components/ui/Feedback';
import { formatEventType } from '../../utils/learning';
import { isAnswered } from './quizUtils';

/** Question navigator plus the screen-activity monitor. */
export default function QuizSidebar({ questions, answers, flags, currentIndex, reviewing, events, storageError, disabled, onSelect, onReview }) {
  return (
    <aside className="aside">
      <section>
        <h2>Questions</h2>
        <div className="question-nav">
          {questions.map((q, i) => {
            const current = i === currentIndex && !reviewing;
            const answered = isAnswered(answers[q.id]);
            const flagged = flags.includes(q.id);
            return (
              <button
                key={q.id}
                disabled={disabled}
                onClick={() => onSelect(i)}
                className={current ? 'current' : answered ? 'answered' : ''}
                aria-label={`Question ${i + 1}, ${answered ? 'answered' : 'not answered'}${flagged ? ', marked' : ''}`}
                aria-current={current ? 'step' : undefined}
              >
                {i + 1}
                {flagged ? '*' : ''}
              </button>
            );
          })}
        </div>
        <p>
          <Status tone="good">Answered</Status> · * Marked
        </p>
        <p>{storageError ? 'Keep this page open until you submit.' : 'Your answers are saved while you work.'}</p>
        <button className="btn btn-secondary" disabled={disabled} onClick={onReview}>
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
            {events.slice(-5).map((event, i) => (
              <li key={`${event.timestamp}-${i}`} style={{ padding: '6px 0' }}>
                <strong>{formatEventType(event.event_type)}</strong> · {new Date(event.timestamp).toLocaleTimeString()}
              </li>
            ))}
          </ul>
        )}
        <Link className="text-action" to="/student/activities">
          Back to activities
        </Link>
      </section>
    </aside>
  );
}
