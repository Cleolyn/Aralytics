import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Download, Plus, Edit3, Trash2, FileUp } from '../components/icons';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import useRemoteData from '../hooks/useRemoteData';
import Dialog from '../components/ui/Dialog';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import { cleanText, ilawLabels, materialUrl } from '../utils/learning';
import { cachedMaterials, downloadMaterial, loadMaterials, loadReadingLogs, removeDownload, syncReading } from '../utils/offlineLearning';

export default function MaterialsHub() {
  const { isTeacher, user } = useAuth();
  const [params] = useSearchParams();
  const [downloaded, setDownloaded] = useState(params.get('downloaded') === 'true');
  const [search, setSearch] = useState('');
  const [quarter, setQuarter] = useState('');
  const [phase, setPhase] = useState(params.get('stage') || '');
  const [type, setType] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingMat, setEditingMat] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [form, setForm] = useState({ competency_id: '', title: '', description: '', file_type: 'PDF', storage_url: '' });
  const { data, loading, error, refresh } = useRemoteData(async () => {
    await syncReading(user.id);
    const [materials, logs, cached, taxonomy] = await Promise.all([
      loadMaterials(user.id),
      loadReadingLogs(user.id),
      cachedMaterials(),
      api.getTaxonomy().catch(() => ({ flatCompetencies: [] }))
    ]);
    return { materials, logs, cached, competencies: taxonomy.flatCompetencies || [] };
  }, [user.id]);
  useEffect(() => {
    const sync = () => refresh();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, [refresh]);
  const close = useCallback(() => {
    setShowAdd(false);
    setEditingMat(null);
    setUploadFile(null);
  }, []);
  const base = isTeacher ? '/teacher/materials' : '/student/materials';
  const compMap = new Map(data?.competencies.map(c => [c.id, c]) || []);
  const readIds = new Set(data?.logs.map(l => l.material_id) || []);
  const items = (data?.materials || []).filter(
    m =>
      (!search || `${m.title} ${m.description || ''}`.toLowerCase().includes(search.toLowerCase())) &&
      (!quarter || compMap.get(m.competency_id)?.quarter_code === quarter || m.melc_code?.includes(quarter)) &&
      (!phase || m.ilaw_tag === phase) &&
      (!type || m.file_type === type) &&
      (!downloaded || data.cached.has(materialUrl(m.storage_url)))
  );

  async function cache(m, remove = false) {
    setBusy(m.id);
    setMessage('');
    setActionError('');
    try {
      if (remove) await removeDownload(m);
      else await downloadMaterial(m);
      setMessage(remove ? 'Saved lesson removed from this device.' : 'Lesson saved. You can now open it without internet.');
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  function handleFileDropOrSelect(selected) {
    if (!selected) return;
    setUploadFile(selected);
    const ext = selected.name.split('.').pop()?.toUpperCase();
    if (['PDF', 'PPTX', 'MP4', 'DOCX'].includes(ext)) {
      const niceTitle = selected.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      setForm(f => ({ ...f, file_type: ext, title: f.title || niceTitle }));
    }
  }

  async function saveMaterial(e) {
    e.preventDefault();
    setBusy('save');
    setActionError('');
    try {
      let payload = { ...form };
      if (uploadFile) {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('Could not read file.'));
          reader.readAsDataURL(uploadFile);
        });
        payload.file_name = uploadFile.name;
        payload.file_size_bytes = uploadFile.size;
        payload.file_content_base64 = base64;
      } else if (!materialUrl(form.storage_url)) {
        throw new Error('Please enter a valid file link or upload a file.');
      }

      const res = editingMat
        ? await api.updateMaterial(editingMat.id, payload)
        : await api.createMaterial(payload);
      if (!res.success) throw new Error(res.message);
      close();
      setMessage(editingMat ? 'Lesson updated.' : 'Lesson added.');
      setForm({ competency_id: '', title: '', description: '', file_type: 'PDF', storage_url: '' });
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function handleDelete(m) {
    setBusy(m.id);
    setActionError('');
    setMessage('');
    try {
      const res = await api.deleteMaterial(m.id);
      if (!res.success) throw new Error(res.message);
      setMessage(`Removed "${cleanText(m.title)}".`);
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  function openEdit(m) {
    setEditingMat(m);
    setUploadFile(null);
    setActionError('');
    setForm({
      competency_id: m.competency_id || '',
      title: cleanText(m.title || ''),
      description: cleanText(m.description || ''),
      file_type: m.file_type || 'PDF',
      storage_url: m.storage_url || ''
    });
    setShowAdd(true);
  }

  const change = e => setForm({ ...form, [e.target.name]: e.target.value });
  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>Lessons</h1>
          <p>{isTeacher ? 'Upload and manage lesson files for your classes.' : 'Read your class lessons and save them for offline reading.'}</p>
        </div>
        {isTeacher && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingMat(null);
              setUploadFile(null);
              setForm({ competency_id: '', title: '', description: '', file_type: 'PDF', storage_url: '' });
              setShowAdd(true);
            }}
          >
            <Plus size={17} />
            Add lesson
          </button>
        )}
      </div>
      <Notice error>{error || (!showAdd && actionError)}</Notice>
      <Notice success>{message}</Notice>
      {error && (
        <button className="text-action" onClick={refresh}>
          Try again
        </button>
      )}
      <div className="tabs">
        <button className={!downloaded ? 'active' : ''} onClick={() => setDownloaded(false)} aria-pressed={!downloaded}>
          All lessons
        </button>
        <button className={downloaded ? 'active' : ''} onClick={() => setDownloaded(true)} aria-pressed={downloaded}>
          Saved on this device
        </button>
      </div>
      <div className="filters">
        <div className="field search-field">
          <label htmlFor="lesson-search">Search lessons</label>
          <input
            id="lesson-search"
            className="form-input"
            type="search"
            placeholder="Type a lesson title or topic…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="lesson-quarter">Quarter</label>
          <select id="lesson-quarter" className="form-input" value={quarter} onChange={e => setQuarter(e.target.value)}>
            <option value="">All quarters</option>
            {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
              <option key={q}>{q}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="lesson-phase">Step</label>
          <select id="lesson-phase" className="form-input" value={phase} onChange={e => setPhase(e.target.value)}>
            <option value="">All steps</option>
            {Object.entries(ilawLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="lesson-format">File type</label>
          <select id="lesson-format" className="form-input" value={type} onChange={e => setType(e.target.value)}>
            <option value="">All file types</option>
            {['PDF', 'PPTX', 'MP4', 'DOCX'].map(t => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      {loading ? (
        <Loading>Loading your lessons…</Loading>
      ) : !items.length ? (
        <EmptyState title={downloaded ? 'No saved lessons found' : 'No lessons found'}>
          Try changing your search filter{downloaded ? ' or save a lesson while online.' : '.'}
        </EmptyState>
      ) : (
        <div className="table-responsive" tabIndex={0} role="region" aria-label="Lesson resources">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lesson</th>
                <th>Step</th>
                <th>Status</th>
                <th>Offline</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map(m => {
                const cached = data.cached.has(materialUrl(m.storage_url));
                return (
                  <tr key={m.id}>
                    <td>
                      <strong>{cleanText(m.title)}</strong>
                      <small>
                        {cleanText(m.file_type)} · {cleanText(compMap.get(m.competency_id)?.topic_title || m.melc_code)}
                      </small>
                    </td>
                    <td>{ilawLabels[m.ilaw_tag] || 'Lessons'}</td>
                    <td>
                      <Status tone={readIds.has(m.id) ? 'good' : ''}>{readIds.has(m.id) ? 'Read' : 'Not read'}</Status>
                    </td>
                    <td>
                      {cached ? (
                        <Status tone="good">Saved offline</Status>
                      ) : (
                        <span className="muted">{m.resource_available === false ? 'File missing' : 'Online only'}</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                        <Link className="text-action" to={`${base}/${m.id}`}>
                          Open <ArrowRight size={15} />
                        </Link>
                        <button
                          className="text-action"
                          disabled={busy === m.id || m.resource_available === false}
                          onClick={() => cache(m, cached)}
                        >
                          {busy === m.id ? (
                            'Saving…'
                          ) : cached ? (
                            'Remove save'
                          ) : m.resource_available === false ? (
                            'File missing'
                          ) : (
                            <>
                              <Download size={15} />
                              Save offline
                            </>
                          )}
                        </button>
                        {isTeacher && (
                          <>
                            <button type="button" className="text-action" onClick={() => openEdit(m)}>
                              <Edit3 size={15} />
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-action"
                              disabled={busy === m.id}
                              onClick={() => handleDelete(m)}
                            >
                              <Trash2 size={15} />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && (
        <Dialog title={editingMat ? 'Edit lesson' : 'Add a lesson'} onClose={close}>
          <Notice error>{actionError}</Notice>
          <p className="muted" style={{ marginBottom: 20 }}>
            Upload a file (PDF, PPTX, MP4, DOCX) or paste a link for your students.
          </p>
          <form onSubmit={saveMaterial}>
            <div className="field">
              <label htmlFor="resource-competency">Topic</label>
              <select
                id="resource-competency"
                name="competency_id"
                className="form-input"
                value={form.competency_id}
                onChange={change}
                required
              >
                <option value="">Choose a topic</option>
                {data?.competencies.map(c => (
                  <option key={c.id} value={c.id}>
                    {cleanText(c.melc_code)} · {cleanText(c.description)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="resource-title">Title</label>
              <input id="resource-title" className="form-input" name="title" value={form.title} onChange={change} required />
            </div>
            <div className="field">
              <label htmlFor="resource-description">Short note</label>
              <textarea
                id="resource-description"
                name="description"
                className="form-input"
                value={form.description}
                onChange={change}
              />
            </div>
            <div className="field">
              <label htmlFor="resource-type">File type</label>
              <select id="resource-type" className="form-input" name="file_type" value={form.file_type} onChange={change}>
                {['PDF', 'PPTX', 'MP4', 'DOCX'].map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div
              className="upload-field"
              onDragOver={e => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={e => {
                e.preventDefault();
                setDragActive(false);
                handleFileDropOrSelect(e.dataTransfer.files?.[0]);
              }}
              style={{ background: dragActive ? 'var(--colors-canvas-soft)' : 'transparent' }}
            >
              <FileUp size={22} aria-hidden="true" />
              <label htmlFor="resource-file" style={{ display: 'block', fontWeight: 600, marginTop: 8 }}>
                Drag and drop a file here, or click to choose
              </label>
              <input
                id="resource-file"
                type="file"
                accept=".pdf,.pptx,.ppt,.mp4,.docx,.doc"
                onChange={e => handleFileDropOrSelect(e.target.files?.[0])}
              />
              {uploadFile && (
                <small>
                  Selected file: <strong>{cleanText(uploadFile.name)}</strong> ({(uploadFile.size / 1024).toFixed(0)} KB)
                </small>
              )}
            </div>
            <div className="field">
              <label htmlFor="resource-url">Or paste a file link</label>
              <input
                id="resource-url"
                className="form-input"
                name="storage_url"
                value={form.storage_url}
                onChange={change}
                placeholder="https://… or /api/materials/download/…"
                required={!uploadFile}
              />
            </div>
            <button className="btn btn-primary" disabled={busy === 'save'}>
              {busy === 'save' ? 'Saving…' : editingMat ? 'Save changes' : 'Add lesson'}
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
