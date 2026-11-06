import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentLocation, renderPage } from '../../test/render';
import AdminDashboard from '../AdminDashboard';
import { api } from '../../services/api';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1', role: 'ADMIN' } }) }));

vi.mock('../../services/api', () => ({
  api: {
    getAdminSummary: vi.fn(), getInstructorApplications: vi.fn(), reviewInstructorApplication: vi.fn(), getInstructors: vi.fn(),
    getAdminStorage: vi.fn(), purgeUserFiles: vi.fn(),
    getAdminUsers: vi.fn(), suspendUser: vi.fn(), unsuspendUser: vi.fn(), revokeInstructor: vi.fn(), deleteUser: vi.fn(), getAuditLog: vi.fn()
  }
}));

const pending = {
  user_id: 'u-maria', full_name: 'Maria_Santos', email: 'maria@school.ph', school: 'Ponce NHS', position: 'Teacher I',
  employee_id: 'EMP-1', mobile: '09171234567', message: 'AP10 adviser', status: 'PENDING', created_at: '2026-11-01 09:00:00'
};
const rejected = { ...pending, user_id: 'u-jose', full_name: 'Jose Cruz', email: 'jose@school.ph', status: 'REJECTED',
  reason: 'Use your DepEd ID.', reviewed_by_name: 'Eulyn Admin', reviewed_at: '2026-11-02 10:00:00' };

const rowOf = text => screen.getByText(text).closest('tr');
const MB = 1024 * 1024;
const storage = {
  success: true, used: 600 * MB, cap: 900 * MB, file_count: 12, by_purpose: {},
  shards: [{ shard: 1, used: 450 * MB, cap: 450 * MB }, { shard: 2, used: 150 * MB, cap: 450 * MB }],
  users: [
    { user_id: 't1', full_name: 'Ana Reyes', email: 'ana@school.ph', role: 'TEACHER', used: 500 * MB, quota: 1024 * MB, files: 9 },
    { user_id: 's1', full_name: 'Juan_Cruz', email: 'juan@school.ph', role: 'STUDENT', used: 40 * MB, quota: 50 * MB, files: 3 }
  ]
};

beforeEach(() => {
  api.getAdminSummary.mockResolvedValue({ success: true, summary: { pending: 1, approved: 0, rejected: 1, instructors: 2 } });
  api.getInstructorApplications.mockImplementation(async ({ status }) => ({
    success: true, applications: status === 'PENDING' ? [pending] : status === 'REJECTED' ? [rejected] : []
  }));
  api.getInstructors.mockResolvedValue({ success: true, instructors: [
    { id: 't1', full_name: 'Ana Reyes', email: 'ana@school.ph', school: 'Ponce NHS', position: 'Teacher III', approved_at: '2026-10-01 08:00:00', active_class_codes: 2, students: 31 },
    { id: 't2', full_name: '', first_name: 'Old', last_name: 'Teacher', email: 'old@school.ph', school: null, position: null, approved_at: null, active_class_codes: 0, students: 0 }
  ] });
  api.reviewInstructorApplication.mockResolvedValue({ success: true, application: { ...pending, status: 'APPROVED' } });
  api.getAdminStorage.mockResolvedValue(storage);
  api.purgeUserFiles.mockResolvedValue({ success: true, removed: 3 });
  api.getAdminUsers.mockResolvedValue({ success: true, total: 4, users: people });
  api.suspendUser.mockResolvedValue({ success: true, user: {} });
  api.unsuspendUser.mockResolvedValue({ success: true, user: {} });
  api.revokeInstructor.mockResolvedValue({ success: true, closed_invitations: 2, released_students: 5 });
  api.deleteUser.mockResolvedValue({ success: true, id: 's1', removed_files: 0 });
  api.getAuditLog.mockResolvedValue({ success: true, entries: [], next_before: null });
});

const person = (id, name, role, extra = {}) => ({ id, email: `${id}@school.ph`, full_name: name, role, status: 'ACTIVE',
  suspended_reason: null, enrollment_status: null, adviser_name: null, created_at: '2026-10-01 08:00:00', ...extra });
const people = [
  person('admin-1', 'Eulyn Admin', 'ADMIN'),
  person('t1', 'Ana Reyes', 'TEACHER'),
  person('s1', 'Juan Cruz', 'STUDENT', { enrollment_status: 'APPROVED', adviser_name: 'Ana Reyes' }),
  person('s2', 'Mara Lim', 'STUDENT', { status: 'SUSPENDED', suspended_reason: 'Shared account' })
];

describe('AdminDashboard people', () => {
  it('lists people with the right actions per row and none for yourself', async () => {
    renderPage(<AdminDashboard />, { route: '/admin?tab=people' });
    expect(await screen.findByText('Juan Cruz')).toBeInTheDocument();
    expect(api.getAdminUsers).toHaveBeenCalledWith({});
    expect(api.getInstructorApplications).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'People' })).toHaveAttribute('aria-pressed', 'true');
    const self = within(rowOf('Eulyn Admin (you)'));
    expect(self.queryByRole('button')).not.toBeInTheDocument();
    const teacher = within(rowOf('Ana Reyes'));
    expect(teacher.getByRole('button', { name: 'Revoke instructor' })).toBeInTheDocument();
    expect(teacher.getByRole('button', { name: 'Suspend' })).toBeInTheDocument();
    expect(teacher.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    const student = within(rowOf('Juan Cruz'));
    expect(student.queryByRole('button', { name: 'Revoke instructor' })).not.toBeInTheDocument();
    expect(student.getByText('Adviser: Ana Reyes')).toBeInTheDocument();
    const suspended = within(rowOf('Mara Lim'));
    expect(suspended.getByText('Shared account')).toBeInTheDocument();
    expect(suspended.getByRole('button', { name: 'Unsuspend' })).toBeInTheDocument();
    expect(suspended.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
  });

  it('searches and filters', async () => {
    const { user } = renderPage(<AdminDashboard />, { route: '/admin?tab=people' });
    await screen.findByText('Juan Cruz');
    await user.type(screen.getByLabelText('Search people'), 'juan');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(api.getAdminUsers).toHaveBeenLastCalledWith({ q: 'juan' }));
    await user.selectOptions(screen.getByLabelText('Role'), 'STUDENT');
    await waitFor(() => expect(api.getAdminUsers).toHaveBeenLastCalledWith({ q: 'juan', role: 'STUDENT' }));
    await user.selectOptions(screen.getByLabelText('Status'), 'SUSPENDED');
    await waitFor(() => expect(api.getAdminUsers).toHaveBeenLastCalledWith({ q: 'juan', role: 'STUDENT', status: 'SUSPENDED' }));
  });

  it('suspends an account only with a reason', async () => {
    const { user } = renderPage(<AdminDashboard />, { route: '/admin?tab=people' });
    await screen.findByText('Juan Cruz');
    await user.click(within(rowOf('Juan Cruz')).getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog', { name: 'Suspend Juan Cruz' });
    expect(within(dialog).getByRole('button', { name: 'Suspend account' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason for suspension'), 'Shared a login');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend account' }));
    expect(api.suspendUser).toHaveBeenCalledWith('s1', { reason: 'Shared a login' });
    expect(await screen.findByText('Juan Cruz is suspended.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(api.getAdminUsers).toHaveBeenCalledTimes(2));
  });

  it('unsuspends straight from the row', async () => {
    const { user } = renderPage(<AdminDashboard />, { route: '/admin?tab=people' });
    await screen.findByText('Mara Lim');
    await user.click(within(rowOf('Mara Lim')).getByRole('button', { name: 'Unsuspend' }));
    expect(api.unsuspendUser).toHaveBeenCalledWith('s2');
    expect(await screen.findByText('Mara Lim can sign in again.')).toBeInTheDocument();
  });

  it('revokes instructor access with a reason and reports what changed', async () => {
    const { user } = renderPage(<AdminDashboard />, { route: '/admin?tab=people' });
    await screen.findByText('Ana Reyes');
    await user.click(within(rowOf('Ana Reyes')).getByRole('button', { name: 'Revoke instructor' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Reason for revoking access'), 'Left the school');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke instructor access' }));
    expect(api.revokeInstructor).toHaveBeenCalledWith('t1', { reason: 'Left the school' });
    expect(await screen.findByText(/2 class codes closed, 5 students released/)).toBeInTheDocument();
  });

  it('deletes an account only after typing its email', async () => {
    const { user } = renderPage(<AdminDashboard />, { route: '/admin?tab=people' });
    await screen.findByText('Juan Cruz');
    await user.click(within(rowOf('Juan Cruz')).getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Juan Cruz?' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Type the email address to confirm'), 's1@school');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Type the email address to confirm'), '.PH');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(api.deleteUser).toHaveBeenCalledWith('s1', { confirm_email: 's1@school.PH' });
    expect(await screen.findByText('Deleted the account for s1@school.ph.')).toBeInTheDocument();
  });

  it('shows the server message when deletion is refused', async () => {
    api.deleteUser.mockResolvedValue({ success: false, message: 'This instructor still owns lessons, quizzes, tasks, or classes with students.' });
    const { user } = renderPage(<AdminDashboard />, { route: '/admin?tab=people' });
    await screen.findByText('Ana Reyes');
    await user.click(within(rowOf('Ana Reyes')).getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Type the email address to confirm'), 't1@school.ph');
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('still owns lessons');
  });

  it('pages through large directories', async () => {
    api.getAdminUsers.mockResolvedValue({ success: true, total: 120, users: people });
    const { user } = renderPage(<AdminDashboard />, { route: '/admin?tab=people' });
    await screen.findByText('Juan Cruz');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(api.getAdminUsers).toHaveBeenLastCalledWith({ page: 2 }));
  });

  it('shows an empty state when nobody matches', async () => {
    api.getAdminUsers.mockResolvedValue({ success: true, total: 0, users: [] });
    renderPage(<AdminDashboard />, { route: '/admin?tab=people' });
    expect(await screen.findByRole('heading', { name: 'No people found' })).toBeInTheDocument();
  });
});

describe('AdminDashboard activity', () => {
  const entry = (id, action, extra = {}) => ({ id, action, actor_email: 'admin@school.ph', target_type: 'USER', target_id: 'x',
    target_label: 'juan@school.ph', details: null, created_at: '2026-11-03 04:00:00', ...extra });

  it('shows the audit log and loads more', async () => {
    api.getAuditLog.mockResolvedValueOnce({ success: true, next_before: 'cursor-1', entries: [
      entry('a1', 'ACCOUNT_SUSPENDED', { details: { reason: 'Shared a login' } }), entry('a2', 'ACCOUNT_DELETED', { details: { removed_files: 2 } })
    ] }).mockResolvedValueOnce({ success: true, next_before: null, entries: [entry('a3', 'APPLICATION_APPROVED', { target_label: 'maria@school.ph' })] });
    const { user } = renderPage(<AdminDashboard />, { route: '/admin?tab=activity' });
    expect(await screen.findByText('Suspended account')).toBeInTheDocument();
    expect(api.getInstructorApplications).not.toHaveBeenCalled();
    expect(screen.getByText('Reason: Shared a login')).toBeInTheDocument();
    expect(screen.getByText('2 files removed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(api.getAuditLog).toHaveBeenLastCalledWith({ limit: 25, before: 'cursor-1' });
    expect(await screen.findByText('Approved instructor application')).toBeInTheDocument();
    expect(screen.getByText('Suspended account')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    renderPage(<AdminDashboard />, { route: '/admin?tab=activity' });
    expect(await screen.findByRole('heading', { name: 'No activity yet' })).toBeInTheDocument();
  });
});

describe('AdminDashboard', () => {
  it('shows counts and pending applications by default', async () => {
    renderPage(<AdminDashboard />, { route: '/admin' });
    expect(await screen.findByText('Maria Santos')).toBeInTheDocument();
    expect(api.getInstructorApplications).toHaveBeenCalledWith({ status: 'PENDING' });
    expect(screen.getByRole('button', { name: 'Waiting for review (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Instructors (2)' })).toBeInTheDocument();
    const row = within(rowOf('Maria Santos'));
    expect(row.getByText('maria@school.ph')).toBeInTheDocument();
    expect(row.getByText('Teacher I')).toBeInTheDocument();
    expect(row.getByText('Waiting for review')).toBeInTheDocument();
  });

  it('approves an application after reviewing its details', async () => {
    const { user } = renderPage(<AdminDashboard />, { route: '/admin' });
    await screen.findByText('Maria Santos');
    await user.click(within(rowOf('Maria Santos')).getByRole('button', { name: /Review/ }));
    const dialog = screen.getByRole('dialog', { name: 'Instructor application: Maria Santos' });
    for (const text of ['maria@school.ph', 'Ponce NHS', 'EMP-1', '09171234567', 'AP10 adviser']) {
      expect(within(dialog).getByText(text)).toBeInTheDocument();
    }
    await user.click(within(dialog).getByRole('button', { name: 'Approve as instructor' }));
    expect(api.reviewInstructorApplication).toHaveBeenCalledWith('u-maria', { status: 'APPROVED', reason: undefined });
    expect(await screen.findByText('Maria Santos is now an instructor.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(api.getAdminSummary).toHaveBeenCalledTimes(2));
    expect(api.getInstructorApplications).toHaveBeenCalledTimes(2);
  });

  it('requires a reason to return an application', async () => {
    const { user } = renderPage(<AdminDashboard />, { route: '/admin' });
    await screen.findByText('Maria Santos');
    await user.click(within(rowOf('Maria Santos')).getByRole('button', { name: /Review/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Return with a reason' }));
    expect(within(dialog).queryByRole('button', { name: 'Approve as instructor' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Return application' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason for the applicant'), 'Please add your employee ID.');
    await user.click(within(dialog).getByRole('button', { name: 'Return application' }));
    expect(api.reviewInstructorApplication).toHaveBeenCalledWith('u-maria', { status: 'REJECTED', reason: 'Please add your employee ID.' });
    expect(await screen.findByText('Application returned to Maria Santos with your reason.')).toBeInTheDocument();
  });

  it('keeps the dialog open and shows the error when a review fails', async () => {
    api.reviewInstructorApplication.mockResolvedValue({ success: false, message: 'This application has already been reviewed.' });
    const { user } = renderPage(<AdminDashboard />, { route: '/admin' });
    await screen.findByText('Maria Santos');
    await user.click(within(rowOf('Maria Santos')).getByRole('button', { name: /Review/ }));
    await user.click(screen.getByRole('button', { name: 'Approve as instructor' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('This application has already been reviewed.');
  });

  it('shows returned applications with the review outcome, read-only', async () => {
    const { user } = renderPage(<AdminDashboard />, { route: '/admin' });
    await screen.findByText('Maria Santos');
    await user.click(screen.getByRole('button', { name: 'Returned (1)' }));
    expect(currentLocation()).toBe('/admin?tab=rejected');
    expect(await screen.findByText('Jose Cruz')).toBeInTheDocument();
    expect(api.getInstructorApplications).toHaveBeenLastCalledWith({ status: 'REJECTED' });
    await user.click(within(rowOf('Jose Cruz')).getByRole('button', { name: /View/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Use your DepEd ID.')).toBeInTheDocument();
    expect(within(dialog).getByText(/^Eulyn Admin · /)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Approve as instructor' })).not.toBeInTheDocument();
  });

  it('lists current instructors', async () => {
    renderPage(<AdminDashboard />, { route: '/admin?tab=instructors' });
    expect(await screen.findByText('Ana Reyes')).toBeInTheDocument();
    expect(api.getInstructors).toHaveBeenCalled();
    const ana = within(rowOf('Ana Reyes'));
    expect(ana.getByText('31')).toBeInTheDocument();
    expect(ana.getByText('2')).toBeInTheDocument();
    const legacy = within(rowOf('Old Teacher'));
    expect(legacy.getByText('Not recorded')).toBeInTheDocument();
    expect(legacy.getByText('Before admin review')).toBeInTheDocument();
  });

  it('shows storage use by site, shard and person (the tab has no count)', async () => {
    renderPage(<AdminDashboard />, { route: '/admin?tab=storage' });
    expect(await screen.findByText('Ana Reyes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Storage' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('progressbar', { name: 'All files' })).toHaveAttribute('aria-valuenow', '67');
    expect(screen.getByText((_, el) => el.tagName === 'P' && el.textContent === 'All files · 600 MB of 900 MB')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Shard 1' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar', { name: 'Shard 2' })).toHaveAttribute('aria-valuenow', '33');
    const ana = within(rowOf('Ana Reyes'));
    expect(ana.getByText('500 MB')).toBeInTheDocument();
    expect(ana.getByText('of 1 GB')).toBeInTheDocument();
    expect(within(rowOf('Juan Cruz')).getByText('Student')).toBeInTheDocument();
  });

  it('deletes a person’s files only after confirmation', async () => {
    const { user } = renderPage(<AdminDashboard />, { route: '/admin?tab=storage' });
    await screen.findByText('Juan Cruz');
    await user.click(within(rowOf('Juan Cruz')).getByRole('button', { name: 'Delete user’s files' }));
    const dialog = screen.getByRole('dialog');
    expect(api.purgeUserFiles).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.purgeUserFiles).not.toHaveBeenCalled();

    await user.click(within(rowOf('Juan Cruz')).getByRole('button', { name: 'Delete user’s files' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete all files' }));
    expect(api.purgeUserFiles).toHaveBeenCalledWith('s1');
    expect(await screen.findByText('Deleted the files owned by Juan Cruz.')).toBeInTheDocument();
    await waitFor(() => expect(api.getAdminStorage).toHaveBeenCalledTimes(2));
  });

  it('shows an empty storage state', async () => {
    api.getAdminStorage.mockResolvedValue({ ...storage, used: 0, file_count: 0, users: [] });
    renderPage(<AdminDashboard />, { route: '/admin?tab=storage' });
    expect(await screen.findByRole('heading', { name: 'No files stored yet' })).toBeInTheDocument();
  });

  it('shows an empty state when nothing is waiting', async () => {
    api.getInstructorApplications.mockResolvedValue({ success: true, applications: [] });
    renderPage(<AdminDashboard />, { route: '/admin' });
    expect(await screen.findByRole('heading', { name: 'No applications waiting' })).toBeInTheDocument();
  });
});
