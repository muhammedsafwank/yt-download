import React, { useState, useEffect, useRef } from 'react';
import { 
  Layers, 
  Trash2, 
  Play, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  FileText,
  Sliders
} from 'lucide-react';

export default function BulkDownload({ startDownload, activeJobs = [] }) {
  const [inputText, setInputText] = useState('');
  const [formatPreset, setFormatPreset] = useState('video-1080p'); // video-best, video-1080p, video-720p, audio-mp3, audio-m4a
  const [concurrency, setConcurrency] = useState(2);
  
  // List of items in the current bulk download batch
  const [items, setItems] = useState([]); // { id, url, status: 'idle'|'downloading'|'completed'|'error', jobId: null, title: '' }
  const [isProcessing, setIsProcessing] = useState(false);
  const startedIdsRef = useRef(new Set());

  // Sync state with global activeJobs progress
  useEffect(() => {
    if (!isProcessing || items.length === 0) return;

    // Check if we need to update status of items based on activeJobs
    let updated = false;
    const newItems = items.map((item) => {
      if (item.jobId) {
        const globalJob = activeJobs.find(j => j.id === item.jobId);
        if (globalJob) {
          let newStatus = item.status;
          if (globalJob.status === 'completed') {
            newStatus = 'completed';
          } else if (globalJob.status === 'error' || globalJob.status === 'cancelled') {
            newStatus = 'error';
          } else if (['downloading', 'merging', 'converting'].includes(globalJob.status)) {
            newStatus = 'downloading';
          }

          if (item.status !== newStatus || item.title !== globalJob.title) {
            updated = true;
            return { 
              ...item, 
              status: newStatus,
              title: globalJob.title !== 'Fetching info...' ? globalJob.title : item.title 
            };
          }
        }
      }
      return item;
    });

    if (updated) {
      setItems(newItems);
    }
  }, [activeJobs, isProcessing, items]);

  // Queue controller loop
  useEffect(() => {
    if (!isProcessing || items.length === 0) return;

    // Count how many are active: status is 'downloading', or status is 'idle' but already started
    const activeCount = items.filter(item => 
      item.status === 'downloading' || 
      (item.status === 'idle' && startedIdsRef.current.has(item.id))
    ).length;
    
    // Idle items that haven't been started yet
    const idleItems = items.filter(item => 
      item.status === 'idle' && !startedIdsRef.current.has(item.id)
    );

    if (activeCount < concurrency && idleItems.length > 0) {
      // We can start more downloads!
      const slotsToFill = concurrency - activeCount;
      const itemsToStart = idleItems.slice(0, slotsToFill);

      // Start downloads outside state updater to prevent duplicate executions (especially in React StrictMode)
      const startedInfo = itemsToStart.map(item => {
        // Determine type and formatOption based on preset
        let type = 'video';
        let option = 'best';
        
        if (formatPreset.startsWith('audio')) {
          type = 'audio';
          option = formatPreset.split('-')[1]; // mp3, m4a
        } else {
          type = 'video';
          option = formatPreset.split('-')[1] === 'best' ? 'best' : `${formatPreset.split('-')[1]}p`;
        }

        // Start the download globally (mutates parent state / triggers WS send)
        const jobId = startDownload(item.url, type, option, `Bulk Video #${item.id}`);

        // Synchronously mark as started to prevent duplicate triggers in the next loop evaluation
        startedIdsRef.current.add(item.id);

        return { id: item.id, jobId };
      });

      // Update state in a pure way
      setItems(prevItems => {
        return prevItems.map(item => {
          const started = startedInfo.find(x => x.id === item.id);
          if (started) {
            return {
              ...item,
              status: 'downloading',
              jobId: started.jobId
            };
          }
          return item;
        });
      });
    }

    // Check if everything is finished (completed or error)
    const allFinished = items.every(item => ['completed', 'error'].includes(item.status));
    if (allFinished && isProcessing) {
      setIsProcessing(false);
      startedIdsRef.current.clear();
    }
  }, [items, isProcessing, concurrency, formatPreset, startDownload]);

  const handleQueueStart = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    // Split text by lines, filter empty lines and trim URLs
    const urls = inputText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('http://') || line.startsWith('https://'));

    if (urls.length === 0) {
      alert('Please enter at least one valid HTTP/HTTPS URL.');
      return;
    }

    // Map to local bulk items structure
    const newItems = urls.map((url, index) => ({
      id: index + 1,
      url,
      status: 'idle',
      jobId: null,
      title: `Pending Link #${index + 1}`
    }));

    startedIdsRef.current.clear();
    setItems(newItems);
    setIsProcessing(true);
    setInputText(''); // Clear input
  };

  const handleReset = () => {
    startedIdsRef.current.clear();
    setItems([]);
    setIsProcessing(false);
  };

  // Get stats
  const total = items.length;
  const completed = items.filter(i => i.status === 'completed').length;
  const errors = items.filter(i => i.status === 'error').length;
  const downloading = items.filter(i => i.status === 'downloading').length;
  const pending = items.filter(i => i.status === 'idle').length;

  return (
    <div style={styles.container}>
      <div style={styles.titleSection}>
        <h2 style={styles.title}>Bulk Download Queue</h2>
        <p style={styles.subtitle}>Paste multiple links to download them sequentially with concurrency limits.</p>
      </div>

      {!isProcessing && items.length === 0 ? (
        /* Configuration & Input Screen */
        <form onSubmit={handleQueueStart} style={styles.form}>
          <div style={styles.editorPanel}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={styles.label}>
                <FileText size={16} /> Paste Video/Audio URLs (one per line):
              </label>
              <textarea
                style={styles.textarea}
                placeholder="https://www.youtube.com/watch?v=video1&#10;https://www.youtube.com/watch?v=video2&#10;https://youtu.be/video3"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                required
              />
            </div>

            {/* Sidebar Settings */}
            <div style={styles.configSidebar} className="glass-card">
              <div style={styles.configHeader}>
                <Sliders size={16} />
                <span>Bulk Settings</span>
              </div>
              
              <div style={styles.formGroup}>
                <label style={styles.fieldLabel}>Download Format</label>
                <select 
                  value={formatPreset} 
                  onChange={(e) => setFormatPreset(e.target.value)}
                  style={styles.select}
                >
                  <option value="video-best">Video: Best Quality</option>
                  <option value="video-1080p">Video: MP4 1080p</option>
                  <option value="video-720p">Video: MP4 720p</option>
                  <option value="audio-mp3">Audio: MP3 (High Quality)</option>
                  <option value="audio-m4a">Audio: M4A (Original)</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.fieldLabel}>Max Concurrent Downloads</label>
                <select 
                  value={concurrency} 
                  onChange={(e) => setConcurrency(parseInt(e.target.value))}
                  style={styles.select}
                >
                  <option value="1">1 Download at a time</option>
                  <option value="2">2 Downloads at a time</option>
                  <option value="3">3 Downloads at a time</option>
                  <option value="4">4 Downloads at a time</option>
                  <option value="5">5 Downloads at a time</option>
                </select>
              </div>

              <button type="submit" style={styles.btnStart} className="btn-primary">
                <Play size={16} />
                <span>Start Queue ({inputText.split('\n').filter(l => l.trim().length > 0).length} links)</span>
              </button>
            </div>
          </div>
        </form>
      ) : (
        /* Progress Monitor Screen */
        <div style={styles.monitorContainer}>
          {/* Stats Bar */}
          <div style={styles.statsBar} className="glass-card">
            <div style={styles.statBox}>
              <div style={styles.statNum}>{total}</div>
              <div style={styles.statLabel}>Total Links</div>
            </div>
            <div style={styles.statBox}>
              <div style={{...styles.statNum, color: '#34d399'}}>{completed}</div>
              <div style={styles.statLabel}>Completed</div>
            </div>
            <div style={styles.statBox}>
              <div style={{...styles.statNum, color: '#60a5fa'}}>{downloading}</div>
              <div style={styles.statLabel}>Active</div>
            </div>
            <div style={styles.statBox}>
              <div style={{...styles.statNum, color: '#fbbf24'}}>{pending}</div>
              <div style={styles.statLabel}>Queued</div>
            </div>
            <div style={styles.statBox}>
              <div style={{...styles.statNum, color: '#f87171'}}>{errors}</div>
              <div style={styles.statLabel}>Failed</div>
            </div>

            <button onClick={handleReset} style={styles.btnReset} className="btn-secondary">
              <Trash2 size={16} />
              <span>Clear / Reset</span>
            </button>
          </div>

          {/* List of items with real-time status */}
          <div style={styles.itemList}>
            <h4 style={styles.listHeaderTitle}>Active Bulk Job Progress</h4>
            {items.map((item) => {
              // Find matching active job details if downloading
              const activeJob = item.jobId ? activeJobs.find(j => j.id === item.jobId) : null;

              return (
                <div key={item.id} style={styles.itemRow} className="glass-card">
                  <div style={styles.itemIndex}>#{item.id}</div>
                  
                  <div style={styles.itemMain}>
                    <div style={styles.itemTitle} title={item.title}>
                      {item.title}
                    </div>
                    <div style={styles.itemUrl} title={item.url}>
                      {item.url}
                    </div>

                    {/* Progress Bar (Visible during downloading) */}
                    {item.status === 'downloading' && activeJob && (
                      <div style={styles.rowProgressContainer}>
                        <div className="progress-bar-container" style={{ height: '4px' }}>
                          <div 
                            className="progress-bar-fill progress-bar-animated" 
                            style={{ 
                              width: `${activeJob.percent}%`,
                              background: activeJob.status === 'merging' || activeJob.status === 'converting'
                                ? 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' 
                                : 'var(--grad-primary)'
                            }}
                          ></div>
                        </div>
                        <div style={styles.rowProgressText}>
                          <span>
                            {activeJob.status === 'merging' ? 'Merging formats...' :
                             activeJob.status === 'converting' ? 'Converting to MP3...' :
                             `Downloading: ${activeJob.percent}%`}
                          </span>
                          <span>{activeJob.speed} • ETA: {activeJob.eta}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={styles.itemBadgeContainer}>
                    {item.status === 'idle' && (
                      <span className="badge badge-pending">Queued</span>
                    )}
                    {item.status === 'downloading' && (
                      <span className="badge badge-downloading">
                        {activeJob?.status === 'merging' ? 'Merging' :
                         activeJob?.status === 'converting' ? 'Converting' : 'Downloading'}
                      </span>
                    )}
                    {item.status === 'completed' && (
                      <span className="badge badge-completed" style={{ gap: 4 }}>
                        <CheckCircle2 size={12} /> Done
                      </span>
                    )}
                    {item.status === 'error' && (
                      <span className="badge badge-error" style={{ gap: 4 }}>
                        <AlertCircle size={12} /> Failed
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    height: '100%',
  },
  titleSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
  },
  editorPanel: {
    display: 'flex',
    gap: '20px',
    flex: 1,
    minHeight: 0,
    alignItems: 'stretch',
    flexWrap: 'wrap',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  textarea: {
    flex: 1,
    background: 'rgba(15, 17, 30, 0.6)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    padding: '16px',
    fontFamily: 'monospace',
    fontSize: '13px',
    lineHeight: '1.6',
    resize: 'none',
    outline: 'none',
    minHeight: '200px',
    transition: 'all 0.2s ease',
    '&:focus': {
      borderColor: 'var(--border-color-focus)',
      boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.15)',
    }
  },
  configSidebar: {
    width: '300px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    flexShrink: 0,
    justifyContent: 'center',
  },
  configHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '10px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fieldLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  select: {
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    padding: '10px 12px',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
  },
  btnStart: {
    height: '46px',
    width: '100%',
    justifyContent: 'center',
    marginTop: '10px',
  },
  monitorContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    flex: 1,
    minHeight: 0,
  },
  statsBar: {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    flexWrap: 'wrap',
  },
  statBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: '70px',
  },
  statNum: {
    fontSize: '22px',
    fontWeight: '800',
    lineHeight: '1.2',
  },
  statLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontWeight: '500',
    marginTop: '2px',
  },
  btnReset: {
    marginLeft: 'auto',
    padding: '10px 16px',
    height: '40px',
  },
  itemList: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflowY: 'auto',
    paddingRight: '6px',
  },
  listHeaderTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    marginBottom: '4px',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 16px',
    gap: '16px',
  },
  itemIndex: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    width: '28px',
  },
  itemMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  itemTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemUrl: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemBadgeContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '110px',
  },
  rowProgressContainer: {
    marginTop: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  rowProgressText: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-active)',
  }
};
