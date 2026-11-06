import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage } from '../../test/render';
import AnnouncementsPage from '../AnnouncementsPage';
import StudentDashboard from '../StudentDashboard';
import { api } from '../../services/api';

const auth = { user: { id: 'u1', role: 'TEACHER', first_name: 'Ana' } };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../hooks/useLearnerData', () => ({
  default: () => ({ data: { quizzes: [], tasks: [], materials: [], logs: [], interventions: [], warnings: [], activities: [] }, loading: false, error: '', refresh: vi.fn() })
}));
vi.mock('../../services/api', () => ({
  api: {
    getAnnouncements: vi.fn(), createAnnouncement: vi.fn(), updateAnnouncement: vi.fn(), deleteAnnouncement: vi.fn(),
    markAnnouncementRead: vi.fn(), markAllAnnouncementsRead: vi.fn(), listMyFiles: vi.fn()
  }
}));

const post = (over = {}) => ({
  id: 'a1', title: 'Quiz on Friday', body: 'Review chapter 3.', pinned: false, created_at: '2026-11-02 09:00:00',
  updated_at: null, teacher_name: 'Ana Cruz', attachment: null, read: false, ...over
});
const feed = (announcements, unread_count = announcements.filter(a => !a.read).length) => ({ success: true, announcements, unread_count });

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: 'u1', role: 'TEACHER', first_name: 'Ana' };
  api.getAnnouncements.mockResolvedValue(feed([post()]));
  api.listMyFiles.mockResolvedValue({ success: true, files: [{ id: 'f1', name: 'Schedule.pdf' }] });
  api.createAnnouncement.mockResolvedValue({ success: true, announcement: post() });
  api.updateAnnouncement.mockResolvedValue({ success: true, announcement: post() });
  api.deleteAnnouncement.mockResolvedValue({ success: true, id: 'a1' });
  api.markAnnouncementRead.mockResolvedValue({ success: true, read_at: '2026-11-03 01:00:00' });
  api.markAllAnnouncementsRead.mockResolvedValue({ success: true, count: 2 });
});

describe('AnnouncementsPage as a teacher', () => {
  it('shows an empty state', async () => {
    api.getAnnouncements.mockResolvedValue(feed([]));
    renderPage(<AnnouncementsPage />);
    expect(await screen.findByText('No announcements yet')).toBeInTheDocument();
  });

  it('creates an announcement with a pin, an attachment and email', async () => {
    const { user } = renderPage(<AnnouncementsPage />);
    await screen.findByText('Quiz on Friday');
    await user.click(screen.getByRole('button', { name: /New announcement/ }));
    const dialog = screen.getByRole('dialog', { name: 'New announcement' });
    await user.type(within(dialog).getByLabelText('Title'), 'Field trip');
    await user.type(within(dialog).getByLabelText('Message'), 'Bring a hat.');
    await within(dialog).findByRole('option', { name: 'Schedule.pdf' });
    await user.selectOptions(within(dialog).getByLabelText(/Attach a file/), 'f1');
    await user.click(within(dialog).getByLabelText('Pin to the top'));
    await user.click(within(dialog).getByLabelText('Email my students'));
    await user.click(within(dialog).getByRole('button', { name: 'Post announcement' }));
    expect(api.createAnnouncement).toHaveBeenCalledWith({
      title: 'Field trip', body: 'Bring a hat.', pinned: true, file_id: 'f1', email_students: true
    });
    expect(await screen.findByText('Announcement posted.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(api.getAnnouncements).toHaveBeenCalledTimes(2));
  });

  it('edits an announcement with its current values', async () => {
    const { user } = renderPage(<AnnouncementsPage />);
    await screen.findByText('Quiz on Friday');
    await user.click(screen.getByRole('button', { name: /Edit/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit announcement' });
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Quiz on Friday');
    expect(within(dialog).queryByLabelText('Email my students')).not.toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Title'));
    await user.type(within(dialog).getByLabelText('Title'), 'Quiz moved');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(api.updateAnnouncement).toHaveBeenCalledWith('a1', { title: 'Quiz moved', body: 'Review chapter 3.', pinned: false, file_id: null });
    expect(await screen.findByText('Announcement updated.')).toBeInTheDocument();
  });

  it('shows the server message when saving fails', async () => {
    api.createAnnouncement.mockResolvedValue({ success: false, message: 'Choose one of your own uploaded files.' });
    const { user } = renderPage(<AnnouncementsPage />);
    await screen.findByText('Quiz on Friday');
    await user.click(screen.getByRole('button', { name: /New announcement/ }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Title'), 'T');
    await user.type(within(dialog).getByLabelText('Message'), 'B');
    await user.click(within(dialog).getByRole('button', { name: 'Post announcement' }));
    expect(await within(dialog).findByText('Choose one of your own uploaded files.')).toBeInTheDocument();
  });

  it('asks before deleting', async () => {
    const { user } = renderPage(<AnnouncementsPage />);
    await screen.findByText('Quiz on Friday');
    await user.click(screen.getByRole('button', { name: /Delete/ }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this announcement?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(api.deleteAnnouncement).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Delete/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete announcement' }));
    expect(api.deleteAnnouncement).toHaveBeenCalledWith('a1');
    expect(await screen.findByText('Announcement deleted.')).toBeInTheDocument();
  });
});

describe('AnnouncementsPage as a student', () => {
  beforeEach(() => { auth.user = { id: 's1', role: 'STUDENT', first_name: 'Ben' }; });

  it('marks a post as read when it is opened and shows the attachment', async () => {
    const attachment = { id: 'f1', name: 'Schedule.pdf', size: 2048, content_type: 'application/pdf', download_url: '/api/files/f1/content?sig=x' };
    api.getAnnouncements.mockResolvedValue(feed([post({ attachment, pinned: true })]));
    const { user } = renderPage(<AnnouncementsPage />);
    expect(await screen.findByText('New')).toBeInTheDocument();
    expect(screen.getByText('1 unread announcement')).toBeInTheDocument();
    expect(screen.queryByText('Review chapter 3.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quiz on Friday' }));
    expect(screen.getByText('Review chapter 3.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Schedule\.pdf/ })).toHaveAttribute('href', '/api/files/f1/content?sig=x');
    expect(api.markAnnouncementRead).toHaveBeenCalledWith('a1');
    await waitFor(() => expect(api.getAnnouncements).toHaveBeenCalledTimes(2));
  });

  it('does not mark an already-read post again', async () => {
    api.getAnnouncements.mockResolvedValue(feed([post({ read: true })]));
    const { user } = renderPage(<AnnouncementsPage />);
    await user.click(await screen.findByRole('button', { name: 'Quiz on Friday' }));
    expect(api.markAnnouncementRead).not.toHaveBeenCalled();
    expect(screen.queryByText('New')).not.toBeInTheDocument();
  });

  it('marks everything as read', async () => {
    api.getAnnouncements.mockResolvedValue(feed([post(), post({ id: 'a2', title: 'Second' })]));
    const { user } = renderPage(<AnnouncementsPage />);
    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    expect(api.markAllAnnouncementsRead).toHaveBeenCalled();
    expect(await screen.findByText('All announcements marked as read.')).toBeInTheDocument();
  });
});

describe('StudentDashboard announcements widget', () => {
  beforeEach(() => { auth.user = { id: 's1', role: 'STUDENT', first_name: 'Ben' }; });

  it('lists the latest three with New badges', async () => {
    api.getAnnouncements.mockResolvedValue(feed([post(), post({ id: 'a2', title: 'Old news', read: true }), post({ id: 'a3', title: 'Third' })], 2));
    renderPage(<StudentDashboard />);
    const widget = (await screen.findByRole('heading', { name: 'Class announcements' })).closest('section');
    expect(api.getAnnouncements).toHaveBeenCalledWith({ limit: 3 });
    expect(within(widget).getByText('Quiz on Friday')).toBeInTheDocument();
    expect(within(widget).getAllByText('New')).toHaveLength(2);
    expect(within(widget).getByRole('link', { name: /Read 2 new/ })).toHaveAttribute('href', '/student/announcements');
  });

  it('stays out of the way when announcements cannot load', async () => {
    api.getAnnouncements.mockRejectedValue(new Error('offline'));
    renderPage(<StudentDashboard />);
    await screen.findByText('Your progress');
    expect(screen.queryByRole('heading', { name: 'Class announcements' })).not.toBeInTheDocument();
  });
});
