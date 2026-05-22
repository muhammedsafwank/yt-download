import React, { useState, useEffect, useRef } from 'react';
import { 
  PlaySquare, 
  Search, 
  Clock, 
  Tv, 
  Music, 
  CheckSquare, 
  Square, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  ListTodo,
  Trash2,
  Play
} from 'lucide-react';
import { API_BASE } from '../config';

export default function PlaylistDownload({ startDownload, activeJobs = [] }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Playlist metadata resolved from API
  const [playlistMeta, setPlaylistMeta] = useState(null); // { title, id, entries: [...] }
  const [selectedIds, setSelectedIds] = useState(new Set()); // Selected video IDs

  // Queue runner states (similar to BulkDownload)
  const [queueItems, setQueueItems] = useState([]); // { id, url, title, status: 'idle'|'downloading'|'completed'|'error', jobId }
  const [isProcessing, setIsProcessing] = useState(false);
  const [formatPreset, setFormatPreset] = useState('video-1080p');
  const [concurrency, setConcurrency] = useState(2);
  const startedIdsRef = useRef(new Set());

  // Sync state with global activeJobs progress
  useEffect(() => {
    if (!isProcessing || queueItems.length === 0) return;

    let updated = false;
    const newItems = queueItems.map((item) => {
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

          if (item.status !== newStatus) {
            updated = true;
            return { ...item, status: newStatus };
          }
        }
      }
      return item;
    });

    if (updated) {
      setQueueItems(newItems);
    }
  }, [activeJobs, isProcessing, queueItems]);

  // Concurrency Loop
  useEffect(() => {
    if (!isProcessing || queueItems.length === 0) return;

    // Count how many are active: status is 'downloading', or status is 'idle' but already started
    const activeCount = queueItems.filter(item => 
      item.status === 'downloading' || 
      (item.status === 'idle' && startedIdsRef.current.has(item.id))
    ).length;
    
    // Idle items that haven't been started yet
    const idleItems = queueItems.filter(item => 
      item.status === 'idle' && !startedIdsRef.current.has(item.id)
    );

    if (activeCount < concurrency && idleItems.length > 0) {
      const slotsToFill = concurrency - activeCount;
      const itemsToStart = idleItems.slice(0, slotsToFill);

      // Start downloads outside state updater to prevent duplicate executions (especially in React StrictMode)
      const startedInfo = itemsToStart.map(item => {
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
        const jobId = startDownload(item.url, type, option, item.title);

        // Synchronously mark as started to prevent duplicate triggers in the next loop evaluation
        startedIdsRef.current.add(item.id);

        return { id: item.id, jobId };
      });

      // Update state in a pure way
      setQueueItems(prevItems => {
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

    const allFinished = queueItems.every(item => ['completed', 'error'].includes(item.status));
    if (allFinished && isProcessing) {
      setIsProcessing(false);
      startedIdsRef.current.clear();
    }
  }, [queueItems, isProcessing, concurrency, formatPreset, startDownload]);

  const handleAnalyzePlaylist = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setPlaylistMeta(null);
    setSelectedIds(new Set());
    setQueueItems([]);
    setIsProcessing(false);

    try {
      const res = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch playlist details.');
      }

      if (!data.isPlaylist) {
        throw new Error('This URL appears to be a single video. Please use the "Single Download" tab.');
      }

      setPlaylistMeta(data);
      // Select all videos by default
      const allIds = new Set(data.entries.map(entry => entry.id));
      setSelectedIds(allIds);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to resolve the playlist.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!playlistMeta) return;
    setSelectedIds(new Set(playlistMeta.entries.map(e => e.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleStartPlaylistDownload = () => {
    if (!playlistMeta || selectedIds.size === 0) return;

    // Filter selected entries and map to queue items
    const selectedEntries = playlistMeta.entries.filter(entry => selectedIds.has(entry.id));
    const items = selectedEntries.map((entry, index) => ({
      id: index + 1,
      url: entry.url,
      title: entry.title,
      status: 'idle',
      jobId: null
    }));

    startedIdsRef.current.clear();
    setQueueItems(items);
    setIsProcessing(true);
  };

  const handleReset = () => {
    startedIdsRef.current.clear();
    setQueueItems([]);
    setIsProcessing(false);
  };

  const formatDuration = (sec) => {
    if (!sec) return '--:--';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Stats
  const total = queueItems.length;
  const completed = queueItems.filter(i => i.status === 'completed').length;
  const errors = queueItems.filter(i => i.status === 'error').length;
  const downloading = queueItems.filter(i => i.status === 'downloading').length;
  const pending = queueItems.filter(i => i.status === 'idle').length;

  return (
    <div style={styles.container}>
      <div style={styles.titleSection}>
        <h2 style={styles.title}>Playlist Downloader</h2>
        <p style={styles.subtitle}>Parse a YouTube playlist link, select videos, and download in batch.</p>
      </div>

      {/* Input playlist link */}
      {!isProcessing && queueItems.length === 0 && (
        <form onSubmit={handleAnalyzePlaylist} style={styles.searchForm}>
          <div style={styles.inputContainer}>
            <PlaySquare size={18} style={styles.searchIcon} />
            <input 
              type="url" 
              placeholder="Paste YouTube playlist URL (e.g. https://www.youtube.com/playlist?list=...)" 
              value={url} 
              onChange={(e) => setUrl(e.target.value)} 
              disabled={loading}
              style={styles.searchInput}
              required
            />
          </div>
          <button 
            type="submit" 
            disabled={loading || !url.trim()} 
            style={styles.btnAnalyze}
            className="btn-primary"
          >
            {loading ? (
              <>
                <Loader2 className="spinner" size={16} />
                <span>Parsing Playlist...</span>
              </>
            ) : (
              <>
                <Search size={16} />
                <span>Parse</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* Error state */}
      {error && (
        <div style={styles.errorCard}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Placeholder */}
      {loading && (
        <div style={styles.loadingCard} className="glass-card">
          <Loader2 className="spinner" size={32} style={{ color: '#6366f1', marginBottom: 12 }} />
          <div style={{ fontWeight: '600' }}>Fetching playlist index entries...</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            For very large playlists this might take a bit longer
          </div>
        </div>
      )}

      {/* Step 1: Render Playlist entries list & selection configuration */}
      {playlistMeta && !loading && queueItems.length === 0 && (
        <div style={styles.playlistConfigLayout}>
          
          {/* Left panel: List of videos in playlist */}
          <div style={styles.videoListContainer} className="glass-card">
            <div style={styles.listHeader}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={styles.playlistTitle}>{playlistMeta.title}</h3>
                <span style={styles.playlistCount}>
                  Total videos: {playlistMeta.entries.length} • Selected: {selectedIds.size}
                </span>
              </div>
              <div style={styles.selectionControls}>
                <button onClick={handleSelectAll} style={styles.btnText}>Select All</button>
                <span style={{ color: 'var(--text-muted)' }}>|</span>
                <button onClick={handleDeselectAll} style={styles.btnText}>Deselect All</button>
              </div>
            </div>

            <div style={styles.scrollList}>
              {playlistMeta.entries.map((video, idx) => {
                const isSelected = selectedIds.has(video.id);
                return (
                  <div 
                    key={video.id} 
                    style={{
                      ...styles.videoRow, 
                      ...(isSelected ? styles.videoRowSelected : {})
                    }}
                    onClick={() => handleToggleSelect(video.id)}
                  >
                    <div style={styles.checkboxContainer}>
                      {isSelected ? (
                        <CheckSquare size={18} style={{ color: '#818cf8' }} />
                      ) : (
                        <Square size={18} style={{ color: 'var(--text-muted)' }} />
                      )}
                    </div>
                    <div style={styles.videoIndex}>{idx + 1}</div>
                    <div style={styles.videoTitleText} title={video.title}>
                      {video.title}
                    </div>
                    <div style={styles.videoDuration}>
                      <Clock size={12} />
                      <span>{formatDuration(video.duration)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right panel: Download preset settings */}
          <div style={styles.downloadSettingsPanel} className="glass-card">
            <h4 style={styles.panelTitle}>Download Parameters</h4>
            
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
              <label style={styles.fieldLabel}>Concurrency Limit</label>
              <select 
                value={concurrency} 
                onChange={(e) => setConcurrency(parseInt(e.target.value))}
                style={styles.select}
              >
                <option value="1">1 at a time</option>
                <option value="2">2 at a time</option>
                <option value="3">3 at a time</option>
                <option value="4">4 at a time</option>
              </select>
            </div>

            <button 
              onClick={handleStartPlaylistDownload} 
              disabled={selectedIds.size === 0} 
              style={styles.btnStart} 
              className="btn-primary"
            >
              <Download size={16} />
              <span>Download Selected ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Render live progress of playlist downloads */}
      {isProcessing || queueItems.length > 0 ? (
        <div style={styles.monitorContainer}>
          {/* Stats Bar */}
          <div style={styles.statsBar} className="glass-card">
            <div style={styles.statBox}>
              <div style={styles.statNum}>{total}</div>
              <div style={styles.statLabel}>Total Videos</div>
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
              <span>Clear / Return</span>
            </button>
          </div>

          {/* List of items */}
          <div style={styles.itemList}>
            {queueItems.map((item) => {
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
      ) : null}
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
  searchForm: {
    display: 'flex',
    gap: '12px',
  },
  inputContainer: {
    position: 'relative',
    flex: 1,
  },
  searchIcon: {
    position: 'absolute',
    left: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-muted)',
  },
  searchInput: {
    paddingLeft: '44px',
    width: '100%',
    height: '46px',
    background: 'rgba(15, 17, 30, 0.6)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.2s ease',
    '&:focus': {
      borderColor: 'var(--border-color-focus)',
      boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.15)',
    }
  },
  btnAnalyze: {
    height: '46px',
    padding: '0 24px',
    flexShrink: 0,
  },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: 'var(--radius-md)',
    color: '#f87171',
    fontSize: '14px',
  },
  loadingCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    textAlign: 'center',
  },
  playlistConfigLayout: {
    display: 'flex',
    gap: '20px',
    flex: 1,
    minHeight: 0,
    flexWrap: 'wrap',
  },
  videoListContainer: {
    flex: 1.6,
    display: 'flex',
    flexDirection: 'column',
    minWidth: '320px',
    minHeight: '300px',
    padding: '20px',
  },
  listHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '14px',
    marginBottom: '10px',
    gap: '12px',
    flexWrap: 'wrap',
  },
  playlistTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  playlistCount: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
  selectionControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
  },
  btnText: {
    background: 'none',
    border: 'none',
    color: '#818cf8',
    cursor: 'pointer',
    fontWeight: '600',
    '&:hover': {
      color: '#a5b4fc',
      textDecoration: 'underline',
    }
  },
  scrollList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingRight: '4px',
  },
  videoRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'background 0.2s',
    background: 'rgba(255,255,255,0.01)',
    '&:hover': {
      background: 'rgba(255, 255, 255, 0.04)',
    }
  },
  videoRowSelected: {
    background: 'rgba(99, 102, 241, 0.05)',
  },
  checkboxContainer: {
    display: 'flex',
    alignItems: 'center',
    marginRight: '12px',
  },
  videoIndex: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    width: '24px',
  },
  videoTitleText: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-primary)',
    flex: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginRight: '12px',
  },
  videoDuration: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  downloadSettingsPanel: {
    flex: 0.9,
    minWidth: '240px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    height: 'fit-content',
  },
  panelTitle: {
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
