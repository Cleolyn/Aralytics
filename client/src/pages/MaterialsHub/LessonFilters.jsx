import React from 'react';
import { ilawLabels } from '../../utils/learning';
import { FILE_TYPES, QUARTERS } from './lessons';

/** "All / Saved" tabs plus search, quarter, step, and file-type filters. */
export default function LessonFilters({ filters, onChange }) {
  const set = key => e => onChange({ [key]: e.target.value });
  return (
    <>
      <div className="tabs">
        <button className={!filters.savedOnly ? 'active' : ''} onClick={() => onChange({ savedOnly: false })} aria-pressed={!filters.savedOnly}>
          All lessons
        </button>
        <button className={filters.savedOnly ? 'active' : ''} onClick={() => onChange({ savedOnly: true })} aria-pressed={filters.savedOnly}>
          Saved on this device
        </button>
      </div>
      <div className="filters">
        <div className="field search-field">
          <label htmlFor="lesson-search">Search lessons</label>
          <input
            id="lesson-search"
            className="form-input"
            type="search"
            placeholder="Type a lesson title or topic…"
            value={filters.search}
            onChange={set('search')}
          />
        </div>
        <div className="field">
          <label htmlFor="lesson-quarter">Quarter</label>
          <select id="lesson-quarter" className="form-input" value={filters.quarter} onChange={set('quarter')}>
            <option value="">All quarters</option>
            {QUARTERS.map(q => <option key={q}>{q}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="lesson-phase">Step</label>
          <select id="lesson-phase" className="form-input" value={filters.phase} onChange={set('phase')}>
            <option value="">All steps</option>
            {Object.entries(ilawLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="lesson-format">File type</label>
          <select id="lesson-format" className="form-input" value={filters.type} onChange={set('type')}>
            <option value="">All file types</option>
            {FILE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
    </>
  );
}
