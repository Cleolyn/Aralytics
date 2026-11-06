import React, { useState } from 'react';
import { api } from '../../services/api';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import Dialog from '../../components/ui/Dialog';
import { Notice } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';

const toDateInput = value => (value ? String(value).slice(0, 10) : '');

/**
 * Create a class task, or edit one when `task` is given. Once students have submitted work the
 * topic, quarter and points are locked (the server enforces the same rule).
 */
export default function TaskFormDialog({ task, competencies = [], onClose, onSaved }) {
  const editing = Boolean(task);
  const locked = editing && Number(task.stats?.total_submissions) > 0;
  const initialDue = toDateInput(task?.due_date);
  const action = useAsyncAction();
  const [form, setForm] = useState({
    title: task?.title || '',
    instructions: task?.instructions || '',
    competency_id: task?.competency_id || '',
    quarter: task?.quarter || 'Q1',
    due_date: initialDue,
    total_points: task?.total_points ?? 40,
    rubric_criteria: task?.rubric_criteria || ''
  });

  function save(e) {
    e.preventDefault();
    action.run(async () => {
      if (editing) {
        const payload = {
          title: form.title,
          instructions: form.instructions,
          rubric_criteria: form.rubric_criteria,
          // Resending an unchanged date would move its time of day, so only send real changes.
          ...(form.due_date !== initialDue && { due_date: form.due_date ? `${form.due_date}T23:59:59+08:00` : null }),
          ...(!locked && { competency_id: form.competency_id, quarter: form.quarter, total_points: Number(form.total_points) })
        };
        requireSuccess(await api.updatePerformanceTask(task.id, payload));
        onSaved('Class task updated.');
      } else {
        requireSuccess(await api.createPerformanceTask({
          ...form,
          total_points: Number(form.total_points),
          due_date: form.due_date ? `${form.due_date}T23:59:59+08:00` : null
        }));
        onSaved('Class task saved. Students can now see it in Activities.');
      }
    });
  }

  return (
    <Dialog title={editing ? 'Edit class task' : 'Create a class task'} onClose={onClose}>
      <Notice error>{action.error}</Notice>
      {locked && (
        <Notice>Students have already submitted work, so the topic and points are locked. You can still change the title, instructions, grading guide and due date.</Notice>
      )}
      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="task-title">Title</label>
          <input id="task-title" className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="task-goal">Topic</label>
          <select
            id="task-goal"
            className="form-input"
            value={form.competency_id}
            disabled={locked}
            onChange={e => {
              const c = competencies.find(item => item.id === e.target.value);
              setForm({ ...form, competency_id: e.target.value, quarter: c?.quarter_code || 'Q1' });
            }}
            required
          >
            <option value="">Choose a topic</option>
            {competencies.map(c => (
              <option key={c.id} value={c.id}>
                {cleanText(c.melc_code)} · {cleanText(c.description)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="task-instructions">Instructions</label>
          <textarea id="task-instructions" className="form-input" value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} required />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="task-due">Due date</label>
            <input id="task-due" className="form-input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="task-points">Total points</label>
            <input
              id="task-points"
              className="form-input"
              type="number"
              min={1}
              max={1000}
              value={form.total_points}
              disabled={locked}
              onChange={e => setForm({ ...form, total_points: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="task-rubric">Grading guide (optional)</label>
          <textarea id="task-rubric" className="form-input" value={form.rubric_criteria} onChange={e => setForm({ ...form, rubric_criteria: e.target.value })} />
        </div>
        <p className="muted" style={{ marginBottom: 20 }}>
          {editing ? 'Saving updates the task for your students right away.' : 'Saving this task makes it visible to your students.'}
        </p>
        <button className="btn btn-primary" disabled={Boolean(action.busy)}>
          {action.busy ? 'Saving…' : editing ? 'Save changes' : 'Save task'}
        </button>
      </form>
    </Dialog>
  );
}
