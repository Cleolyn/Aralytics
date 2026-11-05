import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import PublicLayout from '../../components/PublicLayout';
import { Notice } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import useRemoteData from '../../hooks/useRemoteData';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import { AUTH_PATHS, ROLE_HOMES } from '../../utils/authFlow';
import { formatDate } from '../../utils/learning';
import ApplicationForm from './ApplicationForm';

function PendingReview({ application, checking, onCheck }) {
  return (
    <div className="approval-card">
      <h1>Waiting for administrator review</h1>
      <p>Your instructor application was sent on {formatDate(application.created_at, 'recently')}. You will get access to the teacher workspace once an administrator approves it.</p>
      <dl className="enrollment-details">
        <div><dt>Name</dt><dd>{application.full_name}</dd></div>
        <div><dt>School</dt><dd>{application.school}</dd></div>
        <div><dt>Position</dt><dd>{application.position}</dd></div>
        {application.employee_id && <div><dt>Employee ID</dt><dd>{application.employee_id}</dd></div>}
      </dl>
      <button className="btn btn-primary" disabled={checking} onClick={onCheck}>
        {checking ? 'Checking…' : 'Check application status'}
      </button>
    </div>
  );
}

/** Apply for instructor access; an administrator must approve before the account becomes a teacher. */
export default function InstructorApplicationPage() {
  const { user, loading, logout, refreshUser, refreshing } = useAuth();
  const { data, loading: loadingApplication, error, refresh } = useRemoteData(
    () => (user?.role === 'STUDENT' && user.email_verified ? api.getMyInstructorApplication() : Promise.resolve({ application: null })),
    [user?.id, user?.role]
  );
  const action = useAsyncAction();

  if (loading) return <div className="container" role="status">Checking your account…</div>;
  if (!user) return <Navigate to={AUTH_PATHS.signIn} replace />;
  if (!user.email_verified) return <Navigate to={AUTH_PATHS.afterAuth} replace />;
  if (user.role !== 'STUDENT') return <Navigate to={ROLE_HOMES[user.role]} replace />;

  const application = data?.application || null;
  const enrolled = ['PENDING', 'APPROVED'].includes(user.enrollment_status);

  const submit = values => action.run(async () => {
    requireSuccess(await api.submitInstructorApplication(values));
    refresh();
    refreshUser();
  });
  const checkStatus = () => {
    refresh();
    refreshUser();
  };

  let content;
  if (loadingApplication) {
    content = <p role="status">Loading your application…</p>;
  } else if (enrolled) {
    content = (
      <>
        <h1>This is a student account</h1>
        <p>This account is enrolled as a student. To apply as an instructor, sign out and create a separate account with your work email.</p>
        <Link className="btn btn-primary" to={AUTH_PATHS.afterAuth}>Back to my class</Link>
      </>
    );
  } else if (application?.status === 'PENDING') {
    content = <PendingReview application={application} checking={refreshing || loadingApplication} onCheck={checkStatus} />;
  } else if (application?.status === 'APPROVED') {
    content = (
      <div className="approval-card">
        <h1>Your application was approved</h1>
        <p>Continue to open your teacher workspace.</p>
        <button className="btn btn-primary" disabled={refreshing} onClick={refreshUser}>{refreshing ? 'Opening…' : 'Continue'}</button>
      </div>
    );
  } else {
    const rejected = application?.status === 'REJECTED';
    content = (
      <>
        {rejected && (
          <div className="enrollment-return" role="status">
            <h2>Your application needs an update</h2>
            <p>{application.reason}</p>
            <p>Correct your details below and send the application again.</p>
          </div>
        )}
        <h1>Apply for instructor access</h1>
        <p>Instructor accounts can create classes, publish lessons and quizzes, and see student records, so every instructor is verified by an administrator.</p>
        <ApplicationForm
          key={application?.status || 'new'}
          initial={application || { full_name: user.full_name }}
          busy={action.busy}
          resubmitting={rejected}
          onSubmit={submit}
        />
      </>
    );
  }

  return (
    <PublicLayout account>
      <div className="join-layout">
        <aside className="join-context">
          <h2>Instructor access</h2>
          <p>Araling Panlipunan 10</p>
          <ol className="enrollment-journey">
            <li>Verified account</li>
            <li aria-current={!application || application.status === 'REJECTED' ? 'step' : undefined}>Application</li>
            <li aria-current={application?.status === 'PENDING' ? 'step' : undefined}>Administrator approval</li>
          </ol>
          <p className="account-note">Signed in as {user.email}</p>
          <button className="text-action" onClick={logout}>Sign out</button>
          {!enrolled && <Link className="text-action" to={AUTH_PATHS.afterAuth}>I’m a student joining a class</Link>}
        </aside>
        <section className="join-sheet">
          <Notice error>{error || action.error}</Notice>
          {content}
        </section>
      </div>
    </PublicLayout>
  );
}
