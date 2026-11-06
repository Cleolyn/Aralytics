import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFile, renderPage } from '../../test/render';
import MyFilesPage from '../MyFilesPage';
import { api } from '../../services/api';
import { uploadFile } from '../../utils/upload';

vi.mock('../../services/api', () => ({ api: { listMyFiles: vi.fn(), deleteFile: vi.fn() } }));
vi.mock('../../utils/upload', async importOriginal => ({ ...(await importOriginal()), uploadFile: vi.fn() }));

const MB = 1024 * 1024;
const usage = { used: 120 * MB, quota: 1024 * MB, max_file: 15 * MB, allowed_extensions: ['.pdf', '.docx', '.png'] };
const files = [
  { id: 'f1', name: 'Lesson_Plan.pdf', size: 3 * MB, created_at: '2026-11-01 09:00:00', download_url: '/api/files/f1/content?sig=a', purpose: 'personal' },
  { id: 'f2', name: 'notes.docx', size: 20 * 1024, created_at: '2026-11-02 09:00:00', download_url: '/api/files/f2/content?sig=b', purpose: 'personal' }
];
const rowOf = text => screen.getByText(text).closest('tr');

beforeEach(() => {
  vi.clearAllMocks();
  api.listMyFiles.mockResolvedValue({ success: true, files, usage });
  api.deleteFile.mockResolvedValue({ success: true });
  uploadFile.mockResolvedValue({ id: 'f3', name: 'new.pdf' });
});

describe('MyFilesPage', () => {
  it('shows the usage meter and the file list', async () => {
    renderPage(<MyFilesPage />);
    expect(await screen.findByText('Lesson Plan.pdf')).toBeInTheDocument();
    expect(api.listMyFiles).toHaveBeenCalledWith('personal');
    expect(screen.getByRole('heading', { name: '120 MB of 1 GB' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Storage used' })).toHaveAttribute('aria-valuenow', '12');
    expect(screen.getByText('Each file can be up to 15 MB.')).toBeInTheDocument();
    const row = within(rowOf('Lesson Plan.pdf'));
    expect(row.getByText('3 MB')).toBeInTheDocument();
    expect(row.getByRole('link', { name: /Download/ })).toHaveAttribute('href', '/api/files/f1/content?sig=a');
    expect(within(rowOf('notes.docx')).getByText('20 KB')).toBeInTheDocument();
  });

  it('asks for confirmation before deleting a file', async () => {
    const { user } = renderPage(<MyFilesPage />);
    await screen.findByText('Lesson Plan.pdf');
    await user.click(within(rowOf('Lesson Plan.pdf')).getByRole('button', { name: /Delete/ }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this file?' });
    expect(api.deleteFile).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Keep file' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.deleteFile).not.toHaveBeenCalled();

    await user.click(within(rowOf('Lesson Plan.pdf')).getByRole('button', { name: /Delete/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete file' }));
    expect(api.deleteFile).toHaveBeenCalledWith('f1');
    expect(await screen.findByText('Deleted Lesson Plan.pdf.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(api.listMyFiles).toHaveBeenCalledTimes(2));
  });

  it('shows an empty state when there are no files', async () => {
    api.listMyFiles.mockResolvedValue({ success: true, files: [], usage: { ...usage, used: 0 } });
    renderPage(<MyFilesPage />);
    expect(await screen.findByRole('heading', { name: 'No files yet' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '0 KB of 1 GB' })).toBeInTheDocument();
  });

  it('shows an error with a retry when the list cannot load', async () => {
    api.listMyFiles.mockRejectedValueOnce(new Error('Could not reach the server.'));
    const { user } = renderPage(<MyFilesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Lesson Plan.pdf')).toBeInTheDocument();
  });

  it('uploads a file with the limits from the server and refreshes the list', async () => {
    const { user } = renderPage(<MyFilesPage />);
    await screen.findByText('Lesson Plan.pdf');
    const input = screen.getByLabelText('Drag and drop a file here, or click to choose');
    expect(input).toHaveAttribute('accept', '.pdf,.docx,.png');
    await user.upload(input, makeFile('new.pdf', 'bytes'));
    await waitFor(() => expect(uploadFile).toHaveBeenCalled());
    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'new.pdf' }), expect.objectContaining({ purpose: 'personal', usage }));
    expect(await screen.findByText('Uploaded new.pdf.')).toBeInTheDocument();
    await waitFor(() => expect(api.listMyFiles).toHaveBeenCalledTimes(2));
  });

  it.each([
    [413, "You've used 980 MB of 1 GB. Delete files in My files to make room."],
    [507, 'Aralytics storage is full (3.5 GB used). Uploads are paused — ask the administrator to free space.']
  ])('shows the server message when an upload is refused (%i)', async (_status, message) => {
    uploadFile.mockRejectedValue(new Error(message));
    const { user } = renderPage(<MyFilesPage />);
    await screen.findByText('Lesson Plan.pdf');
    await user.upload(screen.getByLabelText('Drag and drop a file here, or click to choose'), makeFile('big.pdf', 'x'));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(api.listMyFiles).toHaveBeenCalledTimes(1);
  });

  it('shows the delete error inside the confirmation', async () => {
    api.deleteFile.mockRejectedValue(new Error('File not found.'));
    const { user } = renderPage(<MyFilesPage />);
    await screen.findByText('Lesson Plan.pdf');
    await user.click(within(rowOf('Lesson Plan.pdf')).getByRole('button', { name: /Delete/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete file' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('File not found.');
  });
});
