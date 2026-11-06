import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentLocation, renderPage } from '../../test/render';
import AssessmentsPage from '../AssessmentsPage';
import { api } from '../../services/api';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teach-1', role: 'TEACHER' } }) }));
vi.mock('../../services/api', () => ({
  api: {
    getQuizzes: vi.fn(), getPerformanceTasks: vi.fn(), getTaxonomy: vi.fn(), getQuizById: vi.fn(),
    deleteQuiz: vi.fn(), archiveQuiz: vi.fn(), restoreQuiz: vi.fn(),
    deletePerformanceTask: vi.fn(), archivePerformanceTask: vi.fn(), restorePerformanceTask: vi.fn(),
    updatePerformanceTask: vi.fn(), createPerformanceTask: vi.fn()
  }
}));

const quizzes = [
  { id: 'q1', title: 'My quiz', created_by: 'teach-1', is_published: 1, time_limit_minutes: 20, total_points: 5, melc_code: 'AP10_1', attempt_count: 2, archived_at: null },
  { id: 'q2', title: 'Colleague quiz', created_by: 'teach-2', is_published: 1, time_limit_minutes: 15, total_points: 3, melc_code: 'AP10_2', attempt_count: 0, archived_at: null },
  { id: 'q3', title: 'Old quiz', created_by: 'teach-1', is_published: 0, time_limit_minutes: 10, total_points: 2, melc_code: 'AP10_3', attempt_count: 1, archived_at: '2026-10-01 08:00:00' }
];
const tasks = [
  { id: 't1', title: 'My task', created_by: 'teach-1', total_points: 50, competency_id: 'c1', quarter: 'Q1', instructions: 'Do it', stats: { total_submissions: 0, pending_count: 0 } },
  { id: 't2', title: 'Locked task', created_by: 'teach-1', total_points: 60, competency_id: 'c1', quarter: 'Q1', instructions: 'Do it too', stats: { total_submissions: 2, pending_count: 2 } },
  { id: 't3', title: 'Colleague task', created_by: 'teach-2', total_points: 30, stats: { total_submissions: 0, pending_count: 0 } }
];
const rowOf = text => screen.getByText(text).closest('tr');
const apiError = (message, code) => Object.assign(new Error(message), { code, status: 409 });

beforeEach(() => {
  vi.clearAllMocks();
  api.getQuizzes.mockResolvedValue({ success: true, quizzes });
  api.getPerformanceTasks.mockResolvedValue({ success: true, tasks });
  api.getTaxonomy.mockResolvedValue({ flatCompetencies: [{ id: 'c1', melc_code: 'AP10_1', description: 'Climate topic', quarter_code: 'Q1' }] });
  for (const name of ['deleteQuiz', 'archiveQuiz', 'restoreQuiz', 'deletePerformanceTask', 'archivePerformanceTask', 'restorePerformanceTask', 'updatePerformanceTask']) {
    api[name].mockResolvedValue({ success: true });
  }
});

describe('AssessmentsPage', () => {
  it('shows Edit, Archive and Delete only on rows the teacher created', async () => {
    renderPage(<AssessmentsPage />);
    await screen.findByText('My quiz');
    const mine = within(rowOf('My quiz'));
    expect(mine.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/teacher/quizzes/q1/edit');
    expect(mine.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(mine.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    const theirs = within(rowOf('Colleague quiz'));
    expect(theirs.getByRole('button', { name: /View questions/ })).toBeInTheDocument();
    expect(theirs.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(theirs.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(theirs.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('hides archived items until "Show archived" is ticked, and can restore them', async () => {
    const { user } = renderPage(<AssessmentsPage />);
    await screen.findByText('My quiz');
    expect(screen.queryByText('Old quiz')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Show archived'));
    const row = within(rowOf('Old quiz'));
    expect(row.getByText('Archived')).toBeInTheDocument();
    await user.click(row.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(api.restoreQuiz).toHaveBeenCalledWith('q3'));
    expect(await screen.findByText('Restored. Students can see it again.')).toBeInTheDocument();
    expect(api.getQuizzes).toHaveBeenCalledTimes(2);
  });

  it('archives a task', async () => {
    const { user } = renderPage(<AssessmentsPage />);
    await screen.findByText('My quiz');
    await user.click(screen.getByRole('button', { name: 'Class tasks' }));
    await user.click(within(rowOf('My task')).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(api.archivePerformanceTask).toHaveBeenCalledWith('t1'));
    expect(within(rowOf('Colleague task')).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });

  it('deletes a quiz after confirmation', async () => {
    const { user } = renderPage(<AssessmentsPage />);
    await screen.findByText('My quiz');
    await user.click(within(rowOf('My quiz')).getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this quiz?' });
    expect(api.deleteQuiz).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete quiz' }));
    await waitFor(() => expect(api.deleteQuiz).toHaveBeenCalledWith('q1'));
    expect(await screen.findByText('The quiz was deleted.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers "Archive instead" when a quiz has attempts', async () => {
    api.deleteQuiz.mockRejectedValue(apiError('Students have already taken this quiz.', 'QUIZ_HAS_ATTEMPTS'));
    const { user } = renderPage(<AssessmentsPage />);
    await screen.findByText('My quiz');
    await user.click(within(rowOf('My quiz')).getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete quiz' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('Students have already taken this quiz.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Archive instead' }));
    await waitFor(() => expect(api.archiveQuiz).toHaveBeenCalledWith('q1'));
    expect(await screen.findByText(/The quiz was archived/)).toBeInTheDocument();
  });

  it('offers to delete submissions too when a task has ungraded work', async () => {
    api.deletePerformanceTask
      .mockRejectedValueOnce(apiError('Students have already submitted work.', 'TASK_HAS_SUBMISSIONS'))
      .mockResolvedValue({ success: true });
    const { user } = renderPage(<AssessmentsPage />);
    await screen.findByText('My quiz');
    await user.click(screen.getByRole('button', { name: 'Class tasks' }));
    await user.click(within(rowOf('Locked task')).getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete task' }));
    expect(api.deletePerformanceTask).toHaveBeenLastCalledWith('t2', { force: false });
    await user.click(await screen.findByRole('button', { name: 'Delete submissions too' }));
    await waitFor(() => expect(api.deletePerformanceTask).toHaveBeenLastCalledWith('t2', { force: true }));
    expect(await screen.findByText('The task was deleted.')).toBeInTheDocument();
  });

  it('offers only archiving when a task has graded work', async () => {
    api.deletePerformanceTask.mockRejectedValue(apiError('Some submissions are graded.', 'TASK_HAS_GRADES'));
    const { user } = renderPage(<AssessmentsPage />);
    await screen.findByText('My quiz');
    await user.click(screen.getByRole('button', { name: 'Class tasks' }));
    await user.click(within(rowOf('My task')).getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete task' }));
    expect(await screen.findByRole('button', { name: 'Archive instead' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete submissions too' })).not.toBeInTheDocument();
  });

  it('edits a task, locking points and topic once students have submitted', async () => {
    const { user } = renderPage(<AssessmentsPage />);
    await screen.findByText('My quiz');
    await user.click(screen.getByRole('button', { name: 'Class tasks' }));
    await user.click(within(rowOf('Locked task')).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit class task' });
    expect(within(dialog).getByLabelText('Topic')).toBeDisabled();
    expect(within(dialog).getByLabelText('Total points')).toBeDisabled();
    const title = within(dialog).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Renamed task');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updatePerformanceTask).toHaveBeenCalledTimes(1));
    const [id, payload] = api.updatePerformanceTask.mock.calls[0];
    expect(id).toBe('t2');
    expect(payload).toMatchObject({ title: 'Renamed task', instructions: 'Do it too' });
    expect(payload).not.toHaveProperty('total_points');
    expect(payload).not.toHaveProperty('competency_id');
    expect(await screen.findByText('Class task updated.')).toBeInTheDocument();
  });

  it('links Edit to the quiz editor route', async () => {
    const { user } = renderPage(<AssessmentsPage />, { route: '/teacher/assessments', path: '/teacher/assessments' });
    await screen.findByText('My quiz');
    await user.click(within(rowOf('My quiz')).getByRole('link', { name: 'Edit' }));
    expect(currentLocation()).toBe('/teacher/quizzes/q1/edit');
  });
});
