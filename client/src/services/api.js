const API_BASE = '/api';

export function getToken() {
  return localStorage.getItem('aralytics_token');
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('aralytics_token', token);
  } else {
    localStorage.removeItem('aralytics_token');
  }
}

export async function request(endpoint, options = {}) {
  const token = getToken();
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
    throw new Error('OFFLINE_BOUNDARY_REJECT: This action strictly requires an active internet connection.');
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      // Token invalid or expired
      setToken(null);
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
  getAnalyticsXlsxUrl: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const token = getToken();
    return `/api/analytics/export/xlsx?token=${token}&${query}`;
  },
  getAnalyticsPdfUrl: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const token = getToken();
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
    return `${url}?token=${encodeURIComponent(getToken() || '')}`;
  },

  // Export URLs
  getXlsxExportUrl: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const token = getToken();
    return `/api/analytics/export/xlsx?token=${token}&${query}`;
  },
  getPdfExportUrl: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const token = getToken();
    return `/api/analytics/export/pdf?token=${token}&${query}`;
  }
};

