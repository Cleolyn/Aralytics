import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import useLearnerData from '../hooks/useLearnerData';
import ActivityTable from '../components/ActivityTable';
import { Loading, Notice } from '../components/ui/Feedback';
import { completedActivity } from '../utils/learning';

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useLearnerData();
  if (loading) return <div className="container"><Loading /></div>;
  const readIds = new Set(data?.logs.map(l => l.material_id) || []);
  const materials = data?.materials || [];
  const next = materials.find(m => !readIds.has(m.id)) || materials[0];
  const readCount = materials.filter(m => readIds.has(m.id)).length;
  const upcoming = data?.activities.filter(a => !completedActivity(a)).slice(0,4) || [];
  const support = data?.interventions.filter(i => !['RESOLVED','COMPLETED','EXEMPTED','EXEMPT','OVERRIDDEN'].includes(i.status)) || [];
  return <div className="container">
    <div className="page-heading"><div><h1>Mabuhay, {user?.first_name || 'learner'}.</h1><p>Ready for your next lesson?</p><div className="breadcrumb" style={{ marginTop: 14, marginBottom: 0 }}>{user?.section || 'Your class'} <span>/</span> Araling Panlipunan 10 <span>/</span> Contemporary Issues</div></div></div>
    <Notice error>{error || data?.warnings.join(' ')}</Notice>{(error || data?.warnings.length > 0) && <button className="text-action" onClick={refresh}>Retry loading</button>}
    <div className="split-content"><div>
      <section className="continue-lesson"><div><span className="eyebrow">{next ? 'Continue learning' : 'Your learning journey'}</span><h2>{next?.title || 'Discover your next lesson.'}</h2><p className="muted">{next ? `${next.file_type} · ${next.melc_code || 'Araling Panlipunan'}` : 'Your teacher’s materials will appear in Lessons.'}</p><Link to={next ? `/student/materials/${next.id}` : '/student/materials'} className="btn btn-primary">{next ? 'Open lesson' : 'Browse lessons'}<ArrowRight size={17} /></Link></div><img src="/images/community-learning.png" alt="" width="1774" height="887" /></section>
      <div className="ilaw-steps" aria-label="Learning journey"><span>1 · Layunin</span><ArrowRight size={14} /><span>2 · Learn</span><ArrowRight size={14} /><span>3 · Assessment</span><ArrowRight size={14} /><span>4 · Pagsulong</span></div>
      <section className="section"><div className="section-heading"><h2>Upcoming activities</h2><Link to="/student/activities" className="text-action">View all <ArrowRight size={15} /></Link></div><ActivityTable items={upcoming} /></section>
    </div><aside className="aside"><section><h2>Your progress</h2><p>{readCount} of {materials.length} materials marked as read</p><div className="progress-track" role="progressbar" aria-label="Materials read" aria-valuemin={0} aria-valuemax={materials.length || 1} aria-valuenow={readCount}><span style={{ width: `${materials.length ? readCount / materials.length * 100 : 0}%` }} /></div><Link className="text-action" to="/student/progress">See your progress <ArrowRight size={15} /></Link></section>
      <section><BookOpen size={23} aria-hidden="true" /><h3 style={{ marginTop: 12 }}>Offline lessons</h3><p>Download lessons while online to read them later.</p><Link className="text-action" to="/student/materials?downloaded=true">View downloads <ArrowRight size={15} /></Link></section>
      {support.length > 0 && <section><h3>Your next step</h3><p>{support.length} suggested practice {support.length === 1 ? 'activity' : 'activities'} to strengthen your understanding.</p><Link className="text-action" to="/student/interventions">Open Pagsulong <ArrowRight size={15} /></Link></section>}
      {materials.length > 0 && readCount === materials.length && <section><Check size={23} /><p>All available materials are marked as read. Keep exploring!</p></section>}
    </aside></div>
  </div>;
}
