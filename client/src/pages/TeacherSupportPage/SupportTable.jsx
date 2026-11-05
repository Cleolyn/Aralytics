import React from 'react';
import { ArrowDown, ArrowUp, Trash2 } from '../../components/icons';
import { Status } from '../../components/ui/Feedback';
import { cleanText, formatStatus } from '../../utils/learning';

const performanceText = ({ percentage, tab_switch_count }) =>
  percentage === null ? 'Added by teacher' : `${percentage}% · ${tab_switch_count || 0} screen changes`;

/** Support plans with manual ordering and per-plan actions. */
export default function SupportTable({ plans, busy, onMove, onApprove, onEdit, onRemove }) {
  return (
    <div className="table-responsive" tabIndex={0} role="region" aria-label="Student support list">
      <table className="data-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Student</th>
            <th>Topic</th>
            <th>Review material</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan, i) => (
            <tr key={plan.intervention_id}>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" className="icon-button" disabled={i === 0} aria-label="Move up" onClick={() => onMove(i, -1)}>
                    <ArrowUp size={15} />
                  </button>
                  <button type="button" className="icon-button" disabled={i === plans.length - 1} aria-label="Move down" onClick={() => onMove(i, 1)}>
                    <ArrowDown size={15} />
                  </button>
                </div>
              </td>
              <td>
                <strong>{cleanText(plan.student.name)}</strong>
                <small>{cleanText(plan.student.section)}</small>
              </td>
              <td>
                {cleanText(plan.competency.topic_title)}
                <small>{performanceText(plan.assessment_performance)}</small>
              </td>
              <td>{cleanText(plan.assigned_remedial_material?.title, 'Choose a material')}</td>
              <td>
                <Status tone={plan.status === 'COMPLETED' ? 'good' : 'pending'}>{formatStatus(plan.status)}</Status>
              </td>
              <td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                  {plan.status === 'RECOMMENDED' && (
                    <button className="text-action" disabled={busy} onClick={() => onApprove(plan)}>
                      Approve
                    </button>
                  )}
                  <button className="text-action" onClick={() => onEdit(plan, 'MODIFY')}>
                    Change material
                  </button>
                  <button className="text-action" onClick={() => onEdit(plan, 'OVERRIDE')}>
                    Mark done
                  </button>
                  <button type="button" className="text-action" disabled={busy} onClick={() => onRemove(plan)}>
                    <Trash2 size={15} />
                    Remove
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
