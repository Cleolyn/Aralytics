import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { base64, currentLocation, makeFile, renderPage } from '../../test/render';
import ActivitiesPage from '../ActivitiesPage';
import { api } from '../../services/api';
import useLearnerData from '../../hooks/useLearnerData';
import { activitiesFrom } from '../../utils/learning';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'stu-1' } }) }));
vi.mock('../../hooks/useLearnerData', () => ({ default: vi.fn() }));
vi.mock('../../services/api', () => ({
  api: { submitPerformanceTask: vi.fn(), getSubmissionFileUrl: url => (url ? `${url}?token=t` : null) }
}));

const quizzes = [
  { id: 'qz1', title: 'Quiz_Open', instructions: 'Answer well', due_date: '2026-11-01', total_points: 10, time_limit_minutes: 15 },
  { id: 'qz2', title: 'Quiz Done', due_date: '2026-11-03', total_points: 5, submission: { status: 'SUBMITTED' } }
];
const tasks = [
  { id: 'tk1', title: 'Hazard Map', instructions: 'Draw a map', rubric_criteria: 'Content 50%', due_date: '2026-11-02', total_points: 100 },
  { id: 'tk2', title: 'Photo Essay', instructions: 'Five photos', due_date: '2026-11-04', total_points: 50,
    my_submission: { status: 'GRADED', score: 45, feedback: 'Great work', file_name: 'essay.pdf', file_url: '/api/performance-tasks/files/e.pdf', submitted_at: '2026-10-30 09:00:00' } }
];

const refresh = vi.fn();
function learnerData(overrides = {}) {
  return { data: { activities: activitiesFrom(quizzes, tasks), warnings: [], ...overrides }, loading: false, error: '', refresh };
}
const listed = () => screen.queryAllByRole('row').slice(1).map(r => r.querySelector('strong').textContent);
const aside = () => within(screen.getByRole('complementary'));

beforeEach(() => {
  refresh.mockReset();
  useLearnerData.mockReturnValue(learnerData());
  api.submitPerformanceTask.mockResolvedValue({ success: true });
});

describe('ActivitiesPage', () => {
  it('lists activities by due date and shows the first one', () => {
    renderPage(<ActivitiesPage />, { route: '/student/activities' });
    expect(listed()).toEqual(['Quiz Open', 'Hazard Map', 'Quiz Done', 'Photo Essay']);
    expect(aside().getByRole('heading', { name: 'Quiz Open' })).toBeInTheDocument();
    expect(aside().getByText('Not started')).toBeInTheDocument();
    expect(aside().getByText('10 points · 15 minutes')).toBeInTheDocument();
    expect(aside().getByRole('button', { name: /Start quiz/ })).toBeEnabled();
  });

  it('filters by tab and search', async () => {
    const { user } = renderPage(<ActivitiesPage />, { route: '/student/activities' });
    await user.click(screen.getByRole('button', { name: 'Upcoming' }));
    expect(listed()).toEqual(['Quiz Open', 'Hazard Map']);
    await user.click(screen.getByRole('button', { name: 'Completed' }));
    expect(listed()).toEqual(['Quiz Done', 'Photo Essay']);
    await user.click(screen.getByRole('button', { name: 'Submitted' }));
    expect(screen.getByRole('heading', { name: 'You’re all caught up' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.type(screen.getByLabelText('Search activities'), 'photo');
    expect(listed()).toEqual(['Photo Essay']);
  });

  it('selects an activity through the URL and starts a quiz', async () => {
    const { user } = renderPage(<ActivitiesPage />, { route: '/student/activities?task=tk1' });
    expect(aside().getByRole('heading', { name: 'Hazard Map' })).toBeInTheDocument();
    expect(aside().getByText('Content 50%')).toBeInTheDocument();

    await user.click(within(screen.getByText('Quiz Open').closest('tr')).getByRole('button', { name: /Open/ }));
    expect(currentLocation()).toBe('/student/activities?quiz=qz1');
    await user.click(aside().getByRole('button', { name: /Start quiz/ }));
    expect(currentLocation()).toBe('/student/quizzes/qz1');
  });

  it('links finished quizzes to progress', () => {
    renderPage(<ActivitiesPage />, { route: '/student/activities?quiz=qz2' });
    expect(aside().getByRole('link', { name: /See your score/ })).toHaveAttribute('href', '/student/progress');
  });

  it('shows warnings with a retry action', async () => {
    useLearnerData.mockReturnValue(learnerData({ warnings: ['Could not load tasks.'] }));
    const { user } = renderPage(<ActivitiesPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load tasks.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows a graded submission with score and feedback', () => {
    renderPage(<ActivitiesPage />, { route: '/student/activities?task=tk2' });
    expect(aside().getByRole('heading', { name: 'Your submitted work' })).toBeInTheDocument();
    expect(aside().getByRole('link', { name: 'essay.pdf' })).toHaveAttribute('href', '/api/performance-tasks/files/e.pdf?token=t');
    expect(aside().getByText('45 / 50')).toBeInTheDocument();
    expect(aside().getByText('Great work')).toBeInTheDocument();
    expect(aside().getByText(/Sending a new file will reset your score/)).toBeInTheDocument();
  });
});

describe('ActivitiesPage — task submission', () => {
  const fileInput = () => aside().getByLabelText('Drag and drop your file here, or click to choose');

  it('rejects unsupported or oversized files', async () => {
    const { user } = renderPage(<ActivitiesPage />, { route: '/student/activities?task=tk1' });
    // Drag-and-drop bypasses the input's accept filter, so validation must catch it.
    fireEvent.drop(fileInput().closest('.upload-field'), { dataTransfer: { files: [makeFile('virus.exe', 'x')] } });
    expect(aside().getByRole('alert')).toHaveTextContent('Please choose a valid file (PDF, DOCX, PPTX, ZIP, MP4, PNG, or JPG) up to 5 MB.');
    expect(aside().getByRole('button', { name: /Submit work/ })).toBeDisabled();

    const big = makeFile('big.pdf', 'x');
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 });
    await user.upload(fileInput(), big);
    expect(aside().getByRole('alert')).toBeInTheDocument();
  });

  it('submits a valid file with the note', async () => {
    const { user } = renderPage(<ActivitiesPage />, { route: '/student/activities?task=tk1' });
    await user.upload(fileInput(), makeFile('map.pdf', 'hazard-map'));
    expect(aside().getByText(/map\.pdf \(0 KB\)/)).toBeInTheDocument();
    await user.type(aside().getByLabelText('Message for your teacher (optional)'), 'Here it is');
    await user.click(aside().getByRole('button', { name: /Submit work/ }));

    await waitFor(() => expect(api.submitPerformanceTask).toHaveBeenCalledWith('tk1', {
      file_name: 'map.pdf', file_size_bytes: 10, file_content_base64: base64('hazard-map'), notes: 'Here it is'
    }));
    expect(await screen.findByText('Your work has been sent to your teacher.')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the server error when submission fails', async () => {
    api.submitPerformanceTask.mockResolvedValue({ success: false, message: 'Deadline passed.' });
    const { user } = renderPage(<ActivitiesPage />, { route: '/student/activities?task=tk1' });
    await user.upload(fileInput(), makeFile('map.pdf', 'hazard-map'));
    await user.click(aside().getByRole('button', { name: /Submit work/ }));
    expect(await aside().findByRole('alert')).toHaveTextContent('Deadline passed.');
  });

  it('saves and restores a note draft per learner and task', async () => {
    const { user, unmount } = renderPage(<ActivitiesPage />, { route: '/student/activities?task=tk1' });
    await user.type(aside().getByLabelText('Message for your teacher (optional)'), 'Draft text');
    await user.click(aside().getByRole('button', { name: 'Save note' }));
    expect(aside().getByText('Your note was saved on this device.')).toBeInTheDocument();
    expect(localStorage.getItem('aralytics:notes:stu-1:tk1')).toBe('Draft text');
    unmount();

    renderPage(<ActivitiesPage />, { route: '/student/activities?task=tk1' });
    expect(aside().getByLabelText('Message for your teacher (optional)')).toHaveValue('Draft text');
  });
});
