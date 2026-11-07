import React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import useRemoteData from '../../hooks/useRemoteData';
import { ArrowRight, Megaphone } from '../../components/icons';
import { Status } from '../../components/ui/Feedback';
import { cleanText, formatDate } from '../../utils/learning';

/** Dashboard aside: the latest three announcements from the student's adviser. Quietly hidden if they cannot load. */
export default function AnnouncementsWidget() {
  const { data, loading, error } = useRemoteData(() => api.getAnnouncements({ limit: 3 }));
  if (loading || error || !data?.success) return null;
  const items = (data.announcements || []).slice(0, 3);
  return (
    <section aria-labelledby="class-announcements">
      <Megaphone size={23} aria-hidden="true" />
      <h2 id="class-announcements" style={{ marginTop: 12 }}>Class announcements</h2>
      {!items.length ? (
        <p>No announcements yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px', display: 'grid', gap: 10 }}>
          {items.map(item => (
            <li key={item.id}>
              <Link className="text-action" to="/student/announcements"><strong>{cleanText(item.title)}</strong></Link> {!item.read && <Status tone="good">New</Status>}
              <br />
              <small>{formatDate(item.created_at, '')}</small>
            </li>
          ))}
        </ul>
      )}
      <Link className="text-action" to="/student/announcements">
        {data.unread_count > 0 ? `Read ${data.unread_count} new` : 'See all'} <ArrowRight size={15} />
      </Link>
    </section>
  );
}
