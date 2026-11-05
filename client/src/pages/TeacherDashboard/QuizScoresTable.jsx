import React from 'react';
import { ArrowRight } from '../../components/icons';
import { EmptyState, Status } from '../../components/ui/Feedback';
import { cleanText, formatDate } from '../../utils/learning';

/** Submitted quiz scores with screen activity and a link to the answers. */
export default function QuizScoresTable({ entries, busy, onReview }) {
  if (!entries.length) return <EmptyState title="No quiz scores found">Finished quizzes will show up here.</EmptyState>;
  return (
    <div className="table-responsive" tabIndex={0} role="region" aria-label="Quiz gradebook">
      <table className="data-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Quiz</th>
            <th>Score</th>
            <th>Status</th>
            <th>Screen activity</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.submission_id}>
              <td>
                <strong>
                  {cleanText(e.first_name)} {cleanText(e.last_name)}
                </strong>
                <small>
                  {cleanText(e.section)} · {cleanText(e.lrn_or_id)}
                </small>
              </td>
              <td>
                {cleanText(e.quiz_title)}
                <small>{formatDate(e.submitted_at, '')}</small>
              </td>
              <td>
                {e.score_obtained} / {e.total_points}
                <small>{e.percentage}%</small>
              </td>
              <td>
                <Status tone={e.is_passed ? 'good' : 'pending'}>{e.is_passed ? 'Passed' : 'Needs practice'}</Status>
              </td>
              <td>
                {e.blur_count} screen changes
                {e.is_flagged_for_cheating ? ' · Check activity' : ''}
              </td>
              <td>
                <button className="text-action" disabled={busy} onClick={() => onReview(e.submission_id)}>
                  View answers <ArrowRight size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
