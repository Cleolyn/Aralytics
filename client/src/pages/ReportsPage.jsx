import React, { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from '../components/icons';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import Dialog from '../components/ui/Dialog';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import {
  cleanText,
  formatChoiceNote,
  formatDifficulty,
  formatRecommendation,
  formatStatus
} from '../utils/learning';

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const section = params.get('section') || '';
  const [quarter, setQuarter] = useState('');
  const [tab, setTab] = useState('Topics');
  const [quizId, setQuizId] = useState('');
  const [detail, setDetail] = useState(null);
  const close = useCallback(() => setDetail(null), []);
  const { data, loading, error, refresh } = useRemoteData(async () => {
    const [classes, profiling, quizzes] = await Promise.all([
      api.getClasses(),
      api.getProficiencyProfiling({ section, quarter }),
      api.getQuizzes()
    ]);
    return { classes: classes.classes, profiling: profiling.profiling, quizzes: quizzes.quizzes };
  }, [section, quarter]);
  const selectedQuiz = quizId || data?.quizzes[0]?.id;
  const analysis = useRemoteData(
    () =>
      selectedQuiz && tab === 'Quiz questions'
        ? api.getItemAnalysis(selectedQuiz)
        : Promise.resolve({ analysis: null }),
    [selectedQuiz, tab]
  );
  const report = analysis.data?.analysis;
  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>Reports</h1>
          <p>See how your class is doing by topic, check quiz questions, and download grade sheets.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <a
            className="btn btn-secondary"
            href={api.getAnalyticsXlsxUrl({ section })}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={16} />
            Download Excel
          </a>
          <a
            className="btn btn-secondary"
            href={api.getAnalyticsPdfUrl({ section })}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={16} />
            Download PDF
          </a>
        </div>
      </div>
      <Notice error>{error || analysis.error}</Notice>
      {(error || analysis.error) && (
        <button
          className="text-action"
          onClick={() => {
            refresh();
            analysis.refresh();
          }}
        >
          Try again
        </button>
      )}
      <div className="tabs">
        {['Topics', 'Quiz questions'].map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)} aria-pressed={tab === t}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Topics' ? (
        <>
          <div className="filters">
            <div className="field">
              <label htmlFor="report-class">Class section</label>
              <select
                id="report-class"
                className="form-input"
                value={section}
                onChange={e => setParams(e.target.value ? { section: e.target.value } : {})}
              >
                <option value="">All classes</option>
                {data?.classes.map(c => (
                  <option key={c.section}>{c.section}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="report-quarter">Quarter</label>
              <select
                id="report-quarter"
                className="form-input"
                value={quarter}
                onChange={e => setQuarter(e.target.value)}
              >
                <option value="">All quarters</option>
                {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                  <option key={q}>{q}</option>
                ))}
              </select>
            </div>
          </div>
          {loading ? (
            <Loading>Loading topic reports…</Loading>
          ) : (
            <div className="table-responsive" tabIndex={0} role="region" aria-label="Topic report">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>Quizzes taken</th>
                    <th>Class average</th>
                    <th>Mastered</th>
                    <th>Improving</th>
                    <th>Needs practice</th>
                    <th>Students</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.profiling.map(p => (
                    <tr key={p.competency_id}>
                      <td>
                        <strong>{cleanText(p.topic_title)}</strong>
                        <small>
                          {cleanText(p.quarter)} · {cleanText(p.description)}
                        </small>
                      </td>
                      <td>{p.total_assessed}</td>
                      <td>{p.total_assessed ? `${p.cohort_average_percentage}%` : 'No scores yet'}</td>
                      <td>{p.mastery_distribution.mastered.count}</td>
                      <td>{p.mastery_distribution.developing.count}</td>
                      <td>{p.mastery_distribution.needs_intervention.count}</td>
                      <td>
                        <button className="text-action" onClick={() => setDetail(p)}>
                          See students
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ fontSize: 14, marginTop: 24 }}>
            Mastered: 85% and above · Improving: 70% to 84% · Needs practice: below 70%.
          </p>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="analysis-quiz">Choose a quiz</label>
            <select
              id="analysis-quiz"
              className="form-input"
              value={selectedQuiz || ''}
              onChange={e => setQuizId(e.target.value)}
            >
              {data?.quizzes.map(q => (
                <option key={q.id} value={q.id}>
                  {cleanText(q.title)}
                </option>
              ))}
            </select>
          </div>
          {analysis.loading || loading ? (
            <Loading>Checking quiz questions…</Loading>
          ) : !report ? (
            <EmptyState title="Pick a quiz">Question results will show up here.</EmptyState>
          ) : (
            <>
              <p className="muted">
                {report.summary.total_examinees} students answered · {report.summary.total_items} questions. See how many students got each question right and whether any question needs to be clearer.
              </p>
              <div className="table-responsive section" tabIndex={0} role="region" aria-label="Question breakdown">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Got it right</th>
                      <th>How easy</th>
                      <th>Question score</th>
                      <th>Tip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.items.map(item => (
                      <tr key={item.question_id}>
                        <td>
                          <strong>
                            {item.item_number}. {cleanText(item.question_text)}
                          </strong>
                          {item.distractors.length > 0 && (
                            <details style={{ marginTop: 12 }}>
                              <summary>See how many picked each choice</summary>
                              <ul className="simple-list">
                                {item.distractors.map(d => (
                                  <li key={d.id}>
                                    {d.id}. {cleanText(d.text)} · {d.total_chosen} picked ·{' '}
                                    {formatChoiceNote(d.efficiency)}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                        <td>
                          {item.metrics.total_correct} of {item.metrics.total_examinees}
                        </td>
                        <td>
                          {Math.round(Number(item.metrics.difficulty_index_p || 0) * 100)}%
                          <small>{formatDifficulty(item.metrics.difficulty_interpretation)}</small>
                        </td>
                        <td>{item.metrics.discrimination_index_d}</td>
                        <td>{formatRecommendation(item.metrics.discrimination_action)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      {detail && (
        <Dialog title={cleanText(detail.topic_title)} onClose={close}>
          {!detail.student_breakdown.length ? (
            <EmptyState title="No quiz scores yet">Student scores for this topic will show up here.</EmptyState>
          ) : (
            <ul className="simple-list">
              {detail.student_breakdown.map((s, i) => (
                <li key={`${s.student_id}-${i}`}>
                  <strong>{cleanText(s.student_name)}</strong>
                  <p>
                    {cleanText(s.section_id)} · {s.score} / {s.total_points} · {s.percentage}%
                  </p>
                  <Status tone={s.mastery_tier === 'MASTERED' ? 'good' : 'pending'}>
                    {formatStatus(s.mastery_tier)}
                  </Status>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </div>
  );
}
