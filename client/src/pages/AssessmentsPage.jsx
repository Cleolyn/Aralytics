import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from '../components/icons';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import Dialog from '../components/ui/Dialog';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import { cleanText, formatDate } from '../utils/learning';

export default function AssessmentsPage() {
  const { data, loading, error, refresh } = useRemoteData(async () => {
    const [q, t, c] = await Promise.all([api.getQuizzes(), api.getPerformanceTasks(), api.getTaxonomy()]);
    return { quizzes: q.quizzes, tasks: t.tasks, competencies: c.flatCompetencies };
  });
  const [tab, setTab] = useState('Quizzes');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    title: '',
    instructions: '',
    competency_id: '',
    quarter: 'Q1',
    due_date: '',
    total_points: 40,
    rubric_criteria: ''
  });
  const closePreview = useCallback(() => setPreview(null), []);
  const closeCreate = useCallback(() => setShowCreate(false), []);
  const items =
    (tab === 'Quizzes' ? data?.quizzes : data?.tasks)?.filter(a =>
      a.title.toLowerCase().includes(search.toLowerCase())
    ) || [];
  async function view(id) {
    setBusy(true);
    setActionError('');
    try {
      setPreview((await api.getQuizById(id)).quiz);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setActionError('');
    try {
      const res = await api.createPerformanceTask({
        ...form,
        total_points: Number(form.total_points),
        due_date: form.due_date ? `${form.due_date}T23:59:59+08:00` : null
      });
      if (!res.success) throw new Error(res.message);
      setShowCreate(false);
      setMessage('Class task saved. Students can now see it in Activities.');
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>Quizzes and Tasks</h1>
          <p>Create and manage quizzes and class tasks for your students.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setShowCreate(true)}>
            <Plus size={17} />
            Create task
          </button>
          <Link className="btn btn-primary" to="/teacher/quizzes/create">
            <Plus size={17} />
            Create quiz
          </Link>
        </div>
      </div>
      <Notice error>{error || (!showCreate && actionError)}</Notice>
      <Notice success>{message}</Notice>
      {error && (
        <button className="text-action" onClick={refresh}>
          Try again
        </button>
      )}
      <div className="tabs">
        {['Quizzes', 'Class tasks'].map(t => (
          <button key={t} className={tab === t ? 'active' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="filters">
        <div className="field search-field">
          <label htmlFor="assessment-search">Search</label>
          <input
            id="assessment-search"
            className="form-input"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Type a title…"
          />
        </div>
      </div>
      {loading ? (
        <Loading>Loading quizzes and tasks…</Loading>
      ) : !items.length ? (
        <EmptyState title="Nothing found">Create a new quiz or task, or try another search.</EmptyState>
      ) : (
        <div className="table-responsive" tabIndex={0} role="region" aria-label="Assessment list">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>{tab === 'Quizzes' ? 'Time limit' : 'Due date'}</th>
                <th>Points</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map(a => (
                <tr key={a.id}>
                  <td>
                    <strong>{cleanText(a.title)}</strong>
                    <small>{cleanText(a.melc_code || a.topic_title)}</small>
                  </td>
                  <td>{tab === 'Quizzes' ? `${a.time_limit_minutes} min` : formatDate(a.due_date)}</td>
                  <td>{a.total_points}</td>
                  <td>
                    <Status tone="good">
                      {tab === 'Quizzes'
                        ? a.is_published
                          ? 'Active'
                          : 'Draft'
                        : `${a.stats?.pending_count || 0} to grade`}
                    </Status>
                  </td>
                  <td>
                    {tab === 'Quizzes' ? (
                      <button className="text-action" disabled={busy} onClick={() => view(a.id)}>
                        View questions <ArrowRight size={15} />
                      </button>
                    ) : (
                      <Link
                        className="text-action"
                        to={`/teacher/gradebook?view=tasks&task=${encodeURIComponent(a.id)}`}
                      >
                        Check submissions <ArrowRight size={15} />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview && (
        <Dialog title={cleanText(preview.title)} onClose={closePreview}>
          <p>{cleanText(preview.instructions)}</p>
          <ul className="simple-list">
            {preview.questions.map((q, i) => (
              <li key={q.id}>
                <strong>
                  {i + 1}. {cleanText(q.question_text)}
                </strong>
                {Array.isArray(q.options) &&
                  q.options.map(o => (
                    <p key={o.id}>
                      {o.id}. {cleanText(o.text)}
                    </p>
                  ))}
                <p className="muted" style={{ marginTop: 8 }}>
                  Correct answer: {cleanText(q.correct_answer)}
                </p>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {showCreate && (
        <Dialog title="Create a class task" onClose={closeCreate}>
          <Notice error>{actionError}</Notice>
          <form onSubmit={create}>
            <div className="field">
              <label htmlFor="task-title">Title</label>
              <input
                id="task-title"
                className="form-input"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="task-goal">Topic</label>
              <select
                id="task-goal"
                className="form-input"
                value={form.competency_id}
                onChange={e => {
                  const c = data?.competencies.find(c => c.id === e.target.value);
                  setForm({ ...form, competency_id: e.target.value, quarter: c?.quarter_code || 'Q1' });
                }}
                required
              >
                <option value="">Choose a topic</option>
                {data?.competencies.map(c => (
                  <option key={c.id} value={c.id}>
                    {cleanText(c.melc_code)} · {cleanText(c.description)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="task-instructions">Instructions</label>
              <textarea
                id="task-instructions"
                className="form-input"
                value={form.instructions}
                onChange={e => setForm({ ...form, instructions: e.target.value })}
                required
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="task-due">Due date</label>
                <input
                  id="task-due"
                  className="form-input"
                  type="date"
                  value={form.due_date}
                  onChange={e => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="task-points">Total points</label>
                <input
                  id="task-points"
                  className="form-input"
                  type="number"
                  min={1}
                  max={1000}
                  value={form.total_points}
                  onChange={e => setForm({ ...form, total_points: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="task-rubric">Grading guide (optional)</label>
              <textarea
                id="task-rubric"
                className="form-input"
                value={form.rubric_criteria}
                onChange={e => setForm({ ...form, rubric_criteria: e.target.value })}
              />
            </div>
            <p className="muted" style={{ marginBottom: 20 }}>
              Saving this task makes it visible to your students.
            </p>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save task'}
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
