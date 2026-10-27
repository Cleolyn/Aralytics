import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BookOpen, Check } from '../components/icons';
import { useAuth } from '../context/AuthContext';
import useLearnerData from '../hooks/useLearnerData';
import ActivityTable from '../components/ActivityTable';
import { Loading, Notice } from '../components/ui/Feedback';
import { cleanText, completedActivity } from '../utils/learning';

export default function StudentDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const { data, loading, error, refresh } = useLearnerData();
  if (loading) return <div className="container"><Loading /></div>;
  const readIds = new Set(data?.logs.map(l => l.material_id) || []);
  const materials = data?.materials || [];
  const available = materials.filter(m => m.resource_available !== false);
  const next = available.find(m => !readIds.has(m.id)) || available[0];
  const readCount = materials.filter(m => readIds.has(m.id)).length;
  const upcoming = data?.activities.filter(a => !completedActivity(a)).slice(0, 4) || [];
  const support = data?.interventions.filter(i => !['RESOLVED', 'COMPLETED', 'EXEMPTED', 'EXEMPT', 'OVERRIDDEN'].includes(i.status)) || [];
  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <h1>Hello, {user?.first_name || 'Student'}!</h1>
          <p>Ready for your next lesson?</p>
          <div className="breadcrumb" style={{ marginTop: 14, marginBottom: 0 }}>
            {user?.section || 'Your class'} <span>/</span> Araling Panlipunan 10
          </div>
        </div>
      </div>
      <Notice error>{location.state?.unauthorizedNotice || error || data?.warnings.join(' ')}</Notice>
      {(error || data?.warnings.length > 0) && (
        <button className="text-action" onClick={refresh}>
          Try again
        </button>
      )}
      <div className="split-content">
        <div>
          <section className="continue-lesson">
            <div>
              <span className="eyebrow">{next ? 'Continue reading' : 'Your lessons'}</span>
              <h2>{next ? cleanText(next.title) : 'Check out your class lessons.'}</h2>
              <p className="muted">
                {next
                  ? `${cleanText(next.file_type)} · ${cleanText(next.melc_code || 'Araling Panlipunan')}`
                  : 'New reading materials from your teacher will show up in Lessons.'}
              </p>
              <Link to={next ? `/student/materials/${next.id}` : '/student/materials'} className="btn btn-primary">
                {next ? 'Open lesson' : 'Browse lessons'}
                <ArrowRight size={17} />
              </Link>
            </div>
            <img src="/images/community-learning.jpg" alt="" width="1774" height="887" />
          </section>
          <div className="ilaw-steps" aria-label="Learning steps">
            <span>1 · Goals</span>
            <ArrowRight size={14} />
            <span>2 · Lessons</span>
            <ArrowRight size={14} />
            <span>3 · Quizzes</span>
            <ArrowRight size={14} />
            <span>4 · Practice</span>
          </div>
          <section className="section">
            <div className="section-heading">
              <h2>To do next</h2>
              <Link to="/student/activities" className="text-action">
                See all <ArrowRight size={15} />
              </Link>
            </div>
            <ActivityTable items={upcoming} />
          </section>
        </div>
        <aside className="aside">
          <section>
            <h2>Your progress</h2>
            <p>
              {readCount} of {materials.length} lessons read
            </p>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Lessons read"
              aria-valuemin={0}
              aria-valuemax={materials.length || 1}
              aria-valuenow={readCount}
            >
              <span style={{ width: `${materials.length ? (readCount / materials.length) * 100 : 0}%` }} />
            </div>
            <Link className="text-action" to="/student/progress">
              Check your grades <ArrowRight size={15} />
            </Link>
          </section>
          <section>
            <BookOpen size={23} aria-hidden="true" />
            <h3 style={{ marginTop: 12 }}>Offline reading</h3>
            <p>Save lessons while online so you can read them without internet.</p>
            <Link className="text-action" to="/student/materials?downloaded=true">
              Saved lessons <ArrowRight size={15} />
            </Link>
          </section>
          {support.length > 0 && (
            <section>
              <h3>Extra practice</h3>
              <p>
                You have {support.length} practice {support.length === 1 ? 'material' : 'materials'} to help you review.
              </p>
              <Link className="text-action" to="/student/interventions">
                Open practice <ArrowRight size={15} />
              </Link>
            </section>
          )}
          {materials.length > 0 && readCount === materials.length && (
            <section>
              <Check size={23} />
              <p>You have read all available lessons. Great job!</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
