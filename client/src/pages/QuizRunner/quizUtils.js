/** A question counts as answered once it has a non-blank string answer. */
export const isAnswered = answer => typeof answer === 'string' && answer.trim().length > 0;

/** mm:ss */
export const timeText = seconds =>
  `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

const TRUE_FALSE_OPTIONS = [
  { id: 'TRUE', text: 'True / Tama' },
  { id: 'FALSE', text: 'False / Mali' }
];
const PLACEHOLDER_OPTIONS = ['A', 'B', 'C', 'D'].map(id => ({ id, text: `Option ${id}` }));

/** Choices to render for a question, with fallbacks when the quiz has none stored. */
export function optionsFor(question) {
  if (!question) return [];
  if (Array.isArray(question.options) && question.options.length > 0) return question.options;
  return question.question_type === 'TRUE_FALSE' ? TRUE_FALSE_OPTIONS : PLACEHOLDER_OPTIONS;
}
