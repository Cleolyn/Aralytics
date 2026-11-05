import React from 'react';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { currentLocation, renderPage } from '../test/render';
import ProtectedRoute from './ProtectedRoute';

const auth = vi.hoisted(() => ({ value: null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('./iso/IsoLoader', () => ({ default: ({ children }) => <p>{children}</p> }));

const as = user => { auth.value = { user, loading: false }; };
const guarded = role => renderPage(<ProtectedRoute role={role}><h1>Secret page</h1></ProtectedRoute>, { route: '/guarded', path: '/guarded' });

describe('ProtectedRoute', () => {
  it.each([
    ['ADMIN', 'ADMIN'], ['TEACHER', 'TEACHER'], ['STUDENT', 'STUDENT']
  ])('lets a %s into a %s page', (userRole, pageRole) => {
    as({ role: userRole, email_verified: true, enrollment_status: 'APPROVED' });
    guarded(pageRole);
    expect(screen.getByRole('heading', { name: 'Secret page' })).toBeInTheDocument();
  });

  it.each([
    ['ADMIN', 'TEACHER', '/admin'], ['ADMIN', 'STUDENT', '/admin'],
    ['TEACHER', 'ADMIN', '/teacher/dashboard'], ['STUDENT', 'ADMIN', '/student/dashboard'], ['STUDENT', 'TEACHER', '/student/dashboard']
  ])('sends a %s away from a %s page to %s', (userRole, pageRole, home) => {
    as({ role: userRole, email_verified: true, enrollment_status: 'APPROVED' });
    guarded(pageRole);
    expect(screen.queryByRole('heading', { name: 'Secret page' })).not.toBeInTheDocument();
    expect(currentLocation()).toBe(home);
  });

  it('sends signed-out visitors to sign in', () => {
    as(null);
    guarded('ADMIN');
    expect(currentLocation()).toBe('/login');
  });

  it('sends instructor applicants back to their application', () => {
    as({ role: 'STUDENT', email_verified: true, enrollment_status: 'NOT_ENROLLED', instructor_application: { status: 'PENDING' } });
    guarded('TEACHER');
    expect(currentLocation()).toBe('/instructor/apply');
  });

  it('sends students waiting for class approval to onboarding', () => {
    as({ role: 'STUDENT', email_verified: true, enrollment_status: 'PENDING' });
    guarded('STUDENT');
    expect(currentLocation()).toBe('/onboarding');
  });
});
