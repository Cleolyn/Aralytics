import React from 'react';
import { Download, Trash2 } from '../../components/icons';
import { cleanText, formatDate } from '../../utils/learning';
import { formatBytes } from '../../utils/upload';

/** Personal files with a download link and a delete action. */
export default function FilesTable({ files, busyId, onDelete }) {
  return (
    <div className="table-responsive" tabIndex={0} role="region" aria-label="My files">
      <table className="data-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Size</th>
            <th>Added</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {files.map(file => (
            <tr key={file.id}>
              <td>
                <strong>{cleanText(file.name)}</strong>
              </td>
              <td>{formatBytes(file.size)}</td>
              <td>{formatDate(file.created_at, '')}</td>
              <td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  <a className="text-action" href={file.download_url} download={file.name}>
                    <Download size={15} />
                    Download
                  </a>
                  <button type="button" className="text-action" disabled={busyId === file.id} onClick={() => onDelete(file)}>
                    <Trash2 size={15} />
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
