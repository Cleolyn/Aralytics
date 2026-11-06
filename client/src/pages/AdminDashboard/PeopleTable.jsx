import React, { useCallback, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import useRemoteData from '../../hooks/useRemoteData';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import { EmptyState, Loading, Notice, Status } from '../../components/ui/Feedback';
import { cleanText, formatDate } from '../../utils/learning';
import AccountActionDialog from './AccountActionDialog';
import DeleteAccountDialog from './DeleteAccountDialog';

const PAGE_SIZE = 50;
const ROLE_LABELS = { STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Admin' };

/** People directory: search, filter, and account actions (suspend, revoke instructor access, delete). */
export default function PeopleTable() {
  const { user: me } = useAuth();
  const action = useAsyncAction();
  const [draft, setDraft] = useState('');
  const [filters, setFilters] = useState({ q: '', role: '', status: '' });
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const closeDialog = useCallback(() => setDialog(null), []);

  const people = useRemoteData(() => {
    const params = Object.fromEntries(Object.entries({ ...filters, page: page > 1 ? page : '' }).filter(([, value]) => value));
    return api.getAdminUsers(params);
  }, [filters.q, filters.role, filters.status, page]);
  const users = people.data?.users || [];
  const total = people.data?.total || 0;

  const change = values => { setFilters(current => ({ ...current, ...values })); setPage(1); };
  const label = person => cleanText(person.full_name, person.email);
  const open = (kind, person) => { action.setError(''); setDialog({ kind, person }); };

  const done = message => { setDialog(null); action.setMessage(message); people.refresh(); };
  const suspend = reason => action.run(async () => {
    requireSuccess(await api.suspendUser(dialog.person.id, { reason }));
    done(`${label(dialog.person)} is suspended.`);
  });
  const revoke = reason => action.run(async () => {
    const result = requireSuccess(await api.revokeInstructor(dialog.person.id, { reason }));
    done(`${label(dialog.person)} is now a student account. ${result.closed_invitations} class codes closed, ${result.released_students} students released.`);
  });
  const remove = email => action.run(async () => {
    requireSuccess(await api.deleteUser(dialog.person.id, { confirm_email: email }));
    done(`Deleted the account for ${dialog.person.email}.`);
  });
  const unsuspend = person => action.run(async () => {
    requireSuccess(await api.unsuspendUser(person.id));
    action.setMessage(`${label(person)} can sign in again.`);
    people.refresh();
  }, { key: person.id });

  return (
    <>
      <form className="filters" role="search" onSubmit={event => { event.preventDefault(); change({ q: draft.trim() }); }}>
        <div className="field search-field">
          <label htmlFor="people-search">Search people</label>
          <input id="people-search" className="form-input" type="search" placeholder="Name, email, or LRN" value={draft} onChange={e => setDraft(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="people-role">Role</label>
          <select id="people-role" className="form-input" value={filters.role} onChange={e => change({ role: e.target.value })}>
            <option value="">All roles</option>
            <option value="STUDENT">Students</option>
            <option value="TEACHER">Teachers</option>
            <option value="ADMIN">Admins</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="people-status">Status</label>
          <select id="people-status" className="form-input" value={filters.status} onChange={e => change({ status: e.target.value })}>
            <option value="">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
        <button className="btn btn-secondary">Search</button>
      </form>
      <Notice error>{people.error || (!dialog && action.error)}</Notice>
      <Notice success>{action.message}</Notice>
      {people.loading ? (
        <Loading>Loading people…</Loading>
      ) : !users.length ? (
        <EmptyState title="No people found">Try a different search or filter.</EmptyState>
      ) : (
        <>
          <div className="table-responsive" tabIndex={0} role="region" aria-label="People">
            <table className="data-table">
              <thead>
                <tr><th>Person</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map(person => {
                  const self = person.id === me?.id;
                  return (
                    <tr key={person.id}>
                      <td>
                        <strong>{label(person)}{self ? ' (you)' : ''}</strong>
                        <small>{person.email}</small>
                        {person.role === 'STUDENT' && person.adviser_name && <small>Adviser: {cleanText(person.adviser_name)}</small>}
                      </td>
                      <td>{ROLE_LABELS[person.role] || person.role}</td>
                      <td>
                        <Status tone={person.status === 'SUSPENDED' ? '' : 'good'}>{person.status === 'SUSPENDED' ? 'Suspended' : 'Active'}</Status>
                        {person.status === 'SUSPENDED' && person.suspended_reason && <small>{person.suspended_reason}</small>}
                      </td>
                      <td>{formatDate(person.created_at, '')}</td>
                      <td>
                        {!self && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                            {person.status === 'SUSPENDED'
                              ? <button className="text-action" disabled={action.busy === person.id} onClick={() => unsuspend(person)}>Unsuspend</button>
                              : <button className="text-action" onClick={() => open('suspend', person)}>Suspend</button>}
                            {person.role === 'TEACHER' && <button className="text-action" onClick={() => open('revoke', person)}>Revoke instructor</button>}
                            <button className="text-action" onClick={() => open('delete', person)}>Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <nav className="hero-actions" aria-label="People pages">
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <small>{(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + users.length} of {total}</small>
            <button className="btn btn-secondary" disabled={page * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        </>
      )}
      {dialog && dialog.kind !== 'delete' && (
        <AccountActionDialog
          kind={dialog.kind}
          person={dialog.person}
          error={action.error}
          saving={Boolean(action.busy)}
          onSubmit={dialog.kind === 'suspend' ? suspend : revoke}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteAccountDialog person={dialog.person} error={action.error} saving={Boolean(action.busy)} onSubmit={remove} onClose={closeDialog} />
      )}
    </>
  );
}
