import React, { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight } from '../components/icons';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import Dialog from '../components/ui/Dialog';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import { cleanText, formatDate, formatEventType } from '../utils/learning';

export default function TeacherDashboard() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'tasks' ? 'tasks' : 'quizzes';
  const section = params.get('section') || '';
  const search = params.get('learner') || '';
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [detail, setDetail] = useState(null);
  const [grading, setGrading] = useState(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, error, refresh } = useRemoteData(async () => {
    const [classes, records] = await Promise.all([
      api.getClasses(),
      view === 'tasks' ? api.getPerformanceTasks() : api.getGradebook(section ? { section } : {})
    ]);
    return { ...records, classes: classes.classes };
  }, [view, section]);
  const task = data?.tasks?.find(t => t.id === params.get('task')) || data?.tasks?.[0];
  const submissions = useRemoteData(
    () =>
      task && view === 'tasks'
        ? api.getPerformanceTaskSubmissions(task.id)
        : Promise.resolve({ submissions: [] }),
    [task?.id, view]
  );
  const updateParams = values => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(values)) if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  };
  const closeDetail = useCallback(() => setDetail(null), []);
  const closeGrade = useCallback(() => setGrading(null), []);
  const entries = (data?.entries || []).filter(e =>
    `${e.first_name} ${e.last_name} ${e.lrn_or_id}`.toLowerCase().includes(search.toLowerCase())
  );
  const taskEntries = (submissions.data?.submissions || []).filter(
    e =>
      (!section || e.section === section) &&
      `${e.student_name} ${e.lrn_or_id}`.toLowerCase().includes(search.toLowerCase())
  );
  async function review(id) {
    setBusy(true);
    setActionError('');
    try {
      setDetail(await api.getSubmissionById(id));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function grade(e) {
    e.preventDefault();
    setBusy(true);
    setActionError('');
    try {
      const res = await api.gradePerformanceTaskSubmission(grading.id, {
        score: Number(score),
        feedback
      });
      if (!res.success) throw new Error(res.message);
      setGrading(null);
      setMessage('Score and comment saved. The student can now see them in My Progress.');
      submissions.refresh();
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
          <h1>Gradebook</h1>
          <p>Check quiz scores, grade student tasks, and leave helpful comments.</p>
        </div>
        <Link
          className="text-action"
          to={section ? `/teacher/reports?section=${encodeURIComponent(section)}` : '/teacher/reports'}
        >
          Class reports <ArrowRight size={16} />
        </Link>
      </div>
      <Notice error>{error || submissions.error || (!grading && actionError)}</Notice>
      <Notice success>{message}</Notice>
      {(error || submissions.error) && (
        <button
          className="text-action"
          onClick={() => {
            refresh();
            submissions.refresh();
          }}
        >
          Try again
        </button>
      )}
      <div className="tabs">
        <button
          className={view === 'quizzes' ? 'active' : ''}
          aria-pressed={view === 'quizzes'}
          onClick={() => updateParams({ view: 'quizzes' })}
        >
          Quiz scores
        </button>
        <button
          className={view === 'tasks' ? 'active' : ''}
          aria-pressed={view === 'tasks'}
          onClick={() => updateParams({ view: 'tasks' })}
        >
          Class tasks
        </button>
      </div>
      <div className="filters">
        <div className="field">
          <label htmlFor="gradebook-section">Class section</label>
          <select
            id="gradebook-section"
            className="form-input"
            value={section}
            onChange={e => updateParams({ section: e.target.value })}
          >
            <option value="">All classes</option>
            {data?.classes.map(c => (
              <option key={c.section}>{c.section}</option>
            ))}
          </select>
        </div>
        <div className="field search-field">
          <label htmlFor="gradebook-search">Search student</label>
          <input
            id="gradebook-search"
            className="form-input"
            type="search"
            value={search}
            onChange={e => updateParams({ learner: e.target.value })}
            placeholder="Name or LRN…"
          />
        </div>
        {view === 'tasks' && (
          <div className="field">
            <label htmlFor="gradebook-task">Class task</label>
            <select
              id="gradebook-task"
              className="form-input"
              value={task?.id || ''}
              onChange={e => updateParams({ task: e.target.value })}
            >
              {!data?.tasks?.length && <option value="">No tasks yet</option>}
              {data?.tasks?.map(t => (
                <option key={t.id} value={t.id}>
                  {cleanText(t.title)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {loading || (view === 'tasks' && submissions.loading) ? (
        <Loading>Loading gradebook…</Loading>
      ) : view === 'quizzes' ? (
        entries.length ? (
          <div className="table-responsive" tabIndex={0} role="region" aria-label="Quiz gradebook">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Quiz</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Screen activity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.submission_id}>
                    <td>
                      <strong>
                        {cleanText(e.first_name)} {cleanText(e.last_name)}
                      </strong>
                      <small>
                        {cleanText(e.section)} · {cleanText(e.lrn_or_id)}
                      </small>
                    </td>
                    <td>
                      {cleanText(e.quiz_title)}
                      <small>{formatDate(e.submitted_at, '')}</small>
                    </td>
                    <td>
                      {e.score_obtained} / {e.total_points}
                      <small>{e.percentage}%</small>
                    </td>
                    <td>
                      <Status tone={e.is_passed ? 'good' : 'pending'}>
                        {e.is_passed ? 'Passed' : 'Needs practice'}
                      </Status>
                    </td>
                    <td>
                      {e.blur_count} screen changes
                      {e.is_flagged_for_cheating ? ' · Check activity' : ''}
                    </td>
                    <td>
                      <button className="text-action" disabled={busy} onClick={() => review(e.submission_id)}>
                        View answers <ArrowRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No quiz scores found">Finished quizzes will show up here.</EmptyState>
        )
      ) : (
        <>
          {task && (
            <div className="section-heading">
              <div>
                <h2>{cleanText(task.title)}</h2>
                <p className="muted">{cleanText(task.rubric_criteria, 'No grading guide added.')}</p>
              </div>
            </div>
          )}
          {taskEntries.length ? (
            <div className="table-responsive" tabIndex={0} role="region" aria-label="Task submissions">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Submitted file</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {taskEntries.map(s => (
                    <tr key={s.id}>
                      <td>
                        <strong>{cleanText(s.student_name)}</strong>
                        <small>
                          {cleanText(s.section)} · {cleanText(s.lrn_or_id)}
                        </small>
                      </td>
                      <td>
                        <a href={api.getSubmissionFileUrl(s.file_url)} target="_blank" rel="noreferrer">
                          {cleanText(s.file_name)}
                        </a>
                        <small>{formatDate(s.submitted_at, '')}</small>
                      </td>
                      <td>{s.status === 'GRADED' ? `${s.score} / ${task.total_points}` : 'Not graded yet'}</td>
                      <td>
                        <Status tone={s.status === 'GRADED' ? 'good' : 'pending'}>
                          {s.status === 'GRADED' ? 'Graded' : 'Waiting for grade'}
                        </Status>
                      </td>
                      <td>
                        <button
                          className="text-action"
                          onClick={() => {
                            setGrading(s);
                            setScore(s.score === null ? '' : String(s.score));
                            setFeedback(s.feedback || '');
                            setActionError('');
                          }}
                        >
                          {s.status === 'GRADED' ? 'Edit grade' : 'Grade work'}
                          <ArrowRight size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No task submissions yet">Files sent by students will show up here.</EmptyState>
          )}
        </>
      )}
      {grading && (
        <Dialog title={`Grade ${cleanText(grading.student_name)}’s work`} onClose={closeGrade}>
          <Notice error>{actionError}</Notice>
          <a
            className="text-action"
            href={api.getSubmissionFileUrl(grading.file_url)}
            target="_blank"
            rel="noreferrer"
          >
            Open {cleanText(grading.file_name)}
            <ArrowRight size={16} />
          </a>
          {grading.notes && (
            <p className="muted" style={{ margin: '16px 0' }}>
              Student note: {cleanText(grading.notes)}
            </p>
          )}
          <p style={{ margin: '16px 0' }}>
            Grading guide: {cleanText(task.rubric_criteria, 'No grading guide added.')}
          </p>
          <form onSubmit={grade}>
            <div className="field">
              <label htmlFor="grade-score">Score (out of {task.total_points})</label>
              <input
                id="grade-score"
                className="form-input"
                type="number"
                min={0}
                max={task.total_points}
                step="any"
                value={score}
                onChange={e => setScore(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="grade-feedback">Comment for the student</label>
              <textarea
                id="grade-feedback"
                className="form-input"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save score and comment'}
            </button>
          </form>
        </Dialog>
      )}
      {detail && (
        <Dialog title={cleanText(detail.submission.quiz_title)} onClose={closeDetail}>
          <p>
            <strong>
              {cleanText(detail.submission.first_name)} {cleanText(detail.submission.last_name)}
            </strong>{' '}
            · {detail.submission.score_obtained} / {detail.submission.total_points}
          </p>
          <section className="section">
            <h3>Screen activity</h3>
            <p>
              {detail.submission.blur_count} tab or window changes were recorded during the quiz.
            </p>
            {detail.proctorLogs.length ? (
              <ul className="simple-list">
                {detail.proctorLogs.map(l => (
                  <li key={l.id}>
                    {formatEventType(l.event_type)} · {formatDate(l.timestamp, '')}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No tab or window changes recorded.</p>
            )}
          </section>
          <section className="section">
            <h3>Answers</h3>
            <ul className="simple-list">
              {detail.answers.map((a, i) => (
                <li key={a.id}>
                  <strong>
                    {i + 1}. {cleanText(a.question_text)}
                  </strong>
                  <p>Answer: {cleanText(a.selected_answer, 'No answer')}</p>
                  <Status tone={a.is_correct ? 'good' : 'pending'}>
                    {a.is_correct ? 'Correct' : 'Incorrect'}
                  </Status>
                </li>
              ))}
            </ul>
          </section>
        </Dialog>
      )}
    </div>
  );
}
