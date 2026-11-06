import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from '../components/icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import useAsyncAction, { requireSuccess } from '../hooks/useAsyncAction';
import Dialog from '../components/ui/Dialog';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import { cleanText, formatDate } from '../utils/learning';
import TaskFormDialog from './Assessments/TaskFormDialog';
import ConfirmDeleteDialog from './Assessments/ConfirmDeleteDialog';

export default function AssessmentsPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useRemoteData(async () => {
    const [q, t, c] = await Promise.all([api.getQuizzes(), api.getPerformanceTasks(), api.getTaxonomy()]);
    return { quizzes: q.quizzes, tasks: t.tasks, competencies: c.flatCompetencies };
  });
  const [tab, setTab] = useState('Quizzes');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [preview, setPreview] = useState(null);
  const [taskDialog, setTaskDialog] = useState(null); // null | { task? }
  const [deleting, setDeleting] = useState(null); // null | { kind, item }
  const action = useAsyncAction();
  const closePreview = useCallback(() => setPreview(null), []);
  const closeTaskDialog = useCallback(() => setTaskDialog(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const canManage = a => user?.role === 'ADMIN' || a.created_by === user?.id;
  const isQuizzes = tab === 'Quizzes';
  const items =
    (isQuizzes ? data?.quizzes : data?.tasks)?.filter(
      a => a.title.toLowerCase().includes(search.toLowerCase()) && (showArchived || !a.archived_at)
    ) || [];

  const view = id =>
    action.run(async () => {
      setPreview((await api.getQuizById(id)).quiz);
    }, { key: id, clearMessage: true });

  const toggleArchive = a =>
    action.run(
      async () => {
        const archiving = !a.archived_at;
        if (isQuizzes) requireSuccess(await (archiving ? api.archiveQuiz(a.id) : api.restoreQuiz(a.id)));
        else requireSuccess(await (archiving ? api.archivePerformanceTask(a.id) : api.restorePerformanceTask(a.id)));
        action.setMessage(archiving ? 'Archived. Students no longer see it.' : 'Restored. Students can see it again.');
        refresh();
      },
      { key: a.id, clearMessage: true }
    );

  const finish = message => {
    setTaskDialog(null);
    setDeleting(null);
    action.setMessage(message);
    refresh();
  };

  function statusOf(a) {
    if (a.archived_at) return <Status>Archived</Status>;
    return (
      <Status tone="good">
        {isQuizzes ? (a.is_published ? 'Active' : 'Draft') : `${a.stats?.pending_count || 0} to grade`}
      </Status>
    );
  }

  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>Quizzes and Tasks</h1>
          <p>Create and manage quizzes and class tasks for your students.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setTaskDialog({})}>
            <Plus size={17} />
            Create task
          </button>
          <Link className="btn btn-primary" to="/teacher/quizzes/create">
            <Plus size={17} />
            Create quiz
          </Link>
        </div>
      </div>
      <Notice error>{error || action.error}</Notice>
      <Notice success>{action.message}</Notice>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Show archived
        </label>
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
                <th>{isQuizzes ? 'Time limit' : 'Due date'}</th>
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
                  <td>{isQuizzes ? `${a.time_limit_minutes} min` : formatDate(a.due_date)}</td>
                  <td>{a.total_points}</td>
                  <td>{statusOf(a)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                      {isQuizzes ? (
                        <button className="text-action" disabled={Boolean(action.busy)} onClick={() => view(a.id)}>
                          View questions <ArrowRight size={15} />
                        </button>
                      ) : (
                        <Link className="text-action" to={`/teacher/gradebook?view=tasks&task=${encodeURIComponent(a.id)}`}>
                          Check submissions <ArrowRight size={15} />
                        </Link>
                      )}
                      {canManage(a) && (
                        <>
                          {isQuizzes ? (
                            <Link className="text-action" to={`/teacher/quizzes/${encodeURIComponent(a.id)}/edit`}>
                              Edit
                            </Link>
                          ) : (
                            <button className="text-action" onClick={() => setTaskDialog({ task: a })}>
                              Edit
                            </button>
                          )}
                          <button className="text-action" disabled={action.busy === a.id} onClick={() => toggleArchive(a)}>
                            {a.archived_at ? 'Restore' : 'Archive'}
                          </button>
                          <button className="text-action" onClick={() => setDeleting({ kind: isQuizzes ? 'quiz' : 'task', item: a })}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
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
      {taskDialog && (
        <TaskFormDialog task={taskDialog.task} competencies={data?.competencies || []} onClose={closeTaskDialog} onSaved={finish} />
      )}
      {deleting && <ConfirmDeleteDialog kind={deleting.kind} item={deleting.item} onClose={closeDelete} onDone={finish} />}
    </div>
  );
}
