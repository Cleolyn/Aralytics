import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight } from '../components/icons';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import { EmptyState, Loading, Notice } from '../components/ui/Feedback';
import { cleanText } from '../utils/learning';

export default function ClassesPage() {
  const { data, loading, error, refresh } = useRemoteData(api.getClasses);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const section = params.get('section') || '';
  const learners =
    data?.learners.filter(
      l =>
        (!section || l.section === section) &&
        `${l.first_name} ${l.last_name} ${l.lrn_or_id}`.toLowerCase().includes(search.toLowerCase())
    ) || [];
  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>{cleanText(section) || 'Classes'}</h1>
          <p>View your students and check their submitted work.</p>
        </div>
        <Link
          className="text-action"
          to={section ? `/teacher/gradebook?section=${encodeURIComponent(section)}` : '/teacher/gradebook'}
        >
          Open gradebook <ArrowRight size={16} />
        </Link>
      </div>
      <Notice error>{error}</Notice>
      {error && (
        <button className="text-action" onClick={refresh}>
          Try again
        </button>
      )}
      <div className="filters">
        <div className="field">
          <label htmlFor="class-section">Class section</label>
          <select
            id="class-section"
            className="form-input"
            value={section}
            onChange={e => setParams(e.target.value ? { section: e.target.value } : {})}
          >
            <option value="">All classes</option>
            {data?.classes.map(c => (
              <option key={c.section}>{c.section}</option>
            ))}
          </select>
        </div>
        <div className="field search-field">
          <label htmlFor="learner-search">Search students</label>
          <input
            id="learner-search"
            className="form-input"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Name or LRN…"
          />
        </div>
      </div>
      {loading ? (
        <Loading>Loading your classes…</Loading>
      ) : !learners.length ? (
        <EmptyState title="No students found">Try picking another section or typing a different name.</EmptyState>
      ) : (
        <div className="table-responsive" tabIndex={0} role="region" aria-label="Class students">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Section</th>
                <th>Quizzes finished</th>
                <th>Tasks submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {learners.map(l => (
                <tr key={l.id}>
                  <td>
                    <strong>
                      {cleanText(l.first_name)} {cleanText(l.last_name)}
                    </strong>
                    <small>{cleanText(l.lrn_or_id)}</small>
                  </td>
                  <td>{cleanText(l.section)}</td>
                  <td>{l.quiz_submissions}</td>
                  <td>{l.task_submissions}</td>
                  <td>
                    <Link
                      className="text-action"
                      to={`/teacher/gradebook?section=${encodeURIComponent(l.section)}&learner=${encodeURIComponent(
                        `${l.first_name} ${l.last_name}`
                      )}`}
                    >
                      See grades <ArrowRight size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="section">
        <h2>Student support</h2>
        <p className="muted" style={{ marginTop: 12 }}>
          Check which students need extra practice and assign review materials to help them catch up.
        </p>
        <Link
          className="text-action"
          to={section ? `/teacher/remediation?section=${encodeURIComponent(section)}` : '/teacher/remediation'}
        >
          Open student support <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
