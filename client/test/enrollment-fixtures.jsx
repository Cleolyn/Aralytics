import React, { createContext, useContext, useState } from 'react';
const Context = createContext(null);
const enrollment = { full_name: 'María Luz Dela Cruz', section: '10-Rizal', school_year: '2026-2027', adviser_name: 'Ana Santos', lrn: '123456789012', mobile: '09171234567', email: 'maria@example.test', user_id: 'learner-fixture', status: 'PENDING' };
export const useAuth = () => useContext(Context);
export const useClerk = () => ({ openUserProfile() {} });
export function FixtureProvider({ children }) {
  const view = new URLSearchParams(location.search).get('view');
  const [user, setUser] = useState({ id: 'learner-fixture', role: 'STUDENT', email: 'maria@example.test', email_verified: true,
    enrollment_status: view === 'pending' ? 'PENDING' : 'NOT_ENROLLED', enrollment: view === 'pending' ? enrollment : null });
  const [requests, setRequests] = useState(view === 'teacher' ? [enrollment] : []);
  const [invitations, setInvitations] = useState([]);
  window.__fixtureRequests = window.__fixtureRequests || [];
  window.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    window.__fixtureRequests.push({ url, body, method: options.method || 'GET' });
    let data = {};
    if (url.endsWith('/validate-code')) data = { adviser_name: 'Ana Santos', school_year: '2026-2027', sections: ['10-Rizal', '10-Bonifacio'] };
    if (url.endsWith('/request')) { window.__pendingEnrollment = { ...enrollment, ...body }; data = { enrollment: window.__pendingEnrollment }; }
    if (url.endsWith('/status')) data = { enrollment };
    if (url.endsWith('/manage')) data = { invitations, requests };
    if (url.endsWith('/invitations')) { data = { code: 'ABCDEFGH23', id: 'fixture-code' }; setInvitations([{ id: 'fixture-code', school_year: body.school_year, sections: body.sections, active: 1 }]); }
    if (url.includes('/requests/')) setRequests([]);
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return <Context.Provider value={{ user, loading: false, logout() {}, refreshUser() { if (window.__pendingEnrollment) setUser(prev => ({ ...prev, enrollment_status: 'PENDING', enrollment: window.__pendingEnrollment })); } }}>{children}</Context.Provider>;
}
