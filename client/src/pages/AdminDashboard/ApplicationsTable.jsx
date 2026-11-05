import React from 'react';
import { ArrowRight } from '../../components/icons';
import { EmptyState, Status } from '../../components/ui/Feedback';
import { cleanText, formatDate } from '../../utils/learning';

export const STATUS_LABELS = { PENDING: 'Waiting for review', APPROVED: 'Approved', REJECTED: 'Returned' };
export const statusTone = status => (status === 'APPROVED' ? 'good' : status === 'PENDING' ? 'pending' : '');

const EMPTY = {
  PENDING: ['No applications waiting', 'New instructor applications will appear here for review.'],
  APPROVED: ['No approved applications yet', 'Applications you approve are listed here.'],
  REJECTED: ['No returned applications', 'Applications you send back with a reason are listed here.']
};

/** Instructor applications with a Review action per row. */
export default function ApplicationsTable({ applications, status, onReview }) {
  if (!applications.length) {
    const [title, body] = EMPTY[status];
    return <EmptyState title={title}>{body}</EmptyState>;
  }
  return (
    <div className="table-responsive" tabIndex={0} role="region" aria-label="Instructor applications">
      <table className="data-table">
        <thead>
          <tr>
            <th>Applicant</th>
            <th>School</th>
            <th>Submitted</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {applications.map(a => (
            <tr key={a.user_id}>
              <td>
                <strong>{cleanText(a.full_name)}</strong>
                <small>{a.email}</small>
              </td>
              <td>
                {cleanText(a.school)}
                <small>{cleanText(a.position)}</small>
              </td>
              <td>{formatDate(a.created_at, '')}</td>
              <td>
                <Status tone={statusTone(a.status)}>{STATUS_LABELS[a.status] || a.status}</Status>
              </td>
              <td>
                <button className="text-action" onClick={() => onReview(a)}>
                  {a.status === 'PENDING' ? 'Review' : 'View'} <ArrowRight size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
