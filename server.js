const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Ensure the 'downloads' folder exists
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

// Serve static files (for the HTML page)
app.use(express.static('public'));

// Parse URL-encoded bodies (for form submission)
app.use(express.urlencoded({ extended: true }));

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle conversion request
app.post('/convert', async (req, res) => {
  const videoURL = req.body.url;
  if (!ytdl.validateURL(videoURL)) {
    return res.status(400).send('Invalid YouTube URL');
  }

  try {
    // Get video info to extract title
    const info = await ytdl.getInfo(videoURL);
    const title = info.videoDetails.title.replace(/[^\w\s]/gi, ''); // sanitize filename

    const audioStream = ytdl(videoURL, {
      quality: 'highestaudio',
      filter: 'audioonly',
    });

    // Output file path (temporary .mp3)
    const outputPath = path.join(DOWNLOAD_DIR, `${title}.mp3`);

    // Use ffmpeg to convert the stream to MP3
    await new Promise((resolve, reject) => {
      ffmpeg(audioStream)
        .audioBitrate(128) // you can adjust quality
        .save(outputPath)
        .on('end', resolve)
        .on('error', reject);
    });

    // Send the file as a download
    res.download(outputPath, `${title}.mp3`, (err) => {
      if (err) console.error('Download error:', err);
      // Optionally delete the file after download
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Conversion failed: ' + error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
