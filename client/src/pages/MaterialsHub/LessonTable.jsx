import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, Edit3, Trash2 } from '../../components/icons';
import { Status } from '../../components/ui/Feedback';
import { cleanText, ilawLabels, materialUrl } from '../../utils/learning';

function OfflineButton({ material, saved, saving, onToggle }) {
  const missing = material.resource_available === false;
  let label;
  if (saving) label = 'Saving…';
  else if (saved) label = 'Remove save';
  else if (missing) label = 'File missing';
  else label = <><Download size={15} />Save offline</>;
  return (
    <button className="text-action" disabled={saving || missing} onClick={onToggle}>
      {label}
    </button>
  );
}

/** Lesson list with read/offline status and per-row actions. */
export default function LessonTable({ lessons, cached, readIds, competencyById, basePath, isTeacher, busyId, onToggleOffline, onEdit, onDelete }) {
  return (
    <div className="table-responsive" tabIndex={0} role="region" aria-label="Lesson resources">
      <table className="data-table">
        <thead>
          <tr>
            <th>Lesson</th>
            <th>Step</th>
            <th>Status</th>
            <th>Offline</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {lessons.map(m => {
            const saved = cached.has(materialUrl(m.storage_url));
            const read = readIds.has(m.id);
            return (
              <tr key={m.id}>
                <td>
                  <strong>{cleanText(m.title)}</strong>
                  <small>
                    {cleanText(m.file_type)} · {cleanText(competencyById.get(m.competency_id)?.topic_title || m.melc_code)}
                  </small>
                </td>
                <td>{ilawLabels[m.ilaw_tag] || 'Lessons'}</td>
                <td>
                  <Status tone={read ? 'good' : ''}>{read ? 'Read' : 'Not read'}</Status>
                </td>
                <td>
                  {saved ? (
                    <Status tone="good">Saved offline</Status>
                  ) : (
                    <span className="muted">{m.resource_available === false ? 'File missing' : 'Online only'}</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                    <Link className="text-action" to={`${basePath}/${m.id}`}>
                      Open <ArrowRight size={15} />
                    </Link>
                    <OfflineButton material={m} saved={saved} saving={busyId === m.id} onToggle={() => onToggleOffline(m, saved)} />
                    {isTeacher && (
                      <>
                        <button type="button" className="text-action" onClick={() => onEdit(m)}>
                          <Edit3 size={15} />
                          Edit
                        </button>
                        <button type="button" className="text-action" disabled={busyId === m.id} onClick={() => onDelete(m)}>
                          <Trash2 size={15} />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
