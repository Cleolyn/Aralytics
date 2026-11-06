import React, { useState } from 'react';
import { api } from '../../services/api';
import useRemoteData from '../../hooks/useRemoteData';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import Dialog from '../../components/ui/Dialog';
import { Notice } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';

/** Create (no `announcement`) or edit an announcement. Calls `onSaved(message)` after a successful save. */
export default function AnnouncementFormDialog({ announcement, onClose, onSaved }) {
  const editing = Boolean(announcement);
  const action = useAsyncAction();
  const myFiles = useRemoteData(() => api.listMyFiles('personal'));
  const [title, setTitle] = useState(announcement?.title || '');
  const [body, setBody] = useState(announcement?.body || '');
  const [pinned, setPinned] = useState(Boolean(announcement?.pinned));
  const [fileId, setFileId] = useState(announcement?.attachment?.id || '');
  const [email, setEmail] = useState(false);
  const files = myFiles.data?.files || [];

  const submit = event => {
    event.preventDefault();
    return action.run(async () => {
      const payload = { title: title.trim(), body: body.trim(), pinned, file_id: fileId || null };
      if (editing) requireSuccess(await api.updateAnnouncement(announcement.id, payload));
      else requireSuccess(await api.createAnnouncement({ ...payload, email_students: email }));
      onSaved(editing ? 'Announcement updated.' : 'Announcement posted.');
    });
  };

  return (
    <Dialog title={editing ? 'Edit announcement' : 'New announcement'} onClose={onClose}>
      <form onSubmit={submit}>
        <Notice error>{action.error}</Notice>
        <div className="field">
          <label htmlFor="announcement-title">Title</label>
          <input className="form-input" id="announcement-title" required maxLength={150} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="announcement-body">Message</label>
          <textarea className="form-input" id="announcement-body" required rows={6} maxLength={5000} value={body} onChange={e => setBody(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="announcement-file">Attach a file (optional)</label>
          <select className="form-input" id="announcement-file" value={fileId} onChange={e => setFileId(e.target.value)} aria-describedby="announcement-file-help">
            <option value="">No attachment</option>
            {files.map(file => <option key={file.id} value={file.id}>{cleanText(file.name)}</option>)}
          </select>
          <small id="announcement-file-help">Pick from My files. Your students will be able to download it.</small>
        </div>
        <div className="field">
          <label><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pin to the top</label>
        </div>
        {!editing && (
          <div className="field">
            <label><input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} /> Email my students</label>
          </div>
        )}
        <div className="hero-actions">
          <button type="submit" className="btn btn-primary" disabled={Boolean(action.busy)}>
            {action.busy ? 'Saving…' : editing ? 'Save changes' : 'Post announcement'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}
