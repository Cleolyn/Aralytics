import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from '../../components/icons';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import useRemoteData from '../../hooks/useRemoteData';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import { EmptyState, Loading, Notice } from '../../components/ui/Feedback';
import { cleanText } from '../../utils/learning';
import { cachedMaterials, downloadMaterial, loadMaterials, loadReadingLogs, removeDownload, syncReading } from '../../utils/offlineLearning';
import LessonFilters from './LessonFilters';
import LessonTable from './LessonTable';
import LessonFormDialog from './LessonFormDialog';
import { buildLessonPayload, filterLessons } from './lessons';

/** Lesson library: learners read and save lessons offline; teachers also add, edit, and delete. */
export default function MaterialsHub() {
  const { isTeacher, user } = useAuth();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    search: '', quarter: '', type: '', phase: params.get('stage') || '', savedOnly: params.get('downloaded') === 'true'
  }));
  // null = closed; { lesson: null } = adding; { lesson } = editing.
  const [dialog, setDialog] = useState(null);
  const action = useAsyncAction();
  const [progress, setProgress] = useState(0);

  const { data, loading, error, refresh } = useRemoteData(async () => {
    await syncReading(user.id);
    const [materials, logs, cached, taxonomy] = await Promise.all([
      loadMaterials(user.id),
      loadReadingLogs(user.id),
      cachedMaterials(),
      api.getTaxonomy().catch(() => ({ flatCompetencies: [] }))
    ]);
    return { materials, logs, cached, competencies: taxonomy.flatCompetencies || [] };
  }, [user.id]);

  // Re-read the catalog when connectivity changes (online data vs. offline cache).
  useEffect(() => {
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, [refresh]);

  const closeDialog = useCallback(() => setDialog(null), []);
  const openDialog = lesson => {
    action.setError('');
    setDialog({ lesson });
  };

  const competencyById = new Map(data?.competencies.map(c => [c.id, c]) || []);
  const readIds = new Set(data?.logs.map(l => l.material_id) || []);
  const lessons = data ? filterLessons(data.materials, { ...filters, cached: data.cached, competencyById }) : [];

  const toggleOffline = (lesson, saved) => action.run(async () => {
    await (saved ? removeDownload(lesson) : downloadMaterial(lesson));
    action.setMessage(saved ? 'Saved lesson removed from this device.' : 'Lesson saved. You can now open it without internet.');
    refresh();
  }, { key: lesson.id, clearMessage: true });

  const saveLesson = ({ form, file }) => action.run(async () => {
    setProgress(0);
    const payload = await buildLessonPayload(form, file, { onProgress: setProgress });
    const editing = dialog.lesson;
    requireSuccess(editing ? await api.updateMaterial(editing.id, payload) : await api.createMaterial(payload));
    closeDialog();
    action.setMessage(editing ? 'Lesson updated.' : 'Lesson added.');
    refresh();
  }, { key: 'save' });

  const deleteLesson = lesson => action.run(async () => {
    requireSuccess(await api.deleteMaterial(lesson.id));
    action.setMessage(`Removed "${cleanText(lesson.title)}".`);
    refresh();
  }, { key: lesson.id, clearMessage: true });

  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>Lessons</h1>
          <p>{isTeacher ? 'Upload and manage lesson files for your classes.' : 'Read your class lessons and save them for offline reading.'}</p>
        </div>
        {isTeacher && (
          <button className="btn btn-primary" onClick={() => openDialog(null)}>
            <Plus size={17} />
            Add lesson
          </button>
        )}
      </div>
      <Notice error>{error || (!dialog && action.error)}</Notice>
      <Notice success>{action.message}</Notice>
      {error && <button className="text-action" onClick={refresh}>Try again</button>}
      <LessonFilters filters={filters} onChange={patch => setFilters(f => ({ ...f, ...patch }))} />
      {loading ? (
        <Loading>Loading your lessons…</Loading>
      ) : !lessons.length ? (
        <EmptyState title={filters.savedOnly ? 'No saved lessons found' : 'No lessons found'}>
          Try changing your search filter{filters.savedOnly ? ' or save a lesson while online.' : '.'}
        </EmptyState>
      ) : (
        <LessonTable
          lessons={lessons}
          cached={data.cached}
          readIds={readIds}
          competencyById={competencyById}
          basePath={isTeacher ? '/teacher/materials' : '/student/materials'}
          isTeacher={isTeacher}
          busyId={action.busy}
          onToggleOffline={toggleOffline}
          onEdit={openDialog}
          onDelete={deleteLesson}
        />
      )}
      {dialog && (
        <LessonFormDialog
          lesson={dialog.lesson}
          competencies={data?.competencies || []}
          error={action.error}
          saving={action.busy === 'save'}
          progress={progress}
          onSubmit={saveLesson}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
