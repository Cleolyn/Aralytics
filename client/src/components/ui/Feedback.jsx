import React from 'react';
import { AlertCircle, CheckCircle2 } from '../icons';

export function Notice({ children, error = false, success = false }) {
  if (!children) return null;
  const Icon = error ? AlertCircle : CheckCircle2;
  return <div className={`notice ${error ? 'notice-error' : success ? 'notice-success' : ''}`} role={error ? 'alert' : 'status'}><Icon size={18} aria-hidden="true" /><div>{children}</div></div>;
}
export function EmptyState({ title = 'Nothing here yet', children }) {
  return <div className="empty-state"><h3>{title}</h3><p>{children}</p></div>;
}
export function Loading({ children = 'Loading your workspace…' }) {
  return <p className="empty-state" role="status">{children}</p>;
}
export function Status({ children, tone = '' }) {
  return <span className={`status ${tone ? `status-${tone}` : ''}`}>{children}</span>;
}
