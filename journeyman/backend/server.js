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
const pool = require('./config/database');
const {
  trendsValidation,
  playerProgressionValidation,
  advancedAnalyticsValidation,
  validateRequest
} = require('./middleware/validation');

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

// Trends endpoint - Returns time-based trends for a game type
app.get('/trends/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { startDate, endDate, interval = 'daily' } = req.query;

    // Validate game type
    const validGameTypes = ['journeyman', 'challenge', 'easy'];
    if (!validGameTypes.includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type',
        validTypes: validGameTypes,
        timestamp: new Date().toISOString()
      });
    }

    // Set default date range (last 30 days)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Validate date range
    if (start >= end) {
      return res.status(400).json({
        success: false,
        error: 'Start date must be before end date',
        timestamp: new Date().toISOString()
      });
    }

    const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
    if (daysDiff > 365) {
      return res.status(400).json({
        success: false,
        error: 'Date range cannot exceed 365 days',
        timestamp: new Date().toISOString()
      });
    }

    // Build interval grouping based on interval parameter
    let dateFormat;
    let groupByClause;
    switch (interval) {
      case 'monthly':
        dateFormat = 'YYYY-MM';
        groupByClause = "TO_CHAR(created_at, 'YYYY-MM')";
        break;
      case 'weekly':
        dateFormat = 'YYYY-WW';
        groupByClause = "TO_CHAR(created_at, 'IYYY-IW')";
        break;
      default: // daily
        dateFormat = 'YYYY-MM-DD';
        groupByClause = "DATE(created_at)";
    }

    // Query trends data
    const query = `
      SELECT
        ${groupByClause} as period,
        COUNT(*) as total_sessions,
        COUNT(DISTINCT email) as unique_players,
        AVG(correct_count) as avg_score,
        AVG(duration_in_seconds) as avg_duration,
        MAX(correct_count) as max_score,
        MIN(correct_count) as min_score,
        COUNT(CASE WHEN shared_on_social THEN 1 END) as social_shares,
        AVG(CASE WHEN guesses IS NOT NULL THEN jsonb_array_length(guesses) ELSE 0 END) as avg_guesses
      FROM players
      WHERE game_type = $1
        AND created_at >= $2
        AND created_at <= $3
      GROUP BY ${groupByClause}
      ORDER BY period ASC
    `;

    const result = await pool.query(query, [gameType, start, end]);

    // Calculate trends (period-over-period changes)
    const trends = result.rows.map((row, index) => {
      const trend = {
        period: row.period,
        metrics: {
          totalSessions: parseInt(row.total_sessions),
          uniquePlayers: parseInt(row.unique_players),
          avgScore: parseFloat(row.avg_score || 0).toFixed(2),
          avgDuration: parseFloat(row.avg_duration || 0).toFixed(2),
          maxScore: parseInt(row.max_score || 0),
          minScore: parseInt(row.min_score || 0),
          socialShares: parseInt(row.social_shares || 0),
          avgGuesses: parseFloat(row.avg_guesses || 0).toFixed(2)
        }
      };

      // Add period-over-period change if not first period
      if (index > 0) {
        const prevRow = result.rows[index - 1];
        trend.changes = {
          sessions: ((row.total_sessions - prevRow.total_sessions) / prevRow.total_sessions * 100).toFixed(2) + '%',
          players: ((row.unique_players - prevRow.unique_players) / prevRow.unique_players * 100).toFixed(2) + '%',
          avgScore: ((row.avg_score - prevRow.avg_score) / prevRow.avg_score * 100).toFixed(2) + '%'
        };
      }

      return trend;
    });

    securityLogging.logSecurityEvent('TRENDS_ACCESSED', {
      gameType,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      interval,
      periodsReturned: trends.length
    }, req);

    res.json({
      success: true,
      gameType,
      interval,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      trends,
      summary: {
        totalPeriods: trends.length,
        totalSessions: trends.reduce((sum, t) => sum + t.metrics.totalSessions, 0),
        uniquePlayers: result.rows.length > 0 ? Math.max(...trends.map(t => t.metrics.uniquePlayers)) : 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Trends endpoint error:', error);
    securityLogging.logSecurityEvent('TRENDS_ERROR', {
      error: error.message,
      gameType: req.params.gameType
    }, req);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve trends data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Player progression endpoint - Returns individual player's progression over time
app.get('/player-progression/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { limit = 100, offset = 0, gameType } = req.query;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        timestamp: new Date().toISOString()
      });
    }

    // Validate limit and offset
    const parsedLimit = Math.min(parseInt(limit) || 100, 1000);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    // Build query with optional game type filter
    let query = `
      SELECT
        id,
        name,
        email,
        game_type,
        duration_in_seconds,
        correct_count,
        guesses,
        shared_on_social,
        session_id,
        created_at
      FROM players
      WHERE email = $1
    `;

    const queryParams = [email];

    if (gameType) {
      query += ' AND game_type = $2';
      queryParams.push(gameType);
      query += ' ORDER BY created_at DESC LIMIT $3 OFFSET $4';
      queryParams.push(parsedLimit, parsedOffset);
    } else {
      query += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
      queryParams.push(parsedLimit, parsedOffset);
    }

    const result = await pool.query(query, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No player data found for this email',
        email,
        timestamp: new Date().toISOString()
      });
    }

    // Calculate progression metrics
    const sessions = result.rows.map(row => ({
      sessionId: row.session_id,
      gameType: row.game_type,
      correctCount: row.correct_count,
      duration: row.duration_in_seconds,
      guesses: row.guesses,
      sharedOnSocial: row.shared_on_social,
      date: row.created_at
    }));

    // Calculate overall stats
    const totalSessions = sessions.length;
    const avgScore = sessions.reduce((sum, s) => sum + s.correctCount, 0) / totalSessions;
    const avgDuration = sessions.reduce((sum, s) => sum + s.duration, 0) / totalSessions;
    const bestScore = Math.max(...sessions.map(s => s.correctCount));
    const fastestTime = Math.min(...sessions.filter(s => s.duration > 0).map(s => s.duration));
    const socialShares = sessions.filter(s => s.sharedOnSocial).length;

    // Calculate improvement trend (compare first half vs second half)
    const midpoint = Math.floor(totalSessions / 2);
    const firstHalf = sessions.slice(midpoint);
    const secondHalf = sessions.slice(0, midpoint);

    let improvementTrend = null;
    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const firstHalfAvg = firstHalf.reduce((sum, s) => sum + s.correctCount, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, s) => sum + s.correctCount, 0) / secondHalf.length;
      const improvement = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100).toFixed(2);
      improvementTrend = {
        percentageChange: improvement + '%',
        direction: improvement > 0 ? 'improving' : improvement < 0 ? 'declining' : 'stable'
      };
    }

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM players WHERE email = $1';
    const countParams = [email];
    if (gameType) {
      countQuery += ' AND game_type = $2';
      countParams.push(gameType);
    }
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    securityLogging.logSecurityEvent('PLAYER_PROGRESSION_ACCESSED', {
      email,
      gameType: gameType || 'all',
      sessionsReturned: sessions.length
    }, req);

    res.json({
      success: true,
      player: {
        email,
        name: result.rows[0].name
      },
      progression: {
        sessions,
        stats: {
          totalSessions,
          avgScore: parseFloat(avgScore.toFixed(2)),
          avgDuration: parseFloat(avgDuration.toFixed(2)),
          bestScore,
          fastestTime: fastestTime === Infinity ? null : fastestTime,
          socialShares,
          improvementTrend
        }
      },
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: totalCount,
        hasMore: parsedOffset + parsedLimit < totalCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Player progression endpoint error:', error);
    securityLogging.logSecurityEvent('PLAYER_PROGRESSION_ERROR', {
      error: error.message,
      email: req.params.email
    }, req);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve player progression data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Advanced analytics endpoint - Returns complex analytics for a game type
app.get('/advanced-analytics/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { startDate, endDate, metrics } = req.query;

    // Validate game type
    const validGameTypes = ['journeyman', 'challenge', 'easy'];
    if (!validGameTypes.includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type',
        validTypes: validGameTypes,
        timestamp: new Date().toISOString()
      });
    }

    // Set default date range (last 30 days)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Parse requested metrics
    const requestedMetrics = metrics ? (Array.isArray(metrics) ? metrics : [metrics]) : [
      'completion_rate',
      'average_score',
      'player_retention',
      'social_share_rate',
      'difficulty_distribution',
      'time_distribution'
    ];

    // Main analytics query
    const baseQuery = `
      SELECT
        COUNT(*) as total_sessions,
        COUNT(DISTINCT email) as unique_players,
        AVG(correct_count) as avg_score,
        AVG(duration_in_seconds) as avg_duration,
        MAX(correct_count) as max_score,
        MIN(correct_count) as min_score,
        STDDEV(correct_count) as score_stddev,
        COUNT(CASE WHEN shared_on_social THEN 1 END) as social_shares,
        COUNT(CASE WHEN correct_count > 0 THEN 1 END) as completed_sessions,
        AVG(CASE WHEN guesses IS NOT NULL THEN jsonb_array_length(guesses) ELSE 0 END) as avg_guesses,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY correct_count) as median_score,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY correct_count) as q1_score,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY correct_count) as q3_score
      FROM players
      WHERE game_type = $1
        AND created_at >= $2
        AND created_at <= $3
    `;

    const baseResult = await pool.query(baseQuery, [gameType, start, end]);
    const stats = baseResult.rows[0];

    // Build analytics object based on requested metrics
    const analytics = {
      gameType,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      overview: {
        totalSessions: parseInt(stats.total_sessions),
        uniquePlayers: parseInt(stats.unique_players),
        avgSessionsPerPlayer: (stats.total_sessions / stats.unique_players).toFixed(2)
      },
      metrics: {}
    };

    // Completion rate
    if (requestedMetrics.includes('completion_rate')) {
      analytics.metrics.completionRate = {
        rate: (stats.completed_sessions / stats.total_sessions * 100).toFixed(2) + '%',
        completedSessions: parseInt(stats.completed_sessions),
        incompleteSessions: parseInt(stats.total_sessions - stats.completed_sessions)
      };
    }

    // Average score
    if (requestedMetrics.includes('average_score')) {
      analytics.metrics.scoreAnalysis = {
        mean: parseFloat(stats.avg_score || 0).toFixed(2),
        median: parseFloat(stats.median_score || 0).toFixed(2),
        mode: null, // Would need additional query
        stdDev: parseFloat(stats.score_stddev || 0).toFixed(2),
        min: parseInt(stats.min_score || 0),
        max: parseInt(stats.max_score || 0),
        q1: parseFloat(stats.q1_score || 0).toFixed(2),
        q3: parseFloat(stats.q3_score || 0).toFixed(2)
      };
    }

    // Player retention
    if (requestedMetrics.includes('player_retention')) {
      // Query for returning players
      const retentionQuery = `
        SELECT
          COUNT(DISTINCT CASE WHEN session_count > 1 THEN email END) as returning_players,
          COUNT(DISTINCT email) as total_players
        FROM (
          SELECT email, COUNT(*) as session_count
          FROM players
          WHERE game_type = $1
            AND created_at >= $2
            AND created_at <= $3
          GROUP BY email
        ) player_sessions
      `;

      const retentionResult = await pool.query(retentionQuery, [gameType, start, end]);
      const retention = retentionResult.rows[0];

      analytics.metrics.playerRetention = {
        returningPlayers: parseInt(retention.returning_players),
        newPlayers: parseInt(retention.total_players - retention.returning_players),
        retentionRate: (retention.returning_players / retention.total_players * 100).toFixed(2) + '%'
      };
    }

    // Social share rate
    if (requestedMetrics.includes('social_share_rate')) {
      analytics.metrics.socialEngagement = {
        shareRate: (stats.social_shares / stats.total_sessions * 100).toFixed(2) + '%',
        totalShares: parseInt(stats.social_shares),
        nonShares: parseInt(stats.total_sessions - stats.social_shares)
      };
    }

    // Difficulty distribution (score ranges)
    if (requestedMetrics.includes('difficulty_distribution')) {
      const distributionQuery = `
        SELECT
          CASE
            WHEN correct_count = 0 THEN 'no_score'
            WHEN correct_count <= 2 THEN 'low'
            WHEN correct_count <= 5 THEN 'medium'
            WHEN correct_count <= 8 THEN 'high'
            ELSE 'expert'
          END as difficulty_level,
          COUNT(*) as count
        FROM players
        WHERE game_type = $1
          AND created_at >= $2
          AND created_at <= $3
        GROUP BY difficulty_level
      `;

      const distributionResult = await pool.query(distributionQuery, [gameType, start, end]);
      const distribution = {};
      distributionResult.rows.forEach(row => {
        distribution[row.difficulty_level] = parseInt(row.count);
      });

      analytics.metrics.scoreDistribution = distribution;
    }

    // Time distribution (by hour of day)
    if (requestedMetrics.includes('time_distribution')) {
      const timeQuery = `
        SELECT
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as count
        FROM players
        WHERE game_type = $1
          AND created_at >= $2
          AND created_at <= $3
        GROUP BY hour
        ORDER BY hour
      `;

      const timeResult = await pool.query(timeQuery, [gameType, start, end]);
      const hourlyDistribution = {};
      timeResult.rows.forEach(row => {
        hourlyDistribution[`${row.hour}:00`] = parseInt(row.count);
      });

      analytics.metrics.timeDistribution = {
        hourly: hourlyDistribution,
        peakHour: timeResult.rows.reduce((max, row) =>
          row.count > (max.count || 0) ? row : max, {}
        ).hour + ':00'
      };
    }

    securityLogging.logSecurityEvent('ADVANCED_ANALYTICS_ACCESSED', {
      gameType,
      metricsRequested: requestedMetrics,
      startDate: start.toISOString(),
      endDate: end.toISOString()
    }, req);

    res.json({
      success: true,
      ...analytics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Advanced analytics endpoint error:', error);
    securityLogging.logSecurityEvent('ADVANCED_ANALYTICS_ERROR', {
      error: error.message,
      gameType: req.params.gameType
    }, req);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve advanced analytics',
      message: error.message,
      timestamp: new Date().toISOString()
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

// Data Protection Routes - Proxy to Python backend
const dataProtectionRoutes = require("./routes/dataProtection");
app.use("/api/data-protection", dataProtectionRoutes);
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Secure server running on port ${PORT}`);
  console.log(`🛡️  Security middleware active`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
