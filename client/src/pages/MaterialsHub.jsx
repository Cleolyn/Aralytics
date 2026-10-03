import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
  FileText, 
  Presentation, 
  Video, 
  DownloadCloud, 
  CheckCircle2, 
  Filter, 
  HardDrive, 
  Plus, 
  Sparkles,
  ExternalLink,
  Eye,
  X,
  BookOpen,
  Calendar,
  Check
} from 'lucide-react';

export default function MaterialsHub() {
  const { isTeacher } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [readLogs, setReadLogs] = useState({});
  const [loading, setLoading] = useState(true);

  // 3-Level Hierarchy Filters (SRS FR-11: Quarter -> Topic -> File Type)
  const [selectedQuarter, setSelectedQuarter] = useState('ALL');
  const [activeIlawFilter, setActiveIlawFilter] = useState('ALL');
  const [selectedFileType, setSelectedFileType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Cache & Preview State
  const [cachedMap, setCachedMap] = useState({});
  const [downloadingId, setDownloadingId] = useState(null);
  const [previewMaterial, setPreviewMaterial] = useState(null);
  const [markingReadId, setMarkingReadId] = useState(null);

  // Teacher Add Material State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('PDF');
  const [newUrl, setNewUrl] = useState('/api/materials/download/new_module.pdf');
  const [competencies, setCompetencies] = useState([]);
  const [selectedCompId, setSelectedCompId] = useState('');

  useEffect(() => {
    loadData();
    checkCachedStatus();
    syncPendingOfflineLogs();

    const handleOnline = () => {
      syncPendingOfflineLogs();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [matRes, taxRes, logsRes] = await Promise.all([
        api.getMaterials(),
        api.getTaxonomy(),
        api.getReadLogs().catch(() => ({ success: false, logs: [] }))
      ]);

      if (matRes.success) {
        setMaterials(matRes.materials);
      }
      if (taxRes.success && taxRes.flatCompetencies.length > 0) {
        setCompetencies(taxRes.flatCompetencies);
        setSelectedCompId(taxRes.flatCompetencies[0].id);
      }
      if (logsRes.success && Array.isArray(logsRes.logs)) {
        const logMap = {};
        logsRes.logs.forEach(l => { logMap[l.material_id] = l; });
        setReadLogs(logMap);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Inspect Service Worker Cache Storage to see which items are stored locally
  const checkCachedStatus = async () => {
    if ('caches' in window) {
      try {
        const cache = await caches.open('aralytics-materials-v1');
        const keys = await cache.keys();
        const map = {};
        keys.forEach((req) => {
          map[req.url] = true;
        });
        setCachedMap(map);
      } catch (err) {
        console.warn('Cache inspection warning:', err);
      }
    }
  };

  // Offline Sync Queue (SRS FR-50)
  const syncPendingOfflineLogs = async () => {
    if (!navigator.onLine) return;
    try {
      const rawQueue = localStorage.getItem('aralytics_offline_read_queue');
      if (rawQueue) {
        const queue = JSON.parse(rawQueue);
        if (Array.isArray(queue) && queue.length > 0) {
          const res = await api.syncOfflineReadLogs(queue);
          if (res.success) {
            localStorage.removeItem('aralytics_offline_read_queue');
            // Refresh logs
            const logsRes = await api.getReadLogs();
            if (logsRes.success) {
              const logMap = {};
              logsRes.logs.forEach(l => { logMap[l.material_id] = l; });
              setReadLogs(logMap);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Offline read queue sync notice:', e);
    }
  };

  const handleMarkAsRead = async (material) => {
    setMarkingReadId(material.id);
    const logItem = {
      material_id: material.id,
      read_at: new Date().toISOString()
    };

    if (!navigator.onLine) {
      // Queue offline in localStorage (FR-50)
      const raw = localStorage.getItem('aralytics_offline_read_queue');
      const queue = raw ? JSON.parse(raw) : [];
      queue.push(logItem);
      localStorage.setItem('aralytics_offline_read_queue', JSON.stringify(queue));

      setReadLogs(prev => ({
        ...prev,
        [material.id]: { ...logItem, synced_from_offline: 1, pendingOffline: true }
      }));
      setMarkingReadId(null);
      alert('Naka-save sa offline queue. Awtomatikong isa-synchronize sa guro pagbalik ng internet connection.');
      return;
    }

    try {
      const res = await api.syncOfflineReadLogs([logItem]);
      if (res.success) {
        setReadLogs(prev => ({
          ...prev,
          [material.id]: { ...logItem, synced_from_offline: 0 }
        }));
      }
    } catch (err) {
      console.error('Error marking material read:', err);
    } finally {
      setMarkingReadId(null);
    }
  };

  const handlePrecache = async (material) => {
    setDownloadingId(material.id);
    try {
      const targetUrl = material.storage_url;
      const res = await fetch(targetUrl);
      if (res.ok) {
        await checkCachedStatus();
        alert(`Tagumpay! Ang "${material.title}" ay naka-cache na sa iyong browser para sa offline access.`);
      }
    } catch (err) {
      alert('Nabigo sa pag-cache ng materyal. Pakisuri ang koneksyon sa internet.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCreateMaterial = async (e) => {
    e.preventDefault();
    if (!isTeacher || !newTitle || !selectedCompId) return;

    try {
      const res = await api.createMaterial({
        competency_id: selectedCompId,
        title: newTitle,
        description: 'Karagdagang materyal para sa AP10 ILAW curriculum',
        file_type: newType,
        storage_url: newUrl,
        file_size_bytes: 3500000
      });

      if (res.success) {
        setShowAddModal(false);
        setNewTitle('');
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Error creating material');
    }
  };

  // 3-Level Hierarchy Filter (FR-11: Quarter -> Topic/ILAW -> File Type)
  const filteredMaterials = materials.filter((m) => {
    const matchesQuarter = selectedQuarter === 'ALL' || (m.melc_code && m.melc_code.includes(selectedQuarter)) || (m.quarter === selectedQuarter);
    const matchesIlaw = activeIlawFilter === 'ALL' || m.ilaw_tag === activeIlawFilter;
    const matchesType = selectedFileType === 'ALL' || m.file_type.toUpperCase() === selectedFileType.toUpperCase();
    const matchesSearch = !searchQuery || 
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (m.melc_code && m.melc_code.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesQuarter && matchesIlaw && matchesType && matchesSearch;
  });

  const getFileIcon = (type) => {
    switch (type) {
      case 'PPTX':
      case 'PPT':
        return <Presentation size={24} color="#f59e0b" />;
      case 'MP4':
      case 'VIDEO':
        return <Video size={24} color="#3b82f6" />;
      default:
        return <FileText size={24} color="#ec4899" />;
    }
  };

  const getIlawBadgeClass = (tag) => {
    switch (tag) {
      case 'INTENTIONS': return 'badge-ilaw-intentions';
      case 'LEARNING_EXPERIENCES': return 'badge-ilaw-learning';
      case 'ASSESSMENT': return 'badge-ilaw-assessment';
      case 'WAYS_FORWARD': return 'badge-ilaw-ways-forward';
      default: return 'badge-secondary';
    }
  };

  return (
    <div className="container">
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>
              Learning Hub & Instructional Materials Repository
            </h1>
            <span className="badge" style={{ background: 'var(--status-mastered-bg)', color: 'var(--status-mastered)', border: '1px solid var(--status-mastered)' }}>
              <HardDrive size={12} /> PWA Offline Cache & Sync (FR-45, FR-50)
            </span>
          </div>
          <p style={{ color: 'var(--colors-body)', fontSize: '0.9rem' }}>
            Nakaayos ayon sa 3-level hierarchy (Quarter &rarr; Paksa &rarr; File Type). Maaaring silipin in-browser o i-cache para sa offline reading.
          </p>
        </div>

        {isTeacher && (
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
            <Plus size={16} /> Mag-upload ng Materyal
          </button>
        )}
      </div>

      {/* 3-Level Hierarchy Control Bar (FR-11) */}
      <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Level 1: Quarter Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--colors-body-mid)', fontWeight: 700, minWidth: '90px' }}>
              MARKAHAN:
            </span>
            {['ALL', 'Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
              <button
                key={q}
                onClick={() => setSelectedQuarter(q)}
                className={`btn btn-sm ${selectedQuarter === q ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.8rem', padding: '6px 14px', borderRadius: '8px' }}
              >
                {q === 'ALL' ? 'Lahat ng Markahan' : `${q} (${q === 'Q1' ? 'Unang Markahan' : q === 'Q2' ? 'Ikalawa' : q === 'Q3' ? 'Ikatlo' : 'Ikaapat'})`}
              </button>
            ))}
          </div>

          {/* Level 2: ILAW / Topic Category */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--colors-body-mid)', fontWeight: 700, minWidth: '90px' }}>
              ILAW YUGTO:
            </span>
            {[
              { key: 'ALL', label: 'Lahat ng Yugto' },
              { key: 'INTENTIONS', label: 'Intentions (Layunin)' },
              { key: 'LEARNING_EXPERIENCES', label: 'Learning Experiences (Karanasan)' },
              { key: 'ASSESSMENT', label: 'Assessment (Pagtataya)' },
              { key: 'WAYS_FORWARD', label: 'Ways Forward (Pagsulong / Remedial)' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveIlawFilter(tab.key)}
                className={`btn btn-sm ${activeIlawFilter === tab.key ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '6px 12px', borderRadius: '8px' }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Level 3: File Type & Search */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--colors-body-mid)', fontWeight: 700, minWidth: '90px' }}>
                URI NG FILE:
              </span>
              {[
                { key: 'ALL', label: 'Lahat ng Format' },
                { key: 'PDF', label: 'PDF Modyul' },
                { key: 'PPTX', label: 'PowerPoint (PPT/PPTX)' },
                { key: 'MP4', label: 'Video (MP4)' }
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setSelectedFileType(f.key)}
                  className={`btn btn-sm ${selectedFileType === f.key ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: '6px' }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Maghanap ng pamagat o MELC..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'var(--colors-canvas)',
                border: '1px solid var(--border-glass)',
                color: 'var(--colors-ink)',
                fontSize: '0.84rem',
                minWidth: '220px',
                outline: 'none'
              }}
            />
          </div>

        </div>
      </div>

      {/* Materials Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--colors-body)' }}>
          Ikinakarga ang mga modyul at instructional materials...
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--colors-body)' }}>Walang nahanap na materyal para sa napiling hierarchy filters.</p>
        </div>
      ) : (
        <div className="grid-cols-3">
          {filteredMaterials.map((mat) => {
            const isCached = Boolean(cachedMap[window.location.origin + mat.storage_url]);
            const isDownloading = downloadingId === mat.id;
            const isRead = Boolean(readLogs[mat.id]);

            return (
              <div key={mat.id} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
                    <div style={{
                      padding: '12px',
                      background: 'var(--colors-canvas-soft)',
                      borderRadius: '12px',
                      border: '1px solid var(--border-glass)'
                    }}>
                      {getFileIcon(mat.file_type)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span className={`badge ${getIlawBadgeClass(mat.ilaw_tag)}`}>
                        {mat.ilaw_tag}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--colors-body-mid)' }}>
                        {mat.file_type} • {(mat.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '8px', lineHeight: 1.3 }}>
                    {mat.title}
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--colors-body)', marginBottom: '14px', lineHeight: 1.4 }}>
                    {mat.description}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--colors-canvas-soft)', padding: '8px 12px', borderRadius: '8px', marginBottom: '16px' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--colors-body-mid)', fontWeight: 600 }}>
                        DepEd MELC Tag:
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--colors-primary)', fontWeight: 600 }}>
                        {mat.melc_code}
                      </div>
                    </div>
                    {isRead && (
                      <span className="badge badge-mastered" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Check size={12} /> NABASA NA
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--colors-body-mid)' }}>
                      Inihanda ni: G. {mat.author_last_name || 'Ponce'}
                    </span>
                    {isCached ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>
                        <CheckCircle2 size={13} /> Naka-save Offline
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--colors-body-mid)' }}>
                        Online Stream
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {/* In-Browser Preview Button (SRS FR-13) */}
                    <button
                      onClick={() => setPreviewMaterial(mat)}
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                    >
                      <Eye size={14} /> Silipin (Preview)
                    </button>

                    {/* Pre-cache / Save Offline Button (SRS FR-45) */}
                    <button
                      onClick={() => handlePrecache(mat)}
                      className={`btn btn-sm ${isCached ? 'btn-secondary' : 'btn-primary'}`}
                      disabled={isDownloading}
                      style={{ flex: 1.2 }}
                    >
                      <DownloadCloud size={14} />
                      {isDownloading ? 'Inililipat...' : isCached ? 'Naka-Cache' : 'I-save Offline'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* In-Browser Preview Modal (SRS FR-13 without mandatory download) */}
      {previewMaterial && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(32,21,21,0.7)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 300,
          padding: '24px'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '840px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px', overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border-glass)', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span className={`badge ${getIlawBadgeClass(previewMaterial.ilaw_tag)}`}>
                    {previewMaterial.ilaw_tag}
                  </span>
                  <span className="badge badge-secondary">
                    {previewMaterial.file_type}
                  </span>
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                  {previewMaterial.title}
                </h2>
              </div>
              <button onClick={() => setPreviewMaterial(null)} className="btn btn-secondary btn-sm">
                <X size={16} /> Isara
              </button>
            </div>

            {/* In-Browser Viewer (FR-13) */}
            <div style={{
              flex: 1,
              background: 'var(--colors-canvas-soft)',
              borderRadius: '12px',
              border: '1px solid var(--border-glass)',
              overflowY: 'auto',
              minHeight: '360px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              textAlign: 'center'
            }}>
              {previewMaterial.file_type === 'MP4' || previewMaterial.file_type === 'VIDEO' ? (
                <div style={{ width: '100%', maxWidth: '640px' }}>
                  <video controls style={{ width: '100%', borderRadius: '10px', maxHeight: '340px' }}>
                    <source src={previewMaterial.storage_url} type="video/mp4" />
                    Hindi suportado ng browser ang video playback.
                  </video>
                </div>
              ) : previewMaterial.file_type === 'PDF' ? (
                <div style={{ width: '100%', height: '100%', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
                  <iframe
                    src={previewMaterial.storage_url}
                    title={previewMaterial.title}
                    style={{ width: '100%', height: '400px', border: 'none', borderRadius: '8px', background: '#ffffff' }}
                  />
                </div>
              ) : (
                <div style={{ maxWidth: '480px' }}>
                  <Presentation size={48} color="#f59e0b" style={{ margin: '0 auto 16px' }} />
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Presentasyon & Slide Deck Preview</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--colors-body)', marginBottom: '16px' }}>
                    Ipinapakita ang opisyal na DepEd slide lecture para sa {previewMaterial.melc_code}.
                  </p>
                  <a
                    href={previewMaterial.storage_url}
                    download
                    className="btn btn-primary btn-sm"
                  >
                    I-download ang Buong PPTX File
                  </a>
                </div>
              )}
            </div>

            {/* Modal Footer & Mark as Completed Action (SRS FR-50) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '16px', borderTop: '1px solid var(--border-glass)', marginTop: '16px' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--colors-body)' }}>
                {readLogs[previewMaterial.id] ? (
                  <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={15} /> Natapos basahin noong {new Date(readLogs[previewMaterial.id].read_at).toLocaleDateString()}
                  </span>
                ) : (
                  'Basahin nang buo upang maitala sa iyong learning progress.'
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => handleMarkAsRead(previewMaterial)}
                  className={`btn ${readLogs[previewMaterial.id] ? 'btn-secondary' : 'btn-primary'}`}
                  disabled={markingReadId === previewMaterial.id}
                >
                  <CheckCircle2 size={16} />
                  {readLogs[previewMaterial.id] ? 'Markahan Ulit Bilang Tapos' : 'Markahan Bilang Nabasa (FR-50)'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Teacher Add Material Modal */}
      {showAddModal && isTeacher && (
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
          <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '28px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '16px' }}>
              Mag-upload ng Bagong AP10 Instructional Material
            </h2>

            <form onSubmit={handleCreateMaterial}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '4px' }}>
                  Kaugnay na Competency (MELC)
                </label>
                <select
                  className="form-input"
                  value={selectedCompId}
                  onChange={(e) => setSelectedCompId(e.target.value)}
                  required
                >
                  {competencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.melc_code}] - {c.description.substring(0, 60)}...
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '4px' }}>
                  Pamagat ng Materyal
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Hal: Aralin 4 - Disaster Preparedness Plan.pdf"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '4px' }}>
                    Uri ng File
                  </label>
                  <select
                    className="form-input"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                  >
                    <option value="PDF">PDF Dokumento</option>
                    <option value="PPTX">PowerPoint (PPTX)</option>
                    <option value="MP4">Video Aralin (MP4)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--colors-body)', marginBottom: '4px' }}>
                    Download Endpoint
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary"
                >
                  Kanselahin
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  I-save at I-index
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
