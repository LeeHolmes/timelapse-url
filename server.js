const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const GIFEncoder = require('gif-encoder-2');
const crypto = require('crypto');

// Compare two images to see if they're identical
async function imagesAreIdentical(imagePath1, imagePath2) {
  try {
    const buffer1 = await fs.readFile(imagePath1);
    const buffer2 = await fs.readFile(imagePath2);
    return buffer1.equals(buffer2);
  } catch {
    return false;
  }
}

const app = express();
const PORT = 3000;

// Store active capture sessions
const sessions = new Map();

app.use(express.json());
app.use(express.static('public'));

// Ensure captures directory exists
async function ensureDir(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Generate directory name from URL
function urlToDirectory(url) {
  const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  const sanitized = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  return `${sanitized}_${hash}`;
}

// Load existing session from filesystem
async function loadExistingSession(sessionDir, url) {
  try {
    const files = await fs.readdir(sessionDir);
    const imageFiles = files
      .filter(f => f.startsWith('image_') && f.endsWith('.png'))
      .sort((a, b) => {
        // Extract timestamp from filename: image_NNNNN_timestamp.png
        const getTimestamp = (filename) => {
          const parts = filename.replace('.png', '').split('_');
          return parseInt(parts[parts.length - 1]);
        };
        return getTimestamp(a) - getTimestamp(b);
      });
    
    const captureCount = imageFiles.length;
    
    return {
      images: imageFiles,
      captureCount: captureCount
    };
  } catch (error) {
    // Directory doesn't exist or is empty
    return {
      images: [],
      captureCount: 0
    };
  }
}

// Save metadata to file
async function saveMetadata(sessionDir, url) {
  const metadataPath = path.join(sessionDir, 'metadata.json');
  try {
    // Check if metadata already exists
    await fs.access(metadataPath);
  } catch {
    // File doesn't exist, create it
    const metadata = {
      url: url,
      createdAt: new Date().toISOString()
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }
}

// Fetch image with no-cache headers
async function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const options = {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    };
    
    protocol.get(url, options, (response) => {
      const chunks = [];
      
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

// Generate GIF from all captured images
async function generateGif(sessionDir, images, delay = 500) {
  if (images.length === 0) return null;
  
  const gifPath = path.join(sessionDir, 'timelapse.gif');
  
  // Load first image to get dimensions
  const firstImagePath = path.join(sessionDir, images[0]);
  const firstImageMetadata = await sharp(firstImagePath).metadata();
  
  const width = firstImageMetadata.width;
  const height = firstImageMetadata.height;
  
  // Create GIF encoder
  const encoder = new GIFEncoder(width, height);
  
  // Create write stream
  const writeStream = require('fs').createWriteStream(gifPath);
  encoder.createReadStream().pipe(writeStream);
  
  encoder.start();
  encoder.setRepeat(0); // 0 for repeat, -1 for no-repeat
  encoder.setDelay(delay); // Variable delay between frames
  encoder.setQuality(10); // 1-20, lower is better quality
  
  // Process each image, skipping duplicates
  let previousImagePath = null;
  for (const imageName of images) {
    const imagePath = path.join(sessionDir, imageName);
    
    // Skip if identical to previous image
    if (previousImagePath && await imagesAreIdentical(imagePath, previousImagePath)) {
      continue;
    }
    
    // Read and resize image to consistent dimensions, then convert to raw RGBA
    const imageBuffer = await sharp(imagePath)
      .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .ensureAlpha()
      .raw()
      .toBuffer();
    
    encoder.addFrame(imageBuffer);
    previousImagePath = imagePath;
  }
  
  encoder.finish();
  
  return new Promise((resolve) => {
    writeStream.on('finish', () => resolve(gifPath));
  });
}

// Start a new capture session
app.post('/api/start', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  const sessionId = crypto.randomBytes(16).toString('hex');
  const dirName = urlToDirectory(url);
  const sessionDir = path.join(__dirname, 'captures', dirName);
  
  await ensureDir(sessionDir);
  
  // Save metadata if it doesn't exist
  await saveMetadata(sessionDir, url);
  
  // Load existing session data if it exists
  const existingData = await loadExistingSession(sessionDir, url);
  
  sessions.set(sessionId, {
    url,
    dirName,
    sessionDir,
    images: existingData.images,
    captureCount: existingData.captureCount
  });
  
  res.json({ 
    sessionId, 
    dirName,
    existingImages: existingData.captureCount,
    continuing: existingData.captureCount > 0
  });
});

// Capture a new image
app.post('/api/capture/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    // Fetch the image with no-cache
    const imageBuffer = await fetchImage(session.url);
    
    // Check if this image is identical to the last captured image
    let isDuplicate = false;
    if (session.images.length > 0) {
      const lastImagePath = path.join(session.sessionDir, session.images[session.images.length - 1]);
      const lastImageBuffer = await fs.readFile(lastImagePath);
      isDuplicate = imageBuffer.equals(lastImageBuffer);
    }
    
    // Only save if the image is different
    if (!isDuplicate) {
      const timestamp = Date.now();
      const imageName = `image_${String(session.captureCount).padStart(5, '0')}_${timestamp}.png`;
      const imagePath = path.join(session.sessionDir, imageName);
      
      await fs.writeFile(imagePath, imageBuffer);
      
      session.images.push(imageName);
      session.captureCount++;
      
      // Generate updated GIF
      await generateGif(session.sessionDir, session.images);
    }
    
    res.json({ 
      success: true, 
      imageCount: session.images.length,
      latestImage: session.images[session.images.length - 1],
      duplicate: isDuplicate
    });
  } catch (error) {
    console.error('Error capturing image:', error);
    res.status(500).json({ error: 'Failed to capture image: ' + error.message });
  }
});

// Get session info
app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    url: session.url,
    dirName: session.dirName,
    imageCount: session.images.length,
    latestImage: session.images[session.images.length - 1]
  });
});

// Generate GIF with custom speed
app.post('/api/generate-gif/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { speed } = req.body;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    const baseDelay = 500;
    const delay = Math.round(baseDelay / (speed || 1));
    await generateGif(session.sessionDir, session.images, delay);
    res.json({ success: true });
  } catch (error) {
    console.error('Error generating GIF:', error);
    res.status(500).json({ error: 'Failed to generate GIF' });
  }
});

// Serve captured images and GIFs
app.use('/captures', express.static(path.join(__dirname, 'captures')));

// Start server
app.listen(PORT, () => {
  console.log(`Timelapse URL server running at http://localhost:${PORT}`);
});
