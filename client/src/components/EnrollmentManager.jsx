import React, { useEffect, useState, useCallback } from 'react';
import { request } from '../services/api';
import { Notice } from './ui/Feedback';

export default function EnrollmentManager({ onReviewed }) {
  const [data, setData] = useState({ invitations: [], requests: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [schoolYear, setSchoolYear] = useState('');
  const [sections, setSections] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [rejection, setRejection] = useState(null);
  const [reason, setReason] = useState('');
  const load = useCallback(async () => {
    try { setData(await request('/enrollment/manage')); setError(''); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async fn => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const create = event => {
    event.preventDefault();
    act(async () => { const result = await request('/enrollment/invitations', { method: 'POST', body: JSON.stringify({ school_year: schoolYear, sections: sections.split('\n') }) }); setGeneratedCode(result.code); setNotice('Class code created. Copy it before leaving this page.'); });
  };
  const review = (student, status, rejectionReason) => act(async () => {
    await request(`/enrollment/requests/${encodeURIComponent(student.user_id)}`, { method: 'PATCH', body: JSON.stringify({ status, reason: rejectionReason }) });
    setRejection(null); setReason(''); setNotice(status === 'APPROVED' ? `${student.full_name} can now access the class.` : 'Request returned to the student with your reason.'); onReviewed?.();
  });
  const pending = data.requests.filter(student => student.status === 'PENDING');
  return <section className="enrollment-manager" aria-labelledby="enrollment-title"><div className="section-heading"><div><h2 id="enrollment-title">Class enrollment</h2><p>{pending.length} {pending.length === 1 ? 'student is' : 'students are'} waiting for your review.</p></div><button className="text-action" disabled={busy} onClick={load}>Refresh requests</button></div>
    <Notice error>{error}</Notice><p role="status">{notice}</p>
    <div className="enrollment-columns"><div className="enrollment-panel"><h3>Invite your students</h3>
      <form onSubmit={create}><div className="field"><label htmlFor="enrollment-year">School year</label><input className="form-input" id="enrollment-year" required pattern="[0-9]{4}-[0-9]{4}" placeholder="2026-2027" value={schoolYear} onChange={e => setSchoolYear(e.target.value)} /></div>
        <div className="field"><label htmlFor="enrollment-sections">Sections</label><textarea className="form-input" id="enrollment-sections" required rows={3} placeholder={'10-Rizal\n10-Bonifacio'} value={sections} onChange={e => setSections(e.target.value)} aria-describedby="sections-help" /><small id="sections-help">One section per line. Students can choose only these sections.</small></div>
        <button className="btn btn-primary" disabled={busy}>Generate class code</button></form>
      {generatedCode && <div className="generated-code"><p>Share this code with your students</p><strong>{generatedCode}</strong><button className="text-action" onClick={async () => { try { await navigator.clipboard.writeText(generatedCode); setNotice('Class code copied.'); } catch { setError('Could not copy. Select the code and copy it manually.'); } }}>Copy code</button><small>Saved securely. The code is shown only when created.</small></div>}
      <div className="invitation-list"><h3>Your invitations</h3>{loading ? <p role="status">Loading invitations…</p> : !data.invitations.length ? <p>No class codes yet.</p> : data.invitations.map(invite => <div className="invitation-row" key={invite.id}><div><strong>{invite.school_year}</strong><p>{invite.sections.join(', ')}</p><small>{invite.active ? 'Enrollment open' : 'Enrollment closed'}</small></div>{!!invite.active && <button className="text-action" disabled={busy} onClick={() => act(() => request(`/enrollment/invitations/${invite.id}/close`, { method: 'PATCH' }))}>Close enrollment</button>}</div>)}</div>
    </div><div className="enrollment-panel"><h3>Waiting for approval</h3><p>Check the LRN, name, and section against your class records before approving.</p>
      {loading ? <p role="status">Loading requests…</p> : !pending.length ? <p className="enrollment-empty">No enrollment requests waiting. Share a class code to invite students.</p> : pending.map(student => <article className="enrollment-request" key={student.user_id}><h3>{student.full_name}</h3><p>{student.section} · {student.school_year}</p><dl className="enrollment-details"><div><dt>LRN</dt><dd>{student.lrn}</dd></div><div><dt>Email</dt><dd>{student.email}</dd></div><div><dt>Mobile</dt><dd>{student.mobile}</dd></div></dl>
        {rejection === student.user_id ? <form onSubmit={e => { e.preventDefault(); review(student, 'REJECTED', reason); }}><div className="field"><label htmlFor={`reason-${student.user_id}`}>What should the student correct?</label><textarea className="form-input" id={`reason-${student.user_id}`} required maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></div><div className="enrollment-actions"><button className="btn btn-secondary" disabled={busy}>Return request</button><button type="button" className="text-action" disabled={busy} onClick={() => setRejection(null)}>Cancel</button></div></form> : <div className="enrollment-actions"><button className="btn btn-secondary" disabled={busy} onClick={() => review(student, 'APPROVED')}>Approve student</button><button className="text-action" disabled={busy} onClick={() => { setRejection(student.user_id); setReason(''); }}>Return for correction</button></div>}
      </article>)}
    </div></div>
  </section>;
}
