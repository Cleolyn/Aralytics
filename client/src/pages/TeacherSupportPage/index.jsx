import React, { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from '../../components/icons';
import { api } from '../../services/api';
import useRemoteData from '../../hooks/useRemoteData';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import { EmptyState, Loading, Notice } from '../../components/ui/Feedback';
import SupportTable from './SupportTable';
import EditPlanDialog from './EditPlanDialog';
import AssignPracticeDialog from './AssignPracticeDialog';

/** Apply a local manual order (list of intervention ids); unknown ids sort last. */
function inOrder(queue, order) {
  if (!order.length) return queue;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...queue].sort((a, b) => (rank.get(a.intervention_id) ?? 999) - (rank.get(b.intervention_id) ?? 999));
}

/** Remediation queue: approve, change, close, remove, or manually assign practice plans. */
export default function TeacherSupportPage() {
  const [params] = useSearchParams();
  const section = params.get('section') || '';
  const [status, setStatus] = useState('');
  const [order, setOrder] = useState([]);
  // { plan, mode: 'MODIFY' | 'OVERRIDE' } | { mode: 'CREATE' } | null
  const [dialog, setDialog] = useState(null);
  const action = useAsyncAction();
  const closeDialog = useCallback(() => setDialog(null), []);

  const { data, loading, error, refresh } = useRemoteData(async () => {
    const [queueRes, classesRes, profRes, matsRes] = await Promise.all([
      api.getRemediationQueue({ section, status }),
      api.getClasses(),
      api.getProficiencyProfiling(),
      api.getMaterials()
    ]);
    return {
      queue: queueRes.queue || [],
      learners: classesRes.learners || [],
      competencies: profRes.profiling || [],
      materials: matsRes.materials || []
    };
  }, [section, status]);

  const plans = inOrder(data?.queue || [], order);

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= plans.length) return;
    const ids = plans.map(p => p.intervention_id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setOrder(ids);
  };

  const openDialog = next => {
    action.setError('');
    setDialog(next);
  };

  const applyAction = (plan, kind, options = {}) => action.run(async () => {
    requireSuccess(await api.handleInterventionAction(plan.intervention_id, { action: kind, ...options }));
    action.setMessage('Student support updated.');
    setDialog(null);
    refresh();
  });

  const createPlan = plan => action.run(async () => {
    requireSuccess(await api.createIntervention(plan));
    action.setMessage('Practice plan assigned to student.');
    setDialog(null);
    refresh();
  });

  const removePlan = plan => action.run(async () => {
    requireSuccess(await api.deleteIntervention(plan.intervention_id));
    action.setMessage('Practice plan removed.');
    refresh();
  });

  return (
    <div className="container">
      <Link className="text-action" to="/teacher/classes">← Back to classes</Link>
      <div className="page-heading" style={{ marginTop: 20 }}>
        <div>
          <h1>Student support</h1>
          <p>Assign extra reading and practice materials to students who need help with a topic.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openDialog({ mode: 'CREATE' })}>
          <Plus size={17} />
          Assign practice
        </button>
      </div>
      <Notice error>{error || (!dialog && action.error)}</Notice>
      <Notice success>{action.message}</Notice>
      {error && <button className="text-action" onClick={refresh}>Try again</button>}
      <div className="field" style={{ maxWidth: 320 }}>
        <label htmlFor="support-status">Status</label>
        <select id="support-status" className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All records</option>
          <option value="RECOMMENDED">Suggested</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="COMPLETED">Completed</option>
          <option value="EXEMPTED">Excused</option>
        </select>
      </div>
      {loading ? (
        <Loading>Loading student support…</Loading>
      ) : !plans.length ? (
        <EmptyState title="No support plans found">
          Students who score low on a quiz will show up here, or click Assign practice to add one manually.
        </EmptyState>
      ) : (
        <SupportTable
          plans={plans}
          busy={action.busy}
          onMove={move}
          onApprove={plan => applyAction(plan, 'APPROVE')}
          onEdit={(plan, mode) => openDialog({ plan, mode })}
          onRemove={removePlan}
        />
      )}
      {dialog?.plan && (
        <EditPlanDialog
          plan={dialog.plan}
          mode={dialog.mode}
          error={action.error}
          saving={action.busy}
          onSubmit={options => applyAction(dialog.plan, dialog.mode, options)}
          onClose={closeDialog}
        />
      )}
      {dialog?.mode === 'CREATE' && (
        <AssignPracticeDialog
          learners={data?.learners || []}
          competencies={data?.competencies || []}
          error={action.error}
          saving={action.busy}
          onSubmit={createPlan}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
