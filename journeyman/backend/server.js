const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JOrYhSjYcLKHHvyZAnlFkcWTauqNBUea@postgres.railway.internal:5432/railway',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create players table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create game_sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id),
        game_type VARCHAR(50) DEFAULT 'journeyman',
        mode VARCHAR(20) DEFAULT 'form-submission',
        duration_seconds INTEGER DEFAULT 0,
        guesses JSONB DEFAULT '[]',
        correct_count INTEGER DEFAULT 0,
        shared_on_social BOOLEAN DEFAULT FALSE,
        session_data JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create index for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_players_email ON players(email);
      CREATE INDEX IF NOT EXISTS idx_game_sessions_player_id ON game_sessions(player_id);
      CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at ON game_sessions(created_at);
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
}

// Initialize database on startup
initializeDatabase();

app.post('/save-player', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      name,
      email,
      mode,
      durationInSeconds,
      guesses,
      correctCount,
      sharedOnSocial,
      gameSpecificData = {}
    } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name and email are required' 
      });
    }

    // Insert or get player
    let playerId;
    const playerResult = await client.query(
      'SELECT id FROM players WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (playerResult.rows.length > 0) {
      playerId = playerResult.rows[0].id;
    } else {
      const newPlayerResult = await client.query(
        'INSERT INTO players (name, email) VALUES ($1, $2) RETURNING id',
        [name.trim(), email.toLowerCase().trim()]
      );
      playerId = newPlayerResult.rows[0].id;
    }

    // If this is just a form submission (no game data), we're done
    if (!mode || mode === 'form-submission') {
      await client.query('COMMIT');
      console.log(`✅ Player registered: ${name} (${email})`);
      return res.json({ 
        success: true, 
        playerId,
        message: 'Player registered successfully'
      });
    }

    // Insert game session
    const sessionResult = await client.query(`
      INSERT INTO game_sessions 
      (player_id, game_type, mode, duration_seconds, guesses, correct_count, shared_on_social, session_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      playerId,
      'journeyman',
      mode,
      durationInSeconds || 0,
      JSON.stringify(guesses || []),
      correctCount || 0,
      sharedOnSocial || false,
      JSON.stringify(gameSpecificData)
    ]);

    await client.query('COMMIT');

    const logEntry = {
      playerId,
      sessionId: sessionResult.rows[0].id,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      mode,
      durationInSeconds: durationInSeconds || 0,
      guesses: guesses || [],
      correctCount: correctCount || 0,
      sharedOnSocial: sharedOnSocial || false,
      gameSpecificData,
      timestamp: new Date().toISOString()
    };

    console.log('🎮 JOURNEYMAN game session saved:', logEntry);

    res.json({ 
      success: true, 
      playerId,
      sessionId: sessionResult.rows[0].id,
      message: 'Game session saved successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save player data',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// Analytics endpoint
app.get('/analytics/:gameType?', async (req, res) => {
  try {
    const { gameType = 'journeyman' } = req.params;
    
    // Get basic stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT p.id) as total_players,
        COUNT(gs.id) as total_sessions,
        ROUND(AVG(gs.duration_seconds), 2) as avg_duration,
        COUNT(CASE WHEN gs.shared_on_social = true THEN 1 END) as social_shares,
        ROUND(AVG(gs.correct_count), 2) as avg_correct_count
      FROM players p
      LEFT JOIN game_sessions gs ON p.id = gs.player_id
      WHERE gs.game_type = $1 OR gs.game_type IS NULL
    `, [gameType]);

    // Get mode distribution
    const modesResult = await pool.query(`
      SELECT mode, COUNT(*) as count
      FROM game_sessions 
      WHERE game_type = $1 AND mode != 'form-submission'
      GROUP BY mode
    `, [gameType]);

    // Get recent activity
    const recentResult = await pool.query(`
      SELECT MAX(gs.created_at) as last_played
      FROM game_sessions gs
      WHERE gs.game_type = $1
    `, [gameType]);

    const modeDistribution = {};
    modesResult.rows.forEach(row => {
      modeDistribution[row.mode] = parseInt(row.count);
    });

    const analytics = {
      totalPlayers: parseInt(statsResult.rows[0].total_players) || 0,
      totalSessions: parseInt(statsResult.rows[0].total_sessions) || 0,
      averageDuration: parseFloat(statsResult.rows[0].avg_duration) || 0,
      socialShares: parseInt(statsResult.rows[0].social_shares) || 0,
      averageCorrectCount: parseFloat(statsResult.rows[0].avg_correct_count) || 0,
      modeDistribution,
      lastPlayed: recentResult.rows[0].last_played
    };

    res.json({ success: true, data: analytics });

  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate analytics' 
    });
  }
});

// Leaderboard endpoint
app.get('/leaderboard/:gameType?', async (req, res) => {
  try {
    const { gameType = 'journeyman' } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const result = await pool.query(`
      SELECT 
        p.name,
        MAX(gs.correct_count) as best_score,
        MIN(gs.duration_seconds) as fastest_time,
        COUNT(gs.id) as games_played,
        MAX(gs.created_at) as last_played
      FROM players p
      JOIN game_sessions gs ON p.id = gs.player_id
      WHERE gs.game_type = $1 AND gs.mode != 'form-submission'
      GROUP BY p.id, p.name
      ORDER BY best_score DESC, fastest_time ASC
      LIMIT $2
    `, [gameType, limit]);

    res.json({ success: true, data: result.rows });

  } catch (error) {
    console.error('❌ Leaderboard error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate leaderboard' 
    });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      timestamp: new Date().toISOString(),
      port: PORT 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString() 
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Received SIGTERM, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🎮 Journeyman Backend with PostgreSQL running on port ${PORT}`);
  console.log(`📊 Analytics: GET /analytics/journeyman`);
  console.log(`🏆 Leaderboard: GET /leaderboard/journeyman`);
  console.log(`❤️  Health check: GET /health`);
});