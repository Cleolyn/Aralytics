import React, { useState } from 'react';
import Dialog from '../../components/ui/Dialog';
import { Notice } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';

const EMPTY_PLAN = { student_id: '', competency_id: '', material_id: '', status: 'ASSIGNED' };

/** Manually assign practice on a topic to one learner. */
export default function AssignPracticeDialog({ learners, competencies, error, saving, onSubmit, onClose }) {
  const [plan, setPlan] = useState(EMPTY_PLAN);
  const set = key => e => setPlan({ ...plan, [key]: e.target.value });
  return (
    <Dialog title="Assign extra practice" onClose={onClose}>
      <Notice error>{error}</Notice>
      <form
        onSubmit={e => {
          e.preventDefault();
          onSubmit(plan);
        }}
      >
        <div className="field">
          <label htmlFor="new-intv-student">Student</label>
          <select id="new-intv-student" className="form-input" value={plan.student_id} onChange={set('student_id')} required>
            <option value="">Choose a student</option>
            {learners.map(l => (
              <option key={l.id} value={l.id}>
                {cleanText(l.first_name)} {cleanText(l.last_name)} ({cleanText(l.section)})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="new-intv-comp">Topic</label>
          <select id="new-intv-comp" className="form-input" value={plan.competency_id} onChange={set('competency_id')} required>
            <option value="">Choose a topic</option>
            {competencies.map(c => (
              <option key={c.competency_id} value={c.competency_id}>
                {cleanText(c.quarter)} · {cleanText(c.topic_title)}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Assign practice'}
        </button>
      </form>
    </Dialog>
  );
}
