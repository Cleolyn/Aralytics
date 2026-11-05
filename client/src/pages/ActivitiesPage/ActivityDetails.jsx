import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from '../../components/icons';
import { Status } from '../../components/ui/Feedback';
import { cleanText, completedActivity, formatDate } from '../../utils/learning';
import TaskSubmission from './TaskSubmission';

function QuizAction({ quiz }) {
  const navigate = useNavigate();
  if (completedActivity(quiz)) {
    return (
      <Link className="text-action" to="/student/progress">
        See your score <ArrowRight size={16} />
      </Link>
    );
  }
  return (
    <>
      <p>You need internet to take this quiz. Stay on the quiz screen while answering. The timer starts when you open the quiz.</p>
      <button className="btn btn-primary" disabled={!navigator.onLine} onClick={() => navigate(`/student/quizzes/${quiz.id}`)}>
        {quiz.state === 'In progress' ? 'Continue quiz' : 'Start quiz'}
        <ArrowRight size={16} />
      </button>
    </>
  );
}

/** Instructions and the next step (submit work / start quiz) for the selected activity. */
export default function ActivityDetails({ activity, onSubmitted }) {
  return (
    <>
      <span className="eyebrow">{activity.type}</span>
      <h2 style={{ marginTop: 12 }}>{cleanText(activity.title)}</h2>
      <Status tone={completedActivity(activity) ? 'good' : 'pending'}>{activity.state}</Status>
      <p style={{ marginTop: 12 }}>Due: {formatDate(activity.due_date)}</p>
      <section className="section">
        <h3>Instructions</h3>
        <p style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>
          {cleanText(activity.instructions || activity.description || 'Read each question carefully and follow your teacher’s instructions.')}
        </p>
        {activity.rubric_criteria && (
          <>
            <h3 style={{ marginTop: 20 }}>Grading guide</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{cleanText(activity.rubric_criteria)}</p>
          </>
        )}
        <p>
          {activity.total_points} points
          {activity.kind === 'quiz' ? ` · ${activity.time_limit_minutes || 20} minutes` : ''}
        </p>
      </section>
      {activity.kind === 'task' ? (
        <TaskSubmission key={activity.id} task={activity} onSubmitted={onSubmitted} />
      ) : (
        <QuizAction quiz={activity} />
      )}
    </>
  );
}
