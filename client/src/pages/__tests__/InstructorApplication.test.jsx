import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentLocation, renderPage } from '../../test/render';
import InstructorApplicationPage from '../InstructorApplication';
import { api } from '../../services/api';

const auth = vi.hoisted(() => ({ value: null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('../../components/PublicLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../services/api', () => ({ api: { getMyInstructorApplication: vi.fn(), submitInstructorApplication: vi.fn() } }));

const refreshUser = vi.fn();
const student = (overrides = {}) => ({
  user: { id: 'u1', role: 'STUDENT', email: 'maria@school.ph', email_verified: true, full_name: 'Maria Santos', enrollment_status: 'NOT_ENROLLED', ...overrides },
  loading: false, refreshing: false, logout: vi.fn(), refreshUser
});

async function fillRequired(user) {
  await user.type(screen.getByLabelText('School'), 'Ponce NHS');
  await user.type(screen.getByLabelText('Position'), 'Teacher I');
  await user.type(screen.getByLabelText('Mobile number'), '09171234567');
}

beforeEach(() => {
  refreshUser.mockReset();
  auth.value = student();
  api.getMyInstructorApplication.mockResolvedValue({ success: true, application: null });
  api.submitInstructorApplication.mockResolvedValue({ success: true, application: { status: 'PENDING' } });
});

describe('InstructorApplicationPage', () => {
  it('submits a new application with the account name pre-filled', async () => {
    const { user } = renderPage(<InstructorApplicationPage />, { route: '/instructor/apply' });
    expect(await screen.findByRole('heading', { name: 'Apply for instructor access' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Maria Santos');
    await fillRequired(user);
    await user.type(screen.getByLabelText('Employee ID (optional)'), 'EMP-1');
    await user.type(screen.getByLabelText('Note for the administrator (optional)'), 'AP10 adviser');
    await user.click(screen.getByRole('button', { name: 'Send application' }));

    expect(api.submitInstructorApplication).toHaveBeenCalledWith({
      full_name: 'Maria Santos', school: 'Ponce NHS', position: 'Teacher I', employee_id: 'EMP-1', mobile: '09171234567', message: 'AP10 adviser'
    });
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
    expect(api.getMyInstructorApplication).toHaveBeenCalledTimes(2);
  });

  it('shows the server’s validation message', async () => {
    api.submitInstructorApplication.mockResolvedValue({ success: false, message: 'Enter a Philippine mobile number starting with 09 or +639.' });
    const { user } = renderPage(<InstructorApplicationPage />);
    await screen.findByRole('heading', { name: 'Apply for instructor access' });
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a Philippine mobile number');
  });

  it('shows a pending application and checks its status', async () => {
    api.getMyInstructorApplication.mockResolvedValue({ success: true, application: {
      status: 'PENDING', full_name: 'Maria Santos', school: 'Ponce NHS', position: 'Teacher I', employee_id: null, created_at: '2026-11-01 09:00:00'
    } });
    const { user } = renderPage(<InstructorApplicationPage />);
    expect(await screen.findByRole('heading', { name: 'Waiting for administrator review' })).toBeInTheDocument();
    expect(screen.getByText('Ponce NHS')).toBeInTheDocument();
    expect(screen.queryByText('Employee ID')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send application' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check application status' }));
    expect(refreshUser).toHaveBeenCalled();
  });

  it('shows the reason for a returned application and pre-fills a resubmission', async () => {
    api.getMyInstructorApplication.mockResolvedValue({ success: true, application: {
      status: 'REJECTED', reason: 'Use your DepEd employee ID.', full_name: 'Maria Santos', school: 'Ponce NHS',
      position: 'Teacher I', employee_id: 'X', mobile: '09171234567', message: ''
    } });
    const { user } = renderPage(<InstructorApplicationPage />);
    expect(await screen.findByText('Use your DepEd employee ID.')).toBeInTheDocument();
    expect(screen.getByLabelText('School')).toHaveValue('Ponce NHS');
    await user.clear(screen.getByLabelText('Employee ID (optional)'));
    await user.type(screen.getByLabelText('Employee ID (optional)'), 'DEPED-4401');
    await user.click(screen.getByRole('button', { name: 'Send updated application' }));
    expect(api.submitInstructorApplication).toHaveBeenCalledWith(expect.objectContaining({ employee_id: 'DEPED-4401', school: 'Ponce NHS' }));
  });

  it('turns away accounts already enrolled as students', async () => {
    auth.value = student({ enrollment_status: 'APPROVED' });
    renderPage(<InstructorApplicationPage />);
    expect(await screen.findByRole('heading', { name: 'This is a student account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send application' })).not.toBeInTheDocument();
  });

  it.each([
    ['TEACHER', '/teacher/dashboard'],
    ['ADMIN', '/admin']
  ])('sends %s accounts to their workspace', (role, home) => {
    auth.value = student({ role });
    renderPage(<InstructorApplicationPage />, { route: '/instructor/apply', path: '/instructor/apply' });
    expect(currentLocation()).toBe(home);
    expect(api.getMyInstructorApplication).not.toHaveBeenCalled();
  });

  it('sends signed-out visitors to sign in', () => {
    auth.value = { user: null, loading: false };
    renderPage(<InstructorApplicationPage />, { route: '/instructor/apply', path: '/instructor/apply' });
    expect(currentLocation()).toBe('/login');
  });
});
