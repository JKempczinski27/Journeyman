const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3002;

// Middleware
app.use(compression()); // Compress responses
app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files from dashboard directory

// Logging middleware
app.use((req, res, next) => {
  console.log(`📊 Dashboard: ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Routes for dashboard files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'hub.html'));
});

app.get('/hub', (req, res) => {
  res.sendFile(path.join(__dirname, 'hub.html'));
});

app.get('/enhanced', (req, res) => {
  res.sendFile(path.join(__dirname, 'enhanced-dashboard.html'));
});

app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'mobile-dashboard.html'));
});

app.get('/realtime', (req, res) => {
  res.sendFile(path.join(__dirname, 'realtime-dashboard.html'));
});

app.get('/classic', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'journeyman-dashboard',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('./package.json').version
  });
});

// API proxy routes (optional - for when backend is down)
app.get('/api/*', (req, res) => {
  res.status(503).json({
    error: 'Backend API unavailable',
    message: 'Please ensure the backend server is running on port 3001',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'hub.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Dashboard Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Something went wrong with the dashboard server',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🎮 Journeyman Dashboard Server Started!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Dashboard Hub:     http://localhost:${PORT}
📈 Enhanced:          http://localhost:${PORT}/enhanced
📱 Mobile:            http://localhost:${PORT}/mobile
🔴 Real-time:         http://localhost:${PORT}/realtime
📋 Classic:           http://localhost:${PORT}/classic
❤️  Health Check:     http://localhost:${PORT}/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  Note: Make sure backend server is running on port 3001
🔗 Backend Health:    http://localhost:3001/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📊 Dashboard server shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n📊 Dashboard server shutting down gracefully...');
  process.exit(0);
});

module.exports = app;
