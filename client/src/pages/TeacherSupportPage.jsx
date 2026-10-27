import React, { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, ArrowUp, ArrowDown, Trash2 } from '../components/icons';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import Dialog from '../components/ui/Dialog';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import { cleanText, formatStatus } from '../utils/learning';

export default function TeacherSupportPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newPlan, setNewPlan] = useState({ student_id: '', competency_id: '', material_id: '', status: 'ASSIGNED' });
  const [orderList, setOrderList] = useState([]);
  const [material, setMaterial] = useState('');
  const [override, setOverride] = useState('COMPLETED');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const close = useCallback(() => {
    setEditing(null);
    setShowCreate(false);
  }, []);
  const { data, loading, error, refresh } = useRemoteData(async () => {
    const [queueRes, classesRes, profRes, matsRes] = await Promise.all([
      api.getRemediationQueue({ section: params.get('section') || '', status }),
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
  }, [params.get('section'), status]);

  const sortedQueue = (() => {
    const list = [...(data?.queue || [])];
    if (!orderList.length) return list;
    const rank = new Map(orderList.map((id, idx) => [id, idx]));
    return list.sort((a, b) => (rank.get(a.intervention_id) ?? 999) - (rank.get(b.intervention_id) ?? 999));
  })();

  function moveRow(index, delta) {
    const ids = sortedQueue.map(q => q.intervention_id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setOrderList(ids);
  }

  async function act(id, action, options = {}) {
    setBusy(true);
    setActionError('');
    try {
      const res = await api.handleInterventionAction(id, { action, ...options });
      if (!res.success) throw new Error(res.message);
      setMessage('Student support updated.');
      setEditing(null);
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createCustom(e) {
    e.preventDefault();
    setBusy(true);
    setActionError('');
    try {
      const res = await api.createIntervention(newPlan);
      if (!res.success) throw new Error(res.message);
      setMessage('Practice plan assigned to student.');
      setShowCreate(false);
      setNewPlan({ student_id: '', competency_id: '', material_id: '', status: 'ASSIGNED' });
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePlan(id) {
    setBusy(true);
    setActionError('');
    try {
      const res = await api.deleteIntervention(id);
      if (!res.success) throw new Error(res.message);
      setMessage('Practice plan removed.');
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <Link className="text-action" to="/teacher/classes">
        ← Back to classes
      </Link>
      <div className="page-heading" style={{ marginTop: 20 }}>
        <div>
          <h1>Student support</h1>
          <p>Assign extra reading and practice materials to students who need help with a topic.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setActionError('');
            setShowCreate(true);
          }}
        >
          <Plus size={17} />
          Assign practice
        </button>
      </div>
      <Notice error>{error || (!editing && !showCreate && actionError)}</Notice>
      <Notice success>{message}</Notice>
      {error && (
        <button className="text-action" onClick={refresh}>
          Try again
        </button>
      )}
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
      ) : !sortedQueue.length ? (
        <EmptyState title="No support plans found">
          Students who score low on a quiz will show up here, or click Assign practice to add one manually.
        </EmptyState>
      ) : (
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
              {sortedQueue.map((q, idx) => (
                <tr key={q.intervention_id}>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={idx === 0}
                        aria-label="Move up"
                        onClick={() => moveRow(idx, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={idx === sortedQueue.length - 1}
                        aria-label="Move down"
                        onClick={() => moveRow(idx, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <strong>{cleanText(q.student.name)}</strong>
                    <small>{cleanText(q.student.section)}</small>
                  </td>
                  <td>
                    {cleanText(q.competency.topic_title)}
                    <small>
                      {q.assessment_performance.percentage === null
                        ? 'Added by teacher'
                        : `${q.assessment_performance.percentage}% · ${
                            q.assessment_performance.tab_switch_count || 0
                          } screen changes`}
                    </small>
                  </td>
                  <td>{cleanText(q.assigned_remedial_material?.title, 'Choose a material')}</td>
                  <td>
                    <Status tone={q.status === 'COMPLETED' ? 'good' : 'pending'}>{formatStatus(q.status)}</Status>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                      {q.status === 'RECOMMENDED' && (
                        <button
                          className="text-action"
                          disabled={busy}
                          onClick={() => act(q.intervention_id, 'APPROVE')}
                        >
                          Approve
                        </button>
                      )}
                      <button
                        className="text-action"
                        onClick={() => {
                          setEditing({ ...q, action: 'MODIFY' });
                          setMaterial(
                            q.assigned_remedial_material?.id || q.available_competency_remedials[0]?.id || ''
                          );
                          setActionError('');
                        }}
                      >
                        Change material
                      </button>
                      <button
                        className="text-action"
                        onClick={() => {
                          setEditing({ ...q, action: 'OVERRIDE' });
                          setOverride('COMPLETED');
                          setActionError('');
                        }}
                      >
                        Mark done
                      </button>
                      <button
                        type="button"
                        className="text-action"
                        disabled={busy}
                        onClick={() => removePlan(q.intervention_id)}
                      >
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
      )}
      {editing && (
        <Dialog
          title={`${editing.action === 'MODIFY' ? 'Change material for' : 'Update status for'} ${cleanText(
            editing.student.name
          )}`}
          onClose={close}
        >
          <Notice error>{actionError}</Notice>
          <p style={{ marginBottom: 20 }}>{cleanText(editing.competency.topic_title)}</p>
          <form
            onSubmit={e => {
              e.preventDefault();
              act(
                editing.intervention_id,
                editing.action,
                editing.action === 'MODIFY' ? { material_id: material } : { override_status: override }
              );
            }}
          >
            {editing.action === 'MODIFY' ? (
              <div className="field">
                <label htmlFor="support-material">Review material</label>
                <select
                  id="support-material"
                  className="form-input"
                  value={material}
                  onChange={e => setMaterial(e.target.value)}
                  required
                >
                  <option value="">Choose material</option>
                  {editing.available_competency_remedials.map(m => (
                    <option key={m.id} value={m.id}>
                      {cleanText(m.title)}
                    </option>
                  ))}
                </select>
                {!editing.available_competency_remedials.length && (
                  <small>No review material is linked to this topic yet.</small>
                )}
              </div>
            ) : (
              <div className="field">
                <label htmlFor="support-resolution">New status</label>
                <select
                  id="support-resolution"
                  className="form-input"
                  value={override}
                  onChange={e => setOverride(e.target.value)}
                >
                  <option value="COMPLETED">Completed</option>
                  <option value="EXEMPTED">Excused by teacher</option>
                  <option value="OVERRIDDEN">Marked complete by teacher</option>
                </select>
              </div>
            )}
            <button className="btn btn-primary" disabled={busy || (editing.action === 'MODIFY' && !material)}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </Dialog>
      )}
      {showCreate && (
        <Dialog title="Assign extra practice" onClose={close}>
          <Notice error>{actionError}</Notice>
          <form onSubmit={createCustom}>
            <div className="field">
              <label htmlFor="new-intv-student">Student</label>
              <select
                id="new-intv-student"
                className="form-input"
                value={newPlan.student_id}
                onChange={e => setNewPlan({ ...newPlan, student_id: e.target.value })}
                required
              >
                <option value="">Choose a student</option>
                {data?.learners.map(l => (
                  <option key={l.id} value={l.id}>
                    {cleanText(l.first_name)} {cleanText(l.last_name)} ({cleanText(l.section)})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-intv-comp">Topic</label>
              <select
                id="new-intv-comp"
                className="form-input"
                value={newPlan.competency_id}
                onChange={e => setNewPlan({ ...newPlan, competency_id: e.target.value })}
                required
              >
                <option value="">Choose a topic</option>
                {data?.competencies.map(c => (
                  <option key={c.competency_id} value={c.competency_id}>
                    {cleanText(c.quarter)} · {cleanText(c.topic_title)}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Assign practice'}
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
