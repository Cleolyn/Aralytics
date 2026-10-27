import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, Users, BookOpen } from '../components/icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import { EmptyState, Loading, Notice } from '../components/ui/Feedback';
import { cleanText, formatDate } from '../utils/learning';

export default function TeacherOverview() {
  const { user } = useAuth();
  const location = useLocation();
  const { data, loading, error, refresh } = useRemoteData(async () => {
    const [classes, tasks, queue, quizzes] = await Promise.all([
      api.getClasses(),
      api.getPerformanceTasks(),
      api.getRemediationQueue(),
      api.getQuizzes()
    ]);
    return { classes: classes.classes, tasks: tasks.tasks, queue: queue.queue, quizzes: quizzes.quizzes };
  }, [user.id]);
  const pending = data?.tasks.reduce((n, t) => n + Number(t.stats?.pending_count || 0), 0) || 0;
  const support = data?.queue.filter(q => ['RECOMMENDED', 'ASSIGNED'].includes(q.status)) || [];
  const learners = new Set(support.map(q => q.student.id)).size;
  const dueTasks =
    data?.tasks
      .filter(t => t.due_date && new Date(t.due_date.replace(' ', 'T')) >= new Date())
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 3) || [];
  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>Hello, Teacher {user?.first_name}!</h1>
          <p>Here is a quick summary of your classes today.</p>
        </div>
        <Link className="btn btn-primary" to="/teacher/quizzes/create">
          Create quiz <ArrowRight size={17} />
        </Link>
      </div>
      <Notice error>{location.state?.unauthorizedNotice || error}</Notice>
      {error && (
        <button className="text-action" onClick={refresh}>
          Try again
        </button>
      )}
      {loading ? (
        <Loading />
      ) : (
        data && (
          <div className="split-content">
            <div>
              <section>
                <h2>To check</h2>
                <div className="action-row">
                  <ClipboardCheck size={24} aria-hidden="true" />
                  <div>
                    <strong>
                      {pending} {pending === 1 ? 'task submission' : 'task submissions'} to grade
                    </strong>
                    <p>Student projects waiting for your score and comment.</p>
                  </div>
                  <Link className="text-action" to="/teacher/gradebook?view=tasks">
                    Check submissions <ArrowRight size={16} />
                  </Link>
                </div>
                <div className="action-row">
                  <Users size={24} aria-hidden="true" />
                  <div>
                    <strong>
                      {learners} {learners === 1 ? 'student needs' : 'students need'} extra practice
                    </strong>
                    <p>Review materials suggested for students who scored low.</p>
                  </div>
                  <Link className="text-action" to="/teacher/remediation">
                    Open student support <ArrowRight size={16} />
                  </Link>
                </div>
                <div className="action-row">
                  <BookOpen size={24} aria-hidden="true" />
                  <div>
                    <strong>{data.quizzes.length} quizzes in your class</strong>
                    <p>View your quizzes or create a new activity.</p>
                  </div>
                  <Link className="text-action" to="/teacher/assessments">
                    View quizzes <ArrowRight size={16} />
                  </Link>
                </div>
              </section>
              <section className="section">
                <div className="section-heading">
                  <h2>Your classes</h2>
                  <Link className="text-action" to="/teacher/classes">
                    See all <ArrowRight size={15} />
                  </Link>
                </div>
                {data.classes.length ? (
                  <div className="table-responsive" tabIndex={0} role="region" aria-label="Class overview">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Section</th>
                          <th>Students</th>
                          <th>Answered quizzes</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.classes.map(c => (
                          <tr key={c.section}>
                            <td>
                              <strong>{cleanText(c.section)}</strong>
                            </td>
                            <td>{c.learners}</td>
                            <td>
                              {c.learners_with_quiz_submissions} of {c.learners}
                            </td>
                            <td>
                              <Link
                                className="text-action"
                                to={`/teacher/classes?section=${encodeURIComponent(c.section)}`}
                              >
                                Open class <ArrowRight size={15} />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState title="No classes yet">Students who sign up will show up here by section.</EmptyState>
                )}
              </section>
            </div>
            <aside className="aside">
              <section>
                <h2>Upcoming due dates</h2>
                {dueTasks.length ? (
                  <ul className="simple-list">
                    {dueTasks.map(t => (
                      <li key={t.id}>
                        <strong>{cleanText(t.title)}</strong>
                        <p>{formatDate(t.due_date)}</p>
                        <Link
                          className="text-action"
                          to={`/teacher/gradebook?view=tasks&task=${encodeURIComponent(t.id)}`}
                        >
                          See submissions <ArrowRight size={15} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No upcoming task due dates.</p>
                )}
              </section>
              <section>
                <h3>Class lessons</h3>
                <p>Upload reading materials and videos for your students.</p>
                <Link className="text-action" to="/teacher/materials">
                  Open lessons <ArrowRight size={15} />
                </Link>
              </section>
            </aside>
          </div>
        )
      )}
    </div>
  );
}
