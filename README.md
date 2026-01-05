# Timelapse URL

Create timelapse videos from any image URL that changes over time. Perfect for webcams, weather radar, construction sites, or any image that updates periodically.

## Features

- 🎬 Capture images from any URL at regular intervals
- 🖼️ View the current image in real-time
- 🎞️ Automatically generates an animated GIF from all captured images
- 💾 Stores images and GIF locally in organized directories
- 🚫 No-cache image fetching ensures fresh images every time
- ⏰ Auto-capture mode for hands-free operation
- 📁 Organized storage with URL-based directory names

## Installation

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

## Usage

1. Start the server:

```bash
npm start
```

2. Open your browser and navigate to:

```
http://localhost:3000
```

3. Enter the URL of an image that changes over time (e.g., a webcam feed)

4. Click "Start Capturing" to begin

5. On the capture page:
   - Click "📸 Capture Now" to manually capture an image
   - Click "⏰ Auto-Capture (30s)" to automatically capture images every 30 seconds
   - View the current image on the left
   - View the animated timelapse GIF on the right

## How It Works

### Image Capture
- Images are fetched with no-cache headers to ensure fresh content
- Each image is saved with a timestamp and sequence number
- Images are stored in `captures/<url-based-directory>/`

### GIF Generation
- An animated GIF is automatically generated after each capture
- The GIF includes all captured images in sequence
- Frame delay is 500ms (configurable in `server.js`)
- The GIF loops continuously

### Directory Structure
```
timelapse-url/
├── server.js              # Main server application
├── package.json           # Dependencies and scripts
├── public/
│   ├── index.html         # URL input page
│   └── capture.html       # Timelapse viewer page
└── captures/              # Captured images and GIFs
    └── <url-directory>/   # One directory per URL
        ├── image_00000_*.png
        ├── image_00001_*.png
        └── timelapse.gif
```

## Configuration

You can modify these settings in `server.js`:

- **Port**: Change `PORT` constant (default: 3000)
- **GIF Frame Delay**: Modify `encoder.setDelay()` (default: 500ms)
- **GIF Quality**: Modify `encoder.setQuality()` (1-20, lower is better)
- **Auto-Capture Interval**: Change the interval in `capture.html` (default: 30 seconds)

## Example Use Cases

- **Webcams**: Monitor construction sites, traffic, or wildlife
- **Weather Radar**: Track storm systems over time
- **Server Dashboards**: Capture metrics or graphs
- **Time-Sensitive Content**: Any image that updates periodically

## Technical Details

### Dependencies
- **express**: Web server framework
- **sharp**: High-performance image processing
- **gif-encoder-2**: Creates animated GIFs from individual frames

### Cache Prevention
All image requests include these headers:
```javascript
'Cache-Control': 'no-cache, no-store, must-revalidate'
'Pragma': 'no-cache'
'Expires': '0'
```

### Session Management
- Each URL gets a unique session ID
- Sessions are stored in memory (reset on server restart)
- Directory names are generated from URL + hash for uniqueness

## Troubleshooting

**Images aren't updating:**
- Ensure the URL actually changes over time
- Check that the URL is publicly accessible
- Verify the server has internet access

**GIF not generating:**
- Ensure you've captured at least 2 images
- Check the console for error messages
- Verify the `canvas` package installed correctly

**Server won't start:**
- Make sure port 3000 isn't already in use
- Verify all dependencies are installed (`npm install`)

## License

ISC

## Author

Created with GitHub Copilot
