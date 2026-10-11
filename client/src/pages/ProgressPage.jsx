import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import useRemoteData from '../hooks/useRemoteData';
import useLearnerData from '../hooks/useLearnerData';
import Dialog from '../components/ui/Dialog';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import { formatDate } from '../utils/learning';

export default function ProgressPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useLearnerData();
  const scores = useRemoteData(api.getPersonalScores,[user.id]);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => setDetail(null), []);
  async function review(id) { setBusy(true); setDetailError(''); try { setDetail(await api.getOwnSubmission(id)); } catch (err) { setDetailError(err.message); } finally { setBusy(false); } }
  const readIds = new Set(data?.logs.map(l => l.material_id) || []);
  const total = data?.materials.length || 0;
  const count = data?.materials.filter(m => readIds.has(m.id)).length || 0;
  const tasks = data?.tasks.filter(t => t.my_submission) || [];
  const support = data?.interventions.filter(i => !['RESOLVED','COMPLETED','EXEMPTED','EXEMPT','OVERRIDDEN'].includes(i.status)) || [];
  return <div className="container"><div className="page-heading"><div><h1>My Progress</h1><p>See what you have learned and what to practice next.</p></div><span className="muted">{user.section} · Araling Panlipunan</span></div>
    <Notice error>{error || scores.error || data?.warnings.join(' ') || detailError}</Notice>{(error || scores.error || data?.warnings.length > 0) && <button className="text-action" onClick={() => { refresh(); scores.refresh(); }}>Retry loading</button>}
    {loading || scores.loading ? <Loading>Loading your learning records…</Loading> : <div className="split-content"><div><section><div className="section-heading"><h2>Materials read</h2><strong>{count} of {total}</strong></div><div className="progress-track" role="progressbar" aria-label="Materials read" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={count}><span style={{ width: `${total ? count / total * 100 : 0}%` }} /></div><small className="muted">Progress is based on materials you have marked as read.</small></section>
      <section className="section"><h2 style={{ marginBottom: 20 }}>Grades and feedback</h2>{!scores.data?.scores.length && !tasks.length ? <EmptyState title="Your learning record starts here">Complete an activity to see your scores and feedback.</EmptyState> : <div className="table-responsive" tabIndex={0} role="region" aria-label="Grades and feedback"><table className="data-table"><thead><tr><th>Activity</th><th>Score</th><th>Status</th><th>Feedback</th></tr></thead><tbody>
        {(scores.data?.scores || []).map(s => <tr key={s.id}><td><strong>{s.quiz_title}</strong><small>{formatDate(s.submitted_at,'')}</small></td><td>{s.score_obtained} / {s.quiz_total_points}</td><td><Status tone={s.is_passed ? 'good' : 'pending'}>{s.is_passed ? 'Completed' : 'Practice suggested'}</Status></td><td><button className="text-action" disabled={busy} onClick={() => review(s.id)}>Review answers <ArrowRight size={15} /></button></td></tr>)}
        {tasks.map(t => <tr key={t.id}><td><strong>{t.title}</strong><small>{formatDate(t.my_submission.submitted_at,'')}</small></td><td>{t.my_submission.status === 'GRADED' ? `${t.my_submission.score} / ${t.total_points}` : '—'}</td><td><Status tone="good">{t.my_submission.status === 'GRADED' ? 'Graded' : 'Submitted'}</Status></td><td><Link className="text-action" to={`/student/activities?task=${encodeURIComponent(t.id)}`}>{t.my_submission.status === 'GRADED' ? 'View feedback' : 'View submission'}<ArrowRight size={15} /></Link></td></tr>)}
      </tbody></table></div>}</section>
      <section className="section"><h2>Reading history</h2>{count ? <ul className="simple-list">{data.materials.filter(m => readIds.has(m.id)).map(m => <li key={m.id}><Link to={`/student/materials/${m.id}`}>{m.title}</Link><span style={{ float: 'right' }}><Status tone="good">Read</Status></span></li>)}</ul> : <p className="muted" style={{ marginTop: 16 }}>Mark a material as read in Lessons to record it here.</p>}</section>
    </div><aside className="aside"><section><h2>Your next step</h2><p>{support.length ? 'A little more practice can strengthen your understanding.' : 'Keep exploring your lessons and upcoming activities.'}</p><Link className="btn btn-primary" to={support.length ? '/student/interventions' : '/student/materials'}>{support.length ? 'Open practice' : 'Browse lessons'}<ArrowRight size={16} /></Link></section><section><h3>Teacher feedback</h3><p>Your teacher’s comments appear with each graded performance task. Open “View feedback” to see them.</p></section></aside></div>}
    {detail && <Dialog title={detail.submission.quiz_title} onClose={close}><p className="muted">Your submitted answers</p><ul className="simple-list">{detail.answers.map((a,i) => <li key={a.id}><strong>{i + 1}. {a.question_text}</strong><p style={{ marginTop: 8 }}>Your answer: {a.selected_answer || 'Not answered'}</p><Status tone={a.is_correct ? 'good' : 'pending'}>{a.is_correct ? 'Correct' : 'Keep practicing'}</Status></li>)}</ul></Dialog>}
  </div>;
}
