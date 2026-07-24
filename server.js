const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const app = express();
const PORT = 3000;
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Conversion endpoint
app.post('/convert', async (req, res) => {
  const videoURL = req.body.url.trim();

  // Basic URL validation
  if (!videoURL || (!videoURL.includes('youtube.com') && !videoURL.includes('youtu.be'))) {
    return res.status(400).send('❌ Please enter a valid YouTube URL.');
  }

  try {
    // Check if yt-dlp is installed
    await util.promisify(exec)('yt-dlp --version');
  } catch (err) {
    return res.status(500).send('❌ yt-dlp is not installed. Please install it (pip install yt-dlp) and ensure it’s in your PATH.');
  }

  try {
    // Build the command
    const outputTemplate = path.join(DOWNLOAD_DIR, '%(title)s.%(ext)s');
    const command = `yt-dlp -f bestaudio --extract-audio --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${videoURL}"`;

    console.log(`🎵 Processing: ${videoURL}`);
    const { stdout, stderr } = await util.promisify(exec)(command);

    if (stderr && !stderr.includes('Deleting original file')) {
      console.warn('⚠️ yt-dlp stderr:', stderr);
    }

    // Find the newly created MP3 file
    const files = fs.readdirSync(DOWNLOAD_DIR);
    const mp3File = files.find(f => f.endsWith('.mp3'));
    if (!mp3File) {
      return res.status(500).send('❌ Conversion succeeded but no MP3 file found.');
    }

    const filePath = path.join(DOWNLOAD_DIR, mp3File);
    res.download(filePath, mp3File, (err) => {
      if (err) console.error('Download error:', err);
      // Clean up after download
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);

    // Detect 410 Gone
    if (error.message.includes('410')) {
      return res.status(410).send('⚠️ Video unavailable (410 Gone). It may be deleted, private, or blocked in your region.');
    }
    // Other common errors
    if (error.message.includes('unavailable')) {
      return res.status(404).send('⚠️ Video not found or unavailable.');
    }
    res.status(500).send(`❌ Conversion failed: ${error.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
