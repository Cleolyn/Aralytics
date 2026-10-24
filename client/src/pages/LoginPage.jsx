import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { SignIn } from '@clerk/react';
import PublicLayout from '../components/PublicLayout';
import { Notice } from '../components/ui/Feedback';
import { useAuth, PENDING_ROLE_KEY, PENDING_PROFILE_KEY, LOGIN_INTENT_KEY } from '../context/AuthContext';

const NAME_REGEX = /^[a-zA-ZÀ-ÿ\s'-]+$/;
const INVALID_NAME_CHARS = /[^a-zA-ZÀ-ÿ\s'-]/g;

const COMPACT_CLERK_APPEARANCE = {
  elements: {
    rootBox: { width: '100%' },
    cardBox: { width: '100%', boxShadow: 'none', border: '1px solid var(--border-subtle)', borderRadius: '4px' },
    card: { padding: '12px 16px', gap: '8px', boxShadow: 'none', background: 'transparent' },
    header: { display: 'none' },
    socialButtonsBlockButton: { minHeight: '32px', padding: '4px 10px', fontSize: '12px' },
    dividerRow: { margin: '2px 0' },
    form: { gap: '6px' },
    formFieldRow: { marginBottom: '4px' },
    formFieldLabel: { fontSize: '12px', marginBottom: '2px' },
    formFieldInput: { minHeight: '32px', height: '32px', padding: '4px 10px', fontSize: '13px' },
    formButtonPrimary: { minHeight: '34px', height: '34px', padding: '4px 12px', fontSize: '13px', backgroundColor: 'var(--colors-primary)' },
    footerAction: { padding: '4px 12px', margin: 0, fontSize: '12px' },
    footer: { paddingBottom: '4px' }
  }
};

export default function LoginPage() {
  const { authError, clearAuthError } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialRole =
    searchParams.get('role') === 'TEACHER'
      ? 'TEACHER'
      : sessionStorage.getItem(PENDING_ROLE_KEY) === 'TEACHER'
      ? 'TEACHER'
      : 'STUDENT';
  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [profile, setProfile] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(PENDING_PROFILE_KEY));
      return {
        lrn_or_id: saved?.lrn_or_id || '',
        section: saved?.section || '',
        first_name: saved?.first_name || '',
        last_name: saved?.last_name || ''
      };
    } catch {
      return { lrn_or_id: '', section: '', first_name: '', last_name: '' };
    }
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [gateNotice, setGateNotice] = useState('');

  const lrnRef = useRef(null);
  const sectionRef = useRef(null);
  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);

  useEffect(() => {
    sessionStorage.setItem(LOGIN_INTENT_KEY, '1');
    sessionStorage.setItem(PENDING_ROLE_KEY, selectedRole);
  }, [selectedRole]);

  useEffect(() => {
    sessionStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  const isStudentProfileComplete =
    selectedRole === 'TEACHER' ||
    (profile.lrn_or_id.trim().length > 0 &&
      /^[0-9]+$/.test(profile.lrn_or_id.trim()) &&
      profile.section.trim().length > 0 &&
      NAME_REGEX.test(profile.first_name.trim()) &&
      NAME_REGEX.test(profile.last_name.trim()) &&
      !fieldErrors.lrn_or_id &&
      !fieldErrors.section &&
      !fieldErrors.first_name &&
      !fieldErrors.last_name);

  useEffect(() => {
    if (isStudentProfileComplete && gateNotice) {
      setGateNotice('');
    }
  }, [isStudentProfileComplete, gateNotice]);

  const handleTabChange = (role) => {
    clearAuthError?.();
    setGateNotice('');
    setFieldErrors({});
    setSelectedRole(role);
  };

  const handleIdChange = (e) => {
    const raw = e.target.value;
    const sanitized = raw.replace(/\D/g, '');
    setFieldErrors((prev) => ({
      ...prev,
      lrn_or_id: raw !== sanitized ? 'Numeric digits (0–9) only.' : ''
    }));
    setProfile((prev) => ({ ...prev, lrn_or_id: sanitized }));
  };

  const handleSectionChange = (e) => {
    const val = e.target.value;
    setFieldErrors((prev) => ({
      ...prev,
      section: val.trim() ? '' : 'Class section is required.'
    }));
    setProfile((prev) => ({ ...prev, section: val }));
  };

  const handleNameChange = (field, label) => (e) => {
    const raw = e.target.value;
    const sanitized = raw.replace(INVALID_NAME_CHARS, '');
    const hasInvalid = raw !== sanitized || (sanitized.trim() && !NAME_REGEX.test(sanitized));
    setFieldErrors((prev) => ({
      ...prev,
      [field]: hasInvalid ? `${label} accepts letters only.` : ''
    }));
    setProfile((prev) => ({ ...prev, [field]: sanitized }));
  };

  const enforceStudentFieldsGate = (e) => {
    if (selectedRole !== 'STUDENT' || isStudentProfileComplete) return;
    e.preventDefault();
    e.stopPropagation();

    const nextErrors = {};
    if (!profile.lrn_or_id.trim()) nextErrors.lrn_or_id = 'Required';
    if (!profile.section.trim()) nextErrors.section = 'Required';
    if (!profile.first_name.trim() || !NAME_REGEX.test(profile.first_name.trim())) nextErrors.first_name = 'Required';
    if (!profile.last_name.trim() || !NAME_REGEX.test(profile.last_name.trim())) nextErrors.last_name = 'Required';
    setFieldErrors((prev) => ({ ...prev, ...nextErrors }));
    setGateNotice('Complete your Student Number / LRN, Class Section, First Name, and Last Name above before signing in.');

    if (nextErrors.lrn_or_id) lrnRef.current?.focus();
    else if (nextErrors.section) sectionRef.current?.focus();
    else if (nextErrors.first_name) firstNameRef.current?.focus();
    else if (nextErrors.last_name) lastNameRef.current?.focus();
  };

  return (
    <PublicLayout simple>
      <div className="auth-layout">
        <section className="auth-story">
          <span className="eyebrow">Your learning journey</span>
          <h1 style={{ marginTop: 20 }}>Welcome back.</h1>
          <p>Tuloy ang pagkatuto. Explore our world, one lesson at a time.</p>
          <img src="/images/community-learning.jpg" alt="" width="1774" height="887" />
        </section>
        <section className="auth-form clerk-embed">
          <div className="tabs" role="tablist" aria-label="Choose account type">
            <button
              type="button"
              role="tab"
              aria-selected={selectedRole === 'STUDENT'}
              className={selectedRole === 'STUDENT' ? 'active' : ''}
              onClick={() => handleTabChange('STUDENT')}
            >
              Learner Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedRole === 'TEACHER'}
              className={selectedRole === 'TEACHER' ? 'active' : ''}
              onClick={() => handleTabChange('TEACHER')}
            >
              Teacher Sign In
            </button>
          </div>
          <Notice error>{authError || gateNotice || location.state?.unauthorizedNotice}</Notice>

          {selectedRole === 'STUDENT' ? (
            <div style={{ marginBottom: 6 }}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="login-school-id">Student Number / LRN *</label>
                  <input
                    ref={lrnRef}
                    id="login-school-id"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    className="form-input"
                    placeholder="Numbers only (0–9)"
                    value={profile.lrn_or_id}
                    onChange={handleIdChange}
                    maxLength={16}
                  />
                  {fieldErrors.lrn_or_id && (
                    <small style={{ color: 'var(--status-critical)' }} role="alert">
                      {fieldErrors.lrn_or_id}
                    </small>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="login-section">Class section *</label>
                  <input
                    ref={sectionRef}
                    id="login-section"
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. 10-Rizal"
                    value={profile.section}
                    onChange={handleSectionChange}
                  />
                  {fieldErrors.section && (
                    <small style={{ color: 'var(--status-critical)' }} role="alert">
                      {fieldErrors.section}
                    </small>
                  )}
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="login-first-name">First name *</label>
                  <input
                    ref={firstNameRef}
                    id="login-first-name"
                    type="text"
                    required
                    className="form-input"
                    placeholder="Letters only"
                    value={profile.first_name}
                    onChange={handleNameChange('first_name', 'First name')}
                  />
                  {fieldErrors.first_name && (
                    <small style={{ color: 'var(--status-critical)' }} role="alert">
                      {fieldErrors.first_name}
                    </small>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="login-last-name">Last name *</label>
                  <input
                    ref={lastNameRef}
                    id="login-last-name"
                    type="text"
                    required
                    className="form-input"
                    placeholder="Letters only"
                    value={profile.last_name}
                    onChange={handleNameChange('last_name', 'Last name')}
                  />
                  {fieldErrors.last_name && (
                    <small style={{ color: 'var(--status-critical)' }} role="alert">
                      {fieldErrors.last_name}
                    </small>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor="login-teacher-id">Employee ID Number (optional)</label>
              <input
                id="login-teacher-id"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="form-input"
                placeholder="Numeric digits only (0–9)"
                value={profile.lrn_or_id}
                onChange={handleIdChange}
                maxLength={16}
              />
              {fieldErrors.lrn_or_id && (
                <small style={{ color: 'var(--status-critical)' }} role="alert">
                  {fieldErrors.lrn_or_id}
                </small>
              )}
            </div>
          )}

          <div
            onClickCapture={enforceStudentFieldsGate}
            onFocusCapture={enforceStudentFieldsGate}
            onKeyDownCapture={enforceStudentFieldsGate}
            onSubmitCapture={enforceStudentFieldsGate}
            style={{
              opacity: isStudentProfileComplete ? 1 : 0.6,
              transition: 'opacity 0.15s ease'
            }}
          >
            <SignIn
              appearance={COMPACT_CLERK_APPEARANCE}
              routing="path"
              path="/login"
              signUpUrl={`/register?role=${selectedRole}`}
              forceRedirectUrl={selectedRole === 'TEACHER' ? '/teacher/dashboard' : '/student/dashboard'}
            />
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
