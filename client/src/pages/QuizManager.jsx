import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Plus, Trash2, Award, Clock, ShieldAlert, CheckSquare } from 'lucide-react';

export default function QuizManager({ onQuizCreated }) {
  const { user, isTeacher } = useAuth();

  const [competencies, setCompetencies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [competencyId, setCompetencyId] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [timeLimit, setTimeLimit] = useState(15);
  const [passingScore, setPassingScore] = useState(4);
  const [maxBlurLimit, setMaxBlurLimit] = useState(3);

  // Questions
  const [questions, setQuestions] = useState([
    {
      question_text: '',
      question_type: 'MULTIPLE_CHOICE',
      points: 1,
      options: [
        { id: 'A', text: '' },
        { id: 'B', text: '' },
        { id: 'C', text: '' },
        { id: 'D', text: '' }
      ],
      correct_answer: 'A'
    }
  ]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isTeacher || user?.role !== 'TEACHER') return;
    async function loadComps() {
      try {
        const res = await api.getTaxonomy();
        if (res.success && res.flatCompetencies.length > 0) {
          setCompetencies(res.flatCompetencies);
          setCompetencyId(res.flatCompetencies[0].id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadComps();
  }, [isTeacher, user?.role]);

  // STRICT RBAC DEFENSE: Non-teachers cannot create or configure assessments
  if (!isTeacher || user?.role !== 'TEACHER') {
    return (
      <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <div style={{
          maxWidth: '520px',
          margin: '0 auto',
          background: 'var(--status-critical-bg)',
          border: '1px solid var(--status-critical)',
          borderRadius: 'var(--rounded-md)',
          padding: '36px 28px',
        }}>
          <ShieldAlert size={52} color="#ef4444" style={{ marginBottom: '16px' }} />
          <h2 style={{ color: 'var(--status-critical)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '10px' }}>
            Hindi Awtorisadong Pag-access (Access Denied)
          </h2>
          <p style={{ color: 'var(--colors-body)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: '24px' }}>
            Ang paggawa at pagbago ng mga pagsusulit ay para lamang sa mga opisyal na guro ng Araling Panlipunan 10.
          </p>
        </div>
      </div>
    );
  }

  const handleAddQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        question_text: '',
        question_type: 'MULTIPLE_CHOICE',
        points: 1,
        options: [
          { id: 'A', text: '' },
          { id: 'B', text: '' },
          { id: 'C', text: '' },
          { id: 'D', text: '' }
        ],
        correct_answer: 'A'
      }
    ]);
  };

  const handleRemoveQuestion = (index) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQuestionChange = (index, field, value) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[index][field] = value;
      return copy;
    });
  };

  const handleOptionChange = (qIndex, optIndex, text) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[qIndex].options[optIndex].text = text;
      return copy;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !competencyId) return;

    // Validate that questions have text
    for (const q of questions) {
      if (!q.question_text.trim()) {
        alert('Mangyaring punan ang teksto ng bawat tanong bago mag-save.');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await api.createQuiz({
        competency_id: competencyId,
        title,
        instructions,
        time_limit_minutes: Number(timeLimit),
        passing_score: Number(passingScore),
        max_blur_limit: Number(maxBlurLimit),
        questions
      });

      if (res.success) {
        alert('Pagsusulit tagumpay na nalikha at na-publish sa mga mag-aaral!');
        if (onQuizCreated) onQuizCreated();
      }
    } catch (err) {
      alert(err.message || 'Error saving quiz');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '880px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '6px' }}>
          Lumikha ng Bagong AP10 Assessment
        </h1>
        <p style={{ color: 'var(--colors-body)', fontSize: '0.88rem' }}>
          I-tag ang pagsusulit sa opisyal na DepEd MELC competency at itakda ang proctoring watchdog parameters.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* General Assessment Settings */}
        <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '16px' }}>
            Pangunahing Impormasyon ng Pagtatasa
          </h2>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '6px' }}>
              DepEd Learning Competency & MELC Tag (ILAW Framework)
            </label>
            <select
              className="form-input"
              value={competencyId}
              onChange={(e) => setCompetencyId(e.target.value)}
              required
            >
              {competencies.map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.melc_code}] - {c.description.substring(0, 75)}... ({c.ilaw_tag})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '6px' }}>
              Pamagat ng Pagsusulit
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Hal: Unang Lagumang Pagsusulit sa Disaster Management"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '6px' }}>
              Mga Panuto sa Mag-aaral
            </label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Basahin at unawain ang bawat katanungan bago pumili ng sagot..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '6px' }}>
                <Clock size={13} style={{ display: 'inline', marginRight: '4px' }} /> Oras (Minuto)
              </label>
              <input
                type="number"
                className="form-input"
                min="1"
                max="120"
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '6px' }}>
                <Award size={13} style={{ display: 'inline', marginRight: '4px' }} /> Passing Score
              </label>
              <input
                type="number"
                className="form-input"
                min="1"
                value={passingScore}
                onChange={(e) => setPassingScore(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--status-critical)', marginBottom: '6px' }}>
                <ShieldAlert size={13} style={{ display: 'inline', marginRight: '4px' }} /> Max Blur Limit
              </label>
              <input
                type="number"
                className="form-input"
                min="1"
                max="10"
                value={maxBlurLimit}
                onChange={(e) => setMaxBlurLimit(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Questions Builder */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              Mga Tanong ({questions.length})
            </h2>
            <button
              type="button"
              onClick={handleAddQuestion}
              className="btn btn-secondary btn-sm"
            >
              <Plus size={15} /> Magdagdag ng Tanong
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {questions.map((q, qIndex) => (
              <div key={qIndex} className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--colors-primary)' }}>
                    Tanong #{qIndex + 1}
                  </span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(qIndex)}
                      className="btn btn-danger btn-sm"
                      style={{ padding: '2px 8px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ilagay ang teksto ng tanong..."
                    value={q.question_text}
                    onChange={(e) => handleQuestionChange(qIndex, 'question_text', e.target.value)}
                    required
                  />
                </div>

                {/* Choices */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                  {q.options.map((opt, optIndex) => (
                    <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 700, width: '20px', color: 'var(--colors-body-mid)' }}>
                        {opt.id}.
                      </span>
                      <input
                        type="text"
                        className="form-input"
                        placeholder={`Pagpipilian ${opt.id}...`}
                        value={opt.text}
                        onChange={(e) => handleOptionChange(qIndex, optIndex, e.target.value)}
                        required
                      />
                    </div>
                  ))}
                </div>

                {/* Correct Answer Selection */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#34d399' }}>
                    Tamang Sagot:
                  </span>
                  <select
                    className="form-input"
                    style={{ width: 'auto', padding: '6px 12px' }}
                    value={q.correct_answer}
                    onChange={(e) => handleQuestionChange(qIndex, 'correct_answer', e.target.value)}
                  >
                    <option value="A">Pagpipilian A</option>
                    <option value="B">Pagpipilian B</option>
                    <option value="C">Pagpipilian C</option>
                    <option value="D">Pagpipilian D</option>
                  </select>
                </div>

              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
          disabled={saving}
        >
          <CheckSquare size={18} /> {saving ? 'I-pinapublish...' : 'I-publish ang Assessment sa Hub'}
        </button>
      </form>
    </div>
  );
}
