const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// ✅ Set correct origin for Vercel
const corsOptions = {
  origin: 'https://journeyman.vercel.app',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
};

app.use(cors(corsOptions)); // Apply CORS to all requests
app.options('*', cors(corsOptions)); // Handle preflight requests

app.use(express.json());

const filePath = path.join('/tmp', 'players.json');

// ✅ Create the JSON file if it doesn't exist
if (!fs.existsSync(filePath)) {
  fs.writeFileSync(filePath, JSON.stringify([]));
}

app.post('/save-player', (req, res) => {
  const { name, email } = req.body;
  console.log('Received:', name, email);

  let data = [];

  try {
    const fileData = fs.readFileSync(filePath, 'utf-8');
    data = fileData ? JSON.parse(fileData) : [];
  } catch (err) {
    console.error('Error reading file:', err);
  }

  data.push({ name, email, timestamp: new Date().toISOString() });

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error('Error writing file:', err);
    res.status(500).json({ success: false, message: 'Write failed' });
  }
});

app.get('/', (req, res) => {
  res.send('Backend is running and CORS is enabled.');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

// Handle uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
