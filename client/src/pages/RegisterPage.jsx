import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SignUp, useSignIn } from '@clerk/react';
import PublicLayout from '../components/PublicLayout';
import { Notice } from '../components/ui/Feedback';
import { useAuth, PENDING_ROLE_KEY, PENDING_PROFILE_KEY, LOGIN_INTENT_KEY } from '../context/AuthContext';

const NAME_REGEX = /^[a-zA-ZÀ-ÿ\s'-]+$/;
const INVALID_NAME_CHARS = /[^a-zA-ZÀ-ÿ\s'-]/g;

const COMPACT_CLERK_APPEARANCE = {
  elements: {
    rootBox: { width: '100%' },
    cardBox: { width: '100%', boxShadow: 'none', border: '1px solid var(--border-subtle)', borderRadius: '4px' },
    card: { padding: '8px 12px', gap: '4px', boxShadow: 'none', background: 'transparent' },
    header: { display: 'none' },
    socialButtonsBlockButton: { minHeight: '28px', height: '28px', padding: '2px 10px', fontSize: '12px' },
    dividerRow: { margin: '2px 0' },
    form: { gap: '4px' },
    formFieldRow: { marginBottom: '2px' },
    formFieldLabel: { fontSize: '11px', marginBottom: '1px' },
    formFieldInput: { minHeight: '28px', height: '28px', padding: '2px 8px', fontSize: '12px' },
    formButtonPrimary: { minHeight: '28px', height: '28px', padding: '2px 12px', fontSize: '12px', backgroundColor: 'var(--colors-primary)' },
    footerAction: { padding: '2px 10px', margin: 0, fontSize: '11px' },
    footer: { paddingBottom: '2px' }
  }
};

export default function RegisterPage() {
  const { authError, clearAuthError, loginStudent } = useAuth();
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRole =
    searchParams.get('role') === 'TEACHER'
      ? 'TEACHER'
      : sessionStorage.getItem(PENDING_ROLE_KEY) === 'TEACHER'
      ? 'TEACHER'
      : 'STUDENT';
  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [profile, setProfile] = useState({
    lrn_or_id: '',
    first_name: '',
    last_name: '',
    section: '10-Rizal'
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [gateNotice, setGateNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const lrnRef = useRef(null);
  const sectionRef = useRef(null);
  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);

  useEffect(() => {
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
      NAME_REGEX.test(profile.last_name.trim()));

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
      lrn_or_id: raw !== sanitized ? 'Numbers only (0 to 9).' : ''
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

  const validateRequiredStudentFields = () => {
    const nextErrors = {};
    if (!profile.lrn_or_id.trim() || !/^[0-9]+$/.test(profile.lrn_or_id.trim())) {
      nextErrors.lrn_or_id = 'Required (numbers only)';
    }
    if (!profile.section.trim()) {
      nextErrors.section = 'Required';
    }
    if (!profile.first_name.trim() || !NAME_REGEX.test(profile.first_name.trim())) {
      nextErrors.first_name = 'Required (letters only)';
    }
    if (!profile.last_name.trim() || !NAME_REGEX.test(profile.last_name.trim())) {
      nextErrors.last_name = 'Required (letters only)';
    }
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setGateNotice('Please fill in your LRN, Class Section, First Name, and Last Name before continuing.');
      if (nextErrors.lrn_or_id) lrnRef.current?.focus();
      else if (nextErrors.section) sectionRef.current?.focus();
      else if (nextErrors.first_name) firstNameRef.current?.focus();
      else if (nextErrors.last_name) lastNameRef.current?.focus();
      return false;
    }
    return true;
  };

  const handleClerkTicketStudentRegister = async (e) => {
    e.preventDefault();
    clearAuthError?.();
    setGateNotice('');
    if (!validateRequiredStudentFields()) return;

    setSubmitting(true);
    try {
      const data = await loginStudent({
        lrn_or_id: profile.lrn_or_id.trim(),
        section: profile.section.trim(),
        first_name: profile.first_name.trim(),
        last_name: profile.last_name.trim()
      });

      if (data.clerkTicket && signInLoaded && signIn && setActive) {
        try {
          const attempt = await signIn.create({
            strategy: 'ticket',
            ticket: data.clerkTicket
          });
          if (attempt.status === 'complete' && attempt.createdSessionId) {
            await setActive({ session: attempt.createdSessionId });
          }
        } catch (ticketErr) {
          console.warn('[Clerk Ticket Sign-Up]', ticketErr.message);
        }
      }

      navigate('/student/dashboard', { replace: true });
    } catch {
      // authError handled by context
    } finally {
      setSubmitting(false);
    }
  };

  const handleClerkInteraction = (e) => {
    const isInitialRegisterStep = location.pathname === '/register' || location.pathname === '/register/';
    if (selectedRole === 'STUDENT' && isInitialRegisterStep && !isStudentProfileComplete) {
      const clickedButton = e.target.closest?.('button') || e.type === 'submit';
      if (clickedButton) {
        e.preventDefault();
        e.stopPropagation();
        validateRequiredStudentFields();
        return;
      }
    }

    sessionStorage.setItem(LOGIN_INTENT_KEY, String(Date.now()));
    sessionStorage.setItem(PENDING_ROLE_KEY, selectedRole);
    sessionStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(profile));
  };

  return (
    <PublicLayout simple>
      <div className="auth-layout">
        <section className="auth-story">
          <span className="eyebrow">Araling Panlipunan</span>
          <h1 style={{ marginTop: 20 }}>Create your account.</h1>
          <p>Join your class to read lessons, answer quizzes, and check your grades.</p>
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
              Student Account
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedRole === 'TEACHER'}
              className={selectedRole === 'TEACHER' ? 'active' : ''}
              onClick={() => handleTabChange('TEACHER')}
            >
              Teacher Account
            </button>
          </div>
          <Notice error>{authError || gateNotice}</Notice>

          {selectedRole === 'STUDENT' ? (
            <form onSubmit={handleClerkTicketStudentRegister} noValidate style={{ marginBottom: 6 }}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="reg-lrn">Student Number / LRN *</label>
                  <input
                    ref={lrnRef}
                    id="reg-lrn"
                    name="lrn_or_id"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    className="form-input"
                    placeholder="12-digit LRN (numbers only)"
                    value={profile.lrn_or_id}
                    onChange={handleIdChange}
                    maxLength={16}
                  />
                  {fieldErrors.lrn_or_id && <small style={{ color: 'var(--status-critical)' }} role="alert">{fieldErrors.lrn_or_id}</small>}
                </div>
                <div className="field">
                  <label htmlFor="reg-section">Class section *</label>
                  <input
                    ref={sectionRef}
                    id="reg-section"
                    name="section"
                    required
                    className="form-input"
                    value={profile.section}
                    onChange={handleSectionChange}
                    placeholder="e.g. 10-Rizal"
                  />
                  {fieldErrors.section && <small style={{ color: 'var(--status-critical)' }} role="alert">{fieldErrors.section}</small>}
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="reg-first-name">First name *</label>
                  <input
                    ref={firstNameRef}
                    id="reg-first-name"
                    name="first_name"
                    required
                    className="form-input"
                    value={profile.first_name}
                    onChange={handleNameChange('first_name', 'First name')}
                    placeholder="Letters only"
                  />
                  {fieldErrors.first_name && <small style={{ color: 'var(--status-critical)' }} role="alert">{fieldErrors.first_name}</small>}
                </div>
                <div className="field">
                  <label htmlFor="reg-last-name">Last name *</label>
                  <input
                    ref={lastNameRef}
                    id="reg-last-name"
                    name="last_name"
                    required
                    className="form-input"
                    value={profile.last_name}
                    onChange={handleNameChange('last_name', 'Last name')}
                    placeholder="Letters only"
                  />
                  {fieldErrors.last_name && <small style={{ color: 'var(--status-critical)' }} role="alert">{fieldErrors.last_name}</small>}
                </div>
              </div>
              <button
                type="submit"
                className="btn btn-primary full-width"
                style={{ minHeight: 30, height: 30, padding: '2px 12px', fontSize: 12.5, marginTop: 2 }}
                disabled={submitting}
              >
                {submitting ? 'Creating account…' : 'Continue as Student'}
              </button>
            </form>
          ) : (
            <div className="field" style={{ marginBottom: 6 }}>
              <label htmlFor="reg-teacher-lrn">Employee ID Number (optional)</label>
              <input
                id="reg-teacher-lrn"
                name="lrn_or_id"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="form-input"
                placeholder="e.g. 2026001"
                value={profile.lrn_or_id}
                onChange={handleIdChange}
                maxLength={16}
              />
              {fieldErrors.lrn_or_id && <small style={{ color: 'var(--status-critical)' }} role="alert">{fieldErrors.lrn_or_id}</small>}
            </div>
          )}

          <div
            onClickCapture={handleClerkInteraction}
            onSubmitCapture={handleClerkInteraction}
            style={{
              opacity: isStudentProfileComplete ? 1 : 0.65,
              transition: 'opacity 0.15s ease'
            }}
          >
            <SignUp
              appearance={COMPACT_CLERK_APPEARANCE}
              routing="path"
              path="/register"
              signInUrl={`/login?role=${selectedRole}`}
              forceRedirectUrl={selectedRole === 'TEACHER' ? '/teacher/dashboard' : '/student/dashboard'}
            />
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
