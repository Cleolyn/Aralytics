import React, { useState } from 'react';
import Dialog from '../../components/ui/Dialog';
import { Notice } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';

/**
 * MODIFY: choose a different review material. OVERRIDE: set a final status.
 * `onSubmit(options)` receives `{ material_id }` or `{ override_status }`.
 */
export default function EditPlanDialog({ plan, mode, error, saving, onSubmit, onClose }) {
  const remedials = plan.available_competency_remedials;
  const [material, setMaterial] = useState(plan.assigned_remedial_material?.id || remedials[0]?.id || '');
  const [override, setOverride] = useState('COMPLETED');
  const modify = mode === 'MODIFY';
  return (
    <Dialog title={`${modify ? 'Change material for' : 'Update status for'} ${cleanText(plan.student.name)}`} onClose={onClose}>
      <Notice error>{error}</Notice>
      <p style={{ marginBottom: 20 }}>{cleanText(plan.competency.topic_title)}</p>
      <form
        onSubmit={e => {
          e.preventDefault();
          onSubmit(modify ? { material_id: material } : { override_status: override });
        }}
      >
        {modify ? (
          <div className="field">
            <label htmlFor="support-material">Review material</label>
            <select id="support-material" className="form-input" value={material} onChange={e => setMaterial(e.target.value)} required>
              <option value="">Choose material</option>
              {remedials.map(m => (
                <option key={m.id} value={m.id}>{cleanText(m.title)}</option>
              ))}
            </select>
            {!remedials.length && <small>No review material is linked to this topic yet.</small>}
          </div>
        ) : (
          <div className="field">
            <label htmlFor="support-resolution">New status</label>
            <select id="support-resolution" className="form-input" value={override} onChange={e => setOverride(e.target.value)}>
              <option value="COMPLETED">Completed</option>
              <option value="EXEMPTED">Excused by teacher</option>
              <option value="OVERRIDDEN">Marked complete by teacher</option>
            </select>
          </div>
        )}
        <button className="btn btn-primary" disabled={saving || (modify && !material)}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </Dialog>
  );
}
