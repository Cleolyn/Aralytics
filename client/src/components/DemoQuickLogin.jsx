import React, { useEffect, useState, useRef } from 'react';
import { useSignIn } from '@clerk/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Notice } from './ui/Feedback';
import { afterAuthPath } from '../utils/authFlow';

const QUICK_FALLBACK_ACCOUNTS = [
  { key: 'admin-main', full_name: 'Eulyn Admin', email: 'admin+clerk_test@aralytics.edu.ph', cohort_group: 'Staff & Instructors', profile_type: 'School Administrator', quick_pick: true },
  { key: 'teacher-ponce', full_name: 'Cleo Ponce', email: 'teacher.ponce+clerk_test@aralytics.edu.ph', cohort_group: 'Staff & Instructors', profile_type: 'Approved Instructor (10-Rizal & 10-Bonifacio)', quick_pick: true },
  { key: 'teacher-magsaysay', full_name: 'Ramon Magsaysay', email: 'teacher.magsaysay+clerk_test@aralytics.edu.ph', cohort_group: 'Staff & Instructors', profile_type: 'Approved Instructor (10-Luna)', quick_pick: true },
  { key: 'teacher-tecson', full_name: 'Trinidad Tecson', email: 'teacher.tecson+clerk_test@aralytics.edu.ph', cohort_group: 'Staff & Instructors', profile_type: 'Approved Instructor (10-Mabini)', quick_pick: true },
  { key: 'applicant-silang', full_name: 'Gabriela Silang', email: 'applicant.silang+clerk_test@aralytics.edu.ph', cohort_group: 'Staff & Instructors', profile_type: 'Instructor Applicant (PENDING)', quick_pick: true },
  { key: 'rizal-01', full_name: 'Juan Dela Cruz', email: 'rizal.01+clerk_test@aralytics.edu.ph', cohort_group: '10-Rizal', profile_type: '10-Rizal #01 · Flagged + Remediation', quick_pick: true },
  { key: 'rizal-19', full_name: 'Vicente Salazar', email: 'rizal.19+clerk_test@aralytics.edu.ph', cohort_group: '10-Rizal', profile_type: '10-Rizal #19 · Mastered Tier', quick_pick: true },
  { key: 'rizal-26', full_name: 'Agueda Morales', email: 'rizal.26+clerk_test@aralytics.edu.ph', cohort_group: '10-Rizal', profile_type: '10-Rizal #26 · Ungraded Task Upload', quick_pick: true },
  { key: 'rizal-31', full_name: 'Epifanio Fernandez', email: 'rizal.31+clerk_test@aralytics.edu.ph', cohort_group: '10-Rizal', profile_type: '10-Rizal #31 · Clean Slate (0 Attempts)', quick_pick: true },
  { key: 'bonifacio-31', full_name: 'Epifanio Abad', email: 'bonifacio.31+clerk_test@aralytics.edu.ph', cohort_group: '10-Bonifacio', profile_type: '10-Bonifacio #31 · Clean Slate (0 Attempts)', quick_pick: true },
  { key: 'luna-31', full_name: 'Epifanio Katigbak', email: 'luna.31+clerk_test@aralytics.edu.ph', cohort_group: '10-Luna', profile_type: '10-Luna #31 · Clean Slate (0 Attempts)', quick_pick: true },
  { key: 'mabini-31', full_name: 'Epifanio Ongpin', email: 'mabini.31+clerk_test@aralytics.edu.ph', cohort_group: '10-Mabini', profile_type: '10-Mabini #31 · Clean Slate (0 Attempts)', quick_pick: true },
  { key: 'pending-01', full_name: 'Diego Silang', email: 'pending.01+clerk_test@aralytics.edu.ph', cohort_group: 'Unassigned / Onboarding', profile_type: 'Pending Student Approval (10-Rizal)', quick_pick: true },
  { key: 'returned-01', full_name: 'Marcelo Del Pilar', email: 'returned.01+clerk_test@aralytics.edu.ph', cohort_group: 'Unassigned / Onboarding', profile_type: 'Returned Enrollment (REJECTED)', quick_pick: true },
  { key: 'new-student-01', full_name: 'Lapu Lapu', email: 'new.student01+clerk_test@aralytics.edu.ph', cohort_group: 'Unassigned / Onboarding', profile_type: 'Brand-New Student (NOT_ENROLLED)', quick_pick: true }
];

export default function DemoQuickLogin({ intent }) {
  const { signIn } = useSignIn();
  const location = useLocation();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState(QUICK_FALLBACK_ACCOUNTS);
  const [selectedEmail, setSelectedEmail] = useState('teacher.ponce+clerk_test@aralytics.edu.ph');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const autoBypassedRef = useRef('');

  useEffect(() => {
    let active = true;
    fetch('/api/auth/demo-accounts')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (active && Array.isArray(data?.accounts) && data.accounts.length > 0) {
          setAccounts(data.accounts);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const signInWithDemoTicket = async ({ email, password, autoBypass = false }) => {
    if (!email || !signIn) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/demo-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, autoBypass })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ticket) {
        throw new Error(data?.message || 'Could not generate a demo sign-in token.');
      }

      if (typeof signIn.reset === 'function' && signIn.status && signIn.status !== 'needs_identifier') {
        await signIn.reset();
      }

      if (typeof signIn.ticket === 'function') {
        const ticketRes = await signIn.ticket({ ticket: data.ticket });
        if (ticketRes?.error) {
          throw new Error(ticketRes.error.longMessage || ticketRes.error.message || 'Demo ticket sign-in failed.');
        }
        if (typeof signIn.finalize === 'function') {
          await signIn.finalize({
            navigate: ({ decorateUrl }) => {
              const target = decorateUrl ? decorateUrl(afterAuthPath(intent)) : afterAuthPath(intent);
              if (target.startsWith('http')) window.location.href = target;
              else navigate(target, { replace: true });
            }
          });
          return;
        }
      }

      window.location.assign(`/login?__clerk_ticket=${encodeURIComponent(data.ticket)}`);
    } catch (err) {
      setError(err.message || 'Could not sign in with demo account.');
      setBusy(false);
    }
  };

  // Automatically bypass Clerk's verification screen if a user typed a demo email into Clerk's form
  useEffect(() => {
    const identifier = signIn?.identifier || '';
    const status = signIn?.status || '';
    const isFactorStep =
      status === 'needs_client_trust' ||
      status === 'needs_second_factor' ||
      (status === 'needs_first_factor' && location.pathname.includes('/factor-'));

    if (
      /\+clerk_test@aralytics\.edu\.ph$/i.test(identifier) &&
      isFactorStep &&
      autoBypassedRef.current !== `${identifier}:${status}`
    ) {
      autoBypassedRef.current = `${identifier}:${status}`;
      signInWithDemoTicket({ email: identifier, autoBypass: true });
    }
  }, [signIn?.identifier, signIn?.status, location.pathname]);

  const groups = [
    { label: '★ Quick Picks (Top Demo Accounts)', filter: a => a.quick_pick },
    { label: 'Staff & Instructors (5)', filter: a => a.cohort_group === 'Staff & Instructors' || a.cohort_group === 'Staff / Admin' },
    { label: 'Unassigned / Onboarding Students (12)', filter: a => a.cohort_group === 'Unassigned / Onboarding' },
    { label: 'Section 10-Rizal (35 Students · Cleo Ponce)', filter: a => a.cohort_group === '10-Rizal' },
    { label: 'Section 10-Bonifacio (35 Students · Cleo Ponce)', filter: a => a.cohort_group === '10-Bonifacio' },
    { label: 'Section 10-Luna (35 Students · Ramon Magsaysay)', filter: a => a.cohort_group === '10-Luna' },
    { label: 'Section 10-Mabini (35 Students · Trinidad Tecson)', filter: a => a.cohort_group === '10-Mabini' }
  ];

  return (
    <div
      className="demo-quick-login"
      style={{
        marginTop: '18px',
        padding: '14px 16px',
        borderRadius: '12px',
        border: '1px solid var(--colors-border, #e5e7eb)',
        background: 'var(--colors-surface-subtle, rgba(0, 0, 0, 0.02))'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
        <strong style={{ fontSize: '0.88rem', color: 'var(--colors-text, #111827)' }}>
          🚀 Demo Account 1-Click Sign In (No OTP Code Required)
        </strong>
      </div>
      <p style={{ fontSize: '0.8rem', margin: '0 0 10px 0', color: 'var(--colors-text-muted, #4b5563)', lineHeight: '1.4' }}>
        Select any of the 157 pre-seeded demo accounts to log in immediately without needing an email verification code. <em>(If prompted manually by Clerk, use test code <code>424242</code>)</em>.
      </p>
      <Notice error>{error}</Notice>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <select
          aria-label="Select demo account"
          className="input"
          value={selectedEmail}
          disabled={busy}
          onChange={e => setSelectedEmail(e.target.value)}
          style={{ minHeight: '38px', fontSize: '0.85rem', width: '100%', borderRadius: '6px' }}
        >
          {groups.map(group => {
            const items = accounts.filter(group.filter);
            if (!items.length) return null;
            return (
              <optgroup key={group.label} label={group.label}>
                {items.map(acc => (
                  <option key={`${group.label}-${acc.key}`} value={acc.email}>
                    {acc.full_name} — {acc.profile_type} ({acc.email})
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !selectedEmail}
          onClick={() => signInWithDemoTicket({ email: selectedEmail, autoBypass: true })}
          style={{ width: '100%', minHeight: '38px', fontSize: '0.88rem' }}
        >
          {busy ? 'Signing in to demo account…' : 'Sign in as selected demo account'}
        </button>
      </div>
    </div>
  );
}
