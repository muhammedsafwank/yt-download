import React, { useState, useEffect } from 'react';
import { 
  History as HistoryIcon, 
  Trash2, 
  FolderOpen, 
  ExternalLink, 
  Video, 
  Music,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { API_BASE } from '../config';

export default function History({ openFolder }) {
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryItems(data);
      }
    } catch (e) {
      console.error('Failed to fetch history:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear your download history? (This will not delete the actual files from your disk)')) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/clear-history`, {
        method: 'POST'
      });
      if (res.ok) {
        setHistoryItems([]);
      }
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  };

  const handleOpenContainingFolder = async (dirPath) => {
    try {
      await fetch(`${API_BASE}/api/open-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: dirPath })
      });
    } catch (e) {
      console.error('Failed to open containing folder:', e);
    }
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleSection}>
          <h2 style={styles.title}>Downloads History</h2>
          <p style={styles.subtitle}>View your completed downloads and open their containing folders.</p>
        </div>
        {historyItems.length > 0 && (
          <button onClick={handleClearHistory} style={styles.btnClear} className="btn-secondary">
            <Trash2 size={16} />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {loading ? (
        <div style={styles.centerBlock}>
          <Loader2 className="spinner" size={24} />
        </div>
      ) : historyItems.length === 0 ? (
        <div style={styles.emptyCard} className="glass-card">
          <HistoryIcon size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <div style={{ fontWeight: '600' }}>Your history is empty</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Completed downloads will appear here for easy access.
          </div>
        </div>
      ) : (
        <div style={styles.historyList}>
          {historyItems.map((item) => (
            <div key={item.id} style={styles.row} className="glass-card">
              {/* Icon Type indicator */}
              <div style={styles.iconContainer}>
                {item.type === 'audio' ? (
                  <Music size={20} style={{ color: '#ec4899' }} />
                ) : (
                  <Video size={20} style={{ color: '#6366f1' }} />
                )}
              </div>

              {/* Title and metadata */}
              <div style={styles.mainInfo}>
                <div style={styles.itemTitle} title={item.title}>
                  {item.title}
                </div>
                <div style={styles.metadata}>
                  <div style={styles.metaItem}>
                    <Calendar size={12} />
                    <span>{formatDate(item.timestamp)}</span>
                  </div>
                  <div style={styles.metaItem}>
                    <ExternalLink size={12} />
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={styles.urlLink}
                      title="Open original YouTube link"
                    >
                      Original Link
                    </a>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div style={styles.actions}>
                <button 
                  onClick={() => handleOpenContainingFolder(item.downloadDir)} 
                  style={styles.btnAction}
                  title="Open folder where this file is saved"
                  className="btn-secondary"
                >
                  <FolderOpen size={14} />
                  <span>Show in folder</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Simple loader helper local to the component
function Loader2({ className, size }) {
  return (
    <div 
      className={className} 
      style={{ 
        width: size, 
        height: size, 
        border: '3px solid rgba(255, 255, 255, 0.05)', 
        borderTop: '3px solid #6366f1', 
        borderRadius: '50%' 
      }}
    />
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    height: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
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
  btnClear: {
    padding: '8px 16px',
    fontSize: '13px',
    height: '38px',
  },
  centerBlock: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '40px',
  },
  emptyCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '50px',
    textAlign: 'center',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflowY: 'auto',
    flex: 1,
    paddingRight: '6px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 18px',
    gap: '16px',
  },
  iconContainer: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.03)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid var(--border-color)',
  },
  mainInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  itemTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  metadata: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    flexWrap: 'wrap',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  urlLink: {
    color: '#818cf8',
    textDecoration: 'none',
    fontWeight: '500',
    '&:hover': {
      textDecoration: 'underline',
    }
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  btnAction: {
    padding: '8px 12px',
    fontSize: '12px',
    height: '34px',
  }
};
