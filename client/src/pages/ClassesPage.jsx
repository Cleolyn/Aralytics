import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight } from '../components/icons';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import { EmptyState, Loading, Notice } from '../components/ui/Feedback';

export default function ClassesPage() {
  const { data, loading, error, refresh } = useRemoteData(api.getClasses);
  const [params,setParams] = useSearchParams();
  const [search,setSearch] = useState('');
  const section = params.get('section') || '';
  const learners = data?.learners.filter(l => (!section || l.section === section) && `${l.first_name} ${l.last_name} ${l.lrn_or_id}`.toLowerCase().includes(search.toLowerCase())) || [];
  return <div className="container"><div className="page-heading"><div><h1>{section || 'Classes'}</h1><p>Find your learners and follow their classroom work.</p></div><Link className="text-action" to={section ? `/teacher/gradebook?section=${encodeURIComponent(section)}` : '/teacher/gradebook'}>Open gradebook <ArrowRight size={16} /></Link></div><Notice error>{error}</Notice>{error && <button className="text-action" onClick={refresh}>Try again</button>}
    <div className="filters"><div className="field"><label htmlFor="class-section">Class section</label><select id="class-section" className="form-input" value={section} onChange={e => setParams(e.target.value ? { section: e.target.value } : {})}><option value="">All classes</option>{data?.classes.map(c => <option key={c.section}>{c.section}</option>)}</select></div><div className="field search-field"><label htmlFor="learner-search">Search learners</label><input id="learner-search" className="form-input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or school ID…" /></div></div>
    {loading ? <Loading>Loading your classes…</Loading> : !learners.length ? <EmptyState title="No learners match">Choose another class or search term.</EmptyState> : <div className="table-responsive" tabIndex={0} role="region" aria-label="Class learners"><table className="data-table"><thead><tr><th>Learner</th><th>Section</th><th>Quizzes submitted</th><th>Tasks submitted</th><th>Next step</th></tr></thead><tbody>{learners.map(l => <tr key={l.id}><td><strong>{l.first_name} {l.last_name}</strong><small>{l.lrn_or_id}</small></td><td>{l.section}</td><td>{l.quiz_submissions}</td><td>{l.task_submissions}</td><td><Link className="text-action" to={`/teacher/gradebook?section=${encodeURIComponent(l.section)}&learner=${encodeURIComponent(`${l.first_name} ${l.last_name}`)}`}>View work <ArrowRight size={15} /></Link></td></tr>)}</tbody></table></div>}
    <section className="section"><h2>Learner support</h2><p className="muted" style={{ marginTop: 12 }}>Review recommended follow-up activities and choose the right next step for each learner.</p><Link className="text-action" to={section ? `/teacher/remediation?section=${encodeURIComponent(section)}` : '/teacher/remediation'}>Open learner support <ArrowRight size={16} /></Link></section>
  </div>;
}
