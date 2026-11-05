import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentLocation, renderPage } from '../../test/render';
import AdminDashboard from '../AdminDashboard';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({
  api: { getAdminSummary: vi.fn(), getInstructorApplications: vi.fn(), reviewInstructorApplication: vi.fn(), getInstructors: vi.fn() }
}));

const pending = {
  user_id: 'u-maria', full_name: 'Maria_Santos', email: 'maria@school.ph', school: 'Ponce NHS', position: 'Teacher I',
  employee_id: 'EMP-1', mobile: '09171234567', message: 'AP10 adviser', status: 'PENDING', created_at: '2026-11-01 09:00:00'
};
const rejected = { ...pending, user_id: 'u-jose', full_name: 'Jose Cruz', email: 'jose@school.ph', status: 'REJECTED',
  reason: 'Use your DepEd ID.', reviewed_by_name: 'Eulyn Admin', reviewed_at: '2026-11-02 10:00:00' };

const rowOf = text => screen.getByText(text).closest('tr');

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

  it('shows an empty state when nothing is waiting', async () => {
    api.getInstructorApplications.mockResolvedValue({ success: true, applications: [] });
    renderPage(<AdminDashboard />, { route: '/admin' });
    expect(await screen.findByRole('heading', { name: 'No applications waiting' })).toBeInTheDocument();
  });
});
