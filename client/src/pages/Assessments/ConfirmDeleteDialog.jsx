import React, { useState } from 'react';
import { api } from '../../services/api';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import Dialog from '../../components/ui/Dialog';
import { Notice } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';

const ARCHIVE_INSTEAD = ['QUIZ_HAS_ATTEMPTS', 'TASK_HAS_GRADES'];

/**
 * Confirm deleting a quiz or task. When the server refuses because students already have scores or
 * submissions, the dialog offers the safe alternative: archive, or (ungraded tasks) delete the submissions too.
 */
export default function ConfirmDeleteDialog({ kind, item, onClose, onDone }) {
  const isQuiz = kind === 'quiz';
  const noun = isQuiz ? 'quiz' : 'task';
  const action = useAsyncAction();
  const [blocked, setBlocked] = useState(null);

  const remove = force =>
    action.run(async () => {
      try {
        requireSuccess(isQuiz ? await api.deleteQuiz(item.id) : await api.deletePerformanceTask(item.id, { force }));
      } catch (err) {
        if (ARCHIVE_INSTEAD.includes(err.code) || err.code === 'TASK_HAS_SUBMISSIONS') {
          setBlocked({ code: err.code, message: err.message });
          return;
        }
        throw err;
      }
      onDone(`The ${noun} was deleted.`);
    });

  const archive = () =>
    action.run(async () => {
      requireSuccess(isQuiz ? await api.archiveQuiz(item.id) : await api.archivePerformanceTask(item.id));
      onDone(`The ${noun} was archived. Students no longer see it and the scores are kept.`);
    });

  return (
    <Dialog title={`Delete this ${noun}?`} onClose={onClose}>
      <Notice error>{action.error}</Notice>
      {blocked && <Notice error>{blocked.message}</Notice>}
      <p style={{ marginBottom: 20 }}>
        <strong>{cleanText(item.title)}</strong> will be removed for good. This cannot be undone.
      </p>
      <div className="hero-actions">
        {blocked && ARCHIVE_INSTEAD.includes(blocked.code) && (
          <button className="btn btn-primary" disabled={Boolean(action.busy)} onClick={archive}>
            Archive instead
          </button>
        )}
        {blocked?.code === 'TASK_HAS_SUBMISSIONS' && (
          <>
            <button className="btn btn-primary" disabled={Boolean(action.busy)} onClick={archive}>
              Archive instead
            </button>
            <button className="btn btn-secondary" disabled={Boolean(action.busy)} onClick={() => remove(true)}>
              Delete submissions too
            </button>
          </>
        )}
        {!blocked && (
          <button className="btn btn-primary" disabled={Boolean(action.busy)} onClick={() => remove(false)}>
            {action.busy ? 'Deleting…' : `Delete ${noun}`}
          </button>
        )}
        <button className="btn btn-secondary" disabled={Boolean(action.busy)} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
