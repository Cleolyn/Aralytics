import React, { useState } from 'react';
import Dialog from '../../components/ui/Dialog';
import { Notice } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';

/** Permanent deletion; the admin must type the account's email address to confirm. */
export default function DeleteAccountDialog({ person, error, saving, onSubmit, onClose }) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toLowerCase() === String(person.email).toLowerCase();
  return (
    <Dialog title={`Delete ${cleanText(person.full_name, person.email)}?`} onClose={onClose}>
      <Notice error>{error}</Notice>
      <p>
        This permanently deletes the sign-in account, uploaded files, quiz attempts, scores, and enrollment for <strong>{person.email}</strong>.
        It cannot be undone. Instructors who still own lessons, quizzes, tasks, or classes with students cannot be deleted; revoke their access instead.
      </p>
      <form onSubmit={event => { event.preventDefault(); if (matches) onSubmit(typed.trim()); }}>
        <div className="field">
          <label htmlFor="delete-confirm-email">Type the email address to confirm</label>
          <input id="delete-confirm-email" className="form-input" autoComplete="off" placeholder={person.email} value={typed} onChange={e => setTyped(e.target.value)} />
        </div>
        <div className="hero-actions">
          <button className="btn btn-primary" disabled={saving || !matches}>{saving ? 'Deleting…' : 'Delete account'}</button>
          <button type="button" className="text-action" disabled={saving} onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}
