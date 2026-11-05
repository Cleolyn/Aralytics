import React from 'react';
import { cleanText } from '../../utils/learning';

/** Section, learner search, and (task view) task selector. */
export default function GradebookFilters({ classes, section, search, tasks, taskId, showTasks, onChange }) {
  return (
    <div className="filters">
      <div className="field">
        <label htmlFor="gradebook-section">Class section</label>
        <select id="gradebook-section" className="form-input" value={section} onChange={e => onChange({ section: e.target.value })}>
          <option value="">All classes</option>
          {classes.map(c => <option key={c.section}>{c.section}</option>)}
        </select>
      </div>
      <div className="field search-field">
        <label htmlFor="gradebook-search">Search student</label>
        <input
          id="gradebook-search"
          className="form-input"
          type="search"
          value={search}
          onChange={e => onChange({ learner: e.target.value })}
          placeholder="Name or LRN…"
        />
      </div>
      {showTasks && (
        <div className="field">
          <label htmlFor="gradebook-task">Class task</label>
          <select id="gradebook-task" className="form-input" value={taskId || ''} onChange={e => onChange({ task: e.target.value })}>
            {!tasks.length && <option value="">No tasks yet</option>}
            {tasks.map(t => (
              <option key={t.id} value={t.id}>{cleanText(t.title)}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
