import React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import useRemoteData from '../hooks/useRemoteData';
import { EmptyState, Loading, Notice, Status } from '../components/ui/Feedback';
import { materialUrl } from '../utils/learning';

export default function RemedialCenter() {
  const { data, loading, error, refresh } = useRemoteData(() => api.getPractice(), []);
  return <div className="container"><div className="page-heading"><div><span className="eyebrow">ILAW · Ways forward</span><h1>Suggested practice</h1><p>Balikan ang learning goals at your own pace. Your teacher can help choose the next step.</p></div><Link className="text-action" to="/student/progress">My progress →</Link></div>
    <Notice error>{error}</Notice>{error && <button className="text-action" onClick={refresh}>Try again</button>}
    {loading ? <Loading>Loading practice…</Loading> : !data?.interventions.length ? <EmptyState title="No practice recommendations yet">Suggestions will appear after assessments. You can continue exploring your lessons.</EmptyState> : data.interventions.map(item => <section className="section-block" key={item.id}>
      <div className="section-heading"><h2>{item.competency_desc}</h2><Status tone={['COMPLETED','EXEMPTED'].includes(item.status) ? 'good' : 'pending'}>{item.status.charAt(0) + item.status.slice(1).toLowerCase()}</Status></div>
      {item.remedial_material_title && materialUrl(item.remedial_storage_url) ? <><p>Suggested resource: <strong>{item.remedial_material_title}</strong></p><a className="btn btn-primary" style={{ marginTop: 16 }} href={materialUrl(item.remedial_storage_url)} target="_blank" rel="noreferrer">Open practice resource ↗</a></> : <p>Your teacher is choosing a resource for this goal. Ask for guidance in class.</p>}
      <p className="muted" style={{ marginTop: 16 }}>Review the resource, then discuss your progress with your teacher. Your teacher updates the practice status.</p>
    </section>)}
  </div>;
}
