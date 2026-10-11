export function formatDate(value, fallback = 'No due date') {
  if (!value) return fallback;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(date);
}
export const ilawLabels = { INTENTIONS: 'Layunin', LEARNING_EXPERIENCES: 'Learn', ASSESSMENT: 'Assessment', WAYS_FORWARD: 'Pagsulong' };
export function activitiesFrom(quizzes = [], tasks = []) {
  const activities = [
    ...quizzes.map(q => ({ ...q, kind: 'quiz', type: 'Quiz', submission: q.submission, state: q.submission?.status === 'SUBMITTED' ? 'Completed' : q.submission?.status === 'IN_PROGRESS' ? 'In progress' : 'Not started' })),
    ...tasks.map(t => ({ ...t, kind: 'task', type: 'Performance task', submission: t.my_submission, state: t.my_submission?.status === 'GRADED' ? 'Graded' : t.my_submission ? 'Submitted' : 'Not submitted' }))
  ];
  return activities.sort((a,b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
}
export function completedActivity(item) { return ['Completed','Graded','Submitted'].includes(item.state); }
export function materialUrl(value) {
  try { const url = new URL(value, window.location.origin); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
