import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  Layers, 
  PlaySquare, 
  History as HistoryIcon, 
  Settings as SettingsIcon, 
  X, 
  CheckCircle, 
  AlertTriangle, 
  FolderOpen, 
  Loader2, 
  ChevronRight,
  RefreshCw
} from 'lucide-react';

import SingleDownload from './components/SingleDownload';
import BulkDownload from './components/BulkDownload';
import PlaylistDownload from './components/PlaylistDownload';
import History from './components/History';
import Settings from './components/Settings';
import { API_BASE, WS_BASE } from './config';

export default function App() {
  const [activeTab, setActiveTab] = useState('single');
  const [downloadDir, setDownloadDir] = useState('');
  const [backendStatus, setBackendStatus] = useState('connecting'); // connecting, online, offline
  const [jobs, setJobs] = useState([]); // Array of download job objects
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Fetch default download directory and backend status on mount
  useEffect(() => {
    fetchBackendStatus();
    fetchDefaultDir();
    connectWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  const fetchBackendStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      if (res.ok) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }
    } catch (e) {
      setBackendStatus('offline');
    }
  };

  const fetchDefaultDir = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/default-download-dir`);
      const data = await res.json();
      if (data.dir) {
        setDownloadDir(data.dir);
      }
    } catch (e) {
      console.error('Failed to fetch default download dir:', e);
    }
  };

  const connectWebSocket = () => {
    console.log('Connecting to WebSocket...');
    const ws = new WebSocket(WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setBackendStatus('online');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { jobId, type, ...payload } = message;

        setJobs((prevJobs) => {
          return prevJobs.map((job) => {
            if (job.id === jobId) {
              if (type === 'progress') {
                return {
                  ...job,
                  status: payload.status,
                  percent: payload.percent,
                  speed: payload.speed,
                  eta: payload.eta,
                  size: payload.size
                };
              } else if (type === 'status') {
                return {
                  ...job,
                  status: payload.status,
                  fileName: payload.fileName || job.fileName,
                  filePath: payload.filePath || job.filePath,
                  error: payload.error || '',
                  message: payload.message || ''
                };
              }
            }
            return job;
          });
        });
      } catch (err) {
        console.error('Error handling WS message:', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed. Retrying...');
      setBackendStatus('connecting');
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      ws.close();
    };
  };

  // Triggers a download job
  const startDownload = (url, type, formatOption, title) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert('Cannot start download: Backend is offline.');
      return;
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newJob = {
      id: jobId,
      url,
      title: title || 'Fetching info...',
      type,
      formatOption,
      status: 'pending',
      percent: 0,
      speed: '0 KB/s',
      eta: '--:--',
      size: '--',
      error: '',
      timestamp: new Date().toISOString()
    };

    // Add job to global state
    setJobs((prev) => [newJob, ...prev]);

    // Send start message to WebSocket
    wsRef.current.send(JSON.stringify({
      action: 'start-download',
      jobId,
      url,
      type,
      formatOption,
      downloadDir,
      title
    }));

    return jobId;
  };

  // Cancels a download job
  const cancelDownload = (jobId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'cancel-download',
        jobId
      }));
    }

    setJobs((prev) => 
      prev.map((job) => 
        job.id === jobId 
          ? { ...job, status: 'cancelled', message: 'Download cancelled by user.' }
          : job
      )
    );
  };

  // Open local download folder
  const openDownloadFolder = async () => {
    try {
      await fetch(`${API_BASE}/api/open-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: downloadDir })
      });
    } catch (e) {
      console.error('Failed to open downloads folder:', e);
    }
  };

  // Filter jobs into active/completed lists
  const activeJobs = jobs.filter(job => 
    ['pending', 'downloading', 'merging', 'converting'].includes(job.status)
  );

  return (
    <div style={styles.appContainer}>
      {/* Header Nav */}
      <header style={styles.header}>
        <div style={styles.logoSection}>
          <Download style={styles.logoIcon} size={28} />
          <h1 style={styles.logoText}>Velo<span style={{color: '#ec4899'}}>Stream</span></h1>
          <span style={styles.badgeFree}>Free</span>
        </div>

        {/* Backend Status indicator */}
        <div style={styles.statusIndicator}>
          {backendStatus === 'online' && (
            <div style={styles.statusOnline}>
              <span style={styles.dotOnline}></span> Online
            </div>
          )}
          {backendStatus === 'connecting' && (
            <div style={styles.statusConnecting}>
              <Loader2 className="spinner" size={14} style={{ animation: 'spin 1.5s linear infinite' }} /> Connecting...
            </div>
          )}
          {backendStatus === 'offline' && (
            <div style={styles.statusOffline}>
              <AlertTriangle size={14} /> Offline
              <button onClick={fetchBackendStatus} style={styles.btnRetry}>
                <RefreshCw size={10} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Layout (Grid on Desktop) */}
      <div style={styles.mainContent}>
        {/* Navigation Tabs (Sidebar / Navbar) */}
        <nav style={styles.navigation}>
          <button 
            onClick={() => setActiveTab('single')} 
            style={{...styles.navBtn, ...(activeTab === 'single' ? styles.navBtnActive : {})}}
          >
            <Download size={18} />
            <span>Single Download</span>
          </button>
          <button 
            onClick={() => setActiveTab('bulk')} 
            style={{...styles.navBtn, ...(activeTab === 'bulk' ? styles.navBtnActive : {})}}
          >
            <Layers size={18} />
            <span>Bulk Download</span>
          </button>
          <button 
            onClick={() => setActiveTab('playlist')} 
            style={{...styles.navBtn, ...(activeTab === 'playlist' ? styles.navBtnActive : {})}}
          >
            <PlaySquare size={18} />
            <span>Playlist Mode</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')} 
            style={{...styles.navBtn, ...(activeTab === 'history' ? styles.navBtnActive : {})}}
          >
            <HistoryIcon size={18} />
            <span>Downloads History</span>
          </button>
          <button 
            onClick={() => setActiveTab('settings')} 
            style={{...styles.navBtn, ...(activeTab === 'settings' ? styles.navBtnActive : {})}}
          >
            <SettingsIcon size={18} />
            <span>Settings</span>
          </button>

          <div style={styles.navFooter}>
            <div style={styles.downloadDirCard} onClick={openDownloadFolder}>
              <div style={styles.downloadDirTitle}>
                <FolderOpen size={14} />
                <span>Downloads Path</span>
              </div>
              <div style={styles.downloadDirPath} title={downloadDir}>
                {downloadDir ? (downloadDir.split(/[/\\]/).pop() || downloadDir) : 'Loading...'}
              </div>
            </div>
          </div>
        </nav>

        {/* Tab Content Display Area */}
        <section style={styles.tabContentPanel} className="glass-panel">
          {activeTab === 'single' && (
            <SingleDownload startDownload={startDownload} activeJobs={jobs} />
          )}
          {activeTab === 'bulk' && (
            <BulkDownload startDownload={startDownload} activeJobs={jobs} />
          )}
          {activeTab === 'playlist' && (
            <PlaylistDownload startDownload={startDownload} activeJobs={jobs} />
          )}
          {activeTab === 'history' && (
            <History openFolder={openDownloadFolder} />
          )}
          {activeTab === 'settings' && (
            <Settings downloadDir={downloadDir} setDownloadDir={setDownloadDir} />
          )}
        </section>

        {/* Active Downloads Panel (Sidebar Queue) */}
        <aside style={styles.queueSidebar} className="glass-panel">
          <div style={styles.queueHeader}>
            <h3 style={styles.queueTitle}>Download Queue ({activeJobs.length})</h3>
            {activeJobs.length > 0 && <Loader2 className="spinner" size={16} />}
          </div>

          <div style={styles.queueList}>
            {activeJobs.length === 0 ? (
              <div style={styles.emptyQueue}>
                <Download size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                <div>No active downloads</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Add a URL to begin downloading
                </div>
              </div>
            ) : (
              activeJobs.map((job) => (
                <div key={job.id} style={styles.jobCard} className="glass-card">
                  <div style={styles.jobCardHeader}>
                    <div style={styles.jobInfo}>
                      <div style={styles.jobTitle} title={job.title}>
                        {job.title}
                      </div>
                      <div style={styles.jobSub}>
                        <span style={styles.jobTypeBadge}>
                          {job.type === 'audio' ? 'Audio (MP3)' : `Video (${job.formatOption})`}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => cancelDownload(job.id)} 
                      style={styles.cancelBtn} 
                      title="Cancel download"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Progress info */}
                  <div style={styles.jobProgressContainer}>
                    <div style={styles.jobProgressText}>
                      <span>{job.status === 'pending' ? 'Queued' : `${job.percent}%`}</span>
                      <span>{job.speed}</span>
                    </div>

                    <div className="progress-bar-container">
                      <div 
                        className={`progress-bar-fill progress-bar-animated`} 
                        style={{ 
                          width: `${job.percent}%`,
                          background: job.status === 'merging' || job.status === 'converting'
                            ? 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' 
                            : 'var(--grad-primary)'
                        }}
                      ></div>
                    </div>

                    <div style={styles.jobStatusDetails}>
                      {job.status === 'downloading' && (
                        <span>Downloading ({job.size}) • ETA: {job.eta}</span>
                      )}
                      {job.status === 'merging' && (
                        <span style={{ color: '#c084fc' }}>Merging high quality streams...</span>
                      )}
                      {job.status === 'converting' && (
                        <span style={{ color: '#f472b6' }}>Converting audio to MP3...</span>
                      )}
                      {job.status === 'pending' && (
                        <span>Waiting...</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

const styles = {
  appContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    padding: '16px',
    gap: '16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    height: '60px',
    flexShrink: 0,
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoIcon: {
    color: '#6366f1',
    filter: 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.5))',
  },
  logoText: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#f8fafc',
    margin: 0,
    background: 'linear-gradient(to right, #ffffff, #a5b4fc)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  badgeFree: {
    fontSize: '10px',
    fontWeight: '700',
    background: 'rgba(236, 72, 153, 0.15)',
    color: '#f472b6',
    border: '1px solid rgba(236, 72, 153, 0.3)',
    borderRadius: '4px',
    padding: '2px 6px',
    textTransform: 'uppercase',
  },
  statusIndicator: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  statusOnline: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  dotOnline: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#10b981',
    boxShadow: '0 0 8px #10b981',
  },
  statusConnecting: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  statusOffline: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: '#ef4444',
  },
  btnRetry: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
  },
  mainContent: {
    display: 'flex',
    flex: 1,
    gap: '16px',
    minHeight: 0, // Crucial for nested scroll
  },
  navigation: {
    width: '240px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flexShrink: 0,
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-title)',
    fontWeight: '500',
    fontSize: '14px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.2s ease',
  },
  navBtnActive: {
    background: 'rgba(99, 102, 241, 0.15)',
    borderColor: 'rgba(99, 102, 241, 0.25)',
    color: '#a5b4fc',
    boxShadow: 'inset 0 0 12px rgba(99, 102, 241, 0.05)',
  },
  navFooter: {
    marginTop: 'auto',
  },
  downloadDirCard: {
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  downloadDirTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginBottom: '4px',
  },
  downloadDirPath: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  tabContentPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '24px',
    overflowY: 'auto',
  },
  queueSidebar: {
    width: '320px',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    padding: '16px',
  },
  queueHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '12px',
  },
  queueTitle: {
    fontSize: '16px',
    fontWeight: '600',
  },
  queueList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflowY: 'auto',
    flex: 1,
    paddingRight: '4px',
  },
  emptyQueue: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    color: 'var(--text-secondary)',
    fontSize: '13px',
    padding: '20px',
    textAlign: 'center',
  },
  jobCard: {
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  jobCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '8px',
  },
  jobInfo: {
    flex: 1,
    minWidth: 0,
  },
  jobTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  jobSub: {
    marginTop: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  jobTypeBadge: {
    fontSize: '10px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    background: 'rgba(255, 255, 255, 0.06)',
    padding: '1px 5px',
    borderRadius: '3px',
  },
  cancelBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
    borderRadius: '4px',
    transition: 'background 0.2s',
    '&:hover': {
      background: 'rgba(255, 255, 255, 0.05)',
      color: '#ef4444',
    }
  },
  jobProgressContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  jobProgressText: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    fontWeight: '600',
    color: '#a5b4fc',
  },
  jobStatusDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: 'var(--text-muted)',
  }
};
