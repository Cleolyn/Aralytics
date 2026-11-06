import React, { useCallback, useState } from 'react';
import Dialog from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';
import { formatBytes } from '../../utils/upload';

const ROLE_LABELS = { TEACHER: 'Teacher', STUDENT: 'Student', ADMIN: 'Admin' };

function Meter({ label, used, cap }) {
  const percent = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return (
    <div>
      <p style={{ margin: 0 }}>
        <strong>{label}</strong> · {formatBytes(used)} of {formatBytes(cap)}
      </p>
      <div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** Storage overview: site and shard usage, and who is using the space. */
export default function StorageTable({ storage, saving, error, onPurge }) {
  const [confirming, setConfirming] = useState(null);
  const closeConfirm = useCallback(() => setConfirming(null), []);
  const users = storage.users || [];
  return (
    <>
      <section className="section" aria-label="Storage used">
        <Meter label="All files" used={storage.used} cap={storage.cap} />
        <small>{storage.file_count} files stored.</small>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {(storage.shards || []).map(shard => (
            <Meter key={shard.shard} label={shard.shard ? `Shard ${shard.shard}` : 'Local disk'} used={shard.used} cap={shard.cap} />
          ))}
        </div>
      </section>
      {!users.length ? (
        <EmptyState title="No files stored yet">Uploaded files and the people who own them appear here.</EmptyState>
      ) : (
        <div className="table-responsive" tabIndex={0} role="region" aria-label="Storage by person">
          <table className="data-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Used</th>
                <th>Files</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id}>
                  <td>
                    <strong>{cleanText(u.full_name, 'Unknown account')}</strong>
                    <small>{u.email}</small>
                  </td>
                  <td>{ROLE_LABELS[u.role] || 'Unknown'}</td>
                  <td>
                    {formatBytes(u.used)}
                    {u.quota ? <small>of {formatBytes(u.quota)}</small> : null}
                  </td>
                  <td>{u.files}</td>
                  <td>
                    <button type="button" className="text-action" onClick={() => setConfirming(u)}>
                      Delete user’s files
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirming && (
        <Dialog title="Delete all of this person’s files?" onClose={closeConfirm}>
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <p>
            Every file owned by <strong>{cleanText(confirming.full_name, confirming.user_id)}</strong> ({formatBytes(confirming.used)}) will be removed.
            Lessons and submissions that use them will lose their files.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary" disabled={saving} onClick={() => onPurge(confirming, closeConfirm)}>
              {saving ? 'Deleting…' : 'Delete all files'}
            </button>
            <button className="btn btn-secondary" onClick={closeConfirm}>Cancel</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
