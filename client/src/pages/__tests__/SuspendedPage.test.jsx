import React from 'react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentLocation, renderPage } from '../../test/render';
import SuspendedPage from '../SuspendedPage';

const auth = vi.hoisted(() => ({ value: null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth.value }));

const suspended = { id: 'u1', email: 'juan@school.ph', role: 'STUDENT', email_verified: true, status: 'SUSPENDED', suspended_reason: 'Shared a login' };
const setAuth = (user, extra = {}) => { auth.value = { user, loading: false, refreshing: false, logout: vi.fn(), refreshUser: vi.fn(), ...extra }; };
const show = () => renderPage(<SuspendedPage />, { route: '/suspended', path: '/suspended' });

describe('SuspendedPage', () => {
  beforeEach(() => setAuth(suspended));

  it('explains the suspension with its reason', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Your account is suspended' })).toBeInTheDocument();
    expect(screen.getByText('Shared a login')).toBeInTheDocument();
    expect(screen.getByText('Contact your school administrator to ask about restoring access.')).toBeInTheDocument();
    expect(screen.getByText('Signed in as juan@school.ph')).toBeInTheDocument();
  });

  it('works without a reason', () => {
    setAuth({ ...suspended, suspended_reason: null });
    show();
    expect(screen.queryByText(/Reason:/)).not.toBeInTheDocument();
  });

  it('checks again and logs out', async () => {
    const { user } = show();
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(auth.value.refreshUser).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(auth.value.logout).toHaveBeenCalledTimes(1);
  });

  it('disables checking while a refresh is running', () => {
    setAuth(suspended, { refreshing: true });
    show();
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
  });

  it('sends restored accounts back to their home', () => {
    setAuth({ ...suspended, status: 'ACTIVE', enrollment_status: 'APPROVED' });
    show();
    expect(currentLocation()).toBe('/student/dashboard');
  });

  it('sends signed-out visitors to sign in', () => {
    setAuth(null);
    show();
    expect(currentLocation()).toBe('/login');
  });
});
