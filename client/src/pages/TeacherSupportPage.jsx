import React, { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import Dialog from '../components/ui/Dialog';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';

export default function TeacherSupportPage() {
  const [params] = useSearchParams();
  const [status,setStatus] = useState('');
  const [editing,setEditing] = useState(null);
  const [material,setMaterial] = useState('');
  const [override,setOverride] = useState('COMPLETED');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [actionError,setActionError] = useState('');
  const close = useCallback(() => setEditing(null), []);
  const { data, loading, error, refresh } = useRemoteData(() => api.getRemediationQueue({ section: params.get('section') || '',status }), [params.get('section'),status]);
  async function act(id,action,options = {}) { setBusy(true); setActionError(''); try { const res = await api.handleInterventionAction(id,{ action,...options }); if (!res.success) throw new Error(res.message); setMessage('Learner support updated.'); setEditing(null); refresh(); } catch (err) { setActionError(err.message); } finally { setBusy(false); } }
  return <div className="container"><Link className="text-action" to="/teacher/classes">← Back to classes</Link><div className="page-heading" style={{ marginTop: 20 }}><div><h1>Learner support</h1><p>Choose a helpful next step for each learning goal.</p></div></div><Notice error>{error || (!editing && actionError)}</Notice><Notice success>{message}</Notice>{error && <button className="text-action" onClick={refresh}>Try again</button>}
    <div className="field" style={{ maxWidth: 320 }}><label htmlFor="support-status">Status</label><select id="support-status" className="form-input" value={status} onChange={e => setStatus(e.target.value)}><option value="">All support records</option><option value="RECOMMENDED">Recommended</option><option value="ASSIGNED">Assigned</option><option value="COMPLETED">Completed</option><option value="EXEMPTED">Exempted</option></select></div>
    {loading ? <Loading>Loading learner support…</Loading> : !data?.queue.length ? <EmptyState title="No support records match">Recommended practice will appear here after assessments.</EmptyState> : <div className="table-responsive" tabIndex={0} role="region" aria-label="Learner support queue"><table className="data-table"><thead><tr><th>Learner</th><th>Learning goal</th><th>Suggested material</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.queue.map(q => <tr key={q.intervention_id}><td><strong>{q.student.name}</strong><small>{q.student.section}</small></td><td>{q.competency.topic_title}<small>{q.assessment_performance.percentage === null ? 'Not assessed' : `${q.assessment_performance.percentage}% on latest attempt`}</small></td><td>{q.assigned_remedial_material?.title || 'Choose a material'}</td><td><Status tone={q.status === 'COMPLETED' ? 'good' : 'pending'}>{q.status.charAt(0) + q.status.slice(1).toLowerCase()}</Status></td><td><div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>{q.status === 'RECOMMENDED' && <button className="text-action" disabled={busy} onClick={() => act(q.intervention_id,'APPROVE')}>Assign practice</button>}<button className="text-action" onClick={() => { setEditing({ ...q,action: 'MODIFY' }); setMaterial(q.assigned_remedial_material?.id || q.available_competency_remedials[0]?.id || ''); setActionError(''); }}>Change material</button><button className="text-action" onClick={() => { setEditing({ ...q,action: 'OVERRIDE' }); setOverride('COMPLETED'); setActionError(''); }}>Resolve</button></div></td></tr>)}</tbody></table></div>}
    {editing && <Dialog title={`${editing.action === 'MODIFY' ? 'Change practice for' : 'Resolve support for'} ${editing.student.name}`} onClose={close}><Notice error>{actionError}</Notice><p style={{ marginBottom: 20 }}>{editing.competency.topic_title}</p><form onSubmit={e => { e.preventDefault(); act(editing.intervention_id,editing.action,editing.action === 'MODIFY' ? { material_id: material } : { override_status: override }); }}>
      {editing.action === 'MODIFY' ? <div className="field"><label htmlFor="support-material">Practice material</label><select id="support-material" className="form-input" value={material} onChange={e => setMaterial(e.target.value)} required><option value="">Choose material</option>{editing.available_competency_remedials.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select>{!editing.available_competency_remedials.length && <small>No matching practice material is available.</small>}</div> : <div className="field"><label htmlFor="support-resolution">Resolution</label><select id="support-resolution" className="form-input" value={override} onChange={e => setOverride(e.target.value)}><option value="COMPLETED">Completed</option><option value="EXEMPTED">Exempted by teacher</option><option value="OVERRIDDEN">Teacher override</option></select></div>}
      <button className="btn btn-primary" disabled={busy || (editing.action === 'MODIFY' && !material)}>{busy ? 'Saving…' : 'Save decision'}</button></form></Dialog>}
  </div>;
}
