export function formatDate(value, fallback = 'No due date') {
  if (!value) return fallback;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(date);
}

export function cleanText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value)
    .replace(/_/g, ' ')
    .replace(/[—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatStatus(status) {
  const key = String(status || '').toUpperCase().trim();
  const map = {
    RECOMMENDED: 'Suggested',
    ASSIGNED: 'Assigned',
    COMPLETED: 'Completed',
    RESOLVED: 'Completed',
    EXEMPTED: 'Excused',
    EXEMPT: 'Excused',
    OVERRIDDEN: 'Completed by teacher',
    NEEDS_INTERVENTION: 'Needs practice',
    CRITICAL_INTERVENTION: 'Needs practice',
    MASTERED: 'Mastered',
    DEVELOPING: 'Improving',
    SUBMITTED: 'Submitted',
    GRADED: 'Graded',
    IN_PROGRESS: 'In progress'
  };
  if (map[key]) return map[key];
  const cleaned = cleanText(status, 'Pending').toLowerCase();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function formatEventType(type) {
  const key = String(type || '').toUpperCase().trim();
  const map = {
    WINDOW_MINIMIZE: 'Left quiz window',
    WINDOW_BLUR: 'Left quiz window',
    TAB_SWITCH: 'Switched tab',
    TAB_HIDDEN: 'Switched tab',
    FULLSCREEN_EXIT: 'Exited full screen'
  };
  return map[key] || cleanText(type, 'Screen change');
}

export function formatDifficulty(text) {
  const val = String(text || '').toUpperCase();
  if (val.includes('NAPAKADALI') || val.includes('VERY EASY')) return 'Very easy';
  if (val.includes('MADALI') || val.includes('EASY')) return 'Easy';
  if (val.includes('KATAMTAMAN') || val.includes('IDEAL')) return 'Just right';
  if (val.includes('NAPAKAHIRAP') || val.includes('VERY DIFFICULT')) return 'Very hard';
  if (val.includes('MAHIRAP') || val.includes('DIFFICULT')) return 'Hard';
  return cleanText(text, 'Medium');
}

export function formatRecommendation(text) {
  const val = String(text || '').toUpperCase();
  if (val.includes('UNCONDITIONALLY')) return 'Great question (keep)';
  if (val.includes('RETAIN')) return 'Good question (keep)';
  if (val.includes('REVISE')) return 'Make question clearer';
  if (val.includes('DISCARD') || val.includes('REWRITE')) return 'Needs rewrite';
  return cleanText(text, 'Keep');
}

export function formatChoiceNote(text) {
  const val = String(text || '').toUpperCase();
  if (val.includes('KEY')) return 'Correct answer';
  if (val.includes('NEVER CHOSEN') || val.includes('NON-FUNCTIONAL')) return 'No one picked this';
  if (val.includes('REVISE')) return 'Confusing choice (check)';
  if (val.includes('EFFECTIVE')) return 'Good choice option';
  return cleanText(text, '');
}

export const ilawLabels = {
  INTENTIONS: 'Goals',
  LEARNING_EXPERIENCES: 'Lessons',
  ASSESSMENT: 'Quizzes',
  WAYS_FORWARD: 'Practice'
};

export function activitiesFrom(quizzes = [], tasks = []) {
  const activities = [
    ...quizzes.map(q => ({
      ...q,
      title: cleanText(q.title),
      instructions: cleanText(q.instructions),
      kind: 'quiz',
      type: 'Quiz',
      submission: q.submission,
      state: q.submission?.status === 'SUBMITTED' ? 'Completed' : q.submission?.status === 'IN_PROGRESS' ? 'In progress' : 'Not started'
    })),
    ...tasks.map(t => ({
      ...t,
      title: cleanText(t.title),
      instructions: cleanText(t.instructions),
      rubric_criteria: cleanText(t.rubric_criteria),
      kind: 'task',
      type: 'Class task',
      submission: t.my_submission,
      state: t.my_submission?.status === 'GRADED' ? 'Graded' : t.my_submission ? 'Submitted' : 'Not submitted'
    }))
  ];
  return activities.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
}

export function completedActivity(item) {
  return ['Completed', 'Graded', 'Submitted'].includes(item.state);
}

export function materialUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
