import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Plus } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import useRemoteData from '../../hooks/useRemoteData';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import { Loading, Notice } from '../../components/ui/Feedback';
import { readJSON, remove, write } from '../../utils/deviceStorage';
import QuizInfoFields from './QuizInfoFields';
import QuestionEditor from './QuestionEditor';
import { buildQuizPayload, emptyQuiz, newQuestion, quizToForm, totalPoints } from './quizForm';

/**
 * Quiz authoring with a device-local draft. With a quiz id in the route (/teacher/quizzes/:id/edit)
 * it edits that quiz instead; once students have attempted it, questions, topic and passing score lock.
 */
export default function QuizManager({ onQuizCreated }) {
  const { user } = useAuth();
  const { id } = useParams();
  const editing = Boolean(id);
  const draftKey = `aralytics:quiz-draft:${user.id}`;
  const [form, setForm] = useState(() => {
    if (editing) return emptyQuiz();
    const saved = readJSON(draftKey);
    return saved?.questions?.length ? saved : emptyQuiz();
  });
  const { data, loading, error } = useRemoteData(api.getTaxonomy);
  const quizLoad = useRemoteData(() => (editing ? api.getQuizById(id) : null), [id]);
  const action = useAsyncAction();
  const total = totalPoints(form.questions);
  const quiz = quizLoad.data?.quiz;
  const locked = editing && Number(quiz?.attempt_count) > 0;

  useEffect(() => {
    if (editing && quiz) setForm(quizToForm(quiz));
  }, [editing, quiz]);

  const change = e => setForm({ ...form, [e.target.name]: e.target.value });
  const setQuestions = fn => setForm(f => ({ ...f, questions: fn(f.questions) }));
  const updateQuestion = (key, patch) => setQuestions(qs => qs.map(q => (q.key === key ? { ...q, ...patch } : q)));

  function publish(e) {
    e.preventDefault();
    action.setMessage('');
    let payload;
    try {
      payload = buildQuizPayload(form);
    } catch (err) {
      action.setError(err.message);
      return;
    }
    action.run(async () => {
      if (editing) {
        // Locked quizzes keep their questions, topic and passing score; the server rejects them otherwise.
        if (locked) {
          delete payload.questions;
          delete payload.competency_id;
          delete payload.passing_score;
        }
        requireSuccess(await api.updateQuiz(id, payload));
      } else {
        requireSuccess(await api.createQuiz(payload));
        remove(draftKey);
      }
      onQuizCreated?.();
    });
  }

  function saveDraft() {
    if (write(draftKey, form)) action.setMessage('Draft saved on this device.');
    else action.setError('Could not save a draft on this device.');
  }

  const pageLoading = loading || (editing && quizLoad.loading);
  return (
    <div className="container" style={{ maxWidth: 1000 }}>
      <Link className="text-action" to="/teacher/assessments">← Back to quizzes and tasks</Link>
      <div className="page-heading" style={{ marginTop: 16 }}>
        <div>
          <h1>{editing ? 'Edit quiz' : 'Create a quiz'}</h1>
          <p>
            {editing
              ? 'Change the quiz details and questions, then save.'
              : 'Write your multiple choice questions, pick a topic, and publish when ready.'}
          </p>
        </div>
      </div>
      <Notice error>{error || quizLoad.error || action.error}</Notice>
      <Notice success>{action.message}</Notice>
      {locked && (
        <Notice>
          Students have already taken this quiz, so its questions, topic and passing score are locked. You can still change the title, instructions, time limit and screen monitor setting. To change the questions, archive this quiz and create a new one.
        </Notice>
      )}
      {pageLoading ? (
        <Loading>{editing ? 'Loading quiz…' : 'Loading topics…'}</Loading>
      ) : (
        <form onSubmit={publish}>
          <QuizInfoFields form={form} competencies={data?.flatCompetencies || []} total={total} onChange={change} locked={locked} />
          <section className="section">
            <div className="section-heading">
              <h2>Questions ({form.questions.length})</h2>
              <button className="btn btn-secondary" type="button" disabled={locked} onClick={() => setQuestions(qs => [...qs, newQuestion()])}>
                <Plus size={17} />
                Add question
              </button>
            </div>
            <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              {form.questions.map((q, i) => (
                <QuestionEditor
                  key={q.key}
                  question={q}
                  number={i + 1}
                  removable={form.questions.length > 1}
                  onChange={patch => updateQuestion(q.key, patch)}
                  onRemove={() => setQuestions(qs => qs.filter(item => item.key !== q.key))}
                />
              ))}
            </fieldset>
          </section>
          <div className="section">
            <p className="muted" style={{ marginBottom: 20 }}>
              {editing
                ? 'Saving updates the quiz for your students right away.'
                : 'Publishing makes this quiz ready for your students. You can also save a draft on this device first.'}
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary" disabled={Boolean(action.busy)}>
                {editing ? (action.busy ? 'Saving…' : 'Save changes') : action.busy ? 'Publishing…' : 'Publish quiz'}
                <ArrowRight size={17} />
              </button>
              {!editing && (
                <button className="btn btn-secondary" type="button" disabled={Boolean(action.busy)} onClick={saveDraft}>
                  Save draft
                </button>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
