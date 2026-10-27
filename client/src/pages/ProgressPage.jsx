import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from '../components/icons';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import useRemoteData from '../hooks/useRemoteData';
import useLearnerData from '../hooks/useLearnerData';
import Dialog from '../components/ui/Dialog';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import { cleanText, formatDate } from '../utils/learning';

export default function ProgressPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useLearnerData();
  const scores = useRemoteData(api.getPersonalScores, [user.id]);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => setDetail(null), []);
  async function review(id) {
    setBusy(true);
    setDetailError('');
    try {
      setDetail(await api.getOwnSubmission(id));
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const readIds = new Set(data?.logs.map(l => l.material_id) || []);
  const total = data?.materials.length || 0;
  const count = data?.materials.filter(m => readIds.has(m.id)).length || 0;
  const tasks = data?.tasks.filter(t => t.my_submission) || [];
  const support = data?.interventions.filter(i => !['RESOLVED', 'COMPLETED', 'EXEMPTED', 'EXEMPT', 'OVERRIDDEN'].includes(i.status)) || [];
  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>My Progress</h1>
          <p>Check your quiz scores, task grades, and lessons read.</p>
        </div>
        <span className="muted">{user.section} · Araling Panlipunan</span>
      </div>
      <Notice error>{error || scores.error || data?.warnings.join(' ') || detailError}</Notice>
      {(error || scores.error || data?.warnings.length > 0) && (
        <button
          className="text-action"
          onClick={() => {
            refresh();
            scores.refresh();
          }}
        >
          Try again
        </button>
      )}
      {loading || scores.loading ? (
        <Loading>Loading your grades…</Loading>
      ) : (
        <div className="split-content">
          <div>
            <section>
              <div className="section-heading">
                <h2>Lessons read</h2>
                <strong>
                  {count} of {total}
                </strong>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label="Lessons read"
                aria-valuemin={0}
                aria-valuemax={total || 1}
                aria-valuenow={count}
              >
                <span style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
              </div>
              <small className="muted">Shows how many lessons you have marked as read.</small>
            </section>
            <section className="section">
              <h2 style={{ marginBottom: 20 }}>Scores and teacher comments</h2>
              {!scores.data?.scores.length && !tasks.length ? (
                <EmptyState title="No scores yet">Finish a quiz or submit a class task to see your grades here.</EmptyState>
              ) : (
                <div className="table-responsive" tabIndex={0} role="region" aria-label="Grades and feedback">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Activity</th>
                        <th>Score</th>
                        <th>Status</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scores.data?.scores || []).map(s => (
                        <tr key={s.id}>
                          <td>
                            <strong>{cleanText(s.quiz_title)}</strong>
                            <small>{formatDate(s.submitted_at, '')}</small>
                          </td>
                          <td>
                            {s.score_obtained} / {s.quiz_total_points}
                          </td>
                          <td>
                            <Status tone={s.is_passed ? 'good' : 'pending'}>
                              {s.is_passed ? 'Passed' : 'Needs practice'}
                            </Status>
                          </td>
                          <td>
                            <button className="text-action" disabled={busy} onClick={() => review(s.id)}>
                              See answers <ArrowRight size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {tasks.map(t => (
                        <tr key={t.id}>
                          <td>
                            <strong>{cleanText(t.title)}</strong>
                            <small>{formatDate(t.my_submission.submitted_at, '')}</small>
                          </td>
                          <td>
                            {t.my_submission.status === 'GRADED'
                              ? `${t.my_submission.score} / ${t.total_points}`
                              : 'Not graded yet'}
                          </td>
                          <td>
                            <Status tone="good">
                              {t.my_submission.status === 'GRADED' ? 'Graded' : 'Submitted'}
                            </Status>
                          </td>
                          <td>
                            <Link
                              className="text-action"
                              to={`/student/activities?task=${encodeURIComponent(t.id)}`}
                            >
                              {t.my_submission.status === 'GRADED' ? 'See comment' : 'See work'}
                              <ArrowRight size={15} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="section">
              <h2>Read lessons</h2>
              {count ? (
                <ul className="simple-list">
                  {data.materials
                    .filter(m => readIds.has(m.id))
                    .map(m => (
                      <li key={m.id}>
                        <Link to={`/student/materials/${m.id}`}>{cleanText(m.title)}</Link>
                        <span style={{ float: 'right' }}>
                          <Status tone="good">Read</Status>
                        </span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="muted" style={{ marginTop: 16 }}>
                  Click Mark as read inside a lesson to save your progress here.
                </p>
              )}
            </section>
          </div>
          <aside className="aside">
            <section>
              <h2>Next step</h2>
              <p>
                {support.length
                  ? 'You have review materials ready to help you improve.'
                  : 'Keep reading your lessons and checking upcoming activities.'}
              </p>
              <Link
                className="btn btn-primary"
                to={support.length ? '/student/interventions' : '/student/materials'}
              >
                {support.length ? 'Open practice' : 'Browse lessons'}
                <ArrowRight size={16} />
              </Link>
            </section>
            <section>
              <h3>Teacher comments</h3>
              <p>
                When your teacher grades your class task, their score and comments will show up here. Click See comment to read them.
              </p>
            </section>
          </aside>
        </div>
      )}
      {detail && (
        <Dialog title={cleanText(detail.submission.quiz_title)} onClose={close}>
          <p className="muted">Your quiz answers</p>
          <ul className="simple-list">
            {detail.answers.map((a, i) => (
              <li key={a.id}>
                <strong>
                  {i + 1}. {cleanText(a.question_text)}
                </strong>
                <p style={{ marginTop: 8 }}>Your answer: {cleanText(a.selected_answer, 'No answer')}</p>
                <Status tone={a.is_correct ? 'good' : 'pending'}>
                  {a.is_correct ? 'Correct' : 'Incorrect'}
                </Status>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </div>
  );
}
