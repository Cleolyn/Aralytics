import React, { useState } from 'react';
import Dialog from '../../components/ui/Dialog';
import { Notice, Status } from '../../components/ui/Feedback';
import { cleanText, formatDate } from '../../utils/learning';
import { STATUS_LABELS, statusTone } from './ApplicationsTable';

function Detail({ label, children }) {
  if (!children) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Full application details; pending applications can be approved or returned with a reason. */
export default function ReviewDialog({ application: a, error, saving, onApprove, onReject, onClose }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const pending = a.status === 'PENDING';
  return (
    <Dialog title={`Instructor application: ${cleanText(a.full_name)}`} onClose={onClose}>
      <Notice error>{error}</Notice>
      <p>
        <Status tone={statusTone(a.status)}>{STATUS_LABELS[a.status] || a.status}</Status>
      </p>
      <dl className="enrollment-details">
        <Detail label="Email">{a.email}</Detail>
        <Detail label="School">{cleanText(a.school)}</Detail>
        <Detail label="Position">{cleanText(a.position)}</Detail>
        <Detail label="Employee ID">{cleanText(a.employee_id)}</Detail>
        <Detail label="Mobile">{a.mobile}</Detail>
        <Detail label="Submitted">{formatDate(a.created_at, '')}</Detail>
        <Detail label="Note">{a.message}</Detail>
        {!pending && <Detail label="Reviewed">{[cleanText(a.reviewed_by_name), formatDate(a.reviewed_at, '')].filter(Boolean).join(' · ')}</Detail>}
        {!pending && <Detail label="Reason">{a.reason}</Detail>}
      </dl>
      {pending && !rejecting && (
        <div className="hero-actions">
          <button className="btn btn-primary" disabled={saving} onClick={onApprove}>
            {saving ? 'Saving…' : 'Approve as instructor'}
          </button>
          <button className="btn btn-secondary" disabled={saving} onClick={() => setRejecting(true)}>
            Return with a reason
          </button>
        </div>
      )}
      {pending && rejecting && (
        <form
          onSubmit={e => {
            e.preventDefault();
            onReject(reason);
          }}
        >
          <div className="field">
            <label htmlFor="review-reason">Reason for the applicant</label>
            <textarea id="review-reason" className="form-input" required maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
            <small>The applicant sees this and can correct their application.</small>
          </div>
          <div className="hero-actions">
            <button className="btn btn-primary" disabled={saving || !reason.trim()}>
              {saving ? 'Saving…' : 'Return application'}
            </button>
            <button type="button" className="text-action" disabled={saving} onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
