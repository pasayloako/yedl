const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const COOKIE_FILE = path.join(__dirname, 'cookies.txt');

// ----- Write cookies from environment variable OR fallback to file -----
let cookieContent = process.env.COOKIE_CONTENT;

if (cookieContent && cookieContent.trim().length > 0) {
  console.log(`✅ COOKIE_CONTENT found (length: ${cookieContent.length} chars). Writing to ${COOKIE_FILE}...`);
  fs.writeFileSync(COOKIE_FILE, cookieContent, 'utf8');
  console.log('✅ cookies.txt written successfully.');
} else if (fs.existsSync(COOKIE_FILE)) {
  console.log('⚠️ COOKIE_CONTENT not set, but found existing cookies.txt – using that.');
} else {
  console.error('❌ No cookies provided. Please either:');
  console.error('   1. Set the COOKIE_CONTENT environment variable on Render, OR');
  console.error('   2. Upload a cookies.txt file to the project root.');
  process.exit(1);
}
// ---------------------------------------------------

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/convert', async (req, res) => {
  const videoURL = req.body.url.trim();
  if (!videoURL || (!videoURL.includes('youtube.com') && !videoURL.includes('youtu.be'))) {
    return res.status(400).send('❌ Please enter a valid YouTube URL.');
  }

  try {
    await util.promisify(exec)('yt-dlp --version');
  } catch (err) {
    return res.status(500).send('❌ yt-dlp is not installed. Please install it (pip install yt-dlp).');
  }

  try {
    const outputTemplate = path.join(DOWNLOAD_DIR, '%(title)s.%(ext)s');
    const command = `yt-dlp --cookies "${COOKIE_FILE}" -f bestaudio --extract-audio --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${videoURL}"`;

    console.log(`🎵 Processing: ${videoURL}`);
    const { stdout, stderr } = await util.promisify(exec)(command);

    if (stderr && !stderr.includes('Deleting original file')) {
      console.warn('⚠️ yt-dlp stderr:', stderr);
    }

    const files = fs.readdirSync(DOWNLOAD_DIR);
    const mp3File = files.find(f => f.endsWith('.mp3'));
    if (!mp3File) {
      return res.status(500).send('❌ Conversion succeeded but no MP3 file found.');
    }

    const filePath = path.join(DOWNLOAD_DIR, mp3File);
    res.download(filePath, mp3File, (err) => {
      if (err) console.error('Download error:', err);
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('410')) return res.status(410).send('⚠️ Video unavailable (410 Gone).');
    if (error.message.includes('429')) return res.status(429).send('⚠️ Too many requests – cookies may be expired.');
    if (error.message.includes('unavailable')) return res.status(404).send('⚠️ Video not found.');
    res.status(500).send(`❌ Conversion failed: ${error.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
