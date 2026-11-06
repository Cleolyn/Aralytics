import React, { useState } from 'react';
import { ArrowRight } from '../../components/icons';
import Dialog from '../../components/ui/Dialog';
import { Notice } from '../../components/ui/Feedback';
import { api } from '../../services/api';
import { cleanText } from '../../utils/learning';

/** Score and comment for one performance-task submission. */
export default function GradeDialog({ submission, task, error, saving, onSubmit, onClose }) {
  const [score, setScore] = useState(submission.score === null ? '' : String(submission.score));
  const [feedback, setFeedback] = useState(submission.feedback || '');
  return (
    <Dialog title={`Grade ${cleanText(submission.student_name)}’s work`} onClose={onClose}>
      <Notice error>{error}</Notice>
      <a className="text-action" href={api.getSubmissionFileUrl(submission)} target="_blank" rel="noreferrer">
        Open {cleanText(submission.file_name)}
        <ArrowRight size={16} />
      </a>
      {submission.notes && (
        <p className="muted" style={{ margin: '16px 0' }}>
          Student note: {cleanText(submission.notes)}
        </p>
      )}
      <p style={{ margin: '16px 0' }}>Grading guide: {cleanText(task.rubric_criteria, 'No grading guide added.')}</p>
      <form
        onSubmit={e => {
          e.preventDefault();
          onSubmit({ score: Number(score), feedback });
        }}
      >
        <div className="field">
          <label htmlFor="grade-score">Score (out of {task.total_points})</label>
          <input
            id="grade-score"
            className="form-input"
            type="number"
            min={0}
            max={task.total_points}
            step="any"
            value={score}
            onChange={e => setScore(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="grade-feedback">Comment for the student</label>
          <textarea id="grade-feedback" className="form-input" value={feedback} onChange={e => setFeedback(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save score and comment'}
        </button>
      </form>
    </Dialog>
  );
}
