import React from 'react';
import { cleanText } from '../../utils/learning';

/** Title, topic, instructions, timing, passing score, and screen-monitor limit. `locked` freezes topic and passing score. */
export default function QuizInfoFields({ form, competencies, total, onChange, locked = false }) {
  return (
    <section>
      <h2 style={{ marginBottom: 24 }}>Quiz info</h2>
      <div className="field">
        <label htmlFor="quiz-title">Title</label>
        <input id="quiz-title" name="title" className="form-input" value={form.title} onChange={onChange} required />
      </div>
      <div className="field">
        <label htmlFor="quiz-goal">Topic</label>
        <select id="quiz-goal" name="competency_id" className="form-input" value={form.competency_id} onChange={onChange} required disabled={locked}>
          <option value="">Choose a topic</option>
          {competencies.map(c => (
            <option key={c.id} value={c.id}>
              {cleanText(c.melc_code)} · {cleanText(c.description)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="quiz-instructions">Instructions for students</label>
        <textarea id="quiz-instructions" name="instructions" className="form-input" value={form.instructions} onChange={onChange} />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="quiz-time">Time limit (minutes)</label>
          <input id="quiz-time" className="form-input" type="number" name="time_limit_minutes" min={1} max={120} value={form.time_limit_minutes} onChange={onChange} required />
        </div>
        <div className="field">
          <label htmlFor="quiz-pass">Passing score (out of {total})</label>
          <input id="quiz-pass" className="form-input" type="number" name="passing_score" min={1} max={total} value={form.passing_score} onChange={onChange} required disabled={locked} />
        </div>
      </div>
      <details className="section" style={{ paddingTop: 16 }}>
        <summary>Quiz screen monitor settings</summary>
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="quiz-focus">Allowed tab or window changes before alert</label>
          <input id="quiz-focus" className="form-input" type="number" name="max_blur_limit" min={1} max={10} value={form.max_blur_limit} onChange={onChange} required />
          <small className="field-help">Switching tabs or minimizing the window during the quiz is recorded for you to check.</small>
        </div>
      </details>
    </section>
  );
}
