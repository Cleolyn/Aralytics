import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import useRemoteData from '../../hooks/useRemoteData';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import { EmptyState, Loading, Notice } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';

const PAGE = 25;
export const ACTION_LABELS = {
  APPLICATION_APPROVED: 'Approved instructor application',
  APPLICATION_RETURNED: 'Returned instructor application',
  INSTRUCTOR_REVOKED: 'Revoked instructor access',
  ACCOUNT_SUSPENDED: 'Suspended account',
  ACCOUNT_UNSUSPENDED: 'Unsuspended account',
  ACCOUNT_DELETED: 'Deleted account',
  STORAGE_PURGED: 'Deleted a person’s files'
};

const timeOf = value => {
  const date = new Date(`${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(date);
};

function detailsOf(entry) {
  const d = entry.details || {};
  if (d.reason) return `Reason: ${d.reason}`;
  if (entry.action === 'STORAGE_PURGED') return `${d.removed ?? 0} files removed`;
  if (entry.action === 'ACCOUNT_DELETED') return `${d.removed_files ?? 0} files removed`;
  return '';
}

/** Read-only history of admin actions, newest first. */
export default function AuditLogTable() {
  const first = useRemoteData(() => api.getAuditLog({ limit: PAGE }), []);
  const more = useAsyncAction();
  const [entries, setEntries] = useState([]);
  const [next, setNext] = useState(null);

  useEffect(() => {
    if (first.data) { setEntries(first.data.entries || []); setNext(first.data.next_before || null); }
  }, [first.data]);

  const loadMore = () => more.run(async () => {
    const page = requireSuccess(await api.getAuditLog({ limit: PAGE, before: next }));
    setEntries(current => [...current, ...(page.entries || [])]);
    setNext(page.next_before || null);
  });

  if (first.loading) return <Loading>Loading activity…</Loading>;
  return (
    <>
      <Notice error>{first.error || more.error}</Notice>
      {!entries.length ? (
        <EmptyState title="No activity yet">Reviews, suspensions, and deletions are recorded here.</EmptyState>
      ) : (
        <div className="table-responsive" tabIndex={0} role="region" aria-label="Admin activity">
          <table className="data-table">
            <thead>
              <tr><th>When</th><th>Admin</th><th>Action</th><th>Account</th></tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id}>
                  <td>{timeOf(entry.created_at)}</td>
                  <td>{entry.actor_email || 'Unknown'}</td>
                  <td>
                    <strong>{ACTION_LABELS[entry.action] || cleanText(entry.action)}</strong>
                    {detailsOf(entry) && <small>{detailsOf(entry)}</small>}
                  </td>
                  <td>{entry.target_label || entry.target_id || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {next && (
        <div className="hero-actions">
          <button className="btn btn-secondary" disabled={Boolean(more.busy)} onClick={loadMore}>{more.busy ? 'Loading…' : 'Load more'}</button>
        </div>
      )}
    </>
  );
}
