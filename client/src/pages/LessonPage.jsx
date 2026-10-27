import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Download, Check } from '../components/icons';
import { useAuth } from '../context/AuthContext';
import useRemoteData from '../hooks/useRemoteData';
import { Loading, Notice, Status } from '../components/ui/Feedback';
import { cachedMaterials, downloadMaterial, loadMaterials, loadReadingLogs, markRead } from '../utils/offlineLearning';
import { cleanText, ilawLabels, materialUrl } from '../utils/learning';

export default function LessonPage() {
  const { id } = useParams();
  const { user, isTeacher } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const { data, loading, error, refresh } = useRemoteData(async () => {
    const [materials, logs, cached] = await Promise.all([
      loadMaterials(user.id),
      loadReadingLogs(user.id),
      cachedMaterials()
    ]);
    const material = materials.find(m => m.id === id);
    if (!material) throw new Error('This lesson could not be found. Go back to Lessons or reconnect to load it.');
    const targetUrl = materialUrl(material.storage_url);
    if (navigator.onLine && targetUrl && !cached.has(targetUrl) && material.resource_available !== false) {
      downloadMaterial(material)
        .then(() => cached.add(targetUrl))
        .catch(() => {});
    }
    return { material, materials, read: logs.some(l => l.material_id === id), cached };
  }, [id, user.id]);
  const base = isTeacher ? '/teacher/materials' : '/student/materials';
  const m = data?.material;
  const url = m ? materialUrl(m.storage_url) : null;
  const cached = data?.cached.has(url);
  async function perform(download) {
    setBusy(true);
    setActionError('');
    try {
      if (download) await downloadMaterial(m);
      else await markRead(user.id, id);
      setMessage(
        download
          ? 'Saved for offline reading on this device.'
          : navigator.onLine
          ? 'Marked as read. Great job!'
          : 'Marked as read on this device. It will sync when you are back online.'
      );
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container">
      <Link className="text-action" to={base}>
        ← Back to lessons
      </Link>
      <Notice error>{error || actionError}</Notice>
      <Notice success>{message}</Notice>
      {error && (
        <button className="text-action" onClick={refresh}>
          Try again
        </button>
      )}
      {loading ? (
        <Loading>Opening your lesson…</Loading>
      ) : (
        m && (
          <>
            <div className="page-heading" style={{ marginTop: 20 }}>
              <div>
                <span className="eyebrow">Araling Panlipunan 10 · {cleanText(m.melc_code)}</span>
                <h1 style={{ marginTop: 12 }}>{cleanText(m.title)}</h1>
                <p>
                  {cleanText(m.file_type)} · {ilawLabels[m.ilaw_tag] || 'Lessons'}
                </p>
              </div>
              <button
                className="btn btn-secondary"
                disabled={busy || cached || m.resource_available === false}
                onClick={() => perform(true)}
              >
                <Download size={17} />
                {cached ? 'Saved offline' : 'Save for offline'}
              </button>
            </div>
            <nav className="tabs" aria-label="Lesson steps">
              {Object.entries(ilawLabels).map(([tag, label]) => (
                <Link
                  key={tag}
                  className={tag === m.ilaw_tag ? 'active' : ''}
                  to={
                    tag === 'ASSESSMENT'
                      ? isTeacher
                        ? '/teacher/assessments'
                        : '/student/activities'
                      : tag === 'WAYS_FORWARD'
                      ? isTeacher
                        ? '/teacher/remediation'
                        : '/student/interventions'
                      : `${base}?stage=${tag}`
                  }
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="reading-layout">
              <article className="reading-content">
                <h2>What you will learn</h2>
                <p>{cleanText(m.competency_description || 'Read this lesson and follow your teacher’s instructions.')}</p>
                {m.description && (
                  <>
                    <h2>About this lesson</h2>
                    <p>{cleanText(m.description)}</p>
                  </>
                )}
                <section className="section">
                  <h2 style={{ marginTop: 0, marginBottom: 20 }}>Lesson file</h2>
                  {m.resource_available === false ? (
                    <Notice>This lesson file is not uploaded yet. Please ask your teacher for the file.</Notice>
                  ) : !url ? (
                    <Notice error>This lesson link is not working. Please ask your teacher for a new link.</Notice>
                  ) : ['MP4', 'VIDEO'].includes(m.file_type) ? (
                    <video
                      controls
                      src={url}
                      aria-label={cleanText(m.title)}
                      onError={() =>
                        setActionError('The video could not be played. Try opening the file link directly.')
                      }
                    />
                  ) : m.file_type === 'PDF' ? (
                    <iframe src={url} title={cleanText(m.title)} />
                  ) : (
                    <p>Open the file link below to view this {cleanText(m.file_type)} lesson.</p>
                  )}
                  {url && m.resource_available !== false && (
                    <a className="text-action" href={url} target="_blank" rel="noopener noreferrer">
                      Open file in new tab <ArrowRight size={16} />
                    </a>
                  )}
                </section>
                {!isTeacher && (
                  <section className="section">
                    <h2>Done reading?</h2>
                    <p>Click Mark as read below to save your progress.</p>
                    <div className="hero-actions">
                      <button
                        className="btn btn-primary"
                        onClick={() => perform(false)}
                        disabled={busy || data.read || m.resource_available === false}
                      >
                        <Check size={17} />
                        {data.read ? 'Marked as read' : busy ? 'Saving…' : 'Mark as read'}
                      </button>
                      <Link className="text-action" to="/student/activities">
                        Go to activities <ArrowRight size={16} />
                      </Link>
                    </div>
                  </section>
                )}
              </article>
              <aside className="aside">
                <section>
                  <h3>Lesson info</h3>
                  <p>{cleanText(m.melc_code)}</p>
                  <Status tone={cached ? 'good' : ''}>
                    {m.resource_available === false ? 'File missing' : cached ? 'Saved offline' : 'Online only'}
                  </Status>
                </section>
                <section>
                  <h3>Related lessons</h3>
                  <ul className="simple-list">
                    {data.materials
                      .filter(item => item.competency_id === m.competency_id && item.id !== id)
                      .map(item => (
                        <li key={item.id}>
                          <Link to={`${base}/${item.id}`}>{cleanText(item.title)}</Link>
                        </li>
                      ))}
                  </ul>
                  <Link className="text-action" to={base}>
                    See all lessons <ArrowRight size={15} />
                  </Link>
                </section>
              </aside>
            </div>
          </>
        )
      )}
    </div>
  );
}
