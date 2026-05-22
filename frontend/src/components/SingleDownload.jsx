import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Search, 
  Clock, 
  Tv, 
  Music, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Eye, 
  Loader2 
} from 'lucide-react';
import { API_BASE } from '../config';

export default function SingleDownload({ startDownload, activeJobs }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState(null); // { type: 'video'|'audio', option: '1080p'|'mp3'|etc }
  const [currentJobId, setCurrentJobId] = useState(null);

  // Parse duration in seconds to HH:MM:SS
  const formatDuration = (sec) => {
    if (!sec) return '0:00';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setMetadata(null);
    setSelectedFormat(null);
    setCurrentJobId(null);

    try {
      const res = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch video information.');
      }

      if (data.isPlaylist) {
        throw new Error('This looks like a playlist link. Please use the "Playlist Mode" tab to analyze playlists.');
      }

      setMetadata(data);
      
      // Auto-select best quality video by default
      if (data.videoOptions && data.videoOptions.length > 0) {
        setSelectedFormat({ type: 'video', option: data.videoOptions[0].resolution });
      } else {
        setSelectedFormat({ type: 'audio', option: 'mp3' });
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred while analyzing the link.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTrigger = () => {
    if (!metadata || !selectedFormat) return;

    const jobId = startDownload(
      metadata.originalUrl,
      selectedFormat.type,
      selectedFormat.option,
      metadata.title
    );
    setCurrentJobId(jobId);
  };

  // Find job status in the parent job list
  const activeJob = activeJobs.find(job => job.id === currentJobId);

  return (
    <div style={styles.container}>
      <div style={styles.titleSection}>
        <h2 style={styles.title}>Download Single Media</h2>
        <p style={styles.subtitle}>Enter a YouTube video, short, or audio link to download instantly.</p>
      </div>

      {/* Input URL Form */}
      <form onSubmit={handleAnalyze} style={styles.searchForm}>
        <div style={styles.inputContainer}>
          <Globe size={18} style={styles.searchIcon} />
          <input 
            type="url" 
            placeholder="Paste YouTube video or audio link here (e.g. https://www.youtube.com/watch?v=...)" 
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
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Search size={16} />
              <span>Analyze</span>
            </>
          )}
        </button>
      </form>

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
          <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Parsing video stream metadata...</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>This should only take a few seconds</div>
        </div>
      )}

      {/* Metadata & Download Options Display */}
      {metadata && !loading && (
        <div style={styles.resultCard} className="glass-card">
          <div style={styles.mediaDetails}>
            {/* Thumbnail */}
            <div style={styles.thumbnailContainer}>
              <img 
                src={metadata.thumbnail || 'https://via.placeholder.com/320x180?text=No+Thumbnail'} 
                alt={metadata.title} 
                style={styles.thumbnail} 
              />
              <div style={styles.durationBadge}>
                <Clock size={12} />
                <span>{formatDuration(metadata.duration)}</span>
              </div>
            </div>

            {/* Title & Author */}
            <div style={styles.infoContainer}>
              <h3 style={styles.videoTitle} title={metadata.title}>{metadata.title}</h3>
              <div style={styles.uploaderName}>by {metadata.uploader || 'Unknown Channel'}</div>
              
              <div style={styles.statsRow}>
                {metadata.viewCount && (
                  <div style={styles.statItem}>
                    <Eye size={14} />
                    <span>{metadata.viewCount.toLocaleString()} views</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={styles.divider}></div>

          {/* Download Config Options */}
          <div style={styles.optionsSection}>
            <h4 style={styles.sectionTitle}>Select Download Format:</h4>
            
            {/* Format Categories */}
            <div style={styles.formatCategories}>
              {/* Video Resolutions */}
              <div style={styles.categoryBlock}>
                <div style={styles.categoryHeader}>
                  <Tv size={16} />
                  <span>Video Formats (MP4)</span>
                </div>
                <div style={styles.buttonGrid}>
                  {metadata.videoOptions && metadata.videoOptions.length > 0 ? (
                    metadata.videoOptions.map((opt) => (
                      <button
                        key={opt.resolution}
                        type="button"
                        onClick={() => setSelectedFormat({ type: 'video', option: opt.resolution })}
                        style={{
                          ...styles.optionBtn,
                          ...((selectedFormat?.type === 'video' && selectedFormat?.option === opt.resolution) ? styles.optionBtnActive : {})
                        }}
                      >
                        <div style={styles.optTitle}>{opt.resolution}</div>
                        <div style={styles.optSub}>
                          {opt.fps ? `${opt.fps}fps` : ''} {opt.ext.toUpperCase()}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div style={styles.noFormatsText}>No video formats detected</div>
                  )}
                </div>
              </div>

              {/* Audio Conversions */}
              <div style={styles.categoryBlock}>
                <div style={styles.categoryHeader}>
                  <Music size={16} />
                  <span>Audio Formats</span>
                </div>
                <div style={styles.buttonGrid}>
                  <button
                    type="button"
                    onClick={() => setSelectedFormat({ type: 'audio', option: 'mp3' })}
                    style={{
                      ...styles.optionBtn,
                      ...((selectedFormat?.type === 'audio' && selectedFormat?.option === 'mp3') ? styles.optionBtnActive : {})
                    }}
                  >
                    <div style={styles.optTitle}>MP3 Audio</div>
                    <div style={styles.optSub}>High Quality 320kbps</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFormat({ type: 'audio', option: 'm4a' })}
                    style={{
                      ...styles.optionBtn,
                      ...((selectedFormat?.type === 'audio' && selectedFormat?.option === 'm4a') ? styles.optionBtnActive : {})
                    }}
                  >
                    <div style={styles.optTitle}>M4A Audio</div>
                    <div style={styles.optSub}>Original Stream</div>
                  </button>
                </div>
              </div>
            </div>
            
            {/* Action Trigger */}
            <div style={styles.actionContainer}>
              {!activeJob ? (
                <button 
                  onClick={handleDownloadTrigger}
                  style={styles.btnDownload}
                  className="btn-primary"
                >
                  <Download size={18} />
                  <span>Download Selected Format</span>
                </button>
              ) : (
                <div style={styles.inlineProgressCard}>
                  {activeJob.status === 'completed' ? (
                    <div style={styles.successStatus}>
                      <CheckCircle2 size={20} color="#10b981" />
                      <div>
                        <div style={{ fontWeight: '600', color: '#34d399' }}>Download Completed!</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          Saved to your local Downloads folder.
                        </div>
                      </div>
                    </div>
                  ) : activeJob.status === 'error' ? (
                    <div style={styles.errorStatus}>
                      <AlertCircle size={20} color="#ef4444" />
                      <div>
                        <div style={{ fontWeight: '600', color: '#f87171' }}>Download Failed</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {activeJob.error || 'Check details in the sidebar queue.'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={styles.progressStatus}>
                      <Loader2 className="spinner" size={20} style={{ color: '#6366f1' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600' }}>
                          {activeJob.status === 'merging' ? 'Merging streams...' : 
                           activeJob.status === 'converting' ? 'Converting to MP3...' : 
                           `Downloading: ${activeJob.percent}%`}
                        </div>
                        {activeJob.status === 'downloading' && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            Speed: {activeJob.speed} • ETA: {activeJob.eta}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
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
  resultCard: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  mediaDetails: {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
  },
  thumbnailContainer: {
    position: 'relative',
    width: '280px',
    aspectRatio: '16/9',
    borderRadius: 'var(--radius-sm)',
    overflow: 'hidden',
    border: '1px solid var(--border-color)',
    flexShrink: 0,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  durationBadge: {
    position: 'absolute',
    bottom: '8px',
    right: '8px',
    background: 'rgba(0, 0, 0, 0.85)',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: '600',
    padding: '3px 6px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  infoContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minWidth: '240px',
  },
  videoTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    marginBottom: '6px',
    lineHeight: '1.4',
  },
  uploaderName: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    marginBottom: '14px',
  },
  statsRow: {
    display: 'flex',
    gap: '16px',
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  divider: {
    height: '1px',
    background: 'var(--border-color)',
  },
  optionsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  formatCategories: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap',
  },
  categoryBlock: {
    flex: 1,
    minWidth: '280px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
  },
  buttonGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: '10px',
  },
  optionBtn: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s ease',
  },
  optionBtnActive: {
    background: 'rgba(99, 102, 241, 0.15)',
    borderColor: 'rgba(99, 102, 241, 0.5)',
    color: '#a5b4fc',
    boxShadow: '0 0 10px rgba(99, 102, 241, 0.2)',
  },
  optTitle: {
    fontSize: '14px',
    fontWeight: '700',
  },
  optSub: {
    fontSize: '10px',
    marginTop: '2px',
    opacity: 0.8,
  },
  noFormatsText: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '20px 0',
  },
  actionContainer: {
    marginTop: '10px',
  },
  btnDownload: {
    width: '100%',
    height: '48px',
    justifyContent: 'center',
  },
  inlineProgressCard: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    padding: '16px',
  },
  successStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  errorStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  progressStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  }
};
