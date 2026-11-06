import { api } from '../services/api';

const RETRY_DELAYS = [1000, 2000, 4000];
const MB = 1024 * 1024;

/** "12 KB" / "3.4 MB" / "1 GB" label for a byte count. */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * MB) return `${Number((value / (1024 * MB)).toFixed(1))} GB`;
  if (value >= MB) return `${Number((value / MB).toFixed(1))} MB`;
  return `${Math.max(0, Math.round(value / 1024))} KB`;
}

/**
 * Early check against the limits the server reports in GET /api/files (`usage`).
 * Returns a message to show, or '' when the file looks fine. The server stays the final judge.
 */
export function checkFile(file, usage) {
  if (!file) return '';
  if (!file.size) return 'This file is empty. Choose a different file.';
  const allowed = usage?.allowed_extensions;
  const extension = `.${file.name.split('.').pop().toLowerCase()}`;
  if (allowed?.length && !allowed.includes(extension)) return `Unsupported file type. Allowed: ${allowed.join(', ')}`;
  if (usage?.max_file && file.size > usage.max_file) return `Files must be ${formatBytes(usage.max_file)} or smaller.`;
  if (usage?.quota && usage.used + file.size > usage.quota) {
    return `You've used ${formatBytes(usage.used)} of ${formatBytes(usage.quota)}. Delete files in My files to make room.`;
  }
  return '';
}

class UploadError extends Error {
  constructor(message, retryable) {
    super(message);
    this.retryable = retryable;
  }
}

const abortError = () => new DOMException('Upload cancelled.', 'AbortError');

/** PUT one part with XMLHttpRequest, which (unlike fetch) reports upload progress. */
function putPart(url, blob, { onProgress, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const done = settle => value => {
      signal?.removeEventListener('abort', onAbort);
      settle(value);
    };
    const finish = done(resolve);
    const fail = done(reject);
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = event => onProgress?.(event.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return finish();
      let message = '';
      try { message = JSON.parse(xhr.responseText).message; } catch { /* not JSON */ }
      fail(new UploadError(message || `Upload failed (${xhr.status}).`, xhr.status >= 500));
    };
    xhr.onerror = () => fail(new UploadError('The connection dropped. Check your internet and try again.', true));
    xhr.onabort = () => fail(abortError());
    signal?.addEventListener('abort', onAbort);
    xhr.send(blob);
  });
}

const wait = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(abortError()); }, { once: true });
});

async function putPartWithRetries(url, blob, { onProgress, signal, retryDelays }) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await putPart(url, blob, { onProgress, signal });
    } catch (error) {
      if (error.name === 'AbortError' || !error.retryable || attempt >= retryDelays.length) throw error;
      onProgress?.(0);
      await wait(retryDelays[attempt], signal);
    }
  }
}

/**
 * Upload a file in parts and return the finished file record (with a signed download_url).
 *
 *   purpose        'material' | 'submission' | 'personal'
 *   taskId         required for submissions
 *   onProgress(f)  fraction 0..1 of all bytes sent
 *   signal         AbortSignal to cancel
 *   usage          optional limits from api.listMyFiles(); checked before anything is sent
 *
 * On failure or cancel the half-finished upload is deleted, and the server's message is thrown.
 */
export async function uploadFile(file, { purpose, taskId, onProgress, signal, usage, retryDelays = RETRY_DELAYS } = {}) {
  const problem = checkFile(file, usage);
  if (problem) throw new Error(problem);
  const reserved = await api.createUpload({ purpose, name: file.name, size: file.size, task_id: taskId });
  if (!reserved?.success) throw new Error(reserved?.message || 'Could not start the upload.');
  const { file: record, upload } = reserved;
  try {
    const size = upload.chunk_size;
    let done = 0;
    for (let index = 0; index < upload.chunk_count; index++) {
      const blob = file.slice(index * size, (index + 1) * size);
      await putPartWithRetries(upload.part_url.replace('{index}', index), blob, {
        signal,
        retryDelays,
        onProgress: loaded => onProgress?.(Math.min(1, (done + loaded) / file.size))
      });
      done += blob.size;
      onProgress?.(done / file.size);
    }
    const completed = await api.completeUpload(record.id);
    if (!completed?.success) throw new Error(completed?.message || 'Could not finish the upload.');
    return completed.file;
  } catch (error) {
    await Promise.resolve(api.deleteFile(record.id)).catch(() => {});
    throw error;
  }
}
