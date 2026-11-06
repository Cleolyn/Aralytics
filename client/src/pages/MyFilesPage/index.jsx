import React, { useCallback, useState } from 'react';
import { api } from '../../services/api';
import useRemoteData from '../../hooks/useRemoteData';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import Dialog from '../../components/ui/Dialog';
import FileDropZone from '../../components/ui/FileDropZone';
import UploadProgress from '../../components/ui/UploadProgress';
import { EmptyState, Loading, Notice } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';
import { formatBytes, uploadFile } from '../../utils/upload';
import FilesTable from './FilesTable';

/** Personal file space for teachers and learners: a usage meter, an upload area and the file list. */
export default function MyFilesPage() {
  const list = useRemoteData(() => api.listMyFiles('personal'));
  const action = useAsyncAction();
  const [progress, setProgress] = useState(0);
  const [confirming, setConfirming] = useState(null);
  const closeConfirm = useCallback(() => setConfirming(null), []);
  const usage = list.data?.usage;
  const files = list.data?.files || [];
  const percent = usage?.quota ? Math.min(100, Math.round((usage.used / usage.quota) * 100)) : 0;

  const upload = (file, event) => {
    if (!file) return;
    if (event?.target) event.target.value = '';
    return action.run(async () => {
      setProgress(0);
      try {
        const saved = await uploadFile(file, { purpose: 'personal', usage, onProgress: setProgress });
        action.setMessage(`Uploaded ${cleanText(saved.name)}.`);
        list.refresh();
      } finally {
        setProgress(0);
      }
    }, { key: 'upload', clearMessage: true });
  };

  const remove = file => action.run(async () => {
    requireSuccess(await api.deleteFile(file.id));
    setConfirming(null);
    action.setMessage(`Deleted ${cleanText(file.name)}.`);
    list.refresh();
  }, { key: file.id, clearMessage: true });

  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>My files</h1>
          <p>Keep your own documents here. Only you can open them.</p>
        </div>
      </div>
      <Notice error>{list.error || (!confirming && action.error)}</Notice>
      <Notice success>{action.message}</Notice>
      {list.error && <button className="text-action" onClick={list.refresh}>Try again</button>}
      {usage && (
        <section className="section" aria-label="Storage used">
          <h2 style={{ marginTop: 0 }}>{formatBytes(usage.used)} of {formatBytes(usage.quota)}</h2>
          <div className="progress-track" role="progressbar" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <small>Each file can be up to {formatBytes(usage.max_file)}.</small>
        </section>
      )}
      <FileDropZone
        id="my-file"
        label="Drag and drop a file here, or click to choose"
        accept={usage?.allowed_extensions?.join(',')}
        onFile={upload}
        disabled={action.busy === 'upload' || !usage}
      >
        <small>{usage?.allowed_extensions?.join(' ')}</small>
        <UploadProgress value={progress} label="Upload progress" />
      </FileDropZone>
      {list.loading ? (
        <Loading>Loading your files…</Loading>
      ) : !files.length ? (
        !list.error && <EmptyState title="No files yet">Files you upload here will show up in this list.</EmptyState>
      ) : (
        <FilesTable files={files} busyId={action.busy} onDelete={setConfirming} />
      )}
      {confirming && (
        <Dialog title="Delete this file?" onClose={closeConfirm}>
          <Notice error>{action.error}</Notice>
          <p>
            <strong>{cleanText(confirming.name)}</strong> will be removed for good.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary" disabled={action.busy === confirming.id} onClick={() => remove(confirming)}>
              {action.busy === confirming.id ? 'Deleting…' : 'Delete file'}
            </button>
            <button className="btn btn-secondary" onClick={closeConfirm}>Keep file</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
