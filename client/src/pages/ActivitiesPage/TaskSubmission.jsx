import React, { useState } from 'react';
import { ArrowRight } from '../../components/icons';
import FileDropZone from '../../components/ui/FileDropZone';
import { Notice, Status } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { cleanText, formatDate } from '../../utils/learning';
import { fileSizeLabel, readFileAsBase64 } from '../../utils/files';
import { readText, remove, write } from '../../utils/deviceStorage';

const ALLOWED_FILE = /\.(pdf|docx|pptx|zip|mp4|png|jpg|jpeg)$/i;
const MAX_BYTES = 5 * 1024 * 1024;
const isValidFile = file => ALLOWED_FILE.test(file.name) && file.size > 0 && file.size <= MAX_BYTES;

function PreviousSubmission({ submission, totalPoints }) {
  const graded = submission.status === 'GRADED';
  return (
    <section className="section">
      <h3>Your submitted work</h3>
      <p style={{ marginTop: 12 }}>
        <Status tone="good">{graded ? 'Graded' : 'Submitted'}</Status> · {formatDate(submission.submitted_at, '')}
      </p>
      <a className="text-action" href={api.getSubmissionFileUrl(submission.file_url)} target="_blank" rel="noreferrer">
        {cleanText(submission.file_name)}
      </a>
      {graded && (
        <>
          <p>
            <strong>
              {submission.score} / {totalPoints}
            </strong>
          </p>
          <p>{cleanText(submission.feedback, 'No comment from teacher yet.')}</p>
        </>
      )}
    </section>
  );
}

/** Upload a performance-task file with an optional note (draft kept on this device). */
export default function TaskSubmission({ task, onSubmitted }) {
  const { user } = useAuth();
  const draftKey = `aralytics:notes:${user.id}:${task.id}`;
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState(() => readText(draftKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const previous = task.my_submission;

  function selectFile(selected, event) {
    setError('');
    setMessage('');
    setProgress(0);
    if (selected && !isValidFile(selected)) {
      setFile(null);
      setError('Please choose a valid file (PDF, DOCX, PPTX, ZIP, MP4, PNG, or JPG) up to 5 MB.');
      return;
    }
    setFile(selected || null);
    if (!selected && event) event.target.value = '';
  }

  async function submit(e) {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setProgress(15);
    try {
      const encoded = await readFileAsBase64(file, {
        onProgress: fraction => setProgress(Math.min(75, Math.round(fraction * 70))),
        errorMessage: 'Could not read the file. Please choose it again.'
      });
      setProgress(80);
      const res = await api.submitPerformanceTask(task.id, { file_name: file.name, file_size_bytes: file.size, file_content_base64: encoded, notes });
      if (!res.success) throw new Error(res.message || 'Could not submit your work.');
      setProgress(100);
      remove(draftKey);
      onSubmitted('Your work has been sent to your teacher.');
    } catch (err) {
      setError(err.message);
      setProgress(0);
    } finally {
      setBusy(false);
    }
  }

  const saveNote = () => {
    if (write(draftKey, notes)) setMessage('Your note was saved on this device.');
    else setError('Could not save your note on this device.');
  };

  return (
    <>
      {previous && <PreviousSubmission submission={previous} totalPoints={task.total_points} />}
      <section className="section">
        <h3>{previous ? 'Send a new file' : 'Submit your work'}</h3>
        <p style={{ marginTop: 12 }}>
          Check your file before sending it to your teacher.
          {previous?.status === 'GRADED' ? ' Sending a new file will reset your score until your teacher checks it again.' : ''}
        </p>
        <Notice error>{error}</Notice>
        <Notice success>{message}</Notice>
        <form onSubmit={submit}>
          <FileDropZone
            id="activity-file"
            label="Drag and drop your file here, or click to choose"
            accept=".pdf,.docx,.pptx,.zip,.mp4,.png,.jpg,.jpeg"
            iconSize={24}
            labelSpacing={6}
            onFile={selectFile}
            required={!file}
            disabled={busy}
            aria-describedby="upload-help"
          >
            <small id="upload-help">
              PDF, DOCX, PPTX, ZIP, MP4, PNG, JPG · Max 5 MB
              {file ? ` · ${cleanText(file.name)} (${fileSizeLabel(file)})` : ''}
            </small>
            {progress > 0 && (
              <div className="progress-track" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <span style={{ width: `${progress}%` }} />
              </div>
            )}
          </FileDropZone>
          <div className="field">
            <label htmlFor="activity-notes">Message for your teacher (optional)</label>
            <textarea id="activity-notes" className="form-input" value={notes} onChange={e => setNotes(e.target.value)} maxLength={4000} />
          </div>
          <button className="btn btn-primary" disabled={busy || !file}>
            {busy ? `Sending (${progress}%)…` : 'Submit work'}
            <ArrowRight size={16} />
          </button>
          <button type="button" className="text-action" style={{ marginLeft: 20 }} disabled={busy} onClick={saveNote}>
            Save note
          </button>
        </form>
      </section>
    </>
  );
}
