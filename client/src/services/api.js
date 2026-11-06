const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Token getter — wired by AuthContext to Clerk's async getToken()
// ---------------------------------------------------------------------------
let _tokenGetter = null;
let _lastToken = null; // cached for synchronous URL builders
let _tokenGeneration = 0;

/** Called once from AuthContext when Clerk session is ready. */
export function setTokenGetter(fn) {
  if (_tokenGetter === fn) return;
  _tokenGetter = fn;
  if (!fn) _lastToken = null;
  _tokenGeneration++;
}

/** Async — always returns the freshest Clerk session JWT. */
export async function getToken() {
  if (_tokenGetter) {
    const generation = _tokenGeneration;
    const t = await _tokenGetter();
    if (generation !== _tokenGeneration) return null;
    _lastToken = t || null;
    return t;
  }
  return null;
}

/** Synchronous — returns cached token for URL builders (e.g. file downloads). */
export function getTokenSync() {
  return _lastToken;
}

export async function request(endpoint, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Pre-check offline status for strictly online routes
  const isOnlineOnly = /\/(quizzes|proctoring|submissions|export|performance-tasks)/.test(endpoint);
  if (!navigator.onLine && isOnlineOnly) {
    throw new Error('Connect to the internet to complete this action.');
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      // Session expired — fire event for AuthContext to handle
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }

    let data;
    try { data = await res.json(); }
    catch { throw new Error('The server returned an unreadable response. Check that the backend is running and try again.'); }
    if (!res.ok) {
      if (data.code === 'ACCOUNT_SUSPENDED') window.dispatchEvent(new CustomEvent('auth:suspended'));
      throw Object.assign(new Error(data.message || `Request failed with status ${res.status}`), { code: data.code, status: res.status });
    }

    return data;
  } catch (err) {
    console.error(`[API Error] ${endpoint}:`, err);
    throw err;
  }
}

const withQuery = (path, params = {}) => {
  const query = new URLSearchParams(params).toString();
  return query ? `${path}?${query}` : path;
};
const post = (endpoint, payload, method = 'POST') => request(endpoint, { method, body: JSON.stringify(payload) });
// Downloads open in a new tab, so the session token travels as ?token= (bridged server-side).
const downloadUrl = (path, params = {}) => withQuery(`${API_BASE}${path}`, { token: getTokenSync() || '', ...params });

export const api = {
  // Classes & learner records
  getClasses: () => request('/teacher/classes'),
  getPersonalScores: () => request('/student/scores'),
  getOwnSubmission: (id) => request(`/student/submissions/${id}`),

  // Curriculum & ILAW
  getTaxonomy: () => request('/curriculum/taxonomy'),

  // Materials (offline capable)
  getMaterials: (params) => request(withQuery('/materials', params)),
  createMaterial: (data) => post('/materials', data),
  updateMaterial: (id, data) => post(`/materials/${id}`, data, 'PUT'),
  deleteMaterial: (id) => request(`/materials/${id}`, { method: 'DELETE' }),

  // Quizzes (online only)
  getQuizzes: () => request('/quizzes'),
  getQuizById: (id) => request(`/quizzes/${id}`),
  createQuiz: (payload) => post('/quizzes', payload),

  // Submissions & grading (online only)
  getSubmissionById: (id) => request(`/submissions/detail/${id}`),
  getGradebook: (params) => request(withQuery('/submissions/gradebook', params)),
  submitAssessmentAttempt: (payload) => post('/assessment/submit', payload),
  logSecurityEventAsync: (payload) => post('/security/log-event', payload),

  // Practice & interventions (Ways Forward)
  getPractice: () => request('/student/practice'),
  getProficiencyProfiling: (params) => request(withQuery('/analytics/proficiency', params)),
  getRemediationQueue: (params) => request(withQuery('/analytics/remediation-queue', params)),
  handleInterventionAction: (id, payload) => post(`/analytics/intervention/${id}/action`, payload),
  createIntervention: (payload) => post('/analytics/interventions', payload),
  deleteIntervention: (id) => request(`/analytics/interventions/${id}`, { method: 'DELETE' }),
  getItemAnalysis: (quizId) => request(`/analytics/quizzes/${quizId}/item-analysis`),

  // Reports (XLSX / PDF downloads)
  getAnalyticsXlsxUrl: (params) => downloadUrl('/analytics/export/xlsx', params),
  getAnalyticsPdfUrl: (params) => downloadUrl('/analytics/export/pdf', params),

  // Performance tasks (SRS FR-43, FR-44)
  getPerformanceTasks: (params) => request(withQuery('/performance-tasks', params)),
  createPerformanceTask: (payload) => post('/performance-tasks', payload),
  submitPerformanceTask: (id, payload) => post(`/performance-tasks/${id}/submit`, payload),
  getPerformanceTaskSubmissions: (id) => request(`/performance-tasks/${id}/submissions`),
  gradePerformanceTaskSubmission: (id, payload) => post(`/performance-tasks/submissions/${id}/grade`, payload, 'PATCH'),
  // Submissions and lessons carry a short-lived signed download_url; there is nothing to build client-side.
  getSubmissionFileUrl: (item) => item?.download_url ?? null,

  // File storage (chunked uploads, My files)
  createUpload: (payload) => post('/files', payload),
  completeUpload: (id) => post(`/files/${encodeURIComponent(id)}/complete`, {}),
  listMyFiles: (purpose = 'personal') => request(withQuery('/files', { purpose })),
  getFile: (id) => request(`/files/${encodeURIComponent(id)}`),
  deleteFile: (id) => request(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getAdminStorage: () => request('/admin/storage'),
  purgeUserFiles: (userId) => request(`/admin/users/${encodeURIComponent(userId)}/files`, { method: 'DELETE' }),

  // Instructor applications (applicant) and admin review
  getMyInstructorApplication: () => request('/instructor-applications/me'),
  submitInstructorApplication: (payload) => post('/instructor-applications', payload),
  getAdminSummary: () => request('/admin/summary'),
  getInstructorApplications: (params) => request(withQuery('/admin/applications', params)),
  reviewInstructorApplication: (userId, payload) => post(`/admin/applications/${encodeURIComponent(userId)}`, payload, 'PATCH'),
  getInstructors: () => request('/admin/instructors'),

  // Offline reading sync (SRS FR-50)
  syncOfflineReadLogs: (logs) => post('/materials/sync-read-logs', { logs }),
  getReadLogs: () => request('/materials/read-logs'),

  // [A] teaching content — add below
  // ---
  // [B] admin and accounts — add below
  getAdminUsers: p => request(withQuery('/admin/users', p)),
  suspendUser: (id, p) => post(`/admin/users/${encodeURIComponent(id)}/suspend`, p),
  unsuspendUser: id => post(`/admin/users/${encodeURIComponent(id)}/unsuspend`, {}),
  revokeInstructor: (id, p) => post(`/admin/users/${encodeURIComponent(id)}/revoke-instructor`, p),
  deleteUser: (id, p) => post(`/admin/users/${encodeURIComponent(id)}`, p, 'DELETE'),
  getAuditLog: p => request(withQuery('/admin/audit', p)),
  // ---
  // [C] announcements — add below
  getAnnouncements: p => request(withQuery('/announcements', p)),
  createAnnouncement: p => post('/announcements', p),
  updateAnnouncement: (id, p) => post(`/announcements/${encodeURIComponent(id)}`, p, 'PUT'),
  deleteAnnouncement: id => request(`/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  markAnnouncementRead: id => post(`/announcements/${encodeURIComponent(id)}/read`, {}),
  markAllAnnouncementsRead: () => post('/announcements/read-all', {}),
  // ---
};
