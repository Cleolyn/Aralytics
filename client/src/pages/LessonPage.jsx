import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Download, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import useRemoteData from '../hooks/useRemoteData';
import { Loading, Notice, Status } from '../components/ui/Feedback';
import { cachedMaterials, downloadMaterial, loadMaterials, loadReadingLogs, markRead } from '../utils/offlineLearning';
import { ilawLabels, materialUrl } from '../utils/learning';

export default function LessonPage() {
  const { id } = useParams();
  const { user, isTeacher } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const { data, loading, error, refresh } = useRemoteData(async () => {
    const [materials,logs,cached] = await Promise.all([loadMaterials(user.id),loadReadingLogs(user.id),cachedMaterials()]);
    const material = materials.find(m => m.id === id);
    if (!material) throw new Error('This lesson is not available. Go back to Lessons or reconnect to load it.');
    return { material, materials, read: logs.some(l => l.material_id === id), cached };
  }, [id,user.id]);
  const base = isTeacher ? '/teacher/materials' : '/student/materials';
  const m = data?.material;
  const url = m ? materialUrl(m.storage_url) : null;
  const cached = data?.cached.has(url);
  async function perform(download) { setBusy(true); setActionError(''); try { if (download) await downloadMaterial(m); else await markRead(user.id,id); setMessage(download ? 'Downloaded for offline reading on this device.' : navigator.onLine ? 'Reading progress recorded. Keep going!' : 'Reading recorded on this device. It will sync when you reconnect.'); refresh(); } catch (err) { setActionError(err.message); } finally { setBusy(false); } }
  return <div className="container"><Link className="text-action" to={base}>← Back to lessons</Link><Notice error>{error || actionError}</Notice><Notice success>{message}</Notice>{error && <button className="text-action" onClick={refresh}>Try again</button>}
    {loading ? <Loading>Opening your lesson…</Loading> : m && <><div className="page-heading" style={{ marginTop: 20 }}><div><span className="eyebrow">Araling Panlipunan 10 · {m.melc_code}</span><h1 style={{ marginTop: 12 }}>{m.title}</h1><p>{m.file_type} · {ilawLabels[m.ilaw_tag] || 'Learn'}</p></div><button className="btn btn-secondary" disabled={busy || cached} onClick={() => perform(true)}><Download size={17} />{cached ? 'Downloaded' : 'Download for offline'}</button></div>
      <nav className="tabs" aria-label="Lesson learning stages">{Object.entries(ilawLabels).map(([tag,label]) => <Link key={tag} className={tag === m.ilaw_tag ? 'active' : ''} to={tag === 'ASSESSMENT' ? isTeacher ? '/teacher/assessments' : '/student/activities' : tag === 'WAYS_FORWARD' ? isTeacher ? '/teacher/remediation' : '/student/interventions' : `${base}?stage=${tag}`}>{label}</Link>)}</nav>
      <div className="reading-layout"><article className="reading-content"><h2>Learning goal</h2><p>{m.competency_description || 'Explore the resource and follow your teacher’s instructions.'}</p>{m.description && <><h2>About this resource</h2><p>{m.description}</p></>}
        <section className="section"><h2 style={{ marginTop: 0, marginBottom: 20 }}>Lesson resource</h2>{!url ? <Notice error>This resource link is unavailable. Please ask your teacher for an updated link.</Notice> : ['MP4','VIDEO'].includes(m.file_type) ? <video controls src={url} aria-label={m.title} onError={() => setActionError('The video could not be played. Open the resource directly or ask your teacher for a working file.')} /> : m.file_type === 'PDF' ? <iframe src={url} title={m.title} /> : <p>This {m.file_type} resource opens in a compatible document viewer.</p>}{url && <a className="text-action" href={url} target="_blank" rel="noopener noreferrer">Open resource directly <ArrowRight size={16} /></a>}</section>
        {!isTeacher && <section className="section"><h2>Ready to continue?</h2><p>After reviewing the resource, record your reading progress.</p><div className="hero-actions"><button className="btn btn-primary" onClick={() => perform(false)} disabled={busy || data.read}><Check size={17} />{data.read ? 'Marked as read' : busy ? 'Saving…' : 'Mark as read'}</button><Link className="text-action" to="/student/activities">View related activities <ArrowRight size={16} /></Link></div></section>}
      </article><aside className="aside"><section><h3>In this lesson</h3><p>{m.melc_code}</p><Status tone={cached ? 'good' : ''}>{cached ? 'Available offline' : 'Online resource'}</Status></section><section><h3>More on this learning goal</h3><ul className="simple-list">{data.materials.filter(item => item.competency_id === m.competency_id && item.id !== id).map(item => <li key={item.id}><Link to={`${base}/${item.id}`}>{item.title}</Link></li>)}</ul><Link className="text-action" to={base}>Browse all lessons <ArrowRight size={15} /></Link></section></aside></div>
    </>}
  </div>;
}
