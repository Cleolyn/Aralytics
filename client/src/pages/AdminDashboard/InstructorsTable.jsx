import React from 'react';
import { EmptyState } from '../../components/ui/Feedback';
import { cleanText, formatDate } from '../../utils/learning';

/** Accounts that currently have instructor access. */
export default function InstructorsTable({ instructors }) {
  if (!instructors.length) return <EmptyState title="No instructors yet">Approved applicants appear here.</EmptyState>;
  return (
    <div className="table-responsive" tabIndex={0} role="region" aria-label="Instructors">
      <table className="data-table">
        <thead>
          <tr>
            <th>Instructor</th>
            <th>School</th>
            <th>Approved</th>
            <th>Active class codes</th>
            <th>Students</th>
          </tr>
        </thead>
        <tbody>
          {instructors.map(t => (
            <tr key={t.id}>
              <td>
                <strong>{cleanText(t.full_name) || cleanText(`${t.first_name || ''} ${t.last_name || ''}`)}</strong>
                <small>{t.email}</small>
              </td>
              <td>
                {cleanText(t.school, 'Not recorded')}
                <small>{cleanText(t.position)}</small>
              </td>
              <td>{formatDate(t.approved_at, 'Before admin review')}</td>
              <td>{t.active_class_codes}</td>
              <td>{t.students}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
