import React from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, currentLocation } from '../../test/render';
import QuizRunner from '../QuizRunner';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({
  api: { getQuizById: vi.fn(), submitAssessmentAttempt: vi.fn(), logSecurityEventAsync: vi.fn() }
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'stu-1' } }) }));

const SESSION_KEY = 'aralytics:quiz-session:stu-1:quiz-1';

const quiz = (overrides = {}) => ({
  id: 'quiz-1',
  title: 'CBDRRM_Quiz',
  instructions: 'Answer all items.',
  time_limit_minutes: 10,
  total_points: 3,
  questions: [
    { id: 'q1', question_text: 'Pick B', question_type: 'MULTIPLE_CHOICE', options: [{ id: 'A', text: 'Alpha' }, { id: 'B', text: 'Bravo' }] },
    { id: 'q2', question_text: 'Is it true?', question_type: 'TRUE_FALSE', options: [] },
    { id: 'q3', question_text: 'Situation', question_type: 'SITUATIONAL', options: [{ id: 'A', text: 'Act' }, { id: 'B', text: 'Wait' }] }
  ],
  ...overrides
});

const passedResult = {
  success: true,
  attempt: { score: 3, total_points: 3, percentage: 100, is_passed: true },
  intervention: { triggered: false }
};

function renderRunner(props = {}) {
  return renderPage(<QuizRunner quizId="quiz-1" onBackToDashboard={vi.fn()} onNavigateToRemedial={vi.fn()} {...props} />);
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
  api.getQuizById.mockResolvedValue({ success: true, quiz: quiz() });
  api.submitAssessmentAttempt.mockResolvedValue(passedResult);
  api.logSecurityEventAsync.mockResolvedValue({ success: true });
});

describe('QuizRunner', () => {
  it('shows the first question, then navigates and records answers on the device', async () => {
    const { user } = renderRunner();
    expect(await screen.findByRole('heading', { name: 'CBDRRM Quiz' })).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument();
    expect(screen.getByText(/0 answered/)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/Bravo/));
    expect(screen.getByText(/1 answered/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).answers).toEqual({ q1: 'B' });

    await user.click(screen.getByRole('button', { name: /Next question/ }));
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument();
    // TRUE_FALSE without options falls back to True/False choices.
    expect(screen.getByLabelText(/True \/ Tama/)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/False \/ Mali/));

    await user.click(screen.getByRole('button', { name: /Previous/ }));
    expect(screen.getByLabelText(/Bravo/)).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Question 3, not answered' }));
    expect(screen.getByText('Question 3 of 3')).toBeInTheDocument();
    // On the last question the toolbar's primary action becomes "Check answers" (the aside has one too).
    expect(screen.queryByRole('button', { name: /Next question/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Check answers/ })).toHaveLength(2);
  });

  it('marks questions for review and summarizes them before submitting', async () => {
    const { user } = renderRunner();
    await screen.findByText('Question 1 of 3');
    await user.click(screen.getByRole('button', { name: /Mark for review/ }));
    expect(screen.getByRole('button', { name: /Remove mark/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Question 1, not answered, marked' })).toBeInTheDocument();

    await user.click(screen.getByLabelText(/Alpha/));
    const aside = screen.getByRole('complementary');
    await user.click(within(aside).getByRole('button', { name: 'Check answers' }));
    expect(screen.getByRole('heading', { name: 'Ready to submit?' })).toBeInTheDocument();
    expect(screen.getByText(/2 not answered · 1 marked for review/)).toBeInTheDocument();
    expect(screen.getByText('Answer: A · Marked')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /3\. Situation/ }));
    expect(screen.getByText('Question 3 of 3')).toBeInTheDocument();
  });

  it('submits every answer with screen events and shows the result', async () => {
    const onNavigateToRemedial = vi.fn();
    const onBackToDashboard = vi.fn();
    api.submitAssessmentAttempt.mockResolvedValue({ ...passedResult, intervention: { triggered: true } });
    const { user } = renderRunner({ onNavigateToRemedial, onBackToDashboard });

    await screen.findByText('Question 1 of 3');
    await user.click(screen.getByLabelText(/Bravo/));
    await user.click(screen.getByRole('button', { name: /Next question/ }));
    await user.click(screen.getByLabelText(/True \/ Tama/));
    await user.click(screen.getByRole('button', { name: /Next question/ }));
    await user.click(screen.getAllByRole('button', { name: /Check answers/ })[0]);
    await user.click(screen.getByRole('button', { name: /Submit quiz/ }));

    expect(await screen.findByRole('heading', { name: 'Great job! You passed.' })).toBeInTheDocument();
    expect(api.submitAssessmentAttempt).toHaveBeenCalledTimes(1);
    expect(api.submitAssessmentAttempt).toHaveBeenCalledWith({
      quiz_id: 'quiz-1',
      student_id: 'stu-1',
      score: 0,
      total_points: 3,
      tab_switch_count: 0,
      security_events: [],
      answers: [
        { question_id: 'q1', selected_answer: 'B' },
        { question_id: 'q2', selected_answer: 'TRUE' },
        { question_id: 'q3', selected_answer: '' }
      ]
    });
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();

    await user.click(screen.getByRole('button', { name: /Open practice/ }));
    expect(onNavigateToRemedial).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(onBackToDashboard).toHaveBeenCalled();
  });

  it('keeps answers and explains when submitting fails', async () => {
    api.submitAssessmentAttempt.mockRejectedValue(new Error('Server unavailable.'));
    const { user } = renderRunner();
    await screen.findByText('Question 1 of 3');
    await user.click(screen.getByLabelText(/Bravo/));
    await user.click(screen.getAllByRole('button', { name: /Check answers/ }).at(-1));
    await user.click(screen.getByRole('button', { name: /Submit quiz/ }));

    expect(await screen.findByText('Server unavailable. Your answers are still saved here. Please try submitting again.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).answers).toEqual({ q1: 'B' });
    expect(screen.getByRole('button', { name: /Submit quiz/ })).toBeEnabled();
  });

  it('restores a saved session from this device', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      answers: { q1: 'A', q3: 'B' }, deadline: Date.now() + 5 * 60000, events: [], flags: ['q3']
    }));
    renderRunner();
    expect(await screen.findByLabelText(/Alpha/)).toBeChecked();
    expect(screen.getByText(/2 answered/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Question 3, answered, marked' })).toBeInTheDocument();
    expect(screen.getByLabelText(/0[45]:\d\d left/)).toBeInTheDocument();
  });

  it('submits automatically when the saved deadline has passed', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ answers: { q1: 'B' }, deadline: Date.now() - 1000, events: [], flags: [] }));
    renderRunner();
    await waitFor(() => expect(api.submitAssessmentAttempt).toHaveBeenCalledTimes(1));
    expect(api.submitAssessmentAttempt.mock.calls[0][0].answers[0]).toEqual({ question_id: 'q1', selected_answer: 'B' });
    expect(await screen.findByRole('heading', { name: 'Great job! You passed.' })).toBeInTheDocument();
  });

  it('records leaving the quiz screen for the teacher', async () => {
    renderRunner();
    await screen.findByText('Question 1 of 3');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });

    expect(api.logSecurityEventAsync).toHaveBeenCalledWith(expect.objectContaining({
      quiz_id: 'quiz-1', student_id: 'stu-1', event_type: 'TAB_SWITCH'
    }));
    expect(screen.getByText(/Leaving the quiz screen was recorded/)).toBeInTheDocument();
    expect(screen.getByText(/screen change recorded/).textContent).toBe('1 screen change recorded');
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).events).toHaveLength(1);
  });

  it('pauses the quiz when the server cannot be reached', async () => {
    fetch.mockRejectedValue(new TypeError('offline'));
    renderRunner();
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Quiz Paused (No Internet)');
    expect(screen.getByText('You need an internet connection to take this quiz. Please reconnect to continue.')).toBeInTheDocument();
    expect(api.getQuizById).not.toHaveBeenCalled();

    fetch.mockResolvedValue({ ok: true });
    await screen.findByRole('button', { name: 'Check connection and continue' });
    screen.getByRole('button', { name: 'Check connection and continue' }).click();
    expect(await screen.findByText('Question 1 of 3')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('tells the learner when the quiz was already finished', async () => {
    api.getQuizById.mockResolvedValue({ success: true, quiz: quiz({ currentSubmission: { status: 'SUBMITTED' } }) });
    const { user } = renderRunner();
    expect(await screen.findByText('You have already finished this quiz.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /See your score/ }));
    expect(currentLocation()).toBe('/student/progress');
  });

  it('shows an empty state for a quiz without questions', async () => {
    api.getQuizById.mockResolvedValue({ success: true, quiz: quiz({ questions: [] }) });
    renderRunner();
    expect(await screen.findByRole('heading', { name: 'This quiz has no questions yet' })).toBeInTheDocument();
  });
});
