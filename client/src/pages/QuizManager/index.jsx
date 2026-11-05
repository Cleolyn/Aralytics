import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from '../../components/icons';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import useRemoteData from '../../hooks/useRemoteData';
import useAsyncAction, { requireSuccess } from '../../hooks/useAsyncAction';
import { Loading, Notice } from '../../components/ui/Feedback';
import { readJSON, remove, write } from '../../utils/deviceStorage';
import QuizInfoFields from './QuizInfoFields';
import QuestionEditor from './QuestionEditor';
import { buildQuizPayload, emptyQuiz, newQuestion, totalPoints } from './quizForm';

/** Quiz authoring with a device-local draft. */
export default function QuizManager({ onQuizCreated }) {
  const { user } = useAuth();
  const draftKey = `aralytics:quiz-draft:${user.id}`;
  const [form, setForm] = useState(() => {
    const saved = readJSON(draftKey);
    return saved?.questions?.length ? saved : emptyQuiz();
  });
  const { data, loading, error } = useRemoteData(api.getTaxonomy);
  const action = useAsyncAction();
  const total = totalPoints(form.questions);

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
      requireSuccess(await api.createQuiz(payload));
      remove(draftKey);
      onQuizCreated?.();
    });
  }

  function saveDraft() {
    if (write(draftKey, form)) action.setMessage('Draft saved on this device.');
    else action.setError('Could not save a draft on this device.');
  }

  return (
    <div className="container" style={{ maxWidth: 1000 }}>
      <Link className="text-action" to="/teacher/assessments">← Back to quizzes and tasks</Link>
      <div className="page-heading" style={{ marginTop: 16 }}>
        <div>
          <h1>Create a quiz</h1>
          <p>Write your multiple choice questions, pick a topic, and publish when ready.</p>
        </div>
      </div>
      <Notice error>{error || action.error}</Notice>
      <Notice success>{action.message}</Notice>
      {loading ? (
        <Loading>Loading topics…</Loading>
      ) : (
        <form onSubmit={publish}>
          <QuizInfoFields form={form} competencies={data?.flatCompetencies || []} total={total} onChange={change} />
          <section className="section">
            <div className="section-heading">
              <h2>Questions ({form.questions.length})</h2>
              <button className="btn btn-secondary" type="button" onClick={() => setQuestions(qs => [...qs, newQuestion()])}>
                <Plus size={17} />
                Add question
              </button>
            </div>
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
          </section>
          <div className="section">
            <p className="muted" style={{ marginBottom: 20 }}>
              Publishing makes this quiz ready for your students. You can also save a draft on this device first.
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary" disabled={action.busy}>
                {action.busy ? 'Publishing…' : 'Publish quiz'}
                <ArrowRight size={17} />
              </button>
              <button className="btn btn-secondary" type="button" disabled={action.busy} onClick={saveDraft}>
                Save draft
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
