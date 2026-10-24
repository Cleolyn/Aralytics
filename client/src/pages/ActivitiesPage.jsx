import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, FileUp } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import useLearnerData from '../hooks/useLearnerData';
import ActivityTable from '../components/ActivityTable';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import { completedActivity, formatDate } from '../utils/learning';

function TaskSubmission({ task, onSubmitted }) {
  const { user } = useAuth();
  const draftKey = `aralytics:notes:${user.id}:${task.id}`;
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState(() => { try { return localStorage.getItem(draftKey) || ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const previous = task.my_submission;
  function selectFile(selected) {
    setError(''); setMessage(''); setProgress(0);
    if (selected && (!/\.(pdf|docx|pptx|zip|mp4|png|jpg|jpeg)$/i.test(selected.name) || selected.size > 5 * 1024 * 1024 || !selected.size)) {
      setFile(null);
      setError('Choose a valid deliverable (.PDF, .DOCX, .PPTX, .ZIP, .MP4, .PNG, .JPG) up to 5 MB.');
      return;
    }
    setFile(selected || null);
  }
  function choose(e) {
    const selected = e.target.files?.[0];
    selectFile(selected);
    if (!selected) e.target.value = '';
  }
  async function submit(e) {
    e.preventDefault(); if (!file || busy) return; setBusy(true); setError(''); setProgress(15);
    try {
      const encoded = await new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onprogress = ev => { if (ev.lengthComputable) setProgress(Math.min(75, Math.round((ev.loaded / ev.total) * 70))); };
        reader.onload = () => { setProgress(80); resolve(String(reader.result).split(',')[1]); };
        reader.onerror = () => reject(new Error('Could not read the file. Choose it again.'));
        reader.readAsDataURL(file);
      });
      const res = await api.submitPerformanceTask(task.id, { file_name: file.name, file_size_bytes: file.size, file_content_base64: encoded, notes });
      if (!res.success) throw new Error(res.message || 'Could not submit your work.');
      setProgress(100);
      localStorage.removeItem(draftKey); onSubmitted('Your work has been submitted. Your teacher can now review the document.');
    } catch (err) { setError(err.message); setProgress(0); } finally { setBusy(false); }
  }
  return <>
    {previous && <section className="section"><h3>Your submission</h3><p style={{ marginTop: 12 }}><Status tone="good">{previous.status === 'GRADED' ? 'Graded' : 'Submitted'}</Status> · {formatDate(previous.submitted_at,'')}</p><a className="text-action" href={api.getSubmissionFileUrl(previous.file_url)} target="_blank" rel="noreferrer">{previous.file_name}</a>{previous.status === 'GRADED' && <><p><strong>{previous.score} / {task.total_points}</strong></p><p>{previous.feedback || 'No written feedback yet.'}</p></>}</section>}
    <section className="section"><h3>{previous ? 'Replace your submission' : 'Submission'}</h3><p style={{ marginTop: 12 }}>Review your deliverable before sending it to your teacher.{previous?.status === 'GRADED' ? ' Replacing it will clear the previous grade until your teacher reviews it again.' : ''}</p><Notice error>{error}</Notice><Notice success>{message}</Notice>
      <form onSubmit={submit}>
        <div
          className="upload-field"
          onDragOver={e => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => { e.preventDefault(); setDragActive(false); selectFile(e.dataTransfer.files?.[0]); }}
          style={{ background: dragActive ? 'var(--colors-canvas-soft)' : 'transparent' }}
        >
          <FileUp size={24} aria-hidden="true" />
          <label htmlFor="activity-file" style={{ display: 'block', fontWeight: 600, marginTop: 6 }}>Drag &amp; drop your deliverable or choose file</label>
          <input id="activity-file" type="file" accept=".pdf,.docx,.pptx,.zip,.mp4,.png,.jpg,.jpeg" onChange={choose} required={!file} disabled={busy} aria-describedby="upload-help" />
          <small id="upload-help">PDF, DOCX, PPTX, ZIP, MP4, PNG, JPG · Up to 5 MB{file ? ` · ${file.name} (${(file.size / 1024).toFixed(0)} KB selected)` : ''}</small>
          {progress > 0 && (
            <div className="progress-track" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <span style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
        <div className="field"><label htmlFor="activity-notes">Notes for your teacher (optional)</label><textarea id="activity-notes" className="form-input" value={notes} onChange={e => setNotes(e.target.value)} maxLength={4000} /></div>
        <button className="btn btn-primary" disabled={busy || !file}>{busy ? `Uploading (${progress}%)…` : 'Submit work'}<ArrowRight size={16} /></button>
        <button type="button" className="text-action" style={{ marginLeft: 20 }} disabled={busy} onClick={() => { try { localStorage.setItem(draftKey,notes); setMessage('Notes saved on this device. Choose your file again when you return.'); } catch { setError('Could not save notes on this device.'); } }}>Save notes</button>
      </form>
    </section>
  </>;
}

export default function ActivitiesPage() {
  const { data, loading, error, refresh } = useLearnerData();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const items = (data?.activities || []).filter(item => item.title.toLowerCase().includes(search.toLowerCase()) && (tab === 'All' || (tab === 'Upcoming' ? !completedActivity(item) : tab === 'Submitted' ? item.state === 'Submitted' : ['Completed','Graded'].includes(item.state))));
  const selected = (data?.activities || []).find(item => params.get(item.kind) === item.id) || items[0];
  return <div className="container"><div className="page-heading"><div><h1>Activities</h1><p>See what is due and track your submissions.</p></div><Link className="text-action" to="/student/progress">My Progress <ArrowRight size={16} /></Link></div>
    <Notice error>{error || data?.warnings.join(' ')}</Notice><Notice success>{message}</Notice>{(error || data?.warnings.length > 0) && <button className="text-action" onClick={refresh}>Retry loading</button>}
    <div className="split-content" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(280px,1fr)' }}>
      <section><div className="tabs" aria-label="Filter activities">{['All','Upcoming','Submitted','Completed'].map(t => <button className={tab === t ? 'active' : ''} key={t} aria-pressed={tab === t} onClick={() => { setTab(t); setParams({}); }}>{t}</button>)}</div><div className="field"><label htmlFor="activity-search">Search activities</label><input id="activity-search" className="form-input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title…" /></div>{loading ? <Loading>Loading your activities…</Loading> : <ActivityTable items={items} onSelect={item => { setParams({ [item.kind]: item.id }); setMessage(''); }} />}</section>
      <aside className="aside">{selected ? <><span className="eyebrow">{selected.type}</span><h2 style={{ marginTop: 12 }}>{selected.title}</h2><Status tone={completedActivity(selected) ? 'good' : 'pending'}>{selected.state}</Status><p style={{ marginTop: 12 }}>Due: {formatDate(selected.due_date)}</p><section className="section"><h3>Instructions</h3><p style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{selected.instructions || selected.description || 'Read each question carefully and follow your teacher’s instructions.'}</p>{selected.rubric_criteria && <><h3 style={{ marginTop: 20 }}>Rubric</h3><p style={{ whiteSpace: 'pre-wrap' }}>{selected.rubric_criteria}</p></>}<p>{selected.total_points} points{selected.kind === 'quiz' ? ` · ${selected.time_limit_minutes || 20} minutes` : ''}</p></section>
        {selected.kind === 'task' ? <TaskSubmission key={selected.id} task={selected} onSubmitted={msg => { setMessage(msg); refresh(); }} /> : completedActivity(selected) ? <Link className="text-action" to="/student/progress">View results <ArrowRight size={16} /></Link> : <><p>Internet required. Keep the quiz window active; focus changes are recorded for teacher review. The timer starts when you open the quiz.</p><button className="btn btn-primary" disabled={!navigator.onLine} onClick={() => navigate(`/student/quizzes/${selected.id}`)}>{selected.state === 'In progress' ? 'Resume quiz' : 'Start quiz'}<ArrowRight size={16} /></button></>}
      </> : !loading && <EmptyState title="Select an activity">Activity details and instructions will appear here.</EmptyState>}</aside>
    </div>
  </div>;
}
