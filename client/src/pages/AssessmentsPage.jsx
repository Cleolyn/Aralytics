import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import Dialog from '../components/ui/Dialog';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import { formatDate } from '../utils/learning';

export default function AssessmentsPage() {
  const { data, loading, error, refresh } = useRemoteData(async () => { const [q,t,c] = await Promise.all([api.getQuizzes(),api.getPerformanceTasks(),api.getTaxonomy()]); return { quizzes: q.quizzes,tasks: t.tasks,competencies: c.flatCompetencies }; });
  const [tab,setTab] = useState('Quizzes');
  const [search,setSearch] = useState('');
  const [preview,setPreview] = useState(null);
  const [showCreate,setShowCreate] = useState(false);
  const [busy,setBusy] = useState(false);
  const [actionError,setActionError] = useState('');
  const [message,setMessage] = useState('');
  const [form,setForm] = useState({ title: '', instructions: '', competency_id: '', quarter: 'Q1', due_date: '', total_points: 40, rubric_criteria: '' });
  const closePreview = useCallback(() => setPreview(null), []);
  const closeCreate = useCallback(() => setShowCreate(false), []);
  const items = (tab === 'Quizzes' ? data?.quizzes : data?.tasks)?.filter(a => a.title.toLowerCase().includes(search.toLowerCase())) || [];
  async function view(id) { setBusy(true); setActionError(''); try { setPreview((await api.getQuizById(id)).quiz); } catch (err) { setActionError(err.message); } finally { setBusy(false); } }
  async function create(e) { e.preventDefault(); setBusy(true); setActionError(''); try { const res = await api.createPerformanceTask({ ...form, total_points: Number(form.total_points), due_date: form.due_date ? `${form.due_date}T23:59:59+08:00` : null }); if (!res.success) throw new Error(res.message); setShowCreate(false); setMessage('Performance task published. Learners can now open it in Activities.'); refresh(); } catch (err) { setActionError(err.message); } finally { setBusy(false); } }
  return <div className="container"><div className="page-heading"><div><h1>Assessments</h1><p>Create and review your class quizzes and performance tasks.</p></div><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><button className="btn btn-secondary" onClick={() => setShowCreate(true)}><Plus size={17} />Create task</button><Link className="btn btn-primary" to="/teacher/quizzes/create"><Plus size={17} />Create quiz</Link></div></div>
    <Notice error>{error || (!showCreate && actionError)}</Notice><Notice success>{message}</Notice>{error && <button className="text-action" onClick={refresh}>Try again</button>}
    <div className="tabs">{['Quizzes','Performance tasks'].map(t => <button key={t} className={tab === t ? 'active' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}</div><div className="filters"><div className="field search-field"><label htmlFor="assessment-search">Search assessments</label><input id="assessment-search" className="form-input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title…" /></div></div>
    {loading ? <Loading>Loading assessments…</Loading> : !items.length ? <EmptyState title="No assessments match">Create an assessment or try another search term.</EmptyState> : <div className="table-responsive" tabIndex={0} role="region" aria-label="Assessment list"><table className="data-table"><thead><tr><th>Assessment</th><th>{tab === 'Quizzes' ? 'Time limit' : 'Due date'}</th><th>Points</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.map(a => <tr key={a.id}><td><strong>{a.title}</strong><small>{a.melc_code || a.topic_title}</small></td><td>{tab === 'Quizzes' ? `${a.time_limit_minutes} min` : formatDate(a.due_date)}</td><td>{a.total_points}</td><td><Status tone="good">{tab === 'Quizzes' ? a.is_published ? 'Published' : 'Unpublished' : `${a.stats?.pending_count || 0} awaiting review`}</Status></td><td>{tab === 'Quizzes' ? <button className="text-action" disabled={busy} onClick={() => view(a.id)}>Preview quiz <ArrowRight size={15} /></button> : <Link className="text-action" to={`/teacher/gradebook?view=tasks&task=${encodeURIComponent(a.id)}`}>Review submissions <ArrowRight size={15} /></Link>}</td></tr>)}</tbody></table></div>}
    {preview && <Dialog title={preview.title} onClose={closePreview}><p>{preview.instructions}</p><ul className="simple-list">{preview.questions.map((q,i) => <li key={q.id}><strong>{i + 1}. {q.question_text}</strong>{Array.isArray(q.options) && q.options.map(o => <p key={o.id}>{o.id}. {o.text}</p>)}<p className="muted" style={{ marginTop: 8 }}>Answer key: {q.correct_answer}</p></li>)}</ul></Dialog>}
    {showCreate && <Dialog title="Create a performance task" onClose={closeCreate}><Notice error>{actionError}</Notice><form onSubmit={create}>
      <div className="field"><label htmlFor="task-title">Title</label><input id="task-title" className="form-input" value={form.title} onChange={e => setForm({ ...form,title: e.target.value })} required /></div><div className="field"><label htmlFor="task-goal">Learning goal</label><select id="task-goal" className="form-input" value={form.competency_id} onChange={e => { const c = data?.competencies.find(c => c.id === e.target.value); setForm({ ...form,competency_id: e.target.value,quarter: c?.quarter_code || 'Q1' }); }} required><option value="">Choose a learning goal</option>{data?.competencies.map(c => <option key={c.id} value={c.id}>{c.melc_code} · {c.description}</option>)}</select></div>
      <div className="field"><label htmlFor="task-instructions">Instructions</label><textarea id="task-instructions" className="form-input" value={form.instructions} onChange={e => setForm({ ...form,instructions: e.target.value })} required /></div><div className="form-grid"><div className="field"><label htmlFor="task-due">Due date (Philippine time)</label><input id="task-due" className="form-input" type="date" value={form.due_date} onChange={e => setForm({ ...form,due_date: e.target.value })} /></div><div className="field"><label htmlFor="task-points">Total points</label><input id="task-points" className="form-input" type="number" min={1} max={1000} value={form.total_points} onChange={e => setForm({ ...form,total_points: e.target.value })} required /></div></div><div className="field"><label htmlFor="task-rubric">Rubric / grading criteria</label><textarea id="task-rubric" className="form-input" value={form.rubric_criteria} onChange={e => setForm({ ...form,rubric_criteria: e.target.value })} /></div><p className="muted" style={{ marginBottom: 20 }}>Publishing makes this task visible to learners.</p><button className="btn btn-primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish task'}</button>
    </form></Dialog>}
  </div>;
}
