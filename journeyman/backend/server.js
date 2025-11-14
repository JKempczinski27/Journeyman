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

// Enable trust proxy for rate limiting
app.set("trust proxy", 1);

// **ADD THIS LINE: Enable trust proxy for rate limiting**
app.set('trust proxy', 1);

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

// Backup Management Endpoints

// Create backup
app.post('/backup/create', async (req, res) => {
  try {
    const { backupType = 'incremental' } = req.body;

    console.log(`📦 Creating ${backupType} backup...`);

    const result = await s3Manager.createBackup(backupType);

    res.json({
      success: true,
      ...result,
      message: `${backupType} backup created successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Backup creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create backup',
      message: error.message
    });
  }
});

// List backups
app.get('/backup/list', async (req, res) => {
  try {
    const { limit = 30 } = req.query;

    const backups = await s3Manager.listBackups(parseInt(limit));

    res.json({
      success: true,
      backups,
      count: backups.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ List backups error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list backups',
      message: error.message
    });
  }
});

// Rotate backups
app.post('/backup/rotate', async (req, res) => {
  try {
    const { daysToKeep = 30 } = req.body;

    console.log(`🗑️  Rotating backups (keeping ${daysToKeep} days)...`);

    const result = await s3Manager.rotateBackups(parseInt(daysToKeep));

    res.json({
      success: true,
      deleted: result.deleted,
      kept: result.kept,
      message: `Backup rotation completed. Deleted ${result.deleted} old backups.`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Backup rotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rotate backups',
      message: error.message
    });
  }
});

// Get backup manifest
app.get('/backup/:backupKey(*)', async (req, res) => {
  try {
    const backupKey = req.params.backupKey;

    console.log(`📋 Retrieving backup manifest: ${backupKey}`);

    const manifest = await s3Manager.getBackupManifest(backupKey);

    res.json({
      success: true,
      manifest,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Get backup manifest error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve backup manifest',
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

// Import database pool for analytics queries
const pool = require('./config/database');

// Middleware to track query performance
async function trackQueryPerformance(endpoint, queryType, queryFn) {
  const startTime = Date.now();
  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;

    // Log performance metrics to database (async, don't wait)
    pool.query(
      'INSERT INTO query_metrics (endpoint, query_duration_ms, query_type, status_code) VALUES ($1, $2, $3, $4)',
      [endpoint, duration, queryType, 200]
    ).catch(err => console.error('Failed to log query metric:', err));

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log error metrics
    pool.query(
      'INSERT INTO query_metrics (endpoint, query_duration_ms, query_type, status_code, error_message) VALUES ($1, $2, $3, $4, $5)',
      [endpoint, duration, queryType, 500, error.message]
    ).catch(err => console.error('Failed to log error metric:', err));

    throw error;
  }
}

// Enhanced analytics trends endpoint
app.get('/analytics/trends/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = 'day' } = req.query;

    const periodMap = {
      'day': '1 day',
      'week': '1 week',
      'month': '1 month'
    };

    const intervalValue = periodMap[period] || '1 week';

    const result = await trackQueryPerformance(
      '/analytics/trends',
      'trends_query',
      async () => {
        return await pool.query(`
          SELECT
            DATE_TRUNC($1, created_at) as period,
            AVG(correct_count) as avg_score,
            AVG(duration_seconds) as avg_duration,
            COUNT(DISTINCT email) as unique_players,
            COUNT(*) as total_sessions,
            SUM(CASE WHEN shared_on_social THEN 1 ELSE 0 END) as social_shares
          FROM player_sessions
          WHERE game_type = $2
          AND created_at >= NOW() - INTERVAL $3
          GROUP BY DATE_TRUNC($1, created_at)
          ORDER BY period ASC
        `, [period, gameType, intervalValue]);
      }
    );

    res.json({
      success: true,
      period,
      trends: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('❌ Trends endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trends data',
      message: error.message
    });
  }
});

// Enhanced leaderboard endpoint
app.get('/analytics/leaderboard/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { limit = 10, timeRange = 'all' } = req.query;

    const timeRangeMap = {
      'day': '1 day',
      'week': '1 week',
      'month': '1 month',
      'all': '10 years'
    };

    const intervalValue = timeRangeMap[timeRange] || '10 years';

    const result = await trackQueryPerformance(
      '/analytics/leaderboard',
      'leaderboard_query',
      async () => {
        return await pool.query(`
          SELECT
            name,
            email,
            MAX(correct_count) as best_score,
            MIN(duration_seconds) as fastest_time,
            COUNT(*) as games_played,
            AVG(correct_count) as avg_score,
            MAX(created_at) as last_played
          FROM player_sessions
          WHERE game_type = $1
          AND created_at >= NOW() - INTERVAL $2
          GROUP BY name, email
          ORDER BY best_score DESC, fastest_time ASC
          LIMIT $3
        `, [gameType, intervalValue, parseInt(limit)]);
      }
    );

    res.json({
      success: true,
      leaderboard: result.rows,
      count: result.rows.length,
      timeRange
    });
  } catch (error) {
    console.error('❌ Leaderboard endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard',
      message: error.message
    });
  }
});

// Advanced analytics endpoint (mode distribution, correlations, etc.)
app.get('/analytics/advanced-analytics/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;

    const [modeDistribution, correlationData, completionStats] = await Promise.all([
      // Mode distribution
      trackQueryPerformance('/analytics/advanced', 'mode_distribution', async () => {
        return await pool.query(`
          SELECT
            mode,
            COUNT(*) as count,
            AVG(correct_count) as avg_score,
            AVG(duration_seconds) as avg_duration
          FROM player_sessions
          WHERE game_type = $1
          AND mode IS NOT NULL
          GROUP BY mode
        `, [gameType]);
      }),

      // Duration vs Performance correlation
      trackQueryPerformance('/analytics/advanced', 'correlation', async () => {
        return await pool.query(`
          SELECT
            duration_seconds,
            correct_count,
            mode
          FROM player_sessions
          WHERE game_type = $1
          AND duration_seconds IS NOT NULL
          AND correct_count IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 100
        `, [gameType]);
      }),

      // Completion and engagement stats
      trackQueryPerformance('/analytics/advanced', 'completion_stats', async () => {
        return await pool.query(`
          SELECT
            COUNT(*) as total_sessions,
            AVG(correct_count) as avg_completion,
            SUM(CASE WHEN shared_on_social THEN 1 ELSE 0 END) as total_shares,
            ROUND(
              100.0 * SUM(CASE WHEN shared_on_social THEN 1 ELSE 0 END) / COUNT(*),
              2
            ) as share_rate
          FROM player_sessions
          WHERE game_type = $1
        `, [gameType]);
      })
    ]);

    res.json({
      success: true,
      modeDistribution: modeDistribution.rows,
      correlationData: correlationData.rows,
      completionStats: completionStats.rows[0] || {},
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Advanced analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get advanced analytics',
      message: error.message
    });
  }
});

// Player progression endpoint
app.get('/analytics/player-progression/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { gameType = 'journeyman' } = req.query;

    const result = await trackQueryPerformance(
      '/analytics/player-progression',
      'player_progression',
      async () => {
        return await pool.query(`
          SELECT
            session_id,
            name,
            game_type,
            mode,
            correct_count,
            duration_seconds,
            shared_on_social,
            created_at
          FROM player_sessions
          WHERE email = $1
          AND game_type = $2
          ORDER BY created_at DESC
          LIMIT 50
        `, [email, gameType]);
      }
    );

    res.json({
      success: true,
      player: result.rows[0]?.name || 'Unknown',
      sessions: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('❌ Player progression error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get player progression',
      message: error.message
    });
  }
});

// CSV Export endpoint
app.get('/analytics/export/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { startDate, endDate } = req.query;

    let query = `
      SELECT
        session_id,
        name,
        email,
        game_type,
        mode,
        duration_seconds,
        correct_count,
        total_guesses,
        shared_on_social,
        created_at
      FROM player_sessions
      WHERE game_type = $1
    `;

    const params = [gameType];

    if (startDate) {
      query += ' AND created_at >= $2';
      params.push(startDate);
    }

    if (endDate) {
      const endDateIndex = startDate ? 3 : 2;
      query += ` AND created_at <= $${endDateIndex}`;
      params.push(endDate);
    }

    query += ' ORDER BY created_at DESC LIMIT 10000';

    const result = await trackQueryPerformance(
      '/analytics/export',
      'csv_export',
      async () => await pool.query(query, params)
    );

    // Convert to CSV
    const headers = ['Session ID', 'Name', 'Email', 'Game Type', 'Mode', 'Duration (s)', 'Score', 'Total Guesses', 'Shared', 'Date'];
    const csvRows = [headers.join(',')];

    result.rows.forEach(row => {
      const values = [
        row.session_id,
        `"${row.name}"`,
        row.email,
        row.game_type,
        row.mode || '',
        row.duration_seconds || '',
        row.correct_count || '',
        row.total_guesses || '',
        row.shared_on_social ? 'Yes' : 'No',
        new Date(row.created_at).toISOString()
      ];
      csvRows.push(values.join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-${gameType}-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('❌ CSV export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export CSV',
      message: error.message
    });
  }
});

// Database health check endpoint
app.get('/health/database', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as current_time, current_database() as db_name, version() as db_version');
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM player_sessions) as total_sessions,
        (SELECT COUNT(*) FROM players) as total_players,
        (SELECT COUNT(*) FROM users) as total_users
    `);

    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].current_time,
      dbName: result.rows[0].db_name,
      stats: stats.rows[0]
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Add Data Protection routes
const dataProtectionRoutes = require('./routes/dataProtection');
app.use('/api/data-protection', dataProtectionRoutes);

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
  try {
    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT email) as total_players,
        COUNT(*) as total_sessions,
        AVG(correct_count) as average_score,
        AVG(duration_seconds) as average_duration,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '1 day' THEN 1 END) as active_today,
        ROUND(100.0 * COUNT(CASE WHEN correct_count >= 8 THEN 1 END) / COUNT(*), 2) as completion_rate
      FROM player_sessions
      WHERE game_type = $1
    `, [gameType]);

    const stats = result.rows[0];

    return {
      source: 'database',
      totalPlayers: parseInt(stats.total_players) || 0,
      totalSessions: parseInt(stats.total_sessions) || 0,
      averageScore: parseFloat(stats.average_score) || 0,
      averageDuration: parseFloat(stats.average_duration) || 0,
      activeToday: parseInt(stats.active_today) || 0,
      completionRate: parseFloat(stats.completion_rate) || 0
    };
  } catch (error) {
    console.error('Error getting analytics from DB:', error);
    throw error;
  }
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

// Data Protection Routes - Proxy to Python backend
const dataProtectionRoutes = require("./routes/dataProtection");
app.use("/api/data-protection", dataProtectionRoutes);
  process.exit(0);
});

// Create HTTP server and attach Socket.io
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Real-time analytics broadcast
io.on('connection', (socket) => {
  console.log('📡 Dashboard client connected:', socket.id);

  // Send initial stats immediately
  getRealtimeStats().then(stats => {
    socket.emit('stats-update', stats);
  });

  // Subscribe to game type updates
  socket.on('subscribe', (gameType) => {
    socket.join(`game-${gameType}`);
    console.log(`Client ${socket.id} subscribed to ${gameType}`);
  });

  // Unsubscribe from game type
  socket.on('unsubscribe', (gameType) => {
    socket.leave(`game-${gameType}`);
    console.log(`Client ${socket.id} unsubscribed from ${gameType}`);
  });

  socket.on('disconnect', () => {
    console.log('📡 Dashboard client disconnected:', socket.id);
  });
});

// Function to get real-time stats
async function getRealtimeStats(gameType = 'journeyman') {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(DISTINCT email) as active_players,
        COUNT(*) as sessions_today,
        AVG(correct_count) as avg_score,
        MAX(correct_count) as top_score,
        COUNT(CASE WHEN shared_on_social THEN 1 END) as social_shares
      FROM player_sessions
      WHERE game_type = $1
      AND created_at >= NOW() - INTERVAL '1 day'
    `, [gameType]);

    return {
      gameType,
      timestamp: new Date().toISOString(),
      ...stats.rows[0]
    };
  } catch (error) {
    console.error('Error fetching realtime stats:', error);
    return { error: 'Failed to fetch stats' };
  }
}

// Broadcast stats every 5 seconds to all connected clients
setInterval(async () => {
  const stats = await getRealtimeStats();
  io.emit('stats-update', stats);
}, 5000);

// Export io so dataService can use it for broadcasting
global.io = io;

server.listen(PORT, () => {
  console.log(`🚀 Secure server running on port ${PORT}`);
  console.log(`🛡️  Security middleware active`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 WebSocket server ready for real-time updates`);
});

// Export both app and server for testing
module.exports = { app, server, io };
