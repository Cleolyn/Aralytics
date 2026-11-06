export const QUESTION_TYPES = {
  MULTIPLE_CHOICE: 'Standard question',
  SITUATIONAL: 'Real-life situation',
  PISA_LIKE: 'Reading comprehension'
};
export const CHOICE_IDS = ['A', 'B', 'C', 'D'];

const blankChoices = () => CHOICE_IDS.map(id => ({ id, text: '' }));

/** A new blank question; `key` is a client-only identity for React lists. */
export const newQuestion = () => ({
  key: crypto.randomUUID(),
  question_text: '',
  question_type: 'MULTIPLE_CHOICE',
  points: 1,
  options: blankChoices(),
  correct_answer: 'A'
});

export const emptyQuiz = () => ({
  competency_id: '',
  title: '',
  instructions: '',
  time_limit_minutes: 20,
  passing_score: 1,
  max_blur_limit: 3,
  questions: [newQuestion()]
});

/** Turn a quiz returned by GET /quizzes/:id into editable form state. */
export const quizToForm = quiz => ({
  competency_id: quiz.competency_id,
  title: quiz.title || '',
  instructions: quiz.instructions || '',
  time_limit_minutes: quiz.time_limit_minutes,
  passing_score: quiz.passing_score,
  max_blur_limit: quiz.max_blur_limit,
  questions: (quiz.questions || []).map(q => ({
    key: q.id || crypto.randomUUID(),
    question_text: q.question_text || '',
    question_type: q.question_type || 'MULTIPLE_CHOICE',
    points: q.points,
    options: Array.isArray(q.options) && q.options.length === 4 ? q.options : blankChoices(),
    correct_answer: q.correct_answer || 'A'
  }))
});

export const totalPoints = questions => questions.reduce((sum, q) => sum + Number(q.points || 0), 0);

/**
 * Validate the form and build the createQuiz payload.
 * @throws {Error} with a teacher-facing message when something is missing.
 */
export function buildQuizPayload(form) {
  const total = totalPoints(form.questions);
  if (Number(form.passing_score) > total) throw new Error(`Passing score cannot be higher than the ${total} total points.`);

  const questions = form.questions.map(({ key, matching_options, ...q }) => {
    if (!q.question_text.trim()) throw new Error('Please type a question for every item.');
    const options = Array.isArray(q.options) && q.options.length === 4 ? q.options : blankChoices();
    if (options.some(o => !o.text.trim())) throw new Error('Please fill in all 4 choices (A, B, C, and D) for every question.');
    if (!CHOICE_IDS.includes(q.correct_answer)) throw new Error('Please choose a valid correct answer (A, B, C, or D).');
    return {
      ...q,
      question_type: Object.hasOwn(QUESTION_TYPES, q.question_type) ? q.question_type : 'MULTIPLE_CHOICE',
      options,
      points: Number(q.points)
    };
  });

  return {
    ...form,
    questions,
    time_limit_minutes: Number(form.time_limit_minutes),
    passing_score: Number(form.passing_score),
    max_blur_limit: Number(form.max_blur_limit)
  };
}
