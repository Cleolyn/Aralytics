import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useClerk } from '@clerk/react';
import PublicLayout from '../components/PublicLayout';
import { useAuth } from '../context/AuthContext';
import { request } from '../services/api';
import { Notice } from '../components/ui/Feedback';

export default function OnboardingPage() {
  const { user, loading, logout, refreshUser, refreshing } = useAuth();
  const clerk = useClerk();
  const [code, setCode] = useState('');
  const [invitation, setInvitation] = useState(null);
  const [profile, setProfile] = useState({ lrn: '', full_name: '', mobile: '', section: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState('');
  if (loading) return <div className="container" role="status">Checking your enrollment…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.email_verified && user.role === 'TEACHER') return <Navigate to="/teacher/dashboard" replace />;
  if (user.email_verified && user.enrollment_status === 'APPROVED') return <Navigate to="/student/dashboard" replace />;
  const enrollment = user.enrollment;
  const update = event => setProfile(prev => ({ ...prev, [event.target.name]: event.target.value }));
  const validateCode = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await request('/enrollment/validate-code', { method: 'POST', body: JSON.stringify({ code }) });
      setInvitation(data); setProfile(prev => ({ ...prev, section: data.sections.length === 1 ? data.sections[0] : '' }));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await request('/enrollment/request', { method: 'POST', body: JSON.stringify({ code, ...profile }) });
      refreshUser();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const checkStatus = async () => {
    setBusy(true); setError('');
    try { await request('/enrollment/status'); setChecked('Status checked just now.'); refreshUser(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <PublicLayout account><div className="join-layout">
    <aside className="join-context"><h2>Your place in Aralytics</h2><p>Araling Panlipunan 10</p>
      <ol className="enrollment-journey"><li>Verified account</li><li aria-current={!enrollment && !invitation ? 'step' : undefined}>Class code</li><li aria-current={invitation && enrollment?.status !== 'PENDING' ? 'step' : undefined}>Student details</li><li aria-current={enrollment?.status === 'PENDING' ? 'step' : undefined}>Adviser approval</li></ol>
      <p className="account-note">Signed in as {user.email}</p><button className="text-action" onClick={logout}>Sign out</button>
    </aside>
    <section className="join-sheet"><Notice error>{error}</Notice>
      {!user.email_verified ? <><h1>Verify your email</h1><p>Verify your email address before joining a class.</p><button className="btn btn-primary" onClick={() => clerk.openUserProfile()}>Manage email address</button><button className="text-action" onClick={refreshUser}>I’ve verified my email</button></> :
      enrollment?.status === 'PENDING' ? <div className="approval-card"><h1>Waiting for approval</h1>
        <p>Your enrollment request has been sent to {enrollment.adviser_name || 'your adviser'}. You can access your class once they approve it.</p>
        <dl className="enrollment-details"><div><dt>Student</dt><dd>{enrollment.full_name}</dd></div><div><dt>Section</dt><dd>{enrollment.section}</dd></div><div><dt>School year</dt><dd>{enrollment.school_year}</dd></div></dl>
        <p>Still waiting? Contact your adviser and ask them to review your Aralytics enrollment request.</p>
        <button className="btn btn-primary" disabled={busy || refreshing} onClick={checkStatus}>{busy || refreshing ? 'Checking…' : 'Check approval status'}</button><p role="status">{checked}</p>
      </div> : <>
        {enrollment?.status === 'REJECTED' && <div className="enrollment-return" role="status"><h2>Your enrollment needs an update</h2><p>{enrollment.reason}</p><p>Contact your adviser if you need help, then enter a current class code to submit again.</p></div>}
        {!invitation ? <><h1>Join your class</h1><p>Enter the class code shared by your adviser to continue.</p>
          <form onSubmit={validateCode}><div className="field"><label htmlFor="class-code">Class code</label>
            <input className="form-input class-code-input" id="class-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required minLength={10} maxLength={10} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-describedby="code-help" />
            <small id="code-help">Don’t have a code? Ask your adviser. You can return here later.</small></div>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Checking code…' : 'Continue'}</button></form></> : <>
          <h1>Your student details</h1><p>{invitation.adviser_name} · {invitation.school_year}</p>
          <form onSubmit={submit}>
            <div className="field"><label htmlFor="student-lrn">LRN</label><input className="form-input" id="student-lrn" name="lrn" inputMode="numeric" pattern="[0-9]{12}" minLength={12} maxLength={12} required value={profile.lrn} onChange={update} aria-describedby="lrn-help" /><small id="lrn-help">Your 12-digit Learner Reference Number.</small></div>
            <div className="field"><label htmlFor="student-full-name">Full name</label><input className="form-input" id="student-full-name" name="full_name" autoComplete="name" required minLength={2} maxLength={150} value={profile.full_name} onChange={update} aria-describedby="name-help" /><small id="name-help">Use the full name on your school records.</small></div>
            <div className="field"><label htmlFor="student-mobile">Mobile number</label><input className="form-input" id="student-mobile" name="mobile" type="tel" autoComplete="tel" required maxLength={20} value={profile.mobile} onChange={update} aria-describedby="mobile-help" /><small id="mobile-help">Use 09XXXXXXXXX or +639XXXXXXXXX.</small></div>
            <div className="field"><label htmlFor="student-section">Section</label><select className="form-input" id="student-section" name="section" required value={profile.section} onChange={update}><option value="">Choose your section</option>{invitation.sections.map(section => <option key={section}>{section}</option>)}</select></div>
            <p className="account-note">Your adviser will review these details before you can access class lessons and activities.</p>
            <div className="enrollment-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Sending request…' : 'Request to join'}</button><button type="button" className="text-action" disabled={busy} onClick={() => { setInvitation(null); setError(''); }}>Use another code</button></div>
          </form></>}
      </>}
    </section>
  </div></PublicLayout>;
}
