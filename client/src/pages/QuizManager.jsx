import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, ArrowRight } from '../components/icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import { Loading, Notice } from '../components/ui/Feedback';

const questionTypes = { MULTIPLE_CHOICE: 'Multiple choice (Standard)', SITUATIONAL: 'Multiple choice (Situational)', PISA_LIKE: 'Multiple choice (Application / PISA-like)' };
const newQuestion = () => ({ key: crypto.randomUUID(), question_text: '', question_type: 'MULTIPLE_CHOICE', points: 1, options: ['A','B','C','D'].map(id => ({ id,text: '' })), correct_answer: 'A' });

export default function QuizManager({ onQuizCreated }) {
  const { user } = useAuth();
  const draftKey = `aralytics:quiz-draft:${user.id}`;
  const [form,setForm] = useState(() => { try { const saved = JSON.parse(localStorage.getItem(draftKey)); if (saved?.questions?.length) return saved; } catch {} return { competency_id: '', title: '', instructions: '', time_limit_minutes: 20, passing_score: 1, max_blur_limit: 3, questions: [newQuestion()] }; });
  const { data, loading, error } = useRemoteData(api.getTaxonomy);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [actionError,setActionError] = useState('');
  const total = form.questions.reduce((n,q) => n + Number(q.points || 0),0);
  const change = e => setForm({ ...form,[e.target.name]: e.target.value });
  const update = (key,patch) => setForm(f => ({ ...f,questions: f.questions.map(q => q.key === key ? { ...q,...patch } : q) }));
  async function publish(e) {
    e.preventDefault(); setActionError(''); setMessage('');
    if (Number(form.passing_score) > total) { setActionError(`Passing score cannot exceed the ${total} available points.`); return; }
    let questions;
    try { questions = form.questions.map(({ key, matching_options,...q }) => {
      if (!q.question_text.trim()) throw new Error('Add text to every multiple-choice question.');
      const opts = Array.isArray(q.options) && q.options.length === 4 ? q.options : ['A','B','C','D'].map(id => ({ id, text: '' }));
      if (opts.some(o => !o.text.trim())) throw new Error('Fill in all 4 multiple-choice options (A, B, C, D) for every question.');
      if (!['A','B','C','D'].includes(q.correct_answer)) throw new Error('Select a valid correct option (A, B, C, or D).');
      return { ...q, question_type: ['MULTIPLE_CHOICE','SITUATIONAL','PISA_LIKE'].includes(q.question_type) ? q.question_type : 'MULTIPLE_CHOICE', options: opts, points: Number(q.points) };
    }); } catch (err) { setActionError(err.message); return; }
    setBusy(true);
    try { const res = await api.createQuiz({ ...form, questions,time_limit_minutes: Number(form.time_limit_minutes),passing_score: Number(form.passing_score),max_blur_limit: Number(form.max_blur_limit) }); if (!res.success) throw new Error(res.message); localStorage.removeItem(draftKey); onQuizCreated?.(); }
    catch (err) { setActionError(err.message); } finally { setBusy(false); }
  }
  return <div className="container" style={{ maxWidth: 1000 }}><Link className="text-action" to="/teacher/assessments">← Back to assessments</Link><div className="page-heading" style={{ marginTop: 16 }}><div><h1>Create a multiple-choice quiz</h1><p>Connect your multiple-choice questions to a learning goal, then publish when ready.</p></div></div><Notice error>{error || actionError}</Notice><Notice success>{message}</Notice>
    {loading ? <Loading>Loading learning goals…</Loading> : <form onSubmit={publish}><section><h2 style={{ marginBottom: 24 }}>Quiz details</h2><div className="field"><label htmlFor="quiz-title">Title</label><input id="quiz-title" name="title" className="form-input" value={form.title} onChange={change} required /></div><div className="field"><label htmlFor="quiz-goal">Learning goal</label><select id="quiz-goal" name="competency_id" className="form-input" value={form.competency_id} onChange={change} required><option value="">Choose a learning goal</option>{data?.flatCompetencies.map(c => <option key={c.id} value={c.id}>{c.melc_code} · {c.description}</option>)}</select></div><div className="field"><label htmlFor="quiz-instructions">Instructions for learners</label><textarea id="quiz-instructions" name="instructions" className="form-input" value={form.instructions} onChange={change} /></div>
      <div className="form-grid"><div className="field"><label htmlFor="quiz-time">Time limit (minutes)</label><input id="quiz-time" className="form-input" type="number" name="time_limit_minutes" min={1} max={120} value={form.time_limit_minutes} onChange={change} required /></div><div className="field"><label htmlFor="quiz-pass">Passing score (out of {total})</label><input id="quiz-pass" className="form-input" type="number" name="passing_score" min={1} max={total} value={form.passing_score} onChange={change} required /></div></div>
      <details className="section" style={{ paddingTop: 16 }}><summary>Assessment monitoring settings</summary><div className="field" style={{ marginTop: 16 }}><label htmlFor="quiz-focus">Focus changes before teacher review</label><input id="quiz-focus" className="form-input" type="number" name="max_blur_limit" min={1} max={10} value={form.max_blur_limit} onChange={change} required /><small className="field-help">Tab switches, window minimizes, and fullscreen exits are recorded during the quiz.</small></div></details></section>
      <section className="section"><div className="section-heading"><h2>Multiple-Choice Questions ({form.questions.length})</h2><button className="btn btn-secondary" type="button" onClick={() => setForm(f => ({ ...f,questions: [...f.questions,newQuestion()] }))}><Plus size={17} />Add question</button></div>
      {form.questions.map((q,i) => <section className="section" key={q.key}><div className="section-heading"><h3>Question {i + 1}</h3>{form.questions.length > 1 && <button type="button" className="icon-button" aria-label={`Remove question ${i + 1}`} onClick={() => setForm(f => ({ ...f,questions: f.questions.filter(item => item.key !== q.key) }))}><Trash2 size={18} /></button>}</div><div className="form-grid"><div className="field"><label htmlFor={`${q.key}-type`}>Question style</label><select id={`${q.key}-type`} className="form-input" value={q.question_type} onChange={e => update(q.key,{ question_type: e.target.value, correct_answer: 'A' })}>{Object.entries(questionTypes).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label htmlFor={`${q.key}-points`}>Points</label><input id={`${q.key}-points`} className="form-input" type="number" min={1} max={100} value={q.points} onChange={e => update(q.key,{ points: e.target.value })} required /></div></div>
        <div className="field"><label htmlFor={`${q.key}-text`}>Question text</label><textarea id={`${q.key}-text`} className="form-input" value={q.question_text} onChange={e => update(q.key,{ question_text: e.target.value })} required /></div>
        <div className="form-grid">{(q.options || ['A','B','C','D'].map(id => ({ id, text: '' }))).map(o => <div className="field" key={o.id}><label htmlFor={`${q.key}-${o.id}`}>Option {o.id}</label><input id={`${q.key}-${o.id}`} className="form-input" value={o.text} required onChange={e => update(q.key,{ options: q.options.map(item => item.id === o.id ? { ...item,text: e.target.value } : item) })} /></div>)}</div>
        <div className="field"><label htmlFor={`${q.key}-answer`}>Correct answer</label><select id={`${q.key}-answer`} className="form-input" value={q.correct_answer} onChange={e => update(q.key,{ correct_answer: e.target.value })}>{(q.options || []).map(o => <option key={o.id} value={o.id}>Option {o.id}</option>)}</select></div>
      </section>)}</section><div className="section"><p className="muted" style={{ marginBottom: 20 }}>Publishing makes this quiz available to learners. You can save a draft on this device before publishing.</p><div className="hero-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish quiz'}<ArrowRight size={17} /></button><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => { try { localStorage.setItem(draftKey,JSON.stringify(form)); setMessage('Draft saved on this device.'); } catch { setActionError('Could not save a draft on this device.'); } }}>Save local draft</button></div></div>
    </form>}
  </div>;
}
