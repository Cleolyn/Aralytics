import React, { useState } from 'react';
import { Download, Edit3, Trash2 } from '../../components/icons';
import { Status } from '../../components/ui/Feedback';
import { cleanText, formatDate } from '../../utils/learning';
import { formatBytes } from '../../utils/upload';

function Attachment({ attachment }) {
  if (!attachment) return null;
  return (
    <a className="text-action" href={attachment.download_url} download={attachment.name}>
      <Download size={15} />
      {cleanText(attachment.name)} ({formatBytes(attachment.size)})
    </a>
  );
}

/**
 * Announcements, pinned first. Teachers see every post in full with Edit and Delete;
 * students see unread markers and open a post to read it (which marks it read).
 */
export default function AnnouncementList({ items, teacher = false, busyId, onEdit, onDelete, onRead }) {
  const [openId, setOpenId] = useState(null);
  const toggle = item => {
    const opening = openId !== item.id;
    setOpenId(opening ? item.id : null);
    if (opening && !item.read) onRead?.(item);
  };
  return (
    <ul className="announcement-list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
      {items.map(item => {
        const expanded = teacher || openId === item.id;
        return (
          <li key={item.id} className="section" style={{ margin: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>
                {teacher ? cleanText(item.title) : (
                  <button type="button" className="text-action" aria-expanded={expanded} onClick={() => toggle(item)}>
                    {cleanText(item.title)}
                  </button>
                )}
              </h3>
              <span style={{ display: 'flex', gap: 12 }}>
                {item.pinned && <Status tone="pending">Pinned</Status>}
                {item.attachment && !expanded && <Status>Attachment</Status>}
                {!teacher && !item.read && <Status tone="good">New</Status>}
              </span>
            </div>
            <small>
              {formatDate(item.created_at, '')}
              {item.teacher_name ? ` · ${cleanText(item.teacher_name)}` : ''}
              {item.updated_at ? ' · edited' : ''}
            </small>
            {expanded && (
              <div style={{ marginTop: 10 }}>
                <p style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p>
                <Attachment attachment={item.attachment} />
              </div>
            )}
            {teacher && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10 }}>
                <button type="button" className="text-action" disabled={busyId === item.id} onClick={() => onEdit(item)}>
                  <Edit3 size={15} />
                  Edit
                </button>
                <button type="button" className="text-action" disabled={busyId === item.id} onClick={() => onDelete(item)}>
                  <Trash2 size={15} />
                  Delete
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
