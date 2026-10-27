import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, Users, BookOpen } from '../components/icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import { EmptyState, Loading, Notice } from '../components/ui/Feedback';
import { formatDate } from '../utils/learning';

export default function TeacherOverview() {
  const { user } = useAuth();
  const location = useLocation();
  const { data, loading, error, refresh } = useRemoteData(async () => {
    const [classes,tasks,queue,quizzes] = await Promise.all([api.getClasses(),api.getPerformanceTasks(),api.getRemediationQueue(),api.getQuizzes()]);
    return { classes: classes.classes, tasks: tasks.tasks, queue: queue.queue, quizzes: quizzes.quizzes };
  }, [user.id]);
  const pending = data?.tasks.reduce((n,t) => n + Number(t.stats?.pending_count || 0),0) || 0;
  const support = data?.queue.filter(q => ['RECOMMENDED','ASSIGNED'].includes(q.status)) || [];
  const learners = new Set(support.map(q => q.student.id)).size;
  const dueTasks = data?.tasks.filter(t => t.due_date && new Date(t.due_date.replace(' ','T')) >= new Date()).sort((a,b) => a.due_date.localeCompare(b.due_date)).slice(0,3) || [];
  return <div className="container"><div className="page-heading"><div><h1>Magandang araw, Teacher {user?.first_name}.</h1><p>Here is what needs your attention.</p></div><Link className="btn btn-primary" to="/teacher/quizzes/create">Create assessment <ArrowRight size={17} /></Link></div>
    <Notice error>{location.state?.unauthorizedNotice || error}</Notice>{error && <button className="text-action" onClick={refresh}>Try again</button>}
    {loading ? <Loading /> : data && <div className="split-content"><div><section><h2>Needs attention</h2>
      <div className="action-row"><ClipboardCheck size={24} aria-hidden="true" /><div><strong>{pending} {pending === 1 ? 'submission' : 'submissions'} to review</strong><p>Performance tasks awaiting your feedback.</p></div><Link className="text-action" to="/teacher/gradebook?view=tasks">Review submissions <ArrowRight size={16} /></Link></div>
      <div className="action-row"><Users size={24} aria-hidden="true" /><div><strong>{learners} {learners === 1 ? 'learner needs' : 'learners need'} support</strong><p>Recommended or assigned follow-up practice.</p></div><Link className="text-action" to="/teacher/remediation">View learner support <ArrowRight size={16} /></Link></div>
      <div className="action-row"><BookOpen size={24} aria-hidden="true" /><div><strong>{data.quizzes.length} assessments in your workspace</strong><p>Review your quizzes or create the next activity.</p></div><Link className="text-action" to="/teacher/assessments">Manage assessments <ArrowRight size={16} /></Link></div>
    </section><section className="section"><div className="section-heading"><h2>Class overview</h2><Link className="text-action" to="/teacher/classes">View all <ArrowRight size={15} /></Link></div>{data.classes.length ? <div className="table-responsive" tabIndex={0} role="region" aria-label="Class overview"><table className="data-table"><thead><tr><th>Class</th><th>Learners</th><th>With quiz submissions</th><th>Next step</th></tr></thead><tbody>{data.classes.map(c => <tr key={c.section}><td><strong>{c.section}</strong></td><td>{c.learners}</td><td>{c.learners_with_quiz_submissions} of {c.learners}</td><td><Link className="text-action" to={`/teacher/classes?section=${encodeURIComponent(c.section)}`}>Open class <ArrowRight size={15} /></Link></td></tr>)}</tbody></table></div> : <EmptyState title="No classes yet">Registered learners will appear in their sections here.</EmptyState>}</section></div>
    <aside className="aside"><section><h2>Upcoming deadlines</h2>{dueTasks.length ? <ul className="simple-list">{dueTasks.map(t => <li key={t.id}><strong>{t.title}</strong><p>{formatDate(t.due_date)}</p><Link className="text-action" to={`/teacher/gradebook?view=tasks&task=${encodeURIComponent(t.id)}`}>View submissions <ArrowRight size={15} /></Link></li>)}</ul> : <p>No upcoming task deadlines.</p>}</section><section><h3>Teaching resources</h3><p>Organize materials around your learning goals and the ILAW journey.</p><Link className="text-action" to="/teacher/materials">Open lessons <ArrowRight size={15} /></Link></section></aside></div>}
  </div>;
}
