import React, { useState } from 'react';
import Dialog from '../../components/ui/Dialog';
import FileDropZone from '../../components/ui/FileDropZone';
import { Notice } from '../../components/ui/Feedback';
import UploadProgress from '../../components/ui/UploadProgress';
import { cleanText } from '../../utils/learning';
import { fileSizeLabel } from '../../utils/files';
import { EMPTY_LESSON, FILE_TYPES, describeUpload, lessonFormFrom } from './lessons';

/**
 * Add or edit a lesson from an uploaded file or a link.
 * `onSubmit({ form, file })` is called with the raw values; the page builds the payload.
 */
export default function LessonFormDialog({ lesson, competencies, error, saving, progress = 0, onSubmit, onClose }) {
  const [form, setForm] = useState(() => (lesson ? lessonFormFrom(lesson, cleanText) : EMPTY_LESSON));
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const change = e => setForm({ ...form, [e.target.name]: e.target.value });

  const chooseFile = (selected, event) => {
    if (!selected) return;
    const suggestion = describeUpload(selected);
    if (suggestion.error) {
      // Say so now instead of after the upload is refused.
      setFile(null); setFileError(suggestion.error);
      if (event?.target) event.target.value = '';
      return;
    }
    setFileError('');
    setFile(selected);
    setForm(f => ({ ...f, file_type: suggestion.file_type, title: f.title || suggestion.title }));
  };

  return (
    <Dialog title={lesson ? 'Edit lesson' : 'Add a lesson'} onClose={onClose}>
      <Notice error>{error}</Notice>
      <p className="muted" style={{ marginBottom: 20 }}>
        Upload a file (PDF, PowerPoint, Word, MP4 or ZIP, up to 15 MB) or paste a link for your students.
      </p>
      <form
        onSubmit={e => {
          e.preventDefault();
          onSubmit({ form, file });
        }}
      >
        <div className="field">
          <label htmlFor="resource-competency">Topic</label>
          <select id="resource-competency" name="competency_id" className="form-input" value={form.competency_id} onChange={change} required>
            <option value="">Choose a topic</option>
            {competencies.map(c => (
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
          <textarea id="resource-description" name="description" className="form-input" value={form.description} onChange={change} />
        </div>
        <div className="field">
          <label htmlFor="resource-type">File type</label>
          <select id="resource-type" className="form-input" name="file_type" value={form.file_type} onChange={change}>
            {FILE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <FileDropZone
          id="resource-file"
          label="Drag and drop a file here, or click to choose"
          accept=".pdf,.pptx,.ppt,.mp4,.docx,.doc,.zip"
          onFile={chooseFile}
        >
          {fileError && <small role="alert" style={{ color: 'var(--status-critical)' }}>{fileError}</small>}
          {file && (
            <small>
              Selected file: <strong>{cleanText(file.name)}</strong> ({fileSizeLabel(file)})
            </small>
          )}
          {saving && file && <UploadProgress value={progress} label="Lesson upload progress" />}
        </FileDropZone>
        <div className="field">
          <label htmlFor="resource-url">Or paste a file link</label>
          <input
            id="resource-url"
            className="form-input"
            name="storage_url"
            value={form.storage_url}
            onChange={change}
            placeholder="https://… or /api/materials/download/…"
            required={!file}
          />
        </div>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? (file && progress ? `Uploading (${Math.round(progress * 100)}%)…` : 'Saving…') : lesson ? 'Save changes' : 'Add lesson'}
        </button>
      </form>
    </Dialog>
  );
}
