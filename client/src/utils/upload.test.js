import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkFile, formatBytes, uploadFile } from './upload';
import { api } from '../services/api';

vi.mock('../services/api', () => ({ api: { createUpload: vi.fn(), completeUpload: vi.fn(), deleteFile: vi.fn() } }));

const MB = 1024 * 1024;

/** Scripted XMLHttpRequest: each PUT consumes the next planned outcome. */
class FakeXHR {
  static plan = [];
  static sent = [];
  constructor() { this.upload = {}; this.headers = {}; }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(name, value) { this.headers[name] = value; }
  abort() { this.onabort?.(); }
  send(body) {
    FakeXHR.sent.push({ url: this.url, size: body.size, headers: this.headers, method: this.method });
    const outcome = FakeXHR.plan.shift() || { status: 200 };
    queueMicrotask(() => {
      if (outcome.network) return this.onerror();
      this.upload.onprogress?.({ loaded: Math.floor(body.size / 2) });
      this.upload.onprogress?.({ loaded: body.size });
      this.status = outcome.status;
      this.responseText = JSON.stringify(outcome.body || {});
      this.onload();
    });
  }
}

const reservation = (count, chunkSize = MB) => ({
  success: true,
  file: { id: 'file-1' },
  upload: { chunk_size: chunkSize, chunk_count: count, part_url: '/api/files/file-1/parts/{index}?sig=s', expires_at: 'later' }
});
const fileOf = size => new File([new Uint8Array(size)], 'lesson.pdf', { type: 'application/pdf' });
const noWait = { retryDelays: [0, 0, 0] };

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  FakeXHR.plan = [];
  FakeXHR.sent = [];
  vi.clearAllMocks();
  api.completeUpload.mockResolvedValue({ success: true, file: { id: 'file-1', download_url: '/api/files/file-1/content?sig=d' } });
  api.deleteFile.mockResolvedValue({ success: true });
});
afterEach(() => vi.unstubAllGlobals());

describe('uploadFile', () => {
  it('sends each part and reports progress across the whole file', async () => {
    api.createUpload.mockResolvedValue(reservation(3));
    const progress = [];
    const file = fileOf(2 * MB + 500);
    const result = await uploadFile(file, { purpose: 'material', onProgress: value => progress.push(value), ...noWait });

    expect(api.createUpload).toHaveBeenCalledWith({ purpose: 'material', name: 'lesson.pdf', size: file.size, task_id: undefined });
    expect(FakeXHR.sent.map(part => part.size)).toEqual([MB, MB, 500]);
    expect(FakeXHR.sent.map(part => part.url)).toEqual([0, 1, 2].map(i => `/api/files/file-1/parts/${i}?sig=s`));
    expect(FakeXHR.sent.every(part => part.method === 'PUT' && part.headers['Content-Type'] === 'application/octet-stream')).toBe(true);
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.some(value => value > 0 && value < 0.5)).toBe(true);
    expect(api.completeUpload).toHaveBeenCalledWith('file-1');
    expect(result.download_url).toBe('/api/files/file-1/content?sig=d');
    expect(api.deleteFile).not.toHaveBeenCalled();
  });

  it('retries a dropped part and then succeeds', async () => {
    api.createUpload.mockResolvedValue(reservation(2));
    FakeXHR.plan = [{ status: 200 }, { network: true }, { status: 503 }, { status: 200 }];
    await uploadFile(fileOf(MB + 10), noWait);
    expect(FakeXHR.sent.map(part => part.url.match(/parts\/(\d)/)[1])).toEqual(['0', '1', '1', '1']);
    expect(api.completeUpload).toHaveBeenCalled();
    expect(api.deleteFile).not.toHaveBeenCalled();
  });

  it('waits 1, 2 and 4 seconds between attempts by default', async () => {
    vi.useFakeTimers();
    try {
      api.createUpload.mockResolvedValue(reservation(1));
      FakeXHR.plan = [{ network: true }, { network: true }, { network: true }, { network: true }];
      const attempt = uploadFile(fileOf(10)).catch(error => error);
      await vi.advanceTimersByTimeAsync(1000);
      expect(FakeXHR.sent).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(FakeXHR.sent).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(4000);
      expect(FakeXHR.sent).toHaveLength(4);
      expect((await attempt).message).toMatch(/connection dropped/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cleans up the reservation and shows the server message when a part is refused', async () => {
    api.createUpload.mockResolvedValue(reservation(2));
    FakeXHR.plan = [{ status: 200 }, { status: 403, body: { message: 'This upload link is not valid or has expired. Start the upload again.' } }];
    await expect(uploadFile(fileOf(MB + 10), noWait)).rejects.toThrow('This upload link is not valid or has expired. Start the upload again.');
    expect(FakeXHR.sent).toHaveLength(2); // a 403 is not retried
    expect(api.completeUpload).not.toHaveBeenCalled();
    expect(api.deleteFile).toHaveBeenCalledWith('file-1');
  });

  it('gives up after three retries and deletes the partial upload', async () => {
    api.createUpload.mockResolvedValue(reservation(1));
    FakeXHR.plan = [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }];
    await expect(uploadFile(fileOf(10), noWait)).rejects.toThrow('Upload failed (500).');
    expect(FakeXHR.sent).toHaveLength(4);
    expect(api.deleteFile).toHaveBeenCalledWith('file-1');
  });

  it('cleans up when the server rejects the finished file', async () => {
    api.createUpload.mockResolvedValue(reservation(1));
    api.completeUpload.mockResolvedValue({ success: false, message: 'Upload incomplete (0 of 1 parts).' });
    await expect(uploadFile(fileOf(10), noWait)).rejects.toThrow('Upload incomplete (0 of 1 parts).');
    expect(api.deleteFile).toHaveBeenCalledWith('file-1');
  });

  it('stops when the upload is cancelled', async () => {
    api.createUpload.mockResolvedValue(reservation(1));
    const controller = new AbortController();
    controller.abort();
    await expect(uploadFile(fileOf(10), { signal: controller.signal, ...noWait })).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeXHR.sent).toHaveLength(0);
    expect(api.deleteFile).toHaveBeenCalledWith('file-1');
  });

  it('shows the server message when the upload cannot even start', async () => {
    api.createUpload.mockRejectedValue(new Error('Files must be 10 MB or smaller.'));
    await expect(uploadFile(fileOf(10), noWait)).rejects.toThrow('Files must be 10 MB or smaller.');
    expect(api.deleteFile).not.toHaveBeenCalled();
  });

  it('checks size and type against the known limits before contacting the server', async () => {
    const usage = { used: 0, quota: 50 * MB, max_file: 10 * MB, allowed_extensions: ['.pdf'] };
    await expect(uploadFile(new File(['x'], 'virus.exe'), { usage })).rejects.toThrow('Unsupported file type. Allowed: .pdf');
    const big = fileOf(10);
    Object.defineProperty(big, 'size', { value: 11 * MB });
    await expect(uploadFile(big, { usage })).rejects.toThrow('Files must be 10 MB or smaller.');
    await expect(uploadFile(fileOf(0), { usage })).rejects.toThrow('empty');
    expect(api.createUpload).not.toHaveBeenCalled();
  });
});

describe('checkFile', () => {
  it('warns when the file would not fit the remaining space', () => {
    const usage = { used: 49 * MB, quota: 50 * MB, max_file: 10 * MB, allowed_extensions: ['.pdf'] };
    const file = fileOf(10);
    Object.defineProperty(file, 'size', { value: 2 * MB });
    expect(checkFile(file, usage)).toBe("You've used 49 MB of 50 MB. Delete files in My files to make room.");
    expect(checkFile(fileOf(100), usage)).toBe('');
    expect(checkFile(fileOf(100), undefined)).toBe('');
  });
});

describe('formatBytes', () => {
  it('uses KB, MB and GB', () => {
    expect([0, 20 * 1024, 3 * MB, 1.5 * MB, 1024 * MB, 3.5 * 1024 * MB].map(formatBytes)).toEqual(['0 KB', '20 KB', '3 MB', '1.5 MB', '1 GB', '3.5 GB']);
  });
});
