import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
  Award, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles, 
  AlertTriangle,
  BookOpen,
  Layers,
  Upload,
  FileCheck,
  FileText,
  Calendar,
  RefreshCw,
  X
} from 'lucide-react';

export default function StudentDashboard({ onSelectQuiz, onNavigateToRemedial, onNavigateToMaterials }) {
  const { user, isStudent } = useAuth();
  const location = useLocation();
  const [unauthorizedNotice, setUnauthorizedNotice] = useState(
    location?.state?.unauthorizedNotice || null
  );

  const [quizzes, setQuizzes] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [curriculum, setCurriculum] = useState(null);
  const [performanceTasks, setPerformanceTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Performance Task Dropzone Modal (SRS FR-43)
  const [submittingTask, setSubmittingTask] = useState(null);
  const [fileName, setFileName] = useState('');
  const [studentNotes, setStudentNotes] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [taskNotification, setTaskNotification] = useState(null);

  // Offline Read Queue Status (SRS FR-50)
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);

  useEffect(() => {
    if (!isStudent || user?.role !== 'STUDENT') return;
    loadDashboard();
    checkOfflineQueue();
  }, [isStudent, user?.role]);

  // STRICT RBAC DEFENSE: Teachers cannot access the Student Dashboard
  if (!isStudent || user?.role !== 'STUDENT') {
    return (
      <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <div style={{
          maxWidth: '520px',
          margin: '0 auto',
          background: 'var(--colors-canvas-soft)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '16px',
          padding: '36px 28px',
          backdropFilter: 'blur(12px)'
        }}>
          <ShieldAlert size={52} color="#3b82f6" style={{ marginBottom: '16px' }} />
          <h2 style={{ color: 'var(--colors-primary)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '10px' }}>
            Teacher Workspace Active
          </h2>
          <p style={{ color: 'var(--colors-body)', fontSize: '0.92rem', lineHeight: 1.6 }}>
            Naka-login ka bilang Guro. Ang Student Dashboard ay para lamang sa mga mag-aaral.
          </p>
        </div>
      </div>
    );
  }

  const checkOfflineQueue = () => {
    try {
      const raw = localStorage.getItem('aralytics_offline_read_queue');
      if (raw) {
        const queue = JSON.parse(raw);
        setOfflineQueueCount(Array.isArray(queue) ? queue.length : 0);
      } else {
        setOfflineQueueCount(0);
      }
    } catch (e) {
      setOfflineQueueCount(0);
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [quizRes, intRes, currRes, ptRes] = await Promise.all([
        api.getQuizzes(),
        api.getInterventions({ status: 'ASSIGNED' }),
        api.getTaxonomy(),
        api.getPerformanceTasks().catch(() => ({ success: false, tasks: [] }))
      ]);

      if (quizRes.success) setQuizzes(quizRes.quizzes);
      if (intRes.success) setInterventions(intRes.interventions);
      if (currRes.success) setCurriculum(currRes.taxonomy);
      if (ptRes.success) setPerformanceTasks(ptRes.tasks);
    } catch (err) {
      console.warn('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncOffline = async () => {
    setIsSyncingOffline(true);
    try {
      const raw = localStorage.getItem('aralytics_offline_read_queue');
      if (raw) {
        const queue = JSON.parse(raw);
        if (queue.length > 0) {
          const res = await api.syncOfflineReadLogs(queue);
          if (res.success) {
            localStorage.removeItem('aralytics_offline_read_queue');
            setOfflineQueueCount(0);
            showNotification(`Matagumpay na na-sync ang ${res.synced_count} offline reading event(s)!`);
          }
        }
      }
    } catch (err) {
      showNotification('Nabigo ang pag-sync. Pakisuri ang internet connection.', 'error');
    } finally {
      setIsSyncingOffline(false);
    }
  };

  const showNotification = (msg, type = 'success') => {
    setTaskNotification({ msg, type });
    setTimeout(() => setTaskNotification(null), 4000);
  };

  // Submit Performance Task (FR-43)
  const handleSubmitPerformanceTask = async (e) => {
    e.preventDefault();
    if (!submittingTask || !fileName) return;

    setIsSubmittingTask(true);
    try {
      const res = await api.submitPerformanceTask(submittingTask.id, {
        file_name: fileName,
        file_url: `/api/performance-tasks/files/${encodeURIComponent(fileName)}`,
        file_size_bytes: 2500000,
        notes: studentNotes
      });

      if (res.success) {
        showNotification('Matagumpay na naipasa ang iyong Performance Task output!', 'success');
        setSubmittingTask(null);
        setFileName('');
        setStudentNotes('');
        await loadDashboard();
      }
    } catch (err) {
      showNotification(err.message || 'Nabigo sa pagpasa ng task.', 'error');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  return (
    <div className="container">
      {/* Toast Notification */}
      {taskNotification && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '24px',
          zIndex: 999,
          background: taskNotification.type === 'error' ? 'var(--status-critical-bg)' : 'var(--status-mastered-bg)',
          color: taskNotification.type === 'error' ? 'var(--status-critical)' : 'var(--status-mastered)',
          padding: '12px 20px',
          borderRadius: 'var(--rounded-md)',
          boxShadow: 'var(--shadow-md)',
          fontWeight: 600,
          fontSize: '0.88rem'
        }}>
          {taskNotification.msg}
        </div>
      )}

      {/* Welcome Student Banner */}
      <div className="glass-panel" style={{
        padding: '28px 32px',
        marginBottom: '28px',
        background: 'var(--colors-canvas-soft)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span className="badge badge-ilaw-learning">Araling Panlipunan 10</span>
              <span className="badge" style={{ background: 'var(--colors-canvas-soft)', color: 'var(--colors-body)' }}>
                Seksyon {user?.section || '10-Rizal'}
              </span>
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, marginBottom: '6px' }}>
              Mabuhay, {user?.first_name || 'Mag-aaral'}!
            </h1>
            <p style={{ color: 'var(--colors-body)', fontSize: '0.92rem', maxWidth: '640px' }}>
              LRN: <strong style={{ color: 'var(--colors-ink)' }}>{user?.lrn_or_id}</strong> • Maligayang pagdating sa iyong learning hub. Dito mo makikita ang iyong mga pagsusulit, performance tasks, at remedial learning paths.
            </p>
          </div>

          <button onClick={onNavigateToMaterials} className="btn btn-secondary">
            <BookOpen size={16} /> Buksan ang Learning Hub
          </button>
        </div>
      </div>

      {/* Unauthorized Access Notification from ProtectedRoute */}
      {unauthorizedNotice && (
        <div style={{
          background: 'var(--status-critical-bg)',
          border: '1px solid var(--status-critical)',
          borderRadius: 'var(--rounded-md)',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--status-critical)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldAlert size={22} color="#ef4444" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--status-critical)' }}>
                Hindi Awtorisadong Pag-access (Unauthorized Access)
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--status-critical)' }}>
                {unauthorizedNotice}
              </div>
            </div>
          </div>
          <button
            onClick={() => setUnauthorizedNotice(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--colors-body-mid)',
              cursor: 'pointer',
              fontSize: '1.4rem',
              lineHeight: 1,
              padding: '4px'
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Offline Sync Banner (FR-50) */}
      {offlineQueueCount > 0 && (
        <div style={{
          background: 'rgba(255,79,0,0.08)',
          border: '1px solid rgba(255,79,0,0.25)',
          borderRadius: 'var(--rounded-md)',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <RefreshCw size={20} color="var(--colors-primary)" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--colors-primary)' }}>
                {offlineQueueCount} Naitalang Offline Reading Action ang Handa Nang I-sync (FR-50)
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--colors-body)' }}>
                May mga binasa kang modyul habang offline. I-click ang sync upang ma-update ang iyong opisyal na DepEd attendance log.
              </div>
            </div>
          </div>

          <button
            onClick={handleSyncOffline}
            className="btn btn-primary btn-sm"
            disabled={isSyncingOffline}
          >
            <RefreshCw size={14} className={isSyncingOffline ? 'spin' : ''} />
            {isSyncingOffline ? 'Sini-sync...' : 'I-sync Ngayon'}
          </button>
        </div>
      )}

      {/* Urgent Remedial Alert (Ways Forward) if any pending */}
      {interventions.length > 0 && (
        <div style={{
          background: 'rgba(255,79,0,0.08)',
          border: '1px solid rgba(255,79,0,0.25)',
          borderRadius: 'var(--rounded-md)',
          padding: '20px 24px',
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'rgba(255,79,0,0.1)',
              color: 'var(--colors-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--colors-ink)' }}>
                Mayroon kang {interventions.length} Nakatalagang Remedial Task sa "Ways Forward"
              </div>
              <div style={{ fontSize: '0.84rem', color: 'var(--colors-body)' }}>
                May mga pagsusulit kang nakakuha ng mas mababa sa 75%. Punan ang competency gap bago ang quarterly grading.
              </div>
            </div>
          </div>

          <button onClick={onNavigateToRemedial} className="btn btn-primary btn-sm">
            Kumpletuhin ang Remediation <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Quizzes & Assessments Section */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>
              Mga Pagsusulit at Pagtatasa (Strictly Online)
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--colors-body)' }}>
              Sumusuporta sa 6 DepEd item formats (MC, TF, Matching, Identification, Situational, PISA-like) na may proctoring watchdog.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--colors-body)' }}>
            Ikinakarga ang mga pagsusulit...
          </div>
        ) : quizzes.length === 0 ? (
          <div className="glass-panel" style={{ padding: '30px', textAlign: 'center' }}>
            <p style={{ color: 'var(--colors-body)' }}>Kasalukuyang walang nakatalagang pagsusulit.</p>
          </div>
        ) : (
          <div className="grid-cols-2">
            {quizzes.map((quiz) => {
              const sub = quiz.submission;
              const isCompleted = sub && sub.status === 'SUBMITTED';

              return (
                <div key={quiz.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
                      <span className="badge badge-ilaw-assessment">
                        {quiz.melc_code}
                      </span>
                      {isCompleted ? (
                        <span className={`badge ${sub.is_passed ? 'badge-mastered' : 'badge-critical'}`}>
                          {sub.is_passed ? 'PASSED' : 'NEEDS INTERVENTION'} • {sub.percentage}%
                        </span>
                      ) : (
                        <span className="badge" style={{ background: 'rgba(255,79,0,0.1)', color: 'var(--colors-primary)' }}>
                          AVAILABLE
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px', lineHeight: 1.35 }}>
                      {quiz.title}
                    </h3>
                    <p style={{ fontSize: '0.84rem', color: 'var(--colors-body)', marginBottom: '18px', lineHeight: 1.4 }}>
                      {quiz.instructions || 'Suriin ang mga katanungan kaugnay sa aralin.'}
                    </p>

                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.78rem', color: 'var(--colors-body-mid)', marginBottom: '20px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={14} /> {quiz.time_limit_minutes} Minuto
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Award size={14} /> {quiz.total_points} Puntos (Passing: {quiz.passing_score})
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <ShieldAlert size={14} color="#ef4444" /> Max {quiz.max_blur_limit} Blurs
                      </span>
                    </div>
                  </div>

                  <div>
                    {isCompleted ? (
                      <button
                        onClick={() => onSelectQuiz(quiz.id)}
                        className="btn btn-secondary"
                        style={{ width: '100%' }}
                      >
                        <CheckCircle2 size={16} color="#10b981" /> Tingnan ang Resulta at Marka
                      </button>
                    ) : (
                      <button
                        onClick={() => onSelectQuiz(quiz.id)}
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                      >
                        Simulan ang Pagsusulit <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quarterly Performance Tasks Dropzone (SRS FR-43) */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileCheck size={20} color="#3b82f6" /> Quarterly Performance Tasks & Submission Dropzone (FR-43)
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--colors-body)' }}>
              I-submit ang iyong mga indibidwal o pangkatang awtput (PDF, DOCX, PPTX, Video) batay sa itinakdang pamantayan at rubriks.
            </p>
          </div>
        </div>

        {performanceTasks.length === 0 ? (
          <div className="glass-panel" style={{ padding: '28px', textAlign: 'center' }}>
            <p style={{ color: 'var(--colors-body)' }}>Walang aktibong Performance Task sa kasalukuyang markahan.</p>
          </div>
        ) : (
          <div className="grid-cols-2">
            {performanceTasks.map((task) => {
              const sub = task.my_submission;
              const isSubmitted = Boolean(sub);
              const isGraded = sub && sub.status === 'GRADED';

              return (
                <div key={task.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
                      <span className="badge badge-ilaw-ways-forward">
                        {task.quarter} • {task.ilaw_category || 'WAYS FORWARD'}
                      </span>
                      {isGraded ? (
                        <span className="badge badge-mastered">
                          GRADED: {sub.score} / {task.total_points} Pts
                        </span>
                      ) : isSubmitted ? (
                        <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: 'var(--colors-primary)' }}>
                          SUBMITTED (FOR REVIEW)
                        </span>
                      ) : (
                        <span className="badge" style={{ background: 'var(--status-critical-bg)', color: 'var(--status-critical)' }}>
                          PENDING SUBMISSION
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px', lineHeight: 1.35 }}>
                      {task.title}
                    </h3>
                    <p style={{ fontSize: '0.84rem', color: 'var(--colors-body)', marginBottom: '14px', lineHeight: 1.45 }}>
                      {task.instructions}
                    </p>

                    {task.rubric_criteria && (
                      <div style={{ background: 'var(--colors-canvas-soft)', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>
                        <div style={{ fontSize: '0.74rem', color: 'var(--colors-body-mid)', fontWeight: 600 }}>
                          Batayan sa Pagmamarka (Rubric Criteria):
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--colors-primary)', marginTop: '3px' }}>
                          {task.rubric_criteria}
                        </div>
                      </div>
                    )}

                    {/* If student already submitted, show details */}
                    {isSubmitted && (
                      <div style={{
                        background: 'var(--colors-canvas-soft)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '10px',
                        padding: '12px',
                        marginBottom: '16px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--colors-body-mid)', fontWeight: 600 }}>
                            Ipinasang File:
                          </span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--colors-primary)', fontWeight: 600 }}>
                            {sub.file_name}
                          </span>
                        </div>
                        {sub.notes && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--colors-body)', fontStyle: 'italic', marginBottom: '6px' }}>
                            "{sub.notes}"
                          </div>
                        )}
                        {isGraded && sub.feedback && (
                          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', marginTop: '6px' }}>
                            <div style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 700 }}>
                              Puna / Feedback ng Guro:
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--colors-ink)', marginTop: '2px' }}>
                              {sub.feedback}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <button
                      onClick={() => {
                        setSubmittingTask(task);
                        setFileName(sub ? sub.file_name : '');
                        setStudentNotes(sub ? sub.notes || '' : '');
                      }}
                      className={`btn ${isSubmitted ? 'btn-secondary' : 'btn-primary'}`}
                      style={{ width: '100%' }}
                    >
                      <Upload size={16} />
                      {isSubmitted ? 'I-update o Palitan ang Awtput' : 'I-pasa ang Awtput (Dropzone)'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Curriculum Taxonomy Explorer */}
      {curriculum && (
        <div style={{ marginTop: '30px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} color="var(--colors-primary)" /> DepEd AP10 Curriculum & ILAW Tagging
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {curriculum.slice(0, 1).map((q) => (
              <div key={q.id} className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--colors-primary)', marginBottom: '8px' }}>
                  {q.quarter_title}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {q.topics.map((t) => (
                    <div key={t.id} style={{ background: 'var(--colors-canvas-soft)', padding: '12px 16px', borderRadius: '10px' }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--colors-ink)', marginBottom: '6px' }}>
                        {t.topic_title}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {t.competencies.map((c) => (
                          <span key={c.id} className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                            [{c.melc_code}] {c.ilaw_tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Task Dropzone Modal (FR-43) */}
      {submittingTask && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(32, 21, 21, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 300,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '540px', padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <span className="badge badge-ilaw-ways-forward" style={{ marginBottom: '4px' }}>
                  {submittingTask.quarter} Performance Task
                </span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                  {submittingTask.title}
                </h2>
              </div>
              <button onClick={() => setSubmittingTask(null)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--colors-body)', marginBottom: '18px' }}>
              Pumili ng dokumento o multimedia file (PDF, DOCX, PPTX, MP4 hanggang 25MB) para sa iyong pinal na awtput.
            </p>

            <form onSubmit={handleSubmitPerformanceTask}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '6px' }}>
                  Pangalan ng Attachment File:
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Hal: Barangay_San_Jose_Evacuation_Plan_Juan.pdf"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '6px' }}>
                  Reflective Notes / Paliwanag sa Guro (Opsyonal):
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Ibahagi ang maikling paliwanag o deskripsyon sa iyong ginawang awtput..."
                  value={studentNotes}
                  onChange={(e) => setStudentNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setSubmittingTask(null)}
                  className="btn btn-secondary"
                >
                  Kanselahin
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingTask}
                >
                  <Upload size={16} />
                  {isSubmittingTask ? 'Ipinapasa...' : 'Ipasa sa Guro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
