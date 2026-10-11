function isCorrect(question, answer) {
  if (answer === undefined || answer === null || answer === '') return false;
  const value = typeof answer === 'object' ? JSON.stringify(answer) : String(answer).trim();
  const correct = String(question.correct_answer || '').trim();
  if (!correct) return false;
  if (question.question_type === 'IDENTIFICATION') {
    const normalize = text => text.toLowerCase().replace(/['".,]/g, '').trim();
    return correct.split('|').map(normalize).includes(normalize(value));
  }
  if (question.question_type === 'TRUE_FALSE') {
    const normalize = text => ['TRUE', 'TAMA', 'T', '1'].includes(text.toUpperCase()) ? 'TRUE' : ['FALSE', 'MALI', 'F', '0'].includes(text.toUpperCase()) ? 'FALSE' : null;
    return normalize(value) !== null && normalize(value) === normalize(correct);
  }
  if (question.question_type === 'MATCHING') {
    try {
      const selected = typeof answer === 'object' ? answer : JSON.parse(value);
      const expected = JSON.parse(correct);
      const keys = Object.keys(expected);
      return keys.length > 0 && selected && keys.every(k => String(selected[k] || '').trim().toLowerCase() === String(expected[k]).trim().toLowerCase());
    } catch { return false; }
  }
  return value.toLowerCase() === correct.toLowerCase();
}
function gradeAnswers(questions, answers) {
  const ids = new Set(questions.map(q => q.id));
  const map = new Map();
  for (const answer of answers) {
    if (!ids.has(answer.question_id) || map.has(answer.question_id)) throw new Error('The answer list contains an unknown or duplicate question.');
    map.set(answer.question_id, answer.selected_answer);
  }
  const records = questions.map(q => ({ question_id: q.id, selected_answer: map.get(q.id) ?? '', is_correct: isCorrect(q,map.get(q.id)), points: Number(q.points) || 1 }));
  return { records, score: records.reduce((sum,a) => sum + (a.is_correct ? a.points : 0),0), total: records.reduce((sum,a) => sum + a.points,0) };
}
module.exports = { isCorrect, gradeAnswers };
