import React from 'react';
import { ArrowRight } from '../../components/icons';
import { Status } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';
import { isAnswered } from './quizUtils';

/** Final check before submitting: every question with its answer and mark. */
export default function ReviewStep({ questions, answers, flags, answeredCount, busy, disabled, onSelect, onSubmit }) {
  return (
    <section className="section">
      <h2>Ready to submit?</h2>
      <p className="muted" style={{ marginTop: 12 }}>
        {questions.length - answeredCount} not answered · {flags.length} marked for review. Click any question below if you want to change your answer.
      </p>
      <div className="review-list">
        {questions.map((q, i) => (
          <button key={q.id} onClick={() => onSelect(i)} disabled={disabled}>
            <span>
              {i + 1}. {cleanText(q.question_text)}
            </span>
            <Status tone={isAnswered(answers[q.id]) ? 'good' : 'pending'}>
              {isAnswered(answers[q.id]) ? `Answer: ${answers[q.id]}` : 'No answer'}
              {flags.includes(q.id) ? ' · Marked' : ''}
            </Status>
          </button>
        ))}
      </div>
      <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={onSubmit} disabled={busy || disabled}>
        {busy ? 'Submitting…' : 'Submit quiz'}
        <ArrowRight size={16} />
      </button>
      <p className="muted" style={{ fontSize: 14, marginTop: 12 }}>
        Once you submit, your answers are final.
      </p>
    </section>
  );
}
