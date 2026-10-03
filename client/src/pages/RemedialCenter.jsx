import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowRightCircle, 
  CheckCircle2, 
  BookOpen, 
  Clock, 
  Award, 
  ExternalLink, 
  Sparkles,
  Filter
} from 'lucide-react';

export default function RemedialCenter({ onNavigateToMaterials, onSelectQuiz }) {

  const { isTeacher } = useAuth();
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [resolvingId, setResolvingId] = useState(null);

  useEffect(() => {
    loadInterventions();
  }, [statusFilter]);

  const loadInterventions = async () => {
    setLoading(true);
    try {
      const res = await api.getInterventions({ status: statusFilter });
      if (res.success) {
        setInterventions(res.interventions);
      }
    } catch (err) {
      console.warn('Interventions load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id) => {
    setResolvingId(id);
    try {
      const res = await api.resolveIntervention(id);
      if (res.success) {
        await loadInterventions();
      }
    } catch (err) {
      alert(err.message || 'Error resolving intervention');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="container">
      {/* Header Banner */}
      <div className="glass-panel" style={{
        padding: '28px 32px',
        marginBottom: '28px',
        background: 'var(--colors-canvas-soft)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span className="badge badge-ilaw-ways-forward">
            ILAW Phase 4: Ways Forward
          </span>
          <span className="badge" style={{ background: 'var(--colors-canvas-soft)', color: 'var(--colors-body)' }}>
            Automated Learning Intervention Engine
          </span>
        </div>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 800, marginBottom: '6px' }}>
          Remedial Learning Center (Ways Forward)
        </h1>
        <p style={{ color: 'var(--colors-body)', fontSize: '0.9rem', maxWidth: '720px' }}>
          Tuwing ang isang pagsusulit ay magtatala ng markang mas mababa sa 75%, ang Aralytics ay awtomatikong lumilikha ng remedial pathway upang gabayan ang mag-aaral pabalik sa competency mastery.
        </p>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--colors-body-mid)', fontWeight: 600 }}>Filter:</span>
        <button
          onClick={() => setStatusFilter('')}
          className={`btn btn-sm ${statusFilter === '' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Lahat
        </button>
        <button
          onClick={() => setStatusFilter('ASSIGNED')}
          className={`btn btn-sm ${statusFilter === 'ASSIGNED' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Aktibong Remediation
        </button>
        <button
          onClick={() => setStatusFilter('RESOLVED')}
          className={`btn btn-sm ${statusFilter === 'RESOLVED' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Nakumpleto (Resolved)
        </button>
      </div>

      {/* Interventions List */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--colors-body)' }}>
          Ikinakarga ang talaan ng mga remedial intervention...
        </div>
      ) : interventions.length === 0 ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <CheckCircle2 size={40} color="#10b981" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>
            Walang Nakabinbing Remediation
          </h3>
          <p style={{ color: 'var(--colors-body)', fontSize: '0.88rem' }}>
            Lahat ng kinakailangang kasanayan sa kasalukuyang kwarter ay naabot o nakumpleto na.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {interventions.map((item) => {
            const isResolved = item.status === 'RESOLVED';

            return (
              <div
                key={item.id}
                className="glass-panel"
                style={{
                  padding: '24px',
                  borderColor: isResolved ? 'var(--status-mastered)' : 'rgba(255,79,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '20px'
                }}
              >
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span className="badge badge-ilaw-assessment">
                      {item.melc_code}
                    </span>
                    <span className={`badge ${isResolved ? 'badge-mastered' : 'badge-reinforce'}`}>
                      {item.status}
                    </span>
                    {isTeacher && (
                      <span className="badge" style={{ background: 'var(--colors-canvas-soft)', color: 'var(--colors-body-mid)' }}>
                        {item.last_name}, {item.first_name} ({item.section})
                      </span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px', color: 'var(--colors-ink)' }}>
                    {item.competency_desc}
                  </h3>

                  <div style={{ fontSize: '0.82rem', color: 'var(--colors-body)', marginBottom: '14px' }}>
                    Trigger Score: <strong style={{ color: '#f87171' }}>{item.trigger_percentage}%</strong> (Petsa: {item.assigned_at?.slice(0, 10)})
                  </div>

                  {/* Remedial Material Reference */}
                  {item.remedial_material_title ? (
                    <div style={{
                      background: 'var(--colors-canvas-soft)',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-glass)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      <BookOpen size={16} color="var(--colors-primary)" />
                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--colors-body-mid)' }}>Inirekomendang Modyul sa Pagbawi:</div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--colors-ink)' }}>{item.remedial_material_title}</div>
                      </div>
                      <a
                        href={item.remedial_storage_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 8px', fontSize: '0.75rem', marginLeft: '8px' }}
                      >
                        <ExternalLink size={12} /> Buksan
                      </a>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--colors-body-mid)', fontStyle: 'italic' }}>
                      Mangyaring kumonsulta sa guro para sa personalized study guide.
                    </div>
                  )}
                </div>

                {/* Status / Resolution & Post-Test Button (SRS FR-37) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                  {isResolved ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '0.85rem', fontWeight: 600 }}>
                      <CheckCircle2 size={18} /> Nakumpleto noong {item.completed_at?.slice(0, 10)}
                    </div>
                  ) : (
                    <>
                      {onSelectQuiz && (
                        <button
                          onClick={() => onSelectQuiz(item.post_test_quiz_id || 'quiz-ap10-cbdrrm-01')}
                          className="btn btn-primary btn-sm"
                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          <Sparkles size={14} /> Kumuha ng Post-Test (FR-37)
                        </button>
                      )}
                      <button
                        onClick={() => handleResolve(item.id)}
                        className="btn btn-secondary btn-sm"
                        disabled={resolvingId === item.id}
                        style={{ width: '100%' }}
                      >
                        <CheckCircle2 size={14} /> {resolvingId === item.id ? 'Itinatala...' : 'Markahan Bilang Nabasa'}
                      </button>
                    </>
                  )}
                </div>


              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
