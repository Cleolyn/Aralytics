import React from 'react';
import { ArrowRight } from '../../components/icons';
import { EmptyState, Status } from '../../components/ui/Feedback';
import { api } from '../../services/api';
import { cleanText, formatDate } from '../../utils/learning';

/** The selected task's grading guide and its learner submissions. */
export default function TaskSubmissionsTable({ task, submissions, onGrade }) {
  return (
    <>
      {task && (
        <div className="section-heading">
          <div>
            <h2>{cleanText(task.title)}</h2>
            <p className="muted">{cleanText(task.rubric_criteria, 'No grading guide added.')}</p>
          </div>
        </div>
      )}
      {!submissions.length ? (
        <EmptyState title="No task submissions yet">Files sent by students will show up here.</EmptyState>
      ) : (
        <div className="table-responsive" tabIndex={0} role="region" aria-label="Task submissions">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Submitted file</th>
                <th>Score</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map(s => {
                const graded = s.status === 'GRADED';
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{cleanText(s.student_name)}</strong>
                      <small>
                        {cleanText(s.section)} · {cleanText(s.lrn_or_id)}
                      </small>
                    </td>
                    <td>
                      <a href={api.getSubmissionFileUrl(s.file_url)} target="_blank" rel="noreferrer">
                        {cleanText(s.file_name)}
                      </a>
                      <small>{formatDate(s.submitted_at, '')}</small>
                    </td>
                    <td>{graded ? `${s.score} / ${task.total_points}` : 'Not graded yet'}</td>
                    <td>
                      <Status tone={graded ? 'good' : 'pending'}>{graded ? 'Graded' : 'Waiting for grade'}</Status>
                    </td>
                    <td>
                      <button className="text-action" onClick={() => onGrade(s)}>
                        {graded ? 'Edit grade' : 'Grade work'}
                        <ArrowRight size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
