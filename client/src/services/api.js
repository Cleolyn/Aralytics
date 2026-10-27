const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Token getter — wired by AuthContext to Clerk's async getToken()
// ---------------------------------------------------------------------------
let _tokenGetter = null;
let _lastToken = null; // cached for synchronous URL builders

/** Called once from AuthContext when Clerk session is ready. */
export function setTokenGetter(fn) {
  _tokenGetter = fn;
}

/** Async — always returns the freshest Clerk session JWT. */
export async function getToken() {
  if (_tokenGetter) {
    const t = await _tokenGetter();
    if (t) _lastToken = t;
    return t;
  }
  return null;
}

/** Synchronous — returns cached token for URL builders (e.g. file downloads). */
export function getTokenSync() {
  return _lastToken;
}

/** @deprecated — kept only for any legacy code that still calls setToken(). */
export function setToken() {}

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

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `Request failed with status ${res.status}`);
    }

    return data;
  } catch (err) {
    console.error(`[API Error] ${endpoint}:`, err);
    throw err;
  }
}

export const api = {
  // Auth
  login: (identifier, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password })
  }),
  register: (payload) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getCurrentUser: () => request('/auth/me'),

  getClasses: () => request('/teacher/classes'),
  getPersonalScores: () => request('/student/scores'),
  getOwnSubmission: (id) => request(`/student/submissions/${id}`),

  // Curriculum & ILAW
  getTaxonomy: () => request('/curriculum/taxonomy'),
  getByIlaw: (tag) => request(`/curriculum/ilaw/${tag}`),

  // Materials (Offline Capable)
  getMaterials: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/materials${query ? `?${query}` : ''}`);
  },
  getMaterialById: (id) => request(`/materials/${id}`),
  createMaterial: (data) => request('/materials', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateMaterial: (id, data) => request(`/materials/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteMaterial: (id) => request(`/materials/${id}`, {
    method: 'DELETE'
  }),

  // Quizzes (Strictly Online)
  getQuizzes: () => request('/quizzes'),
  getQuizById: (id) => request(`/quizzes/${id}`),
  createQuiz: (payload) => request('/quizzes', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // Proctoring Security Watchdog (Strictly Online)
  logProctoringEvent: (payload) => request('/proctoring/event', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getProctoringTrail: (submissionId) => request(`/proctoring/trail/${submissionId}`),

  // Submissions & Auto-Grading (Strictly Online)
  startQuiz: (quiz_id) => request('/submissions/start', {
    method: 'POST',
    body: JSON.stringify({ quiz_id })
  }),
  submitQuiz: (submission_id, answers) => request('/submissions/submit', {
    method: 'POST',
    body: JSON.stringify({ submission_id, answers })
  }),
  getSubmissionById: (id) => request(`/submissions/detail/${id}`),
  getGradebook: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/submissions/gradebook${query ? `?${query}` : ''}`);
  },

  // DATA-PERSISTENCE-LAYER & SECURITY ENGINE API CONTRACTS
  submitAssessmentAttempt: (payload) => request('/assessment/submit', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  logSecurityEventAsync: (payload) => request('/security/log-event', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // Remedial Interventions (Ways Forward)
  getPractice: () => request('/student/practice'),
  getInterventions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/interventions${query ? `?${query}` : ''}`);
  },
  resolveIntervention: (id) => request(`/interventions/${id}/resolve`, {
    method: 'PATCH'
  }),

  // INTERVENTION-ANALYTICS-ENGINE
  getProficiencyProfiling: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/analytics/proficiency${query ? `?${query}` : ''}`);
  },
  getRemediationQueue: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/analytics/remediation-queue${query ? `?${query}` : ''}`);
  },
  handleInterventionAction: (id, payload) => request(`/analytics/intervention/${id}/action`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  createIntervention: (payload) => request('/analytics/interventions', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  deleteIntervention: (id) => request(`/analytics/interventions/${id}`, {
    method: 'DELETE'
  }),
  getAnalyticsXlsxUrl: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const token = getTokenSync();
    return `/api/analytics/export/xlsx?token=${token}&${query}`;
  },
  getAnalyticsPdfUrl: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const token = getTokenSync();
    return `/api/analytics/export/pdf?token=${token}&${query}`;
  },

  getItemAnalysis: (quizId) => request(`/analytics/quizzes/${quizId}/item-analysis`),

  // Performance Tasks (SRS FR-43, FR-44)
  getPerformanceTasks: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/performance-tasks${query ? `?${query}` : ''}`);
  },
  getPerformanceTaskById: (id) => request(`/performance-tasks/${id}`),
  createPerformanceTask: (payload) => request('/performance-tasks', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  submitPerformanceTask: (id, payload) => request(`/performance-tasks/${id}/submit`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getPerformanceTaskSubmissions: (id) => request(`/performance-tasks/${id}/submissions`),
  gradePerformanceTaskSubmission: (id, payload) => request(`/performance-tasks/submissions/${id}/grade`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }),

  // Offline Read Sync (SRS FR-50)
  syncOfflineReadLogs: (logs) => request('/materials/sync-read-logs', {
    method: 'POST',
    body: JSON.stringify({ logs })
  }),
  getReadLogs: () => request('/materials/read-logs'),

  getSubmissionFileUrl: (url) => {
    if (!url?.startsWith('/api/performance-tasks/files/')) return null;
    return `${url}?token=${encodeURIComponent(getTokenSync() || '')}`;
  },

  // Export URLs
  getXlsxExportUrl: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const token = getTokenSync();
    return `/api/analytics/export/xlsx?token=${token}&${query}`;
  },
  getPdfExportUrl: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const token = getTokenSync();
    return `/api/analytics/export/pdf?token=${token}&${query}`;
  }
};

