import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { 
  Users, 
  ShieldAlert, 
  Award, 
  FileSpreadsheet, 
  FileText, 
  Download, 
  Search, 
  Eye, 
  CheckCircle2, 
  AlertTriangle,
  Flame,
  ArrowRight,
  BarChart3,
  Sliders,
  Edit3,
  RefreshCw,
  ChevronDown,
  Check,
  XCircle,
  BookOpen,
  FileCheck,
  Activity
} from 'lucide-react';


export default function TeacherDashboard({ onNavigateToCreator, onNavigateToRemedial }) {
  const { user, isTeacher } = useAuth();

  // Navigation sub-tab inside Teacher Command Center
  const [activeTab, setActiveTab] = useState('gradebook'); // 'gradebook' | 'profiling' | 'remediation'

  // Common filters
  const [sectionFilter, setSectionFilter] = useState('');
  const [quarterFilter, setQuarterFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);

  // Gradebook State
  const [entries, setEntries] = useState([]);
  const [loadingGradebook, setLoadingGradebook] = useState(true);

  // Proctoring audit trail modal
  const [selectedSubForAudit, setSelectedSubForAudit] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Proficiency Profiling State (Requirement 1)
  const [profilingData, setProfilingData] = useState([]);
  const [loadingProfiling, setLoadingProfiling] = useState(false);
  const [expandedCompId, setExpandedCompId] = useState(null);

  // Remediation Queue & Decision State (Requirement 2)
  const [remediationQueue, setRemediationQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [queueStatusFilter, setQueueStatusFilter] = useState('');
  const [modifyingItem, setModifyingItem] = useState(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [overridingItem, setOverridingItem] = useState(null);
  const [overrideStatus, setOverrideStatus] = useState('OVERRIDDEN');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Performance Tasks Review & Grading State (SRS FR-44)
  const [performanceTasks, setPerformanceTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [selectedTaskForReview, setSelectedTaskForReview] = useState(null);
  const [taskSubmissions, setTaskSubmissions] = useState([]);
  const [loadingTaskSubs, setLoadingTaskSubs] = useState(false);
  const [gradingSubmission, setGradingSubmission] = useState(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [isSavingGrade, setIsSavingGrade] = useState(false);

  // Psychometric Item Analysis State (SRS FR-21, FR-40)
  const [itemAnalysisQuizzes, setItemAnalysisQuizzes] = useState([]);
  const [selectedQuizIdForAnalysis, setSelectedQuizIdForAnalysis] = useState('quiz-ap10-cbdrrm-01');
  const [itemAnalysisData, setItemAnalysisData] = useState(null);
  const [loadingItemAnalysis, setLoadingItemAnalysis] = useState(false);
  const [expandedItemNumber, setExpandedItemNumber] = useState(null);

  // Load data based on active tab & filters
  useEffect(() => {
    if (!isTeacher || user?.role !== 'TEACHER') return;
    if (activeTab === 'gradebook') {
      loadGradebook();
    } else if (activeTab === 'profiling') {
      loadProfiling();
    } else if (activeTab === 'remediation') {
      loadRemediationQueue();
    } else if (activeTab === 'performance_tasks') {
      loadPerformanceTasks();
    } else if (activeTab === 'item_analysis') {
      loadItemAnalysis();
    }
  }, [activeTab, sectionFilter, quarterFilter, queueStatusFilter, isTeacher, user?.role]);

  // STRICT RBAC DEFENSE: If student attempts to mount, immediately block and render Access Denied
  if (!isTeacher || user?.role !== 'TEACHER') {
    return (
      <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <div style={{
          maxWidth: '520px',
          margin: '0 auto',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '16px',
          padding: '36px 28px',
          backdropFilter: 'blur(12px)'
        }}>
          <ShieldAlert size={52} color="#ef4444" style={{ marginBottom: '16px' }} />
          <h2 style={{ color: '#f87171', fontSize: '1.4rem', fontWeight: 800, marginBottom: '10px' }}>
            Hindi Awtorisadong Pag-access (Access Denied)
          </h2>
          <p style={{ color: 'var(--colors-body)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: '24px' }}>
            Ang Gurong Command Center at Master Gradebook ay eksklusibo lamang para sa mga guro ng Araling Panlipunan 10. Hindi pinahihintulutan ang mga mag-aaral na buksan ang bahaging ito.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn btn-secondary"
            style={{ fontSize: '0.85rem' }}
          >
            Bumalik sa Sariling Dashboard
          </button>
        </div>
      </div>
    );
  }


  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadGradebook = async () => {
    setLoadingGradebook(true);
    try {
      const res = await api.getGradebook({ section: sectionFilter });
      if (res.success) {
        setEntries(res.entries || []);
      }
    } catch (err) {
      console.warn('Gradebook fetch error:', err);
    } finally {
      setLoadingGradebook(false);
    }
  };

  const loadProfiling = async () => {
    setLoadingProfiling(true);
    try {
      const res = await api.getProficiencyProfiling({ 
        section_id: sectionFilter, 
        quarter: quarterFilter 
      });
      if (res.success) {
        setProfilingData(res.profiling || []);
      }
    } catch (err) {
      console.warn('Profiling fetch error:', err);
    } finally {
      setLoadingProfiling(false);
    }
  };

  const loadRemediationQueue = async () => {
    setLoadingQueue(true);
    try {
      const res = await api.getRemediationQueue({ 
        section_id: sectionFilter, 
        status: queueStatusFilter 
      });
      if (res.success) {
        setRemediationQueue(res.queue || []);
      }
    } catch (err) {
      console.warn('Remediation queue fetch error:', err);
    } finally {
      setLoadingQueue(false);
    }
  };

  const handleOpenAuditModal = async (entry) => {
    setSelectedSubForAudit(entry);
    setLoadingAudit(true);
    try {
      const res = await api.getProctoringTrail(entry.submission_id);
      if (res.success) {
        setAuditLogs(res.logs || []);
      }
    } catch (err) {
      console.error('Audit trail fetch error:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Teacher Decision Action Handlers (Requirement 2)
  const handleApproveIntervention = async (interventionId) => {
    setActionLoadingId(interventionId);
    try {
      const res = await api.handleInterventionAction(interventionId, { action: 'APPROVE' });
      if (res.success) {
        showNotification('Matagumpay na naaprubahan ang remedial intervention at naitakda sa mag-aaral.', 'success');
        await loadRemediationQueue();
      }
    } catch (err) {
      showNotification(err.message || 'Error sa pag-apruba ng intervention', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenModifyModal = (item) => {
    setModifyingItem(item);
    setSelectedMaterialId(item.assigned_remedial_material?.id || item.available_competency_remedials?.[0]?.id || '');
  };

  const handleSaveModify = async () => {
    if (!modifyingItem) return;
    setActionLoadingId(modifyingItem.intervention_id);
    try {
      const res = await api.handleInterventionAction(modifyingItem.intervention_id, {
        action: 'MODIFY',
        material_id: selectedMaterialId
      });
      if (res.success) {
        showNotification('Nabagong remedial instructional material at matagumpay na naitakda.', 'success');
        setModifyingItem(null);
        await loadRemediationQueue();
      }
    } catch (err) {
      showNotification(err.message || 'Error sa pagbabago ng remedial material', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenOverrideModal = (item) => {
    setOverridingItem(item);
    setOverrideStatus('OVERRIDDEN');
  };

  const handleSaveOverride = async () => {
    if (!overridingItem) return;
    setActionLoadingId(overridingItem.intervention_id);
    try {
      const res = await api.handleInterventionAction(overridingItem.intervention_id, {
        action: 'OVERRIDE',
        override_status: overrideStatus
      });
      if (res.success) {
        showNotification(`Matagumpay na na-override ang intervention (Status: ${overrideStatus}).`, 'success');
        setOverridingItem(null);
        await loadRemediationQueue();
      }
    } catch (err) {
      showNotification(err.message || 'Error sa pag-override ng intervention', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Performance Tasks Handlers (SRS FR-44)
  const loadPerformanceTasks = async () => {
    setLoadingTasks(true);
    try {
      const res = await api.getPerformanceTasks({ quarter: quarterFilter });
      if (res.success) {
        setPerformanceTasks(res.tasks || []);
        if (res.tasks.length > 0 && !selectedTaskForReview) {
          handleSelectTaskForReview(res.tasks[0]);
        }
      }
    } catch (err) {
      console.warn('Performance tasks fetch error:', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleSelectTaskForReview = async (task) => {
    setSelectedTaskForReview(task);
    setLoadingTaskSubs(true);
    try {
      const res = await api.getPerformanceTaskSubmissions(task.id);
      if (res.success) {
        setTaskSubmissions(res.submissions || []);
      }
    } catch (err) {
      console.error('Task submissions fetch error:', err);
    } finally {
      setLoadingTaskSubs(false);
    }
  };

  const handleOpenGradeModal = (sub) => {
    setGradingSubmission(sub);
    setGradeScore(sub.score !== null ? String(sub.score) : '');
    setGradeFeedback(sub.feedback || '');
  };

  const handleSaveGrade = async (e) => {
    e.preventDefault();
    if (!gradingSubmission) return;

    setIsSavingGrade(true);
    try {
      const res = await api.gradePerformanceTaskSubmission(gradingSubmission.id, {
        score: Number(gradeScore),
        feedback: gradeFeedback
      });

      if (res.success) {
        showNotification('Matagumpay na naitala ang marka at feedback sa gradebook!', 'success');
        setGradingSubmission(null);
        if (selectedTaskForReview) {
          await handleSelectTaskForReview(selectedTaskForReview);
        }
        await loadPerformanceTasks();
      }
    } catch (err) {
      showNotification(err.message || 'Error sa pag-grade ng submission', 'error');
    } finally {
      setIsSavingGrade(false);
    }
  };

  // Item Analysis Handlers (SRS FR-21, FR-40)
  const loadItemAnalysis = async (quizId) => {
    const targetQuizId = quizId || selectedQuizIdForAnalysis || 'quiz-ap10-cbdrrm-01';
    setLoadingItemAnalysis(true);
    try {
      const [quizListRes, analysisRes] = await Promise.all([
        api.getQuizzes(),
        api.getItemAnalysis(targetQuizId)
      ]);

      if (quizListRes.success) {
        setItemAnalysisQuizzes(quizListRes.quizzes || []);
      }
      if (analysisRes.success) {
        setItemAnalysisData(analysisRes.analysis);
      }
    } catch (err) {
      console.warn('Item analysis fetch error:', err);
    } finally {
      setLoadingItemAnalysis(false);
    }
  };

  // Gradebook overview calculations

  const totalSubmissions = entries.length;
  const passedCount = entries.filter((e) => e.is_passed).length;
  const passRate = totalSubmissions > 0 ? ((passedCount / totalSubmissions) * 100).toFixed(1) : 0;
  const flaggedCount = entries.filter((e) => e.is_flagged_for_cheating).length;
  const masteredCount = entries.filter((e) => e.mastery_status === 'MASTERED').length;

  const filteredEntries = entries.filter((e) => {
    const q = searchQuery.toLowerCase();
    const fullName = `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase();
    const lrn = String(e.lrn_or_id || '').toLowerCase();
    return fullName.includes(q) || lrn.includes(q);
  });

  return (
    <div className="container" style={{ paddingBottom: '40px' }}>
      
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          background: notification.type === 'error' ? 'var(--status-critical-bg)' : 'var(--status-mastered-bg)',
          color: notification.type === 'error' ? 'var(--status-critical)' : 'var(--status-mastered)',
          border: `1px solid ${notification.type === 'error' ? 'var(--status-critical)' : 'var(--status-mastered)'}`,
          padding: '14px 20px',
          borderRadius: 'var(--rounded-md)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 600,
          fontSize: '0.9rem'
        }}>
          {notification.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{notification.msg}</span>
        </div>
      )}

      {/* Top Banner with SheetJS & PDFKit Export Actions (Requirement 3) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="badge badge-ilaw-assessment">Cleo Ponce • AP10 Coordinator</span>
            <span className="badge" style={{ background: 'rgba(255,79,0,0.1)', color: 'var(--colors-primary)' }}>
              DepEd SDO Compliance Ready
            </span>
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>
            Teacher Command Center & Analytics Engine
          </h1>
          <p style={{ color: 'var(--colors-body)', fontSize: '0.88rem' }}>
            Real-time live monitoring ng mga marka, anti-cheat proctoring audit logs, competency proficiency profiling, at teacher intervention decision engine.
          </p>
        </div>

        {/* Instant Export Actions (SheetJS & PDFKit) */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <a
            href={api.getAnalyticsXlsxUrl({ section: sectionFilter })}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            title="Download comprehensive Excel gradebook formatted with SheetJS"
          >
            <FileSpreadsheet size={16} color="#10b981" /> I-export sa XLSX (Excel)
          </a>
          <a
            href={api.getAnalyticsPdfUrl({ section: sectionFilter })}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            title="Download official DepEd layout PDF report generated via PDFKit"
          >
            <FileText size={16} /> I-export sa PDF (DepEd Form)
          </a>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '24px', 
        borderBottom: '1px solid var(--border-glass)',
        paddingBottom: '12px',
        overflowX: 'auto'
      }}>
        <button
          onClick={() => setActiveTab('gradebook')}
          className={`btn btn-sm ${activeTab === 'gradebook' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <FileSpreadsheet size={16} />
          Master Gradebook & Proctoring
        </button>
        <button
          onClick={() => setActiveTab('profiling')}
          className={`btn btn-sm ${activeTab === 'profiling' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <BarChart3 size={16} />
          Proficiency Profiling Aggregator (3-Tier)
        </button>
        <button
          onClick={() => setActiveTab('remediation')}
          className={`btn btn-sm ${activeTab === 'remediation' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Sliders size={16} />
          Remediation Decision Center
        </button>
        <button
          onClick={() => setActiveTab('performance_tasks')}
          className={`btn btn-sm ${activeTab === 'performance_tasks' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <FileCheck size={16} />
          Performance Tasks Review (FR-44)
        </button>
        <button
          onClick={() => setActiveTab('item_analysis')}
          className={`btn btn-sm ${activeTab === 'item_analysis' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Activity size={16} />
          Psychometric Item Analysis (FR-21, FR-40)
        </button>
      </div>


      {/* Global Filter Bar */}
      <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '240px' }}>
          {activeTab === 'gradebook' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
              <Search size={16} color="var(--text-sub)" />
              <input
                type="text"
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                placeholder="Maghanap ayon sa Pangalan ng Mag-aaral o LRN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}
          {activeTab === 'profiling' && (
            <span style={{ fontSize: '0.85rem', color: 'var(--colors-body)' }}>
              Pagsusuri ng antas ng kasanayan ayon sa MELC Competencies & ILAW Taxonomy.
            </span>
          )}
          {activeTab === 'remediation' && (
            <span style={{ fontSize: '0.85rem', color: 'var(--colors-body)' }}>
              Pila ng mga mag-aaral na nangangailangan ng intervention (Iskor &lt; 70%).
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Section Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--colors-body-mid)', fontWeight: 600 }}>Seksyon:</span>
            <select
              className="form-input"
              style={{ padding: '8px 12px', fontSize: '0.85rem', width: 'auto' }}
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
            >
              <option value="">Lahat ng Seksyon</option>
              <option value="10-Rizal">10-Rizal</option>
              <option value="10-Bonifacio">10-Bonifacio</option>
            </select>
          </div>

          {/* Quarter Filter (for Profiling) */}
          {activeTab === 'profiling' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--colors-body-mid)', fontWeight: 600 }}>Markahan:</span>
              <select
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '0.85rem', width: 'auto' }}
                value={quarterFilter}
                onChange={(e) => setQuarterFilter(e.target.value)}
              >
                <option value="">Lahat ng Markahan</option>
                <option value="Q1">Q1 (Unang Markahan)</option>
                <option value="Q2">Q2 (Ikalawang Markahan)</option>
                <option value="Q3">Q3 (Ikatlong Markahan)</option>
                <option value="Q4">Q4 (Ikaapat na Markahan)</option>
              </select>
            </div>
          )}

          {/* Status Filter (for Remediation) */}
          {activeTab === 'remediation' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--colors-body-mid)', fontWeight: 600 }}>Katayuan:</span>
              <select
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '0.85rem', width: 'auto' }}
                value={queueStatusFilter}
                onChange={(e) => setQueueStatusFilter(e.target.value)}
              >
                <option value="">Lahat ng Katayuan</option>
                <option value="RECOMMENDED">Awaiting Decision (RECOMMENDED)</option>
                <option value="ASSIGNED">Naitakda (ASSIGNED)</option>
                <option value="OVERRIDDEN">Na-override (OVERRIDDEN / EXEMPT)</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MASTER GRADEBOOK & PROCTORING AUDIT                                */}
      {/* ========================================================================= */}
      {activeTab === 'gradebook' && (
        <>
          {/* Metric Cards Row */}
          <div className="grid-cols-4" style={{ marginBottom: '24px' }}>
            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--colors-body)', fontWeight: 600 }}>Kabuuang Pagsusumite</span>
                <Users size={18} color="#3b82f6" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>
                {totalSubmissions}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--colors-body-mid)', marginTop: '4px' }}>
                Mula sa lahat ng aktibong sekyon
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--colors-body)', fontWeight: 600 }}>Class Passing Rate</span>
                <Award size={18} color="#10b981" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#34d399' }}>
                {passRate}%
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--colors-body-mid)', marginTop: '4px' }}>
                {passedCount} sa {totalSubmissions} ang pumasa (&ge; 75%)
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--colors-body)', fontWeight: 600 }}>Mastered Competencies</span>
                <Flame size={18} color="#fbbf24" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fbbf24' }}>
                {masteredCount}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--colors-body-mid)', marginTop: '4px' }}>
                Score threshold &ge; 85% (Mastered)
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderColor: flaggedCount > 0 ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-glass)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--colors-body)', fontWeight: 600 }}>Proctoring Cheating Flags</span>
                <ShieldAlert size={18} color="#ef4444" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: flaggedCount > 0 ? 'var(--status-critical)' : 'var(--colors-ink)' }}>
                {flaggedCount}
              </div>
              <div style={{ fontSize: '0.72rem', color: flaggedCount > 0 ? 'var(--status-critical)' : 'var(--colors-body-mid)', marginTop: '4px' }}>
                {flaggedCount > 0 ? 'May mga lumampas sa blur limit' : 'Walang paglabag na naitala'}
              </div>
            </div>
          </div>

          {/* Gradebook Table */}
          <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
            {loadingGradebook ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--colors-body)' }}>
                Ikinakarga ang Master Gradebook...
              </div>
            ) : filteredEntries.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--colors-body)' }}>
                Walang naitalang pagsusumite para sa napiling filter.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>LRN</th>
                      <th>Pangalan ng Mag-aaral</th>
                      <th>Seksyon</th>
                      <th>Assessment Title</th>
                      <th>MELC Tag</th>
                      <th>Iskor</th>
                      <th>Bahagdan</th>
                      <th>DepEd Status</th>
                      <th>Proctoring Watchdog</th>
                      <th>Mastery</th>
                      <th>Aksyon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((row) => (
                      <tr key={row.submission_id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--colors-body)' }}>
                          {row.lrn_or_id}
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--colors-ink)' }}>
                          {row.last_name}, {row.first_name}
                        </td>
                        <td>
                          <span className="badge" style={{ background: 'var(--colors-canvas-soft)', color: 'var(--colors-body-mid)' }}>
                            {row.section || '10-Rizal'}
                          </span>
                        </td>
                        <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.quiz_title}
                        </td>
                        <td>
                          <span className="badge badge-ilaw-assessment" style={{ fontSize: '0.68rem' }}>
                            {row.melc_code}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          {row.score_obtained} / {row.total_points}
                        </td>
                        <td style={{ fontWeight: 700, color: row.percentage >= 75 ? '#34d399' : '#f87171' }}>
                          {row.percentage}%
                        </td>
                        <td>
                          <span className={`badge ${row.is_passed ? 'badge-mastered' : 'badge-critical'}`}>
                            {row.is_passed ? 'PASSED' : 'DID NOT MEET'}
                          </span>
                        </td>
                        <td>
                          {row.is_flagged_for_cheating ? (
                            <span className="badge badge-flagged" style={{ cursor: 'pointer' }} onClick={() => handleOpenAuditModal(row)}>
                              <ShieldAlert size={12} /> FLAGGED ({row.blur_count} Blurs)
                            </span>
                          ) : (
                            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>
                              CLEAN ({row.blur_count} Blurs)
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${row.mastery_status === 'MASTERED' ? 'badge-mastered' : (row.mastery_status === 'NEEDS_REINFORCEMENT' ? 'badge-reinforce' : 'badge-critical')}`}>
                            {row.mastery_status || 'EVALUATED'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => handleOpenAuditModal(row)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            title="Tingnan ang Audit Trail"
                          >
                            <Eye size={13} /> Audit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PROFICIENCY PROFILING AGGREGATOR (REQUIREMENT 1)                    */}
      {/* ========================================================================= */}
      {activeTab === 'profiling' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {loadingProfiling ? (
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--colors-body)' }}>
              Ikinakarga ang Proficiency Profiling Aggregator...
            </div>
          ) : profilingData.length === 0 ? (
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--colors-body)' }}>
              Walang datos ng competency profiling para sa napiling filter.
            </div>
          ) : (
            profilingData.map((comp) => {
              const isExpanded = expandedCompId === comp.competency_id;
              const { mastered, developing, needs_intervention } = comp.mastery_distribution;

              return (
                <div key={comp.competency_id} className="glass-panel" style={{ padding: '24px' }}>
                  {/* Competency Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '280px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span className="badge" style={{ background: 'rgba(255,79,0,0.1)', color: 'var(--colors-primary)' }}>
                          {comp.quarter}
                        </span>
                        <span className="badge badge-ilaw-assessment" style={{ fontSize: '0.7rem' }}>
                          ILAW: {comp.ilaw_category}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--colors-body-mid)', fontFamily: 'monospace' }}>
                          {comp.competency_id}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '6px' }}>
                        {comp.topic_title}
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--colors-body)', lineHeight: '1.4' }}>
                        {comp.description}
                      </p>
                    </div>

                    <div style={{ textAlign: 'right', minWidth: '150px' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--colors-body)' }}>
                        Cohort Average
                      </div>
                      <div style={{ 
                        fontSize: '1.85rem', 
                        fontWeight: 900, 
                        color: comp.cohort_average_percentage >= 85 ? '#10b981' : comp.cohort_average_percentage >= 70 ? '#f59e0b' : '#ef4444' 
                      }}>
                        {comp.cohort_average_percentage}%
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--colors-body-mid)' }}>
                        {comp.total_assessed} mag-aaral ang sumubok
                      </div>
                    </div>
                  </div>

                  {/* 3-Tier Proficiency Distribution Cards & Progress Bar */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--colors-body-mid)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Mastery Tier Distribution:
                    </div>

                    {/* Stacked Progress Bar */}
                    <div style={{
                      height: '14px',
                      borderRadius: '7px',
                      background: 'var(--colors-canvas-soft)',
                      display: 'flex',
                      overflow: 'hidden',
                      marginBottom: '12px'
                    }}>
                      <div 
                        title={`Mastered: ${mastered.count} (${mastered.percentage}%)`}
                        style={{ width: `${mastered.percentage}%`, background: '#10b981', transition: 'width 0.4s ease' }} 
                      />
                      <div 
                        title={`Developing: ${developing.count} (${developing.percentage}%)`}
                        style={{ width: `${developing.percentage}%`, background: '#f59e0b', transition: 'width 0.4s ease' }} 
                      />
                      <div 
                        title={`Needs Intervention: ${needs_intervention.count} (${needs_intervention.percentage}%)`}
                        style={{ width: `${needs_intervention.percentage}%`, background: '#ef4444', transition: 'width 0.4s ease' }} 
                      />
                    </div>

                    {/* 3 Tiers Detailed Badges */}
                    <div className="grid-cols-3" style={{ gap: '12px' }}>
                      {/* Tier 1: Mastered (>= 85%) */}
                      <div style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 700, textTransform: 'uppercase' }}>
                            Mastered (&ge; 85%)
                          </div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981' }}>
                            {mastered.count} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>({mastered.percentage}%)</span>
                          </div>
                        </div>
                        <CheckCircle2 size={24} color="#10b981" />
                      </div>

                      {/* Tier 2: Developing (70% - 84%) */}
                      <div style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 700, textTransform: 'uppercase' }}>
                            Developing (70% - 84%)
                          </div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f59e0b' }}>
                            {developing.count} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>({developing.percentage}%)</span>
                          </div>
                        </div>
                        <Award size={24} color="#f59e0b" />
                      </div>

                      {/* Tier 3: Needs Intervention (< 70%) */}
                      <div style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 700, textTransform: 'uppercase' }}>
                            Needs Intervention (&lt; 70%)
                          </div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444' }}>
                            {needs_intervention.count} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>({needs_intervention.percentage}%)</span>
                          </div>
                        </div>
                        <AlertTriangle size={24} color="#ef4444" />
                      </div>
                    </div>
                  </div>

                  {/* Student Cohort Breakdown Toggle */}
                  {comp.student_breakdown && comp.student_breakdown.length > 0 && (
                    <div>
                      <button
                        onClick={() => setExpandedCompId(isExpanded ? null : comp.competency_id)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {isExpanded ? 'Itago ang Talaan ng Mag-aaral' : `Tingnan ang Talaan ng ${comp.student_breakdown.length} Mag-aaral`}
                      </button>

                      {isExpanded && (
                        <div className="table-responsive" style={{ marginTop: '14px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Mag-aaral</th>
                                <th>Seksyon</th>
                                <th>Iskor</th>
                                <th>Bahagdan (%)</th>
                                <th>Mastery Tier</th>
                                <th>Anti-Cheat Audit</th>
                                <th>Petsa ng Pagsusumite</th>
                              </tr>
                            </thead>
                            <tbody>
                              {comp.student_breakdown.map((std, idx) => (
                                <tr key={`${std.student_id}-${idx}`}>
                                  <td style={{ fontWeight: 700, color: 'var(--colors-ink)' }}>
                                    {std.student_name}
                                  </td>
                                  <td>
                                    <span className="badge" style={{ background: 'var(--colors-canvas-soft)', color: 'var(--colors-body-mid)' }}>
                                      {std.section_id || '10-Rizal'}
                                    </span>
                                  </td>
                                  <td>{std.score} / {std.total_points}</td>
                                  <td style={{ 
                                    fontWeight: 700, 
                                    color: std.percentage >= 85 ? '#10b981' : std.percentage >= 70 ? '#f59e0b' : '#ef4444' 
                                  }}>
                                    {std.percentage}%
                                  </td>
                                  <td>
                                    <span className={`badge ${
                                      std.mastery_tier === 'MASTERED' ? 'badge-mastered' :
                                      std.mastery_tier === 'DEVELOPING' ? 'badge-reinforce' : 'badge-critical'
                                    }`}>
                                      {std.mastery_tier}
                                    </span>
                                  </td>
                                  <td>
                                    {std.tab_switch_count >= 3 ? (
                                      <span className="badge badge-flagged">
                                        FLAGGED ({std.tab_switch_count} switches)
                                      </span>
                                    ) : (
                                      <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>
                                        CLEAN ({std.tab_switch_count})
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ fontSize: '0.75rem', color: 'var(--colors-body-mid)' }}>
                                    {std.submitted_at}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: REMEDIATION ROUTING QUEUE & DECISION ACTIONS (REQUIREMENT 2)        */}
      {/* ========================================================================= */}
      {activeTab === 'remediation' && (
        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                Teacher Decision Queue: Remedial Interventions
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--colors-body)' }}>
                Mga mag-aaral na nagtala ng iskor na mababa sa 70% sa competency assessments. Gamitin ang mga aksyon upang aprubahan, baguhin, o i-override ang intervention routing.
              </p>
            </div>
            <button
              onClick={loadRemediationQueue}
              className="btn btn-secondary btn-sm"
              title="I-refresh ang Pila"
            >
              <RefreshCw size={14} /> I-refresh
            </button>
          </div>

          {loadingQueue ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--colors-body)' }}>
              Ikinakarga ang Remediation Decision Queue...
            </div>
          ) : remediationQueue.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#34d399' }}>
              <CheckCircle2 size={36} style={{ margin: '0 auto 12px' }} />
              <div>Walang nakabinbing remedial intervention sa kasalukuyan.</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--colors-body)', marginTop: '4px' }}>
                Lahat ng mag-aaral ay nakamit ang mastery threshold o naaprubahan na.
              </div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mag-aaral</th>
                    <th>Seksyon</th>
                    <th>Target Competency</th>
                    <th>Assessment Iskor</th>
                    <th>Proctoring Audit</th>
                    <th>Inirerekomendang Remedial Material</th>
                    <th>Katayuan</th>
                    <th style={{ textAlign: 'center' }}>Teacher Decision Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {remediationQueue.map((item) => {
                    const isFlagged = item.assessment_performance.is_proctoring_flagged;
                    const isActioning = actionLoadingId === item.intervention_id;

                    return (
                      <tr key={item.intervention_id}>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--colors-ink)' }}>
                            {item.student.name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--colors-body-mid)' }}>
                            {item.student.email}
                          </div>
                        </td>
                        <td>
                          <span className="badge" style={{ background: 'var(--colors-canvas-soft)', color: 'var(--colors-body-mid)' }}>
                            {item.student.section || '10-Rizal'}
                          </span>
                        </td>
                        <td style={{ maxWidth: '200px' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {item.competency.topic_title}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--colors-primary)' }}>
                            {item.competency.quarter} • {item.competency.ilaw_category}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#ef4444' }}>
                            {item.assessment_performance.score} / {item.assessment_performance.total_points}
                          </div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444' }}>
                            {item.assessment_performance.percentage}% (Needs Intervention)
                          </div>
                        </td>
                        <td>
                          {isFlagged ? (
                            <span className="badge badge-flagged">
                              <ShieldAlert size={12} /> {item.assessment_performance.tab_switch_count} switches
                            </span>
                          ) : (
                            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>
                              Clean
                            </span>
                          )}
                        </td>
                        <td>
                          {item.assigned_remedial_material ? (
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--colors-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <BookOpen size={14} />
                                {item.assigned_remedial_material.title}
                              </div>
                              <span className="badge" style={{ fontSize: '0.65rem', background: 'rgba(255,79,0,0.08)', color: 'var(--colors-primary)' }}>
                                {item.assigned_remedial_material.file_type}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.78rem', color: 'var(--colors-body-mid)' }}>
                              Wala pang naitakda
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${
                            item.status === 'RECOMMENDED' ? 'badge-reinforce' :
                            item.status === 'ASSIGNED' ? 'badge-mastered' :
                            'badge-critical'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            {/* Approve Action */}
                            <button
                              disabled={isActioning}
                              onClick={() => handleApproveIntervention(item.intervention_id)}
                              className="btn btn-sm"
                              style={{ 
                                padding: '4px 8px', 
                                fontSize: '0.75rem', 
                                background: '#10b981', 
                                color: '#ffffff' 
                              }}
                              title="Aprubahan ang inirerekomendang intervention"
                            >
                              <Check size={13} /> Aprubahan
                            </button>

                            {/* Modify Action */}
                            <button
                              disabled={isActioning}
                              onClick={() => handleOpenModifyModal(item)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              title="Baguhin ang itinalagang remedial material"
                            >
                              <Edit3 size={13} /> Baguhin
                            </button>

                            {/* Override Action */}
                            <button
                              disabled={isActioning}
                              onClick={() => handleOpenOverrideModal(item)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                              title="I-override o ipawalang-bisa ang intervention"
                            >
                              <XCircle size={13} color="#ef4444" /> I-override
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PERFORMANCE TASK REVIEW & RUBRIC-BASED GRADING QUEUE (SRS FR-44)   */}
      {/* ========================================================================= */}
      {activeTab === 'performance_tasks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Header & Task Selection Cards */}
          <div className="glass-panel" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCheck size={20} color="#3b82f6" /> Performance Tasks Review & Rubric Grading Queue (FR-44)
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--colors-body)' }}>
                  Suriin ang mga ipinasang student outputs, maglagay ng rubric-based breakdown, at mag-encode ng pinal na marka at qualitative feedback.
                </p>
              </div>

              <button onClick={loadPerformanceTasks} className="btn btn-secondary btn-sm">
                <RefreshCw size={14} /> I-refresh
              </button>
            </div>

            {loadingTasks ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--colors-body)' }}>
                Ikinakarga ang mga Performance Tasks...
              </div>
            ) : performanceTasks.length === 0 ? (
              <p style={{ color: 'var(--colors-body)', fontSize: '0.88rem' }}>
                Walang nakatalagang Performance Task para sa napiling filter.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                {performanceTasks.map((task) => {
                  const isSelected = selectedTaskForReview && selectedTaskForReview.id === task.id;
                  const stats = task.stats || { total_submissions: 0, graded_count: 0, pending_count: 0 };

                  return (
                    <div
                      key={task.id}
                      onClick={() => handleSelectTaskForReview(task)}
                      style={{
                        padding: '16px',
                        borderRadius: '12px',
                        background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        border: `1px solid ${isSelected ? '#3b82f6' : 'var(--border-glass)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span className="badge badge-ilaw-ways-forward" style={{ fontSize: '0.7rem' }}>
                          {task.quarter} • {task.ilaw_category || 'WAYS FORWARD'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 700 }}>
                          Max: {task.total_points} Pts
                        </span>
                      </div>

                      <div style={{ fontWeight: 700, fontSize: '0.94rem', color: 'var(--colors-ink)', marginBottom: '6px' }}>
                        {task.title}
                      </div>

                      <div style={{ display: 'flex', gap: '10px', fontSize: '0.76rem', color: 'var(--colors-body)', marginTop: '8px' }}>
                        <span>Ipinasa: <strong style={{ color: 'var(--colors-ink)' }}>{stats.total_submissions}</strong></span>
                        <span>•</span>
                        <span>Namarkahan: <strong style={{ color: '#10b981' }}>{stats.graded_count}</strong></span>
                        <span>•</span>
                        <span>Kailangan ng Review: <strong style={{ color: '#f59e0b' }}>{stats.pending_count}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Submissions Queue Table for Selected Task */}
          {selectedTaskForReview && (
            <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                    Talaan ng mga Pagsusumite: {selectedTaskForReview.title}
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--colors-body)', marginTop: '2px' }}>
                    Rubrik: {selectedTaskForReview.rubric_criteria || 'Wala pang nakatalagang rubrik'}
                  </div>
                </div>
              </div>

              {loadingTaskSubs ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--colors-body)' }}>
                  Ikinakarga ang mga isinumiteng awtput...
                </div>
              ) : taskSubmissions.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--colors-body)' }}>
                  Wala pang mag-aaral na nagpapasa para sa gawaing ito.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Mag-aaral</th>
                        <th>Seksyon</th>
                        <th>Ipinasang Dokumento / Output</th>
                        <th>Reflective Notes ng Mag-aaral</th>
                        <th>Petsa ng Pagsusumite</th>
                        <th>Katayuan</th>
                        <th>Iskor</th>
                        <th>Puna / Feedback</th>
                        <th style={{ textAlign: 'center' }}>Aksyon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taskSubmissions.map((sub) => {
                        const isGraded = sub.status === 'GRADED';

                        return (
                          <tr key={sub.id}>
                            <td style={{ fontWeight: 700, color: 'var(--colors-ink)' }}>
                              {sub.student_name}
                              <div style={{ fontSize: '0.72rem', color: 'var(--colors-body-mid)' }}>
                                LRN: {sub.lrn_or_id}
                              </div>
                            </td>
                            <td>
                              <span className="badge" style={{ background: 'var(--colors-canvas-soft)', color: 'var(--colors-body-mid)' }}>
                                {sub.section || '10-Rizal'}
                              </span>
                            </td>
                            <td>
                              <a
                                href={sub.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--colors-primary)', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600 }}
                              >
                                <FileText size={14} />
                                {sub.file_name}
                              </a>
                            </td>
                            <td style={{ maxWidth: '180px', fontSize: '0.8rem', color: 'var(--colors-body)' }}>
                              {sub.notes ? `"${sub.notes}"` : '-'}
                            </td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--colors-body-mid)' }}>
                              {new Date(sub.submitted_at).toLocaleDateString()}
                            </td>
                            <td>
                              <span className={`badge ${isGraded ? 'badge-mastered' : 'badge-developing'}`}>
                                {sub.status}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700, color: isGraded ? 'var(--status-mastered)' : 'var(--colors-body-mid)' }}>
                              {isGraded ? `${sub.score} / ${selectedTaskForReview.total_points}` : 'Pending'}
                            </td>
                            <td style={{ maxWidth: '180px', fontSize: '0.8rem', color: 'var(--colors-body)' }}>
                              {sub.feedback || '-'}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                onClick={() => handleOpenGradeModal(sub)}
                                className="btn btn-primary btn-sm"
                                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                              >
                                <Edit3 size={13} />
                                {isGraded ? 'I-edit ang Marka' : 'Markahan (Grade)'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: PSYCHOMETRIC ITEM ANALYSIS DASHBOARD (SRS FR-21, FR-40)            */}
      {/* ========================================================================= */}
      {activeTab === 'item_analysis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Controls Bar: Quiz Selector */}
          <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={20} color="#f59e0b" /> Psychometric Item Analysis Engine (FR-21, FR-40)
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--colors-body)' }}>
                Pagsusuri sa Difficulty Index (P = R/T), Discrimination Index (D = [R_H - R_L]/N), at Distractor Distribution sa pagitan ng Upper (27%) at Lower (27%) groups.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <select
                className="form-input"
                value={selectedQuizIdForAnalysis}
                onChange={(e) => {
                  setSelectedQuizIdForAnalysis(e.target.value);
                  loadItemAnalysis(e.target.value);
                }}
                style={{ minWidth: '260px' }}
              >
                {itemAnalysisQuizzes.length > 0 ? (
                  itemAnalysisQuizzes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title}
                    </option>
                  ))
                ) : (
                  <option value="quiz-ap10-cbdrrm-01">
                    Pagsusuri sa CBDRRM Approach at Kahandaan sa Kalamidad
                  </option>
                )}
              </select>

              <button
                onClick={() => loadItemAnalysis(selectedQuizIdForAnalysis)}
                className="btn btn-secondary btn-sm"
              >
                <RefreshCw size={14} /> I-compute
              </button>
            </div>
          </div>

          {loadingItemAnalysis ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--colors-body)' }}>
              Kinakalkula ang psychometric indices at distractor frequencies...
            </div>
          ) : !itemAnalysisData ? (
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
              Pumili ng pagsusulit upang makita ang item analysis.
            </div>
          ) : (
            <>
              {/* Summary Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                <div className="glass-panel" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--colors-body-mid)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Kabuuang Aytem
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--colors-ink)', marginTop: '4px' }}>
                    {itemAnalysisData.summary.total_items}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--colors-body)' }}>
                    MELC Question Set
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--colors-body-mid)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Kabuuang Examinees (T)
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--colors-primary)', marginTop: '4px' }}>
                    {itemAnalysisData.summary.total_examinees}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--colors-body)' }}>
                    Mag-aaral na kumuha
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--colors-body-mid)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Upper / Lower Group (N)
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#a78bfa', marginTop: '4px' }}>
                    {itemAnalysisData.summary.upper_group_size} bawat grupo
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--colors-body)' }}>
                    Top vs Bottom 27% (FR-21)
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--colors-body-mid)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Average Difficulty (P)
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>
                    {itemAnalysisData.summary.average_difficulty_p}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>
                    Katamtamang Hirap (Ideal)
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--colors-body-mid)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Average Discrimination (D)
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fbbf24', marginTop: '4px' }}>
                    {itemAnalysisData.summary.average_discrimination_d}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600 }}>
                    Napakagandang Pagtukoy
                  </div>
                </div>
              </div>

              {/* Detailed Item Analysis Table */}
              <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-glass)' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                    Psychometric Breakdown bawat Tanong (SRS Table FR-40)
                  </h3>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Tanong & Uri</th>
                        <th style={{ textAlign: 'center' }}>Tamang Sagot</th>
                        <th style={{ textAlign: 'center' }}>Total Tama (R)</th>
                        <th style={{ textAlign: 'center' }}>Difficulty Index (P)</th>
                        <th>Verbal Interpretation (P)</th>
                        <th style={{ textAlign: 'center' }}>Discrimination Index (D)</th>
                        <th>Verbal Action (D)</th>
                        <th style={{ textAlign: 'center' }}>Distractor Breakdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemAnalysisData.items.map((item) => {
                        const m = item.metrics;
                        const isExpanded = expandedItemNumber === item.item_number;

                        const pBadgeClass = m.difficulty_index_p >= 0.86 ? 'badge-critical' :
                          m.difficulty_index_p >= 0.71 ? 'badge-developing' :
                          m.difficulty_index_p >= 0.30 ? 'badge-mastered' :
                          m.difficulty_index_p >= 0.15 ? 'badge-developing' : 'badge-critical';

                        const dBadgeClass = m.discrimination_index_d >= 0.40 ? 'badge-mastered' :
                          m.discrimination_index_d >= 0.30 ? 'badge-developing' :
                          m.discrimination_index_d >= 0.20 ? 'badge-ilaw-learning' : 'badge-critical';

                        return (
                          <React.Fragment key={item.item_number}>
                            <tr>
                              <td style={{ fontWeight: 800, color: 'var(--colors-ink)' }}>
                                {item.item_number}
                              </td>
                              <td style={{ maxWidth: '300px' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--colors-ink)', lineHeight: 1.35, marginBottom: '4px' }}>
                                  {item.question_text}
                                </div>
                                <span className="badge badge-secondary" style={{ fontSize: '0.68rem' }}>
                                  {item.question_type}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: '#34d399' }}>
                                {item.correct_answer && item.correct_answer.length > 20 ? `${item.correct_answer.slice(0, 18)}...` : item.correct_answer}
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                {m.total_correct} / {m.total_examinees}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`badge ${pBadgeClass}`} style={{ fontWeight: 800 }}>
                                  {m.difficulty_index_p}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.8rem' }}>
                                <div style={{ fontWeight: 700 }}>{m.difficulty_interpretation}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--colors-body)' }}>{m.difficulty_action}</div>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`badge ${dBadgeClass}`} style={{ fontWeight: 800 }}>
                                  {m.discrimination_index_d}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.8rem' }}>
                                <div style={{ fontWeight: 700 }}>{m.discrimination_interpretation}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--colors-body)' }}>{m.discrimination_action}</div>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {item.distractors && item.distractors.length > 0 ? (
                                  <button
                                    onClick={() => setExpandedItemNumber(isExpanded ? null : item.item_number)}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                                  >
                                    {isExpanded ? 'Itago' : 'Tingnan Distractors'}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--colors-body-mid)' }}>N/A</span>
                                )}
                              </td>
                            </tr>

                            {/* Expanded Distractor Analysis Row */}
                            {isExpanded && item.distractors && (
                              <tr>
                                <td colSpan={9} style={{ background: 'var(--colors-canvas-soft)', padding: '16px 24px' }}>
                                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fbbf24', marginBottom: '8px' }}>
                                    Distractor Analysis: Pagsusuri sa Pagpipilian para sa Aytem #{item.item_number}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                                    {item.distractors.map((d) => (
                                      <div
                                        key={d.id}
                                        style={{
                                          background: d.is_key ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                                          border: `1px solid ${d.is_key ? '#10b981' : 'var(--border-glass)'}`,
                                          padding: '10px 12px',
                                          borderRadius: '8px'
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                          <span style={{ fontWeight: 800, color: d.is_key ? '#34d399' : '#f8fafc' }}>
                                            Opsyon {d.id} {d.is_key && '(TAMANG SAGOT)'}
                                          </span>
                                          <span className={`badge ${d.is_key ? 'badge-mastered' : 'badge-secondary'}`} style={{ fontSize: '0.65rem' }}>
                                            {d.efficiency}
                                          </span>
                                        </div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--colors-body)', marginBottom: '6px' }}>
                                          {d.text}
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--colors-body-mid)' }}>
                                          Pinili: Kabuuan: <strong>{d.total_chosen}</strong> • Upper 27%: <strong>{d.upper_chosen}</strong> • Lower 27%: <strong>{d.lower_chosen}</strong>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PERFORMANCE TASK RUBRIC-BASED GRADING (SRS FR-44)                  */}
      {/* ========================================================================= */}
      {gradingSubmission && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(32,21,21,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 300,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '580px', padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <span className="badge badge-ilaw-ways-forward" style={{ marginBottom: '4px' }}>
                  Rubric Grading Queue
                </span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                  Markahan ang Output: {gradingSubmission.student_name}
                </h2>
              </div>
              <button onClick={() => setGradingSubmission(null)} className="btn btn-secondary btn-sm">
                <XCircle size={16} />
              </button>
            </div>

            <div style={{ background: 'var(--colors-canvas-soft)', padding: '12px 16px', borderRadius: '10px', marginBottom: '18px', border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--colors-body-mid)' }}>Attachment File:</div>
              <a
                href={gradingSubmission.file_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--colors-primary)', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}
              >
                <FileText size={15} /> {gradingSubmission.file_name}
              </a>
              {gradingSubmission.notes && (
                <div style={{ fontSize: '0.78rem', color: 'var(--colors-body)', fontStyle: 'italic', marginTop: '6px' }}>
                  "{gradingSubmission.notes}"
                </div>
              )}
            </div>

            {selectedTaskForReview && selectedTaskForReview.rubric_criteria && (
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '10px 14px', borderRadius: '8px', marginBottom: '18px' }}>
                <div style={{ fontSize: '0.74rem', color: '#fbbf24', fontWeight: 700 }}>
                  Rubric Criteria Breakdown:
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--colors-ink)', marginTop: '2px' }}>
                  {selectedTaskForReview.rubric_criteria}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveGrade}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '6px' }}>
                  Kabuuang Puntos (Over {selectedTaskForReview?.total_points || 100}):
                </label>
                <input
                  type="number"
                  min="0"
                  max={selectedTaskForReview?.total_points || 100}
                  className="form-input"
                  placeholder="Hal: 92"
                  value={gradeScore}
                  onChange={(e) => setGradeScore(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '6px' }}>
                  Qualitative Feedback & Rekomendasyon sa Mag-aaral:
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Isulat ang kalakasan ng gawa at mga aspetong maaaring paunlarin..."
                  value={gradeFeedback}
                  onChange={(e) => setGradeFeedback(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setGradingSubmission(null)}
                  className="btn btn-secondary"
                >
                  Kanselahin
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSavingGrade}
                >
                  <Check size={16} />
                  {isSavingGrade ? 'Inililigtas...' : 'I-save ang Marka at Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: MODIFY REMEDIAL MATERIAL ASSIGNMENT                              */}
      {/* ========================================================================= */}

      {modifyingItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(32,21,21,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '540px', padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                  Baguhin ang Remedial Material
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--colors-body)' }}>
                  Mag-aaral: {modifyingItem.student.name} ({modifyingItem.competency.topic_title})
                </p>
              </div>
              <button
                onClick={() => setModifyingItem(null)}
                className="btn btn-sm btn-secondary"
              >
                Kanselahin
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                Pumili ng Remedial Learning Resource para sa Competency na ito:
              </label>

              {modifyingItem.available_competency_remedials && modifyingItem.available_competency_remedials.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {modifyingItem.available_competency_remedials.map((mat) => (
                    <label
                      key={mat.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: selectedMaterialId === mat.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(0, 0, 0, 0.3)',
                        border: selectedMaterialId === mat.id ? '1px solid #3b82f6' : '1px solid var(--border-glass)',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="radio"
                        name="remedialMaterial"
                        value={mat.id}
                        checked={selectedMaterialId === mat.id}
                        onChange={() => setSelectedMaterialId(mat.id)}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{mat.title}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--colors-body-mid)' }}>Format: {mat.file_type}</div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--colors-body)' }}>
                  Walang ibang alternatibong remedial material na nakatala sa catalog.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setModifyingItem(null)}
                className="btn btn-secondary btn-sm"
              >
                Kanselahin
              </button>
              <button
                onClick={handleSaveModify}
                className="btn btn-primary btn-sm"
                disabled={!selectedMaterialId}
              >
                I-save at Itakda ang Material
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: OVERRIDE / EXEMPT INTERVENTION                                   */}
      {/* ========================================================================= */}
      {overridingItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(32,21,21,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                  I-override ang Remedial Intervention
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--colors-body)' }}>
                  Mag-aaral: {overridingItem.student.name}
                </p>
              </div>
              <button
                onClick={() => setOverridingItem(null)}
                className="btn btn-sm btn-secondary"
              >
                Kanselahin
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--colors-body)', marginBottom: '14px', lineHeight: '1.4' }}>
                Ang pag-override ay magtatanggal sa mag-aaral mula sa aktibong remedial requirements o magmamarka nito bilang resolved ayon sa desisyon ng guro.
              </p>

              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                Pumili ng Override Status:
              </label>
              <select
                className="form-input"
                style={{ width: '100%', padding: '10px 12px' }}
                value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value)}
              >
                <option value="OVERRIDDEN">OVERRIDDEN (Pinasya ng Guro na Hindi Kailangan)</option>
                <option value="EXEMPT">EXEMPT (May Natatanging Katwiran / Pinaliban)</option>
                <option value="COMPLETED">COMPLETED (Naisagawa na sa Labas ng LMS)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setOverridingItem(null)}
                className="btn btn-secondary btn-sm"
              >
                Kanselahin
              </button>
              <button
                onClick={handleSaveOverride}
                className="btn btn-sm"
                style={{ background: '#ef4444', color: '#ffffff' }}
              >
                Kumpirmahin ang Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: PROCTORING SECURITY AUDIT TRAIL                                  */}
      {/* ========================================================================= */}
      {selectedSubForAudit && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(32,21,21,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                  Proctoring Security Audit Trail
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--colors-body)' }}>
                  Mag-aaral: {selectedSubForAudit.first_name} {selectedSubForAudit.last_name} ({selectedSubForAudit.lrn_or_id})
                </p>
              </div>
              <button
                onClick={() => setSelectedSubForAudit(null)}
                className="btn btn-sm btn-secondary"
              >
                Isara
              </button>
            </div>

            {loadingAudit ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--colors-body)' }}>
                Ikinakarga ang proctoring audit log timestamps...
              </div>
            ) : auditLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#34d399', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '12px' }}>
                <CheckCircle2 size={32} style={{ margin: '0 auto 8px' }} />
                Walang naitalang paglipat ng window o paglabag. Malinis ang pagsusulit.
              </div>
            ) : (
              <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: '12px 14px',
                      background: 'var(--colors-canvas-soft)',
                      borderRadius: '8px',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <span className="badge badge-critical" style={{ fontSize: '0.68rem', marginBottom: '4px' }}>
                        {log.event_type}
                      </span>
                      <div style={{ fontSize: '0.78rem', color: 'var(--colors-body)' }}>
                        Nawalan ng pokus ang window
                      </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--colors-body-mid)', fontFamily: 'monospace' }}>
                      {log.timestamp}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
