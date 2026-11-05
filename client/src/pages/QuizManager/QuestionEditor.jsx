import React from 'react';
import { Trash2 } from '../../components/icons';
import { CHOICE_IDS, QUESTION_TYPES } from './quizForm';

/** Editor for one multiple-choice question. `onChange(patch)` merges fields into the question. */
export default function QuestionEditor({ question: q, number, removable, onChange, onRemove }) {
  const options = q.options || CHOICE_IDS.map(id => ({ id, text: '' }));
  const setChoice = (id, text) => onChange({ options: q.options.map(o => (o.id === id ? { ...o, text } : o)) });
  return (
    <section className="section">
      <div className="section-heading">
        <h3>Question {number}</h3>
        {removable && (
          <button type="button" className="icon-button" aria-label={`Remove question ${number}`} onClick={onRemove}>
            <Trash2 size={18} />
          </button>
        )}
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${q.key}-type`}>Question style</label>
          <select id={`${q.key}-type`} className="form-input" value={q.question_type} onChange={e => onChange({ question_type: e.target.value, correct_answer: 'A' })}>
            {Object.entries(QUESTION_TYPES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${q.key}-points`}>Points</label>
          <input id={`${q.key}-points`} className="form-input" type="number" min={1} max={100} value={q.points} onChange={e => onChange({ points: e.target.value })} required />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${q.key}-text`}>Question</label>
        <textarea id={`${q.key}-text`} className="form-input" value={q.question_text} onChange={e => onChange({ question_text: e.target.value })} required />
      </div>
      <div className="form-grid">
        {options.map(o => (
          <div className="field" key={o.id}>
            <label htmlFor={`${q.key}-${o.id}`}>Choice {o.id}</label>
            <input id={`${q.key}-${o.id}`} className="form-input" value={o.text} required onChange={e => setChoice(o.id, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="field">
        <label htmlFor={`${q.key}-answer`}>Correct answer</label>
        <select id={`${q.key}-answer`} className="form-input" value={q.correct_answer} onChange={e => onChange({ correct_answer: e.target.value })}>
          {(q.options || []).map(o => (
            <option key={o.id} value={o.id}>Choice {o.id}</option>
          ))}
        </select>
      </div>
    </section>
  );
}
