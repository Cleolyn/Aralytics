import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentLocation, renderPage } from '../../test/render';
import TeacherDashboard from '../TeacherDashboard';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({
  api: {
    getClasses: vi.fn(), getGradebook: vi.fn(), getPerformanceTasks: vi.fn(), getPerformanceTaskSubmissions: vi.fn(),
    getSubmissionById: vi.fn(), gradePerformanceTaskSubmission: vi.fn(),
    getSubmissionFileUrl: url => (url ? `${url}?token=t` : null)
  }
}));

const entries = [
  { submission_id: 's1', first_name: 'Juan', last_name: 'Dela Cruz', lrn_or_id: '111', section: '10-Rizal', quiz_title: 'Quiz_One', submitted_at: '2026-10-02 08:30:00', score_obtained: 9, total_points: 10, percentage: 90, is_passed: 1, blur_count: 0, is_flagged_for_cheating: 0 },
  { submission_id: 's2', first_name: 'Maria', last_name: 'Clara', lrn_or_id: '222', section: '10-Luna', quiz_title: 'Quiz_One', submitted_at: '2026-10-02 08:35:00', score_obtained: 4, total_points: 10, percentage: 40, is_passed: 0, blur_count: 4, is_flagged_for_cheating: 1 }
];
const tasks = [
  { id: 't1', title: 'Hazard Map', rubric_criteria: 'Content 50%', total_points: 100 },
  { id: 't2', title: 'Photo Essay', rubric_criteria: null, total_points: 50 }
];
const taskSubmissions = [
  { id: 'p1', student_name: 'Juan Dela Cruz', lrn_or_id: '111', section: '10-Rizal', file_name: 'map.pdf', file_url: '/api/performance-tasks/files/a.pdf', submitted_at: '2026-10-03 10:00:00', status: 'SUBMITTED', score: null, feedback: null, notes: 'Please check' },
  { id: 'p2', student_name: 'Maria Clara', lrn_or_id: '222', section: '10-Luna', file_name: 'map2.pdf', file_url: '/api/performance-tasks/files/b.pdf', submitted_at: '2026-10-03 11:00:00', status: 'GRADED', score: 88, feedback: 'Good', notes: '' }
];

const rowOf = text => screen.getByText(text).closest('tr');
const studentNames = () => screen.queryAllByRole('row').slice(1).map(r => r.querySelector('strong').textContent);

beforeEach(() => {
  api.getClasses.mockResolvedValue({ classes: [{ section: '10-Rizal' }, { section: '10-Luna' }] });
  api.getGradebook.mockResolvedValue({ success: true, entries });
  api.getPerformanceTasks.mockResolvedValue({ success: true, tasks });
  api.getPerformanceTaskSubmissions.mockResolvedValue({ success: true, submissions: taskSubmissions });
  api.getSubmissionById.mockResolvedValue({
    submission: { quiz_title: 'Quiz_One', first_name: 'Maria', last_name: 'Clara', score_obtained: 4, total_points: 10, blur_count: 4 },
    proctorLogs: [{ id: 'l1', event_type: 'TAB_SWITCH', timestamp: '2026-10-02 08:31:00' }],
    answers: [
      { id: 'a1', question_text: 'First?', selected_answer: 'B', is_correct: 1 },
      { id: 'a2', question_text: 'Second?', selected_answer: '', is_correct: 0 }
    ]
  });
  api.gradePerformanceTaskSubmission.mockResolvedValue({ success: true });
});

describe('TeacherDashboard — quiz scores', () => {
  it('lists quiz results with status and screen activity', async () => {
    renderPage(<TeacherDashboard />, { route: '/teacher/gradebook' });
    await screen.findByText('Juan Dela Cruz');
    expect(api.getGradebook).toHaveBeenCalledWith({});
    expect(studentNames()).toEqual(['Juan Dela Cruz', 'Maria Clara']);

    const juan = within(rowOf('Juan Dela Cruz'));
    expect(juan.getByText('10-Rizal · 111')).toBeInTheDocument();
    expect(juan.getByText('9 / 10')).toBeInTheDocument();
    expect(juan.getByText('Passed')).toBeInTheDocument();
    expect(juan.getByText('0 screen changes')).toBeInTheDocument();
    const maria = within(rowOf('Maria Clara'));
    expect(maria.getByText('Needs practice')).toBeInTheDocument();
    expect(maria.getByText('4 screen changes · Check activity')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Class reports/ })).toHaveAttribute('href', '/teacher/reports');
  });

  it('filters by section and learner through the URL', async () => {
    const { user } = renderPage(<TeacherDashboard />, { route: '/teacher/gradebook' });
    await screen.findByText('Juan Dela Cruz');

    await user.selectOptions(screen.getByLabelText('Class section'), '10-Luna');
    await waitFor(() => expect(api.getGradebook).toHaveBeenLastCalledWith({ section: '10-Luna' }));
    expect(currentLocation()).toBe('/teacher/gradebook?section=10-Luna');
    expect(screen.getByRole('link', { name: /Class reports/ })).toHaveAttribute('href', '/teacher/reports?section=10-Luna');

    await user.type(screen.getByLabelText('Search student'), '222');
    await waitFor(() => expect(studentNames()).toEqual(['Maria Clara']));
    expect(currentLocation()).toBe('/teacher/gradebook?section=10-Luna&learner=222');
  });

  it('opens a learner’s answers and proctoring log', async () => {
    const { user } = renderPage(<TeacherDashboard />, { route: '/teacher/gradebook' });
    await screen.findByText('Maria Clara');
    await user.click(within(rowOf('Maria Clara')).getByRole('button', { name: /View answers/ }));

    expect(api.getSubmissionById).toHaveBeenCalledWith('s2');
    const dialog = await screen.findByRole('dialog', { name: 'Quiz One' });
    expect(within(dialog).getByText('4 tab or window changes were recorded during the quiz.')).toBeInTheDocument();
    expect(within(dialog).getByText(/^Switched tab · /)).toBeInTheDocument();
    expect(within(dialog).getByText('Answer: B')).toBeInTheDocument();
    // Current behavior: an empty answer renders blank (see follow-up fix).
    expect(within(dialog).getAllByText(/^Answer:/).map(n => n.textContent)).toEqual(['Answer: B', 'Answer: ']);
    expect(within(dialog).getByText('Correct')).toBeInTheDocument();
    expect(within(dialog).getByText('Incorrect')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no results', async () => {
    api.getGradebook.mockResolvedValue({ success: true, entries: [] });
    renderPage(<TeacherDashboard />, { route: '/teacher/gradebook' });
    expect(await screen.findByRole('heading', { name: 'No quiz scores found' })).toBeInTheDocument();
  });
});

describe('TeacherDashboard — class tasks', () => {
  it('lists submissions for the selected task and switches tasks', async () => {
    const { user } = renderPage(<TeacherDashboard />, { route: '/teacher/gradebook?view=tasks' });
    expect(await screen.findByRole('heading', { name: 'Hazard Map' })).toBeInTheDocument();
    expect(api.getPerformanceTaskSubmissions).toHaveBeenCalledWith('t1');
    expect(screen.getByText('Content 50%')).toBeInTheDocument();

    const juan = within(rowOf('Juan Dela Cruz'));
    expect(juan.getByRole('link', { name: 'map.pdf' })).toHaveAttribute('href', '/api/performance-tasks/files/a.pdf?token=t');
    expect(juan.getByText('Not graded yet')).toBeInTheDocument();
    expect(juan.getByText('Waiting for grade')).toBeInTheDocument();
    expect(within(rowOf('Maria Clara')).getByText('88 / 100')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Class task'), 't2');
    await waitFor(() => expect(api.getPerformanceTaskSubmissions).toHaveBeenLastCalledWith('t2'));
    expect(await screen.findByRole('heading', { name: 'Photo Essay' })).toBeInTheDocument();
    expect(screen.getByText('No grading guide added.')).toBeInTheDocument();
    expect(currentLocation()).toBe('/teacher/gradebook?view=tasks&task=t2');
  });

  it('filters task submissions by section on the client', async () => {
    const { user } = renderPage(<TeacherDashboard />, { route: '/teacher/gradebook?view=tasks' });
    await screen.findByText('Juan Dela Cruz');
    await user.selectOptions(screen.getByLabelText('Class section'), '10-Rizal');
    await waitFor(() => expect(studentNames()).toEqual(['Juan Dela Cruz']));
  });

  it('grades a submission with a score and comment', async () => {
    const { user } = renderPage(<TeacherDashboard />, { route: '/teacher/gradebook?view=tasks' });
    await screen.findByText('Juan Dela Cruz');
    await user.click(within(rowOf('Juan Dela Cruz')).getByRole('button', { name: /Grade work/ }));

    const dialog = screen.getByRole('dialog', { name: 'Grade Juan Dela Cruz’s work' });
    expect(within(dialog).getByText('Student note: Please check')).toBeInTheDocument();
    expect(within(dialog).getByText('Grading guide: Content 50%')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Score (out of 100)')).toHaveValue(null);
    await user.type(within(dialog).getByLabelText('Score (out of 100)'), '91.5');
    await user.type(within(dialog).getByLabelText('Comment for the student'), 'Well done');
    await user.click(within(dialog).getByRole('button', { name: 'Save score and comment' }));

    expect(api.gradePerformanceTaskSubmission).toHaveBeenCalledWith('p1', { score: 91.5, feedback: 'Well done' });
    expect(await screen.findByText('Score and comment saved. The student can now see them in My Progress.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(api.getPerformanceTaskSubmissions).toHaveBeenCalledTimes(2));
  });

  it('prefills an existing grade and keeps the dialog open on failure', async () => {
    api.gradePerformanceTaskSubmission.mockResolvedValue({ success: false, message: 'Score is above the maximum.' });
    const { user } = renderPage(<TeacherDashboard />, { route: '/teacher/gradebook?view=tasks' });
    await screen.findByText('Maria Clara');
    await user.click(within(rowOf('Maria Clara')).getByRole('button', { name: /Edit grade/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Score (out of 100)')).toHaveValue(88);
    expect(within(dialog).getByLabelText('Comment for the student')).toHaveValue('Good');
    await user.click(within(dialog).getByRole('button', { name: 'Save score and comment' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Score is above the maximum.');
  });
});
