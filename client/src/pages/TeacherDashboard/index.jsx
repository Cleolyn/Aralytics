import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from '../../components/icons';
import { api } from '../../services/api';
import useRemoteData from '../../hooks/useRemoteData';
import useQueryParams from '../../hooks/useQueryParams';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import { Loading, Notice } from '../../components/ui/Feedback';
import GradebookFilters from './GradebookFilters';
import QuizScoresTable from './QuizScoresTable';
import TaskSubmissionsTable from './TaskSubmissionsTable';
import GradeDialog from './GradeDialog';
import SubmissionDetailDialog from './SubmissionDetailDialog';

const matches = (text, search) => text.toLowerCase().includes(search.toLowerCase());

/** Teacher gradebook: quiz scores and performance-task grading. View and filters live in the URL. */
export default function TeacherDashboard() {
  const [params, updateParams] = useQueryParams();
  const view = params.get('view') === 'tasks' ? 'tasks' : 'quizzes';
  const section = params.get('section') || '';
  const search = params.get('learner') || '';
  const [detail, setDetail] = useState(null);
  const [grading, setGrading] = useState(null);
  const action = useAsyncAction();

  const { data, loading, error, refresh } = useRemoteData(async () => {
    const [classes, records] = await Promise.all([
      api.getClasses(),
      view === 'tasks' ? api.getPerformanceTasks() : api.getGradebook(section ? { section } : {})
    ]);
    return { ...records, classes: classes.classes };
  }, [view, section]);

  const task = data?.tasks?.find(t => t.id === params.get('task')) || data?.tasks?.[0];
  const submissions = useRemoteData(
    () => (task && view === 'tasks' ? api.getPerformanceTaskSubmissions(task.id) : Promise.resolve({ submissions: [] })),
    [task?.id, view]
  );

  const closeDetail = useCallback(() => setDetail(null), []);
  const closeGrade = useCallback(() => setGrading(null), []);

  const quizEntries = (data?.entries || []).filter(e => matches(`${e.first_name} ${e.last_name} ${e.lrn_or_id}`, search));
  const taskEntries = (submissions.data?.submissions || []).filter(
    e => (!section || e.section === section) && matches(`${e.student_name} ${e.lrn_or_id}`, search)
  );

  const review = id => action.run(async () => setDetail(await api.getSubmissionById(id)));
  const openGrading = submission => {
    action.setError('');
    setGrading(submission);
  };
  const saveGrade = values => action.run(async () => {
    requireSuccess(await api.gradePerformanceTaskSubmission(grading.id, values));
    setGrading(null);
    action.setMessage('Score and comment saved. The student can now see them in My Progress.');
    submissions.refresh();
    refresh();
  });

  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>Gradebook</h1>
          <p>Check quiz scores, grade student tasks, and leave helpful comments.</p>
        </div>
        <Link className="text-action" to={section ? `/teacher/reports?section=${encodeURIComponent(section)}` : '/teacher/reports'}>
          Class reports <ArrowRight size={16} />
        </Link>
      </div>
      <Notice error>{error || submissions.error || (!grading && action.error)}</Notice>
      <Notice success>{action.message}</Notice>
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
        <button className={view === 'quizzes' ? 'active' : ''} aria-pressed={view === 'quizzes'} onClick={() => updateParams({ view: 'quizzes' })}>
          Quiz scores
        </button>
        <button className={view === 'tasks' ? 'active' : ''} aria-pressed={view === 'tasks'} onClick={() => updateParams({ view: 'tasks' })}>
          Class tasks
        </button>
      </div>
      <GradebookFilters
        classes={data?.classes || []}
        section={section}
        search={search}
        tasks={data?.tasks || []}
        taskId={task?.id}
        showTasks={view === 'tasks'}
        onChange={updateParams}
      />
      {loading || (view === 'tasks' && submissions.loading) ? (
        <Loading>Loading gradebook…</Loading>
      ) : view === 'quizzes' ? (
        <QuizScoresTable entries={quizEntries} busy={action.busy} onReview={review} />
      ) : (
        <TaskSubmissionsTable task={task} submissions={taskEntries} onGrade={openGrading} />
      )}
      {grading && (
        <GradeDialog submission={grading} task={task} error={action.error} saving={action.busy} onSubmit={saveGrade} onClose={closeGrade} />
      )}
      {detail && <SubmissionDetailDialog detail={detail} onClose={closeDetail} />}
    </div>
  );
}
