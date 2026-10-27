import React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import { cleanText, formatStatus, materialUrl } from '../utils/learning';

export default function RemedialCenter() {
  const { data, loading, error, refresh } = useRemoteData(() => api.getPractice(), []);
  return (
    <div className="container">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Review and Practice</span>
          <h1>Extra practice</h1>
          <p>Read these review materials at your own pace to improve your understanding.</p>
        </div>
        <Link className="text-action" to="/student/progress">
          My Progress →
        </Link>
      </div>
      <Notice error>{error}</Notice>
      {error && (
        <button className="text-action" onClick={refresh}>
          Try again
        </button>
      )}
      {loading ? (
        <Loading>Loading practice materials…</Loading>
      ) : !data?.interventions.length ? (
        <EmptyState title="No extra practice needed right now">
          Practice materials will show up here if you need to review a quiz topic.
        </EmptyState>
      ) : (
        data.interventions.map(item => (
          <section className="section" key={item.id}>
            <div className="section-heading">
              <h2>{cleanText(item.competency_desc)}</h2>
              <Status tone={['COMPLETED', 'EXEMPTED'].includes(item.status) ? 'good' : 'pending'}>
                {formatStatus(item.status)}
              </Status>
            </div>
            {item.remedial_material_title && materialUrl(item.remedial_storage_url) ? (
              <>
                <p>
                  Review material: <strong>{cleanText(item.remedial_material_title)}</strong>
                </p>
                <a
                  className="btn btn-primary"
                  style={{ marginTop: 16 }}
                  href={materialUrl(item.remedial_storage_url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open review material ↗
                </a>
              </>
            ) : (
              <p>Your teacher is choosing a review material for this topic.</p>
            )}
            <p className="muted" style={{ marginTop: 16 }}>
              After reading the material, let your teacher know so they can update your progress.
            </p>
          </section>
        ))
      )}
    </div>
  );
}
