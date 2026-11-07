import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight } from '../../components/icons';
import useLearnerData from '../../hooks/useLearnerData';
import ActivityTable from '../../components/ActivityTable';
import { EmptyState, Loading, Notice } from '../../components/ui/Feedback';
import { completedActivity } from '../../utils/learning';
import ActivityDetails from './ActivityDetails';

const TABS = ['All', 'Upcoming', 'Submitted', 'Completed'];

const inTab = (item, tab) => {
  if (tab === 'All') return true;
  if (tab === 'Upcoming') return !completedActivity(item);
  if (tab === 'Submitted') return item.state === 'Submitted';
  return ['Completed', 'Graded'].includes(item.state);
};

/** Learner's quizzes and class tasks; the selected one (?quiz= or ?task=) opens in the side panel. */
export default function ActivitiesPage() {
  const { data, loading, error, refresh } = useLearnerData();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  const activities = data?.activities || [];
  const items = activities.filter(item => item.title.toLowerCase().includes(search.toLowerCase()) && inTab(item, tab));
  const selected = (search ? items : activities).find(item => params.get(item.kind) === item.id) || items[0];

  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>Activities</h1>
          <p>View your quizzes and class tasks.</p>
        </div>
        <Link className="text-action" to="/student/progress">
          My Progress <ArrowRight size={16} />
        </Link>
      </div>
      <Notice error>{error || data?.warnings.join(' ')}</Notice>
      <Notice success>{message}</Notice>
      {(error || data?.warnings.length > 0) && <button className="text-action" onClick={refresh}>Try again</button>}
      <div className="split-content" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(280px,1fr)' }}>
        <section>
          <div className="tabs" aria-label="Filter activities">
            {TABS.map(t => (
              <button
                className={tab === t ? 'active' : ''}
                key={t}
                aria-pressed={tab === t}
                onClick={() => {
                  setTab(t);
                  const current = activities.find(item => params.get(item.kind) === item.id);
                  if (!current || !inTab(current, t)) setParams({});
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="activity-search">Search activities</label>
            <input
              id="activity-search"
              className="form-input"
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type an activity name…"
            />
          </div>
          {loading ? (
            <Loading>Loading your activities…</Loading>
          ) : (
            <ActivityTable
              items={items}
              onSelect={item => {
                setParams({ [item.kind]: item.id });
                setMessage('');
              }}
            />
          )}
        </section>
        <aside className="aside">
          {selected ? (
            <ActivityDetails
              activity={selected}
              onSubmitted={msg => {
                setMessage(msg);
                refresh();
              }}
            />
          ) : (
            !loading && <EmptyState title="Pick an activity">Select a quiz or class task to see its instructions.</EmptyState>
          )}
        </aside>
      </div>
    </div>
  );
}
