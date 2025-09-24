require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');

// Import security middleware
const {
  authMiddleware,
  inputValidation,
  secureDesign,
  securityHeaders,
  authentication,
  securityLogging,
  ssrfProtection,
  generalLimiter,
  parameterPollutionProtection,
  secureCompression
} = require('./middleware/security');

const DataService = require('./services/dataService');
const { S3Manager } = require('./config/awsConfig');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const dataService = new DataService();
const s3Manager = new S3Manager();

// Apply security middleware in correct order
app.use(securityLogging.requestLogger);
app.use(securityHeaders);
app.use(secureCompression);
app.use(parameterPollutionProtection);
app.use(generalLimiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
}));

// Session configuration
app.use(session(secureDesign.sessionConfig));

// Body parsing with size limits
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Content type validation
app.use(secureDesign.validateContentType);

// Input sanitization
app.use(inputValidation.sanitizeInput);

// Suspicious activity monitoring
app.use(securityLogging.suspiciousActivityMiddleware);

// Health check endpoint (no authentication required)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Game data endpoint with validation
app.post('/api/game-data',
  inputValidation.validatePlayerData,
  inputValidation.validateGameData,
  async (req, res) => {
    try {
      // Game data processing logic here
      const { name, email, gameType, correctCount, durationInSeconds } = req.body;

      securityLogging.logSecurityEvent('GAME_DATA_SUBMITTED', {
        playerEmail: email,
        gameType,
        score: correctCount
      }, req);

      res.json({
        success: true,
        message: 'Game data received',
        sessionId: req.sessionID
      });
    } catch (error) {
      securityLogging.logSecurityEvent('GAME_DATA_ERROR', {
        error: error.message
      }, req);

      res.status(500).json({
        error: 'Internal server error',
        requestId: req.id
      });
    }
  }
);

// Admin endpoint with API key authentication
app.get('/api/admin/stats',
  authMiddleware.validateApiKey,
  (req, res) => {
    // Admin stats logic here
    res.json({ message: 'Admin stats would go here' });
  }
);

// Enhanced player data endpoint with S3 pipeline
app.post('/save-player',
  inputValidation.validatePlayerData,
  inputValidation.validateGameData,
  async (req, res) => {
    try {
      // Extract client info
      const clientData = {
        ...req.body,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      };

      const { name, email } = clientData;

      if (!name || !email) {
        return res.status(400).json({
          success: false,
          error: 'Player name and email are required'
        });
      }

      console.log('📥 Received player data:', {
        name,
        email,
        gameType: clientData.gameType || 'journeyman',
        mode: clientData.mode,
        score: clientData.correctCount
      });

      // Save data through pipeline
      const { playerId, savedAt } = await dataService.savePlayerData(clientData);
      const sessionId = req.sessionID;

      res.json({
        success: true,
        message: 'Player data saved successfully',
        sessionId,
        playerId,
        savedAt,
        metadata: {
          gameType: clientData.gameType || 'journeyman',
          correctCount: clientData.correctCount ?? null
        }
      });
    } catch (error) {
      console.error('❌ Error in /save-player:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save player data',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

// Batch upload endpoint
app.post('/batch-upload', async (req, res) => {
  try {
    const { sessions } = req.body;

    if (!Array.isArray(sessions)) {
      return res.status(400).json({
        success: false,
        error: 'Sessions must be an array'
      });
    }

    console.log(`📦 Processing batch upload: ${sessions.length} sessions`);

    const results = await Promise.allSettled(
      sessions.map(session => dataService.savePlayerData({
        ...session,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    res.json({
      success: true,
      processed: sessions.length,
      successful,
      failed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Batch upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Batch upload failed',
      message: error.message
    });
  }
});

// Analytics export endpoint
app.post('/export-analytics', async (req, res) => {
  try {
    const { startDate, endDate, gameType = 'journeyman' } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    console.log(`📊 Creating analytics export: ${startDate} to ${endDate}`);

    const result = await dataService.createAnalyticsExport(startDate, endDate, gameType);

    res.json({
      success: true,
      exportKey: result.exportKey,
      metrics: result.metrics,
      message: 'Analytics export completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Analytics export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create analytics export',
      message: error.message
    });
  }
});

// S3 data management endpoints
app.get('/s3/status', async (req, res) => {
  try {
    let bucketContents = [];

    try {
      bucketContents = await s3Manager.listFiles('', 10);
    } catch (listError) {
      console.error('S3 status listing error:', listError);
      bucketContents = [];
    }

    const files = Array.isArray(bucketContents) ? bucketContents : [];
    const status = await checkS3Health();
    const response = {
      success: true,
      mode: s3Manager.enabled ? 'aws' : 'mock',
      s3Status: status,
      recentFiles: files.slice(0, 5).map(file => ({
        key: file.Key,
        size: file.Size,
        lastModified: file.LastModified
      })),
      totalFiles: files.length
    };

    if (!s3Manager.enabled) {
      response.message = 'AWS S3 integration disabled - running in mock mode with no remote files available.';
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get S3 status',
      message: error.message
    });
  }
});

app.get('/s3/list/:prefix*', async (req, res) => {
  try {
    const prefix = req.params.prefix + (req.params[0] || '');
    const maxKeys = parseInt(req.query.limit) || 100;

    const rawFiles = await s3Manager.listFiles(prefix, maxKeys);
    const files = Array.isArray(rawFiles) ? rawFiles : [];

    const response = {
      success: true,
      prefix,
      files: files.map(file => ({
        key: file.Key,
        size: file.Size,
        lastModified: file.LastModified
      }))
    };

    if (!s3Manager.enabled) {
      response.mode = 'mock';
      response.message = 'AWS S3 integration disabled - returning empty file list.';
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to list S3 files',
      message: error.message
    });
  }
});

app.get('/s3/download/:key*', async (req, res) => {
  try {
    const key = req.params.key + (req.params[0] || '');
    const data = await s3Manager.downloadData(key);

    res.json({
      success: true,
      key,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to download from S3',
      message: error.message
    });
  }
});

// Daily export endpoint
app.post('/create-daily-export', async (req, res) => {
  try {
    const { date, gameType = 'journeyman' } = req.body;
    const exportDate = date || new Date().toISOString().slice(0, 10);

    console.log(`📅 Creating daily export for ${exportDate}`);

    const result = await s3Manager.createDailyExport(exportDate, gameType);

    res.json({
      success: true,
      exportDate,
      gameType,
      s3Location: result.Location,
      message: 'Daily export created successfully'
    });
  } catch (error) {
    console.error('❌ Daily export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create daily export',
      message: error.message
    });
  }
});

// Analytics data endpoints (existing ones enhanced)
app.get('/analytics/:gameType?', async (req, res) => {
  try {
    const gameType = req.params.gameType || 'journeyman';

    // Get analytics from both DB and S3
    const [dbAnalytics, s3Analytics] = await Promise.allSettled([
      getAnalyticsFromDB(gameType),
      getAnalyticsFromS3(gameType)
    ]);

    // Combine results, prefer DB data but fallback to S3
    const analytics = dbAnalytics.status === 'fulfilled'
      ? dbAnalytics.value
      : s3Analytics.value || getDefaultAnalytics();

    res.json(analytics);
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics',
      message: error.message
    });
  }
});

// Utility functions
async function checkS3Health() {
  if (!s3Manager.enabled) {
    return 'mock-mode';
  }

  try {
    await s3Manager.listFiles('', 1);
    return 'connected';
  } catch (error) {
    console.error('S3 health check failed:', error);
    return 'disconnected';
  }
}

async function getAnalyticsFromDB(gameType) {
  // Implement DB analytics query
  return {
    source: 'database',
    totalPlayers: 0,
    totalSessions: 0,
    averageScore: 0
  };
}

async function getAnalyticsFromS3(gameType) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const files = await s3Manager.listFiles(`analytics/daily/${gameType}/${today}`);

    if (files.length > 0) {
      const data = await s3Manager.downloadData(files[0].Key);
      return { source: 's3', ...data };
    }

    return getDefaultAnalytics();
  } catch (error) {
    return getDefaultAnalytics();
  }
}

function getDefaultAnalytics() {
  return {
    source: 'default',
    totalPlayers: 0,
    totalSessions: 0,
    averageScore: 0,
    activeToday: 0,
    completionRate: 0
  };
}

// Error handling middleware
app.use((error, req, res, next) => {
  securityLogging.logSecurityEvent('UNHANDLED_ERROR', {
    error: error.message,
    stack: error.stack
  }, req);

  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id
  });
});

// 404 handler
app.use('*', (req, res) => {
  securityLogging.logSecurityEvent('NOT_FOUND', {
    path: req.originalUrl
  }, req);

  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Secure server running on port ${PORT}`);
  console.log(`🛡️  Security middleware active`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
