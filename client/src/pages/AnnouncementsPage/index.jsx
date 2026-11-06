import React, { useCallback, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import useRemoteData from '../../hooks/useRemoteData';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import Dialog from '../../components/ui/Dialog';
import { EmptyState, Loading, Notice } from '../../components/ui/Feedback';
import { Plus } from '../../components/icons';
import { cleanText } from '../../utils/learning';
import AnnouncementFormDialog from './AnnouncementFormDialog';
import AnnouncementList from './AnnouncementList';

/** Teachers post and manage announcements; students read their adviser's posts. */
export default function AnnouncementsPage() {
  const { user } = useAuth();
  const teacher = user?.role === 'TEACHER';
  const list = useRemoteData(() => api.getAnnouncements());
  const action = useAsyncAction();
  const [editing, setEditing] = useState(null); // null, 'new' or an announcement
  const [deleting, setDeleting] = useState(null);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const closeForm = useCallback(() => setEditing(null), []);
  const items = list.data?.announcements || [];
  const unread = list.data?.unread_count || 0;

  const saved = message => {
    setEditing(null);
    action.setMessage(message);
    list.refresh();
  };

  const remove = item => action.run(async () => {
    requireSuccess(await api.deleteAnnouncement(item.id));
    setDeleting(null);
    action.setMessage('Announcement deleted.');
    list.refresh();
  }, { key: item.id, clearMessage: true });

  const markRead = item => action.run(async () => {
    requireSuccess(await api.markAnnouncementRead(item.id));
    list.refresh();
  }, { key: item.id });

  const markAll = () => action.run(async () => {
    requireSuccess(await api.markAllAnnouncementsRead());
    action.setMessage('All announcements marked as read.');
    list.refresh();
  }, { key: 'all', clearMessage: true });

  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>Announcements</h1>
          <p>{teacher ? 'Post news, reminders and files for your class.' : 'News and reminders from your adviser.'}</p>
        </div>
        {teacher ? (
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={17} />
            New announcement
          </button>
        ) : unread > 0 && (
          <button type="button" className="btn btn-secondary" disabled={action.busy === 'all'} onClick={markAll}>
            Mark all as read
          </button>
        )}
      </div>
      <Notice error>{list.error || (!deleting && action.error)}</Notice>
      <Notice success>{action.message}</Notice>
      {list.error && <button className="text-action" onClick={list.refresh}>Try again</button>}
      {!teacher && unread > 0 && <p role="status">{unread} unread {unread === 1 ? 'announcement' : 'announcements'}</p>}
      {list.loading && !list.data ? (
        <Loading>Loading announcements…</Loading>
      ) : !items.length ? (
        !list.error && (
          <EmptyState title="No announcements yet">
            {teacher ? 'Posts you publish will appear here for your students.' : 'When your adviser posts news, you will see it here.'}
          </EmptyState>
        )
      ) : (
        <AnnouncementList
          items={items}
          teacher={teacher}
          busyId={action.busy}
          onEdit={setEditing}
          onDelete={setDeleting}
          onRead={markRead}
        />
      )}
      {editing && (
        <AnnouncementFormDialog
          announcement={editing === 'new' ? null : editing}
          onClose={closeForm}
          onSaved={saved}
        />
      )}
      {deleting && (
        <Dialog title="Delete this announcement?" onClose={closeDelete}>
          <Notice error>{action.error}</Notice>
          <p><strong>{cleanText(deleting.title)}</strong> will be removed for your students. The attached file stays in My files.</p>
          <div className="hero-actions">
            <button className="btn btn-primary" disabled={action.busy === deleting.id} onClick={() => remove(deleting)}>
              {action.busy === deleting.id ? 'Deleting…' : 'Delete announcement'}
            </button>
            <button className="btn btn-secondary" onClick={closeDelete}>Keep it</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
