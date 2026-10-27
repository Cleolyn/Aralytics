import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from './icons';
import { EmptyState, Status } from './ui/Feedback';
import { completedActivity, formatDate } from '../utils/learning';

export default function ActivityTable({ items, onSelect }) {
  if (!items.length) return <EmptyState title="You’re all caught up">New activities from your teacher will appear here.</EmptyState>;
  return <div className="table-responsive" tabIndex={0} role="region" aria-label="Activities"><table className="data-table"><thead><tr><th scope="col">Activity</th><th scope="col">Due date</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{items.map(item => <tr key={`${item.kind}-${item.id}`}>
    <td><strong>{item.title}</strong><small>{item.type}{item.kind === 'quiz' ? ' · Internet required' : ''}</small></td><td>{formatDate(item.due_date)}</td><td><Status tone={completedActivity(item) ? 'good' : item.state === 'Not submitted' ? 'pending' : ''}>{item.state}</Status></td>
    <td>{onSelect ? <button className="text-action" onClick={() => onSelect(item)}>Open <ArrowRight size={15} /></button> : <Link className="text-action" to={item.kind === 'quiz' && !completedActivity(item) ? `/student/activities?quiz=${encodeURIComponent(item.id)}` : item.kind === 'task' ? `/student/activities?task=${encodeURIComponent(item.id)}` : '/student/progress'}>{completedActivity(item) ? 'View' : item.kind === 'task' ? 'Submit work' : 'View quiz'}<ArrowRight size={15} /></Link>}</td>
  </tr>)}</tbody></table></div>;
}
