import React, { useCallback, useState } from 'react';
import { api } from '../../services/api';
import useRemoteData from '../../hooks/useRemoteData';
import useQueryParams from '../../hooks/useQueryParams';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import { Loading, Notice } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';
import ApplicationsTable from './ApplicationsTable';
import InstructorsTable from './InstructorsTable';
import ReviewDialog from './ReviewDialog';

const TABS = [
  ['pending', 'Waiting for review', 'pending'],
  ['approved', 'Approved', 'approved'],
  ['rejected', 'Returned', 'rejected'],
  ['instructors', 'Instructors', 'instructors']
];

/** Admin workspace: verify instructor applications and see who has instructor access. */
export default function AdminDashboard() {
  const [params, updateParams] = useQueryParams();
  const tab = TABS.some(([key]) => key === params.get('tab')) ? params.get('tab') : 'pending';
  const [reviewing, setReviewing] = useState(null);
  const action = useAsyncAction();
  const closeReview = useCallback(() => setReviewing(null), []);

  const summary = useRemoteData(api.getAdminSummary);
  const list = useRemoteData(
    () => (tab === 'instructors' ? api.getInstructors() : api.getInstructorApplications({ status: tab.toUpperCase() })),
    [tab]
  );
  const counts = summary.data?.summary;

  const review = (status, reason) => action.run(async () => {
    const applicant = reviewing;
    requireSuccess(await api.reviewInstructorApplication(applicant.user_id, { status, reason }));
    setReviewing(null);
    action.setMessage(status === 'APPROVED'
      ? `${cleanText(applicant.full_name)} is now an instructor.`
      : `Application returned to ${cleanText(applicant.full_name)} with your reason.`);
    list.refresh();
    summary.refresh();
  });

  const openReview = application => {
    action.setError('');
    setReviewing(application);
  };

  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>Instructor access</h1>
          <p>Verify instructor applications. Only approved instructors can create classes and see student records.</p>
        </div>
      </div>
      <Notice error>{summary.error || list.error || (!reviewing && action.error)}</Notice>
      <Notice success>{action.message}</Notice>
      {(summary.error || list.error) && (
        <button className="text-action" onClick={() => { summary.refresh(); list.refresh(); }}>Try again</button>
      )}
      <div className="tabs" aria-label="Application views">
        {TABS.map(([key, label, countKey]) => (
          <button key={key} className={tab === key ? 'active' : ''} aria-pressed={tab === key} onClick={() => updateParams({ tab: key === 'pending' ? '' : key })}>
            {label}{counts ? ` (${counts[countKey]})` : ''}
          </button>
        ))}
      </div>
      {list.loading ? (
        <Loading>Loading…</Loading>
      ) : tab === 'instructors' ? (
        <InstructorsTable instructors={list.data?.instructors || []} />
      ) : (
        <ApplicationsTable applications={list.data?.applications || []} status={tab.toUpperCase()} onReview={openReview} />
      )}
      {reviewing && (
        <ReviewDialog
          application={reviewing}
          error={action.error}
          saving={action.busy}
          onApprove={() => review('APPROVED')}
          onReject={reason => review('REJECTED', reason)}
          onClose={closeReview}
        />
      )}
    </div>
  );
}
