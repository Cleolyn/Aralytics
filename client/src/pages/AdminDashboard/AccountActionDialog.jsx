import React, { useState } from 'react';
import Dialog from '../../components/ui/Dialog';
import { Notice } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';

const COPY = {
  suspend: {
    title: name => `Suspend ${name}`,
    intro: 'They will be locked out of their workspace until you unsuspend the account. They will see the reason you write here.',
    label: 'Reason for suspension',
    submit: 'Suspend account'
  },
  revoke: {
    title: name => `Revoke instructor access: ${name}`,
    intro: 'This account becomes a student account. Their class codes close and their students are released to find a new adviser. Their lessons, quizzes, and tasks are kept.',
    label: 'Reason for revoking access',
    submit: 'Revoke instructor access'
  }
};

/** Collects the required reason for suspending an account or revoking instructor access. */
export default function AccountActionDialog({ kind, person, error, saving, onSubmit, onClose }) {
  const [reason, setReason] = useState('');
  const copy = COPY[kind];
  const name = cleanText(person.full_name, person.email);
  return (
    <Dialog title={copy.title(name)} onClose={onClose}>
      <Notice error>{error}</Notice>
      <p>{copy.intro}</p>
      <form onSubmit={event => { event.preventDefault(); onSubmit(reason.trim()); }}>
        <div className="field">
          <label htmlFor="account-action-reason">{copy.label}</label>
          <textarea id="account-action-reason" className="form-input" required maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
          <small>Up to 300 characters. This is saved in the activity log.</small>
        </div>
        <div className="hero-actions">
          <button className="btn btn-primary" disabled={saving || !reason.trim()}>{saving ? 'Saving…' : copy.submit}</button>
          <button type="button" className="text-action" disabled={saving} onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}
