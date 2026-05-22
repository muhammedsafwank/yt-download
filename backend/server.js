const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = process.env.PORT || 5005;
const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Path for download history file
const HISTORY_FILE = path.join(__dirname, 'download-history.json');

// Map to store active yt-dlp processes: jobId -> childProcess
const activeJobs = new Map();

// Helper to get default download directory
function getDefaultDownloadDir() {
  return path.join(os.homedir(), 'Downloads');
}

// Helper to load history
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading history:', err);
  }
  return [];
}

// Helper to save history
function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving history:', err);
  }
}

// Endpoint: Check status
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', engine: 'yt-dlp' });
});

// Endpoint: Get default download directory
app.get('/api/default-download-dir', (req, res) => {
  res.json({ dir: getDefaultDownloadDir() });
});

// Endpoint: Open download directory in File Explorer
app.post('/api/open-folder', (req, res) => {
  const { folderPath } = req.body;
  const targetPath = folderPath || getDefaultDownloadDir();

  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'Folder does not exist' });
  }

  // Open directory in Windows File Explorer
  exec(`explorer.exe "${targetPath}"`, (err) => {
    // explorer.exe on Windows often exits with code 1 even on success
    if (err && err.code !== 1) {
      console.error('Failed to open folder:', err);
      return res.status(500).json({ error: 'Failed to open folder' });
    }
    res.json({ success: true });
  });
});

// Endpoint: Fetch YouTube info (video, playlist, shorts)
app.get('/api/info', (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log(`Fetching info for URL: ${url}`);

  // Run flat-playlist first to determine if it is a playlist and extract entries quickly
  const args = [
    '-m', 'yt_dlp',
    '--dump-json',
    '--flat-playlist',
    '--no-warnings',
    '--no-call-home',
    url
  ];

  let stdoutData = '';
  let stderrData = '';

  const child = spawn('python', args);

  child.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`yt-dlp info failed with code ${code}: ${stderrData}`);
      return res.status(500).json({ error: 'Failed to fetch video information', details: stderrData });
    }

    try {
      // Check if multiple JSON lines were returned (for playlists sometimes)
      const lines = stdoutData.trim().split('\n');
      if (lines.length === 0 || !lines[0]) {
        throw new Error('No content returned');
      }

      // If it's a playlist or multiple items, parse them
      if (lines.length > 1) {
        // We have multiple entries
        const entries = lines.map(line => JSON.parse(line));
        // Construct a pseudo-playlist
        const firstEntry = entries[0];
        res.json({
          isPlaylist: true,
          title: firstEntry.playlist_title || 'YouTube Playlist',
          id: firstEntry.playlist_id || 'playlist',
          entries: entries.map(e => ({
            id: e.id,
            title: e.title,
            url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
            duration: e.duration,
            uploader: e.uploader
          }))
        });
      } else {
        const metadata = JSON.parse(lines[0]);
        const isPlaylist = metadata._type === 'playlist';

        if (isPlaylist) {
          res.json({
            isPlaylist: true,
            title: metadata.title || 'YouTube Playlist',
            id: metadata.id,
            uploader: metadata.uploader,
            entries: (metadata.entries || []).map(e => ({
              id: e.id,
              title: e.title,
              url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
              duration: e.duration,
              uploader: e.uploader
            }))
          });
        } else {
          // It's a single video, but we used flat-playlist, which means it might not have the format list.
          // Wait, let's check if the format list is in the metadata.
          // yt-dlp flat-playlist doesn't return formats list for a video if it was inside a playlist,
          // but for a direct single video link, it does return the full info including formats!
          if (metadata.formats && metadata.formats.length > 0) {
            // Formats are already here! Format them nicely.
            res.json(formatSingleVideoMetadata(metadata));
          } else {
            // Re-fetch without --flat-playlist for full details
            fetchFullVideoInfo(url, res);
          }
        }
      }
    } catch (err) {
      console.error('Error parsing yt-dlp JSON:', err);
      res.status(500).json({ error: 'Failed to parse video metadata', details: err.message });
    }
  });
});

// Helper to fetch full video info (resolves formats)
function fetchFullVideoInfo(url, res) {
  const args = [
    '-m', 'yt_dlp',
    '--dump-json',
    '--no-warnings',
    '--no-playlist',
    url
  ];

  let stdoutData = '';
  let stderrData = '';
  const child = spawn('python', args);

  child.stdout.on('data', (data) => { stdoutData += data.toString(); });
  child.stderr.on('data', (data) => { stderrData += data.toString(); });

  child.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: 'Failed to fetch video formats', details: stderrData });
    }
    try {
      const metadata = JSON.parse(stdoutData.trim());
      res.json(formatSingleVideoMetadata(metadata));
    } catch (err) {
      res.status(500).json({ error: 'Failed to parse video formats metadata', details: err.message });
    }
  });
}

// Clean up and format metadata for single video
function formatSingleVideoMetadata(metadata) {
  // Extract and filter unique, useful video resolutions
  const formats = metadata.formats || [];
  
  // Select video+audio combined or video-only formats
  // We want to return unique resolutions with video + audio support
  const uniqueResolutions = new Map();
  
  formats.forEach(f => {
    // If it has video height, track it
    if (f.height) {
      const resKey = `${f.height}p`;
      const current = uniqueResolutions.get(resKey);
      
      // Prefer mp4 extension, and higher total bitrate
      if (!current || (f.ext === 'mp4' && current.ext !== 'mp4') || (f.tbr > current.tbr)) {
        uniqueResolutions.set(resKey, {
          formatId: f.format_id,
          resolution: resKey,
          height: f.height,
          ext: f.ext,
          fps: f.fps,
          filesize: f.filesize || f.filesize_approx,
          codec: `${f.vcodec || 'unknown'}/${f.acodec || 'none'}`
        });
      }
    }
  });

  const videoOptions = Array.from(uniqueResolutions.values())
    .sort((a, b) => b.height - a.height); // Higher resolution first

  return {
    isPlaylist: false,
    id: metadata.id,
    title: metadata.title,
    description: metadata.description,
    duration: metadata.duration,
    thumbnail: metadata.thumbnail,
    uploader: metadata.uploader,
    viewCount: metadata.view_count,
    videoOptions,
    originalUrl: metadata.webpage_url || metadata.original_url
  };
}

// Endpoint: Get history
app.get('/api/history', (req, res) => {
  res.json(loadHistory());
});

// Endpoint: Clear history
app.post('/api/clear-history', (req, res) => {
  saveHistory([]);
  res.json({ success: true });
});

// WebSocket Server Logic
wss.on('connection', (ws) => {
  console.log('WS Client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const { action } = data;

      if (action === 'start-download') {
        const { jobId, url, type, formatOption, downloadDir, title } = data;
        startDownloadJob(ws, jobId, url, type, formatOption, downloadDir, title);
      } else if (action === 'cancel-download') {
        const { jobId } = data;
        cancelDownloadJob(ws, jobId);
      }
    } catch (err) {
      console.error('WS Message parsing error:', err);
    }
  });

  ws.on('close', () => {
    console.log('WS Client disconnected');
  });
});

// Start a yt-dlp download job
function startDownloadJob(ws, jobId, url, type, formatOption, downloadDir, title) {
  const targetDir = downloadDir || getDefaultDownloadDir();
  
  // Make sure directory exists
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (e) {
      ws.send(JSON.stringify({
        jobId,
        type: 'status',
        status: 'error',
        error: `Could not create download directory: ${e.message}`
      }));
      return;
    }
  }

  // Build yt-dlp arguments
  let args = ['-m', 'yt_dlp'];
  
  // Output template: C:\Users\hadih\Downloads\%(title)s.%(ext)s
  const outputTemplate = path.join(targetDir, '%(title)s.%(ext)s');
  args.push('-o', outputTemplate);
  args.push('--no-warnings');

  if (type === 'audio') {
    // Best audio download and convert to MP3
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    // Format selection for best audio
    args.push('-f', 'bestaudio/best');
  } else {
    // Video download
    if (formatOption && formatOption !== 'best') {
      // E.g., formatOption is height like 1080, 720
      const height = formatOption.replace('p', '');
      // Format template: best video under height + best audio, or fallback to best
      args.push('-f', `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best`);
      // Merge to mp4
      args.push('--merge-output-format', 'mp4');
    } else {
      // Best quality overall (merge to mp4 if possible)
      args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
      args.push('--merge-output-format', 'mp4');
    }
  }

  args.push(url);

  console.log(`Starting job ${jobId}: python ${args.join(' ')}`);

  ws.send(JSON.stringify({
    jobId,
    type: 'status',
    status: 'downloading',
    percent: 0,
    speed: '0 KiB/s',
    eta: '--:--',
    title: title || 'Resolving...'
  }));

  const child = spawn('python', args);
  activeJobs.set(jobId, child);

  // Regex patterns to parse progress
  const percentRegex = /\[download\]\s+([\d.]+)%/;
  const sizeRegex = /of\s+~?([\d.]+\w+)/;
  const speedRegex = /at\s+([\d.]+\w+\/s)/;
  const etaRegex = /ETA\s+([\d:]+)/;
  const mergerRegex = /\[Merger\]|\[ffmpeg\]/;
  const extractRegex = /\[ExtractAudio\]/;

  let stdoutBuffer = '';
  let finalFilePath = '';

  child.stdout.on('data', (data) => {
    const chunk = data.toString();
    stdoutBuffer += chunk;

    // Search for downloaded file destination
    if (chunk.includes('[download] Destination:')) {
      const match = chunk.match(/\[download\] Destination:\s*(.*)/);
      if (match && match[1]) {
        finalFilePath = match[1].trim();
      }
    }
    if (chunk.includes('[ExtractAudio] Destination:')) {
      const match = chunk.match(/\[ExtractAudio\] Destination:\s*(.*)/);
      if (match && match[1]) {
        finalFilePath = match[1].trim();
      }
    }
    if (chunk.includes('[Merger] Merging formats into')) {
      const match = chunk.match(/\[Merger\] Merging formats into\s*"(.*)"/);
      if (match && match[1]) {
        finalFilePath = match[1].trim();
      }
    }
    if (chunk.includes('has already been downloaded')) {
      const match = chunk.match(/\[download\]\s*(.*?)\s*has already been downloaded/);
      if (match && match[1]) {
        finalFilePath = match[1].trim();
      }
    }

    const lines = chunk.split('\n');
    lines.forEach((line) => {
      if (line.includes('[download]') && line.includes('%')) {
        const percentMatch = line.match(percentRegex);
        const sizeMatch = line.match(sizeRegex);
        const speedMatch = line.match(speedRegex);
        const etaMatch = line.match(etaRegex);

        if (percentMatch) {
          const percent = parseFloat(percentMatch[1]);
          const size = sizeMatch ? sizeMatch[1] : 'Unknown';
          const speed = speedMatch ? speedMatch[1] : 'N/A';
          const eta = etaMatch ? etaMatch[1] : '--:--';

          ws.send(JSON.stringify({
            jobId,
            type: 'progress',
            status: 'downloading',
            percent,
            size,
            speed,
            eta
          }));
        }
      } else if (mergerRegex.test(line)) {
        ws.send(JSON.stringify({
          jobId,
          type: 'status',
          status: 'merging',
          message: 'Merging high-quality audio and video streams...'
        }));
      } else if (extractRegex.test(line)) {
        ws.send(JSON.stringify({
          jobId,
          type: 'status',
          status: 'converting',
          message: 'Converting to high-quality MP3 format...'
        }));
      }
    });
  });

  child.stderr.on('data', (data) => {
    // Some download info prints to stderr; only treat as error if contains error keywords
    const text = data.toString();
    console.log(`[job ${jobId} stderr]: ${text}`);
  });

  child.on('close', (code) => {
    activeJobs.delete(jobId);
    console.log(`Job ${jobId} closed with code ${code}`);

    if (code === 0) {
      // Find dynamic actual file name if template created it
      if (!finalFilePath && stdoutBuffer) {
        // Try parsing destination from overall stdout buffer
        const destMatch = stdoutBuffer.match(/Destination:\s*(.*)/);
        if (destMatch && destMatch[1]) {
          finalFilePath = destMatch[1].trim();
        } else {
          const existMatch = stdoutBuffer.match(/\[download\]\s*(.*?)\s*has already been downloaded/);
          if (existMatch && existMatch[1]) {
            finalFilePath = existMatch[1].trim();
          }
        }
      }

      // If we still don't have it, assume title with extension in directory
      const fileName = finalFilePath 
        ? path.basename(finalFilePath) 
        : `${title || 'Video'}.${type === 'audio' ? 'mp3' : 'mp4'}`;

      // Notify success
      ws.send(JSON.stringify({
        jobId,
        type: 'status',
        status: 'completed',
        fileName,
        filePath: finalFilePath || path.join(targetDir, fileName)
      }));

      // Add to download history
      const history = loadHistory();
      history.unshift({
        id: jobId,
        title: title || fileName,
        url,
        type,
        fileName,
        filePath: finalFilePath || path.join(targetDir, fileName),
        downloadDir: targetDir,
        timestamp: new Date().toISOString()
      });
      // Keep history to last 50 entries
      saveHistory(history.slice(0, 50));

    } else {
      // If job was canceled, the process is killed (handled in cancelDownloadJob)
      // Otherwise, it was an error
      if (child.killed) {
        // Already handled
      } else {
        ws.send(JSON.stringify({
          jobId,
          type: 'status',
          status: 'error',
          error: 'Download failed. Check the video URL or network connection.'
        }));
      }
    }
  });
}

// Cancel active yt-dlp job
function cancelDownloadJob(ws, jobId) {
  const child = activeJobs.get(jobId);
  if (child) {
    console.log(`Cancelling job: ${jobId}`);
    child.kill('SIGTERM');
    activeJobs.delete(jobId);
    
    ws.send(JSON.stringify({
      jobId,
      type: 'status',
      status: 'cancelled',
      message: 'Download cancelled by user.'
    }));
  }
}

// Start HTTP server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Default download dir: ${getDefaultDownloadDir()}`);
});
