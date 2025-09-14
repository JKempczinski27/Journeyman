const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { Pool } = require('pg');
const fs = require('fs');
const https = require('https');
const path = require('path');
require('dotenv').config();

// Import security middleware
const {
  authMiddleware,
  encryption,
  inputValidation,
  secureDesign,
  securityHeaders,
  authentication,
  integrityChecks,
  securityLogging,
  ssrfProtection,
  generalLimiter,
  strictLimiter,
  parameterPollutionProtection
} = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (important for rate limiting and IP detection)
app.set('trust proxy', 1);

// Apply security headers first
app.use(securityHeaders);

// Request logging for security monitoring
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

// Apply general rate limiting
app.use('/api/', generalLimiter);

// Apply strict rate limiting for sensitive endpoints
app.use('/admin/', strictLimiter);
app.use('/analytics/', strictLimiter);

// Apply suspicious activity monitoring
app.use(securityLogging.suspiciousActivityMiddleware);

// Parameter pollution protection
app.use(parameterPollutionProtection);

// Body parsing with size limits
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization
app.use(inputValidation.sanitizeInput);

// Session configuration
app.use(session({
  ...secureDesign.sessionConfig,
  store: process.env.DATABASE_URL ? MongoStore.create({
    mongoUrl: process.env.DATABASE_URL,
    touchAfter: 24 * 3600 // lazy session update
  }) : undefined
}));

// CSRF protection (commented out for API, but recommended for web forms)
// app.use(secureDesign.csrfProtection);

// CORS configuration with security considerations
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3002',
      'https://journeyman.yourdomain.com',
      'https://journeyman-dashboard.yourdomain.com',
      process.env.FRONTEND_URL
    ].filter(Boolean);

    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      securityLogging.logSecurityEvent('CORS_VIOLATION', { origin }, { ip: 'unknown' });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Signature', 'X-Timestamp']
};

app.use(cors(corsOptions));

// Database connection with SSL
let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
      rejectUnauthorized: false,
      ca: process.env.DB_CA_CERT,
      cert: process.env.DB_CLIENT_CERT,
      key: process.env.DB_CLIENT_KEY
    } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    query_timeout: 10000,
    statement_timeout: 15000
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
    securityLogging.logSecurityEvent('DATABASE_POOL_ERROR', { error: err.message }, { ip: 'server' });
  });
}

// Database initialization with proper error handling
async function initializeDatabase() {
  if (!pool) {
    console.log('⚠️ Database not configured');
    return;
  }

  try {
    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    console.log('✅ Database connected successfully');

    // Create tables with proper constraints
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL CHECK (length(name) > 0),
        email VARCHAR(254) NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'),
        game_type VARCHAR(20) NOT NULL DEFAULT 'journeyman' CHECK (game_type IN ('journeyman', 'challenge', 'easy')),
        duration_in_seconds INTEGER CHECK (duration_in_seconds >= 0 AND duration_in_seconds <= 86400),
        guesses JSONB DEFAULT '[]'::jsonb,
        correct_count INTEGER DEFAULT 0 CHECK (correct_count >= 0 AND correct_count <= 1000),
        shared_on_social BOOLEAN DEFAULT FALSE,
        session_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address INET,
        user_agent TEXT,
        encrypted_data JSONB, -- For storing encrypted sensitive data
        data_hash VARCHAR(64), -- For integrity verification
        UNIQUE(email, game_type, DATE(created_at))
      );
    `);

    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_players_email ON players(email);
      CREATE INDEX IF NOT EXISTS idx_players_game_type ON players(game_type);
      CREATE INDEX IF NOT EXISTS idx_players_created_at ON players(created_at);
      CREATE INDEX IF NOT EXISTS idx_players_session_id ON players(session_id);
      CREATE INDEX IF NOT EXISTS idx_players_ip_address ON players(ip_address);
    `);

    // Create security log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        details JSONB,
        ip_address INET,
        user_agent TEXT,
        url TEXT,
        method VARCHAR(10),
        session_id VARCHAR(255),
        severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create audit log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        table_name VARCHAR(100) NOT NULL,
        operation VARCHAR(20) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
        old_values JSONB,
        new_values JSONB,
        user_id VARCHAR(255),
        ip_address INET,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    securityLogging.logSecurityEvent('DATABASE_ERROR', { error: error.message }, { ip: 'server' });
  }
}

// Enhanced security logging to database
async function logSecurityEventToDatabase(event, details, req) {
  if (!pool) return;

  try {
    await pool.query(
      `INSERT INTO security_logs (event_type, details, ip_address, user_agent, url, method, session_id, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event,
        JSON.stringify(details),
        req.ip,
        req.get('User-Agent'),
        req.originalUrl,
        req.method,
        req.sessionID,
        details.severity || 'info'
      ]
    );
  } catch (error) {
    console.error('Failed to log security event to database:', error);
  }
}

// Secure route handlers

// Health check endpoint
app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: pool ? 'connected' : 'not configured',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  };

  res.status(200).json(healthCheck);
});

// Enhanced health check for monitoring systems
app.get('/health/detailed',
  authMiddleware.validateApiKey,
  async (req, res) => {
    try {
      const healthCheck = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0'
      };

      // Test database connection
      if (pool) {
        try {
          const dbResult = await pool.query('SELECT NOW() as current_time, version() as version');
          healthCheck.database = {
            status: 'connected',
            currentTime: dbResult.rows[0].current_time,
            version: dbResult.rows[0].version
          };
        } catch (dbError) {
          healthCheck.database = {
            status: 'error',
            error: dbError.message
          };
          healthCheck.status = 'degraded';
        }
      } else {
        healthCheck.database = { status: 'not configured' };
      }

      res.status(healthCheck.status === 'healthy' ? 200 : 503).json(healthCheck);
    } catch (error) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }
);

// Player registration with enhanced security controls
app.post('/save-player',
  authentication.authLimiter,
  inputValidation.validatePlayerData,
  inputValidation.validateGameData,
  async (req, res) => {
    try {
      const { name, email, gameType = 'journeyman' } = req.body;
      const clientIp = req.ip;
      const userAgent = req.get('User-Agent');
      const sessionId = req.sessionID;

      // Check for account lockout
      if (authentication.checkAccountLockout(email)) {
        await logSecurityEventToDatabase('ACCOUNT_LOCKED', { email, severity: 'warning' }, req);
        return res.status(429).json({
          success: false,
          error: 'Account temporarily locked due to suspicious activity'
        });
      }

      if (!pool) {
        return res.status(503).json({
          success: false,
          error: 'Database not available'
        });
      }

      // Check for duplicate submissions (basic fraud prevention)
      const duplicateCheck = await pool.query(
        'SELECT id FROM players WHERE email = $1 AND game_type = $2 AND created_at > NOW() - INTERVAL \'1 hour\'',
        [email, gameType]
      );

      if (duplicateCheck.rows.length > 0) {
        await logSecurityEventToDatabase('DUPLICATE_SUBMISSION', { email, gameType, severity: 'warning' }, req);
        return res.status(429).json({
          success: false,
          error: 'Please wait before submitting another game'
        });
      }

      // Rate limiting by IP
      const ipSubmissions = await pool.query(
        'SELECT COUNT(*) as count FROM players WHERE ip_address = $1 AND created_at > NOW() - INTERVAL \'1 hour\'',
        [clientIp]
      );

      if (parseInt(ipSubmissions.rows[0].count) > 10) {
        await logSecurityEventToDatabase('IP_RATE_LIMIT_EXCEEDED', { ip: clientIp, severity: 'warning' }, req);
        return res.status(429).json({
          success: false,
          error: 'Too many submissions from this IP address'
        });
      }

      // Prepare data for encryption and integrity checking
      const sensitiveData = {
        email,
        name,
        guesses: req.body.guesses || [],
        userAgent
      };

      const encryptedData = encryption.encrypt(JSON.stringify(sensitiveData));
      const dataHash = integrityChecks.generateIntegrityHash(req.body);

      // Begin transaction for atomicity
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Insert player data
        const result = await client.query(
          `INSERT INTO players
           (name, email, game_type, duration_in_seconds, guesses, correct_count,
            shared_on_social, session_id, ip_address, user_agent, encrypted_data, data_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id`,
          [
            name,
            email,
            gameType,
            req.body.durationInSeconds || 0,
            JSON.stringify(req.body.guesses || []),
            req.body.correctCount || 0,
            req.body.sharedOnSocial || false,
            sessionId,
            clientIp,
            userAgent,
            JSON.stringify(encryptedData),
            dataHash
          ]
        );

        // Log to audit table
        await client.query(
          `INSERT INTO audit_logs (table_name, operation, new_values, user_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'players',
            'INSERT',
            JSON.stringify({ id: result.rows[0].id, email, gameType }),
            email,
            clientIp
          ]
        );

        await client.query('COMMIT');

        const playerId = result.rows[0].id;

        // Log successful registration
        await logSecurityEventToDatabase('PLAYER_REGISTERED', {
          playerId,
          gameType,
          severity: 'info'
        }, req);

        // Clear any failed attempts
        authentication.clearFailedAttempts(email);

        res.status(200).json({
          success: true,
          data: {
            playerId,
            sessionId
          },
          message: 'Player data saved successfully'
        });

      } catch (dbError) {
        await client.query('ROLLBACK');
        throw dbError;
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error saving player:', error);

      // Log security event
      await logSecurityEventToDatabase('SAVE_PLAYER_ERROR', {
        error: error.message,
        severity: 'error'
      }, req);

      // Record failed attempt
      if (req.body.email) {
        authentication.recordFailedAttempt(req.body.email);
      }

      res.status(500).json({
        success: false,
        error: 'Failed to save player data',
        requestId: req.id
      });
    }
  }
);

// Analytics endpoint with proper access control
app.get('/analytics/:gameType?',
  authMiddleware.validateApiKey, // Require API key for analytics
  async (req, res) => {
    try {
      const { gameType } = req.params;
      const { startDate, endDate } = req.query;

      if (!pool) {
        return res.status(503).json({ error: 'Database not available' });
      }

      // Build query with parameterized inputs to prevent SQL injection
      let query = `
        SELECT
          COUNT(DISTINCT email) as total_players,
          COUNT(*) as total_sessions,
          AVG(correct_count) as average_score,
          AVG(duration_in_seconds) as average_duration,
          COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as active_today,
          SUM(CASE WHEN shared_on_social THEN 1 ELSE 0 END) as social_shares,
          MAX(correct_count) as highest_score,
          MIN(duration_in_seconds) FILTER (WHERE duration_in_seconds > 0) as fastest_time
        FROM players
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      // Date filtering
      if (startDate) {
        query += ` AND created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      } else {
        query += ` AND created_at >= NOW() - INTERVAL '30 days'`;
      }

      if (endDate) {
        query += ` AND created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      if (gameType && gameType !== 'all') {
        query += ` AND game_type = $${paramIndex}`;
        params.push(gameType);
      }

      const result = await pool.query(query, params);

      // Log analytics access
      await logSecurityEventToDatabase('ANALYTICS_ACCESSED', {
        gameType,
        dateRange: { startDate, endDate },
        severity: 'info'
      }, req);

      res.json({
        success: true,
        data: {
          ...result.rows[0],
          total_players: parseInt(result.rows[0].total_players),
          total_sessions: parseInt(result.rows[0].total_sessions),
          average_score: parseFloat(result.rows[0].average_score) || 0,
          average_duration: parseFloat(result.rows[0].average_duration) || 0,
          active_today: parseInt(result.rows[0].active_today),
          social_shares: parseInt(result.rows[0].social_shares),
          highest_score: parseInt(result.rows[0].highest_score) || 0,
          fastest_time: parseInt(result.rows[0].fastest_time) || 0
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Analytics error:', error);
      await logSecurityEventToDatabase('ANALYTICS_ERROR', {
        error: error.message,
        severity: 'error'
      }, req);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch analytics',
        requestId: req.id
      });
    }
  }
);

// Leaderboard endpoint with pagination and limits
app.get('/leaderboard/:gameType?', async (req, res) => {
  try {
    const { gameType } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Max 100 results
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    let query = `
      SELECT
        name as player_name,
        MAX(correct_count) as best_score,
        MIN(duration_in_seconds) FILTER (WHERE duration_in_seconds > 0) as fastest_time,
        COUNT(*) as games_played,
        MAX(created_at) as last_played
      FROM players
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `;

    const params = [];
    let paramIndex = 1;

    if (gameType && gameType !== 'all') {
      query += ` AND game_type = $${paramIndex}`;
      params.push(gameType);
      paramIndex++;
    }

    query += `
      GROUP BY name
      ORDER BY best_score DESC, fastest_time ASC NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows.map((row, index) => ({
        ...row,
        rank: offset + index + 1,
        best_score: parseInt(row.best_score) || 0,
        fastest_time: parseInt(row.fastest_time) || null,
        games_played: parseInt(row.games_played)
      }))
    });

  } catch (error) {
    console.error('Leaderboard error:', error);
    await logSecurityEventToDatabase('LEADERBOARD_ERROR', {
      error: error.message,
      severity: 'error'
    }, req);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard',
      requestId: req.id
    });
  }
});

// Admin endpoint for security logs (highly restricted)
app.get('/admin/security-logs',
  authMiddleware.validateApiKey,
  authMiddleware.requireRole('admin'),
  async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ error: 'Database not available' });
      }

      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const severity = req.query.severity;

      let query = `SELECT * FROM security_logs WHERE 1=1`;
      const params = [];
      let paramIndex = 1;

      if (severity && ['info', 'warning', 'error', 'critical'].includes(severity)) {
        query += ` AND severity = $${paramIndex}`;
        params.push(severity);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('Security logs error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch security logs'
      });
    }
  }
);

// Data integrity verification endpoint
app.post('/admin/verify-integrity',
  authMiddleware.validateApiKey,
  authMiddleware.requireRole('admin'),
  async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ error: 'Database not available' });
      }

      const result = await pool.query(
        'SELECT id, data_hash FROM players WHERE data_hash IS NOT NULL LIMIT 100'
      );

      const verificationResults = [];

      for (const row of result.rows) {
        const player = await pool.query('SELECT * FROM players WHERE id = $1', [row.id]);
        const playerData = player.rows[0];

        const currentHash = integrityChecks.generateIntegrityHash({
          name: playerData.name,
          email: playerData.email,
          gameType: playerData.game_type,
          correctCount: playerData.correct_count,
          durationInSeconds: playerData.duration_in_seconds
        });

        verificationResults.push({
          id: row.id,
          stored_hash: row.data_hash,
          current_hash: currentHash,
          integrity_valid: row.data_hash === currentHash
        });
      }

      const invalidCount = verificationResults.filter(r => !r.integrity_valid).length;

      if (invalidCount > 0) {
        await logSecurityEventToDatabase('DATA_INTEGRITY_VIOLATION', {
          invalid_count: invalidCount,
          severity: 'critical'
        }, req);
      }

      res.json({
        success: true,
        data: {
          total_checked: verificationResults.length,
          valid_count: verificationResults.length - invalidCount,
          invalid_count: invalidCount,
          results: verificationResults
        }
      });

    } catch (error) {
      console.error('Integrity verification error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify data integrity'
      });
    }
  }
);

// Error handling middleware
app.use(async (error, req, res, next) => {
  console.error('Unhandled error:', error);

  await logSecurityEventToDatabase('UNHANDLED_ERROR', {
    error: error.message,
    stack: error.stack,
    severity: 'error'
  }, req);

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    requestId: req.id
  });
});

// 404 handler
app.use('*', async (req, res) => {
  await logSecurityEventToDatabase('404_NOT_FOUND', {
    url: req.originalUrl,
    severity: 'info'
  }, req);

  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');

  if (pool) {
    await pool.end();
    console.log('Database pool closed');
  }

  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');

  if (pool) {
    await pool.end();
    console.log('Database pool closed');
  }

  process.exit(0);
});

// Initialize database and start server
async function startServer() {
  await initializeDatabase();

  // HTTPS server for production
  if (process.env.NODE_ENV === 'production' && process.env.SSL_CERT && process.env.SSL_KEY) {
    const httpsOptions = {
      cert: fs.readFileSync(process.env.SSL_CERT),
      key: fs.readFileSync(process.env.SSL_KEY),
      // Modern SSL/TLS configuration
      secureProtocol: 'TLSv1_2_method',
      ciphers: [
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA384'
      ].join(':'),
      honorCipherOrder: true
    };

    https.createServer(httpsOptions, app).listen(PORT, () => {
      console.log(`🚀 Secure HTTPS server running on port ${PORT}`);
      console.log(`🛡️  Security middleware active`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    });
  } else {
    // HTTP server for development
    app.listen(PORT, () => {
      console.log(`🚀 Secure server running on port ${PORT}`);
      console.log(`🛡️  Security middleware active`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

      if (process.env.NODE_ENV === 'production') {
        console.log('⚠️  Running in production without HTTPS - configure SSL certificates');
      }
    });
  }
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

module.exports = app;
