import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage } from '../../test/render';
import QuizManager from '../QuizManager';
import { api } from '../../services/api';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teach-1' } }) }));
vi.mock('../../services/api', () => ({ api: { getTaxonomy: vi.fn(), createQuiz: vi.fn(), getQuizById: vi.fn(), updateQuiz: vi.fn() } }));

const opts = (...texts) => ['A', 'B', 'C', 'D'].map((id, i) => ({ id, text: texts[i] }));
const savedQuiz = (attempts = 0) => ({
  id: 'quiz-9', competency_id: 'c1', title: 'Saved quiz', instructions: 'Old notes', time_limit_minutes: 30, passing_score: 2, max_blur_limit: 4,
  attempt_count: attempts,
  questions: [
    { id: 'qa', question_text: 'First?', question_type: 'MULTIPLE_CHOICE', points: 1, options: opts('a1', 'a2', 'a3', 'a4'), correct_answer: 'B' },
    { id: 'qb', question_text: 'Second?', question_type: 'SITUATIONAL', points: 2, options: opts('b1', 'b2', 'b3', 'b4'), correct_answer: 'D' }
  ]
});

const DRAFT_KEY = 'aralytics:quiz-draft:teach-1';
const questionSection = n => screen.getByRole('heading', { name: `Question ${n}` }).closest('section');

async function fillQuestion(user, n, { text, choices = ['One', 'Two', 'Three', 'Four'], answer = 'A', points } = {}) {
  const q = within(questionSection(n));
  await user.type(q.getByLabelText('Question'), text);
  for (const [i, id] of ['A', 'B', 'C', 'D'].entries()) await user.type(q.getByLabelText(`Choice ${id}`), choices[i]);
  await user.selectOptions(q.getByLabelText('Correct answer'), answer);
  if (points !== undefined) {
    await user.clear(q.getByLabelText('Points'));
    await user.type(q.getByLabelText('Points'), String(points));
  }
}

async function fillQuizInfo(user) {
  await user.type(screen.getByLabelText('Title'), 'Climate Quiz');
  await user.selectOptions(screen.getByLabelText('Topic'), 'c1');
  await user.type(screen.getByLabelText('Instructions for students'), 'Read carefully');
}

beforeEach(() => {
  api.getTaxonomy.mockResolvedValue({ flatCompetencies: [{ id: 'c1', melc_code: 'AP10_1', description: 'Climate topic' }] });
  api.createQuiz.mockResolvedValue({ success: true });
  api.updateQuiz.mockResolvedValue({ success: true });
  api.getQuizById.mockResolvedValue({ success: true, quiz: savedQuiz() });
});

describe('QuizManager edit mode', () => {
  const renderEdit = onQuizCreated => renderPage(<QuizManager onQuizCreated={onQuizCreated} />, { route: '/teacher/quizzes/quiz-9/edit', path: '/teacher/quizzes/:id/edit' });

  it('loads the quiz, ignores device drafts, and saves a full update', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: 'Stale draft', questions: [{ key: 'x', question_text: 'Stale', question_type: 'MULTIPLE_CHOICE', points: 1, options: opts('1', '2', '3', '4'), correct_answer: 'A' }] }));
    const onSaved = vi.fn();
    const { user } = renderEdit(onSaved);
    expect(await screen.findByRole('heading', { name: 'Edit quiz' })).toBeInTheDocument();
    expect(api.getQuizById).toHaveBeenCalledWith('quiz-9');
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Saved quiz'));
    expect(screen.getByRole('heading', { name: 'Questions (2)' })).toBeInTheDocument();
    expect(within(questionSection(2)).getByLabelText('Choice D')).toHaveValue('b4');
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Renamed quiz');
    await user.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(api.updateQuiz).toHaveBeenCalledTimes(1));
    const [id, payload] = api.updateQuiz.mock.calls[0];
    expect(id).toBe('quiz-9');
    expect(payload).toMatchObject({ title: 'Renamed quiz', competency_id: 'c1', passing_score: 2, time_limit_minutes: 30, max_blur_limit: 4 });
    expect(payload.questions).toHaveLength(2);
    expect(payload.questions[1]).toMatchObject({ question_text: 'Second?', correct_answer: 'D', points: 2 });
    expect(api.createQuiz).not.toHaveBeenCalled();
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull(); // editing never touches the new-quiz draft
    expect(onSaved).toHaveBeenCalled();
  });

  it('locks questions, topic and passing score once students have attempted it', async () => {
    api.getQuizById.mockResolvedValue({ success: true, quiz: savedQuiz(3) });
    const { user } = renderEdit();
    expect(await screen.findByText(/Students have already taken this quiz/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Saved quiz'));
    expect(screen.getByLabelText('Topic')).toBeDisabled();
    expect(screen.getByLabelText('Passing score (out of 3)')).toBeDisabled();
    expect(within(questionSection(1)).getByLabelText('Question')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Add question/ })).toBeDisabled();

    await user.clear(screen.getByLabelText('Time limit (minutes)'));
    await user.type(screen.getByLabelText('Time limit (minutes)'), '45');
    await user.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(api.updateQuiz).toHaveBeenCalledTimes(1));
    const payload = api.updateQuiz.mock.calls[0][1];
    expect(payload).toMatchObject({ title: 'Saved quiz', instructions: 'Old notes', time_limit_minutes: 45, max_blur_limit: 4 });
    expect(payload).not.toHaveProperty('questions');
    expect(payload).not.toHaveProperty('competency_id');
    expect(payload).not.toHaveProperty('passing_score');
  });

  it('shows the server message when saving fails', async () => {
    api.updateQuiz.mockRejectedValue(Object.assign(new Error('Students have already taken this quiz.'), { code: 'QUIZ_LOCKED' }));
    const { user } = renderEdit();
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Saved quiz'));
    await user.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Students have already taken this quiz.');
  });
});

describe('QuizManager', () => {
  it('starts with one question and topic choices', async () => {
    renderPage(<QuizManager />);
    expect(await screen.findByRole('option', { name: 'AP10 1 · Climate topic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Questions (1)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Passing score (out of 1)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove question 1' })).not.toBeInTheDocument();
  });

  it('adds and removes questions and totals their points', async () => {
    const { user } = renderPage(<QuizManager />);
    await screen.findByRole('heading', { name: 'Questions (1)' });
    await user.click(screen.getByRole('button', { name: /Add question/ }));
    await user.click(screen.getByRole('button', { name: /Add question/ }));
    expect(screen.getByRole('heading', { name: 'Questions (3)' })).toBeInTheDocument();

    const q2 = within(questionSection(2));
    await user.clear(q2.getByLabelText('Points'));
    await user.type(q2.getByLabelText('Points'), '5');
    expect(screen.getByLabelText('Passing score (out of 7)')).toBeInTheDocument();

    await user.type(within(questionSection(3)).getByLabelText('Question'), 'Third one');
    await user.click(screen.getByRole('button', { name: 'Remove question 2' }));
    expect(screen.getByRole('heading', { name: 'Questions (2)' })).toBeInTheDocument();
    expect(within(questionSection(2)).getByLabelText('Question')).toHaveValue('Third one');
    expect(screen.getByLabelText('Passing score (out of 2)')).toBeInTheDocument();
  });

  it('publishes a complete quiz with numeric settings', async () => {
    const onQuizCreated = vi.fn();
    const { user } = renderPage(<QuizManager onQuizCreated={onQuizCreated} />);
    await screen.findByRole('option', { name: /Climate topic/ });
    await fillQuizInfo(user);
    await fillQuestion(user, 1, { text: 'Best answer?', answer: 'C', points: 2 });
    await user.click(screen.getByRole('button', { name: /Add question/ }));
    await user.selectOptions(within(questionSection(2)).getByLabelText('Question style'), 'SITUATIONAL');
    await fillQuestion(user, 2, { text: 'In a flood you…', choices: ['Run', 'Hide', 'Evacuate', 'Wait'], answer: 'C' });
    await user.clear(screen.getByLabelText('Passing score (out of 3)'));
    await user.type(screen.getByLabelText('Passing score (out of 3)'), '2');
    await user.click(screen.getByRole('button', { name: /Publish quiz/ }));

    await waitFor(() => expect(api.createQuiz).toHaveBeenCalledTimes(1));
    const payload = api.createQuiz.mock.calls[0][0];
    expect(payload).toMatchObject({
      competency_id: 'c1', title: 'Climate Quiz', instructions: 'Read carefully',
      time_limit_minutes: 20, passing_score: 2, max_blur_limit: 3
    });
    expect(payload.questions).toEqual([
      { question_text: 'Best answer?', question_type: 'MULTIPLE_CHOICE', points: 2, correct_answer: 'C',
        options: [{ id: 'A', text: 'One' }, { id: 'B', text: 'Two' }, { id: 'C', text: 'Three' }, { id: 'D', text: 'Four' }] },
      { question_text: 'In a flood you…', question_type: 'SITUATIONAL', points: 1, correct_answer: 'C',
        options: [{ id: 'A', text: 'Run' }, { id: 'B', text: 'Hide' }, { id: 'C', text: 'Evacuate' }, { id: 'D', text: 'Wait' }] }
    ]);
    expect(onQuizCreated).toHaveBeenCalled();
  });

  it('rejects a passing score above the total', async () => {
    const { user } = renderPage(<QuizManager />);
    await screen.findByRole('option', { name: /Climate topic/ });
    await fillQuizInfo(user);
    await fillQuestion(user, 1, { text: 'Q?' });
    const pass = screen.getByLabelText('Passing score (out of 1)');
    pass.removeAttribute('max');
    await user.clear(pass);
    await user.type(pass, '3');
    await user.click(screen.getByRole('button', { name: /Publish quiz/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Passing score cannot be higher than the 1 total points.');
    expect(api.createQuiz).not.toHaveBeenCalled();
  });

  it('rejects blank choices even if the browser lets the form submit', async () => {
    const { user } = renderPage(<QuizManager />);
    await screen.findByRole('option', { name: /Climate topic/ });
    await fillQuizInfo(user);
    await user.type(within(questionSection(1)).getByLabelText('Question'), 'Q?');
    // Bypass native validation to exercise the component's own checks.
    screen.getByRole('button', { name: /Publish quiz/ }).closest('form').noValidate = true;
    await user.type(within(questionSection(1)).getByLabelText('Choice A'), '   ');
    await user.click(screen.getByRole('button', { name: /Publish quiz/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please fill in all 4 choices (A, B, C, and D) for every question.');
    expect(api.createQuiz).not.toHaveBeenCalled();
  });

  it('shows the server error and keeps the form', async () => {
    api.createQuiz.mockResolvedValue({ success: false, message: 'Title already used.' });
    const { user } = renderPage(<QuizManager />);
    await screen.findByRole('option', { name: /Climate topic/ });
    await fillQuizInfo(user);
    await fillQuestion(user, 1, { text: 'Q?' });
    await user.click(screen.getByRole('button', { name: /Publish quiz/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Title already used.');
    expect(screen.getByLabelText('Title')).toHaveValue('Climate Quiz');
  });

  it('saves a draft on the device, restores it, and clears it after publishing', async () => {
    const { user, unmount } = renderPage(<QuizManager />);
    await screen.findByRole('option', { name: /Climate topic/ });
    await fillQuizInfo(user);
    await fillQuestion(user, 1, { text: 'Draft question' });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getByText('Draft saved on this device.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)).title).toBe('Climate Quiz');
    unmount();

    const second = renderPage(<QuizManager />);
    await screen.findByRole('option', { name: /Climate topic/ });
    expect(screen.getByLabelText('Title')).toHaveValue('Climate Quiz');
    expect(within(questionSection(1)).getByLabelText('Question')).toHaveValue('Draft question');
    await second.user.click(screen.getByRole('button', { name: /Publish quiz/ }));
    await waitFor(() => expect(api.createQuiz).toHaveBeenCalled());
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull());
  });
});
