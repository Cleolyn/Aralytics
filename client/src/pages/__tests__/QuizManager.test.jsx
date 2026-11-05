import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage } from '../../test/render';
import QuizManager from '../QuizManager';
import { api } from '../../services/api';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teach-1' } }) }));
vi.mock('../../services/api', () => ({ api: { getTaxonomy: vi.fn(), createQuiz: vi.fn() } }));

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
