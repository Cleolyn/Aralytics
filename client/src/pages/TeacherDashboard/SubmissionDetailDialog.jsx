import React from 'react';
import Dialog from '../../components/ui/Dialog';
import { Status } from '../../components/ui/Feedback';
import { cleanText, formatDate, formatEventType } from '../../utils/learning';

/** A learner's quiz answers and proctoring log. */
export default function SubmissionDetailDialog({ detail, onClose }) {
  const { submission, proctorLogs, answers } = detail;
  return (
    <Dialog title={cleanText(submission.quiz_title)} onClose={onClose}>
      <p>
        <strong>
          {cleanText(submission.first_name)} {cleanText(submission.last_name)}
        </strong>{' '}
        · {submission.score_obtained} / {submission.total_points}
      </p>
      <section className="section">
        <h3>Screen activity</h3>
        <p>{submission.blur_count} tab or window changes were recorded during the quiz.</p>
        {proctorLogs.length ? (
          <ul className="simple-list">
            {proctorLogs.map(log => (
              <li key={log.id}>
                {formatEventType(log.event_type)} · {formatDate(log.timestamp, '')}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No tab or window changes recorded.</p>
        )}
      </section>
      <section className="section">
        <h3>Answers</h3>
        <ul className="simple-list">
          {answers.map((a, i) => (
            <li key={a.id}>
              <strong>
                {i + 1}. {cleanText(a.question_text)}
              </strong>
              <p>Answer: {cleanText(a.selected_answer, 'No answer')}</p>
              <Status tone={a.is_correct ? 'good' : 'pending'}>{a.is_correct ? 'Correct' : 'Incorrect'}</Status>
            </li>
          ))}
        </ul>
      </section>
    </Dialog>
  );
}
