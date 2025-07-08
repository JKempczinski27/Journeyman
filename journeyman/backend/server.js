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

    // Create player_profiles table for cached profile data
    await pool.query(`
      CREATE TABLE IF NOT EXISTS player_profiles (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id),
        skill_level VARCHAR(50) DEFAULT 'Beginner',
        player_type VARCHAR(50) DEFAULT 'Casual Player',
        engagement_level VARCHAR(50) DEFAULT 'Low Engagement',
        total_games INTEGER DEFAULT 0,
        avg_correct DECIMAL(5,2) DEFAULT 0,
        avg_duration INTEGER DEFAULT 0,
        avg_guesses DECIMAL(5,2) DEFAULT 0,
        challenge_games INTEGER DEFAULT 0,
        easy_games INTEGER DEFAULT 0,
        social_shares INTEGER DEFAULT 0,
        best_score INTEGER DEFAULT 0,
        fastest_time INTEGER DEFAULT 0,
        insights JSONB DEFAULT '[]',
        recommendations JSONB DEFAULT '[]',
        last_calculated TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(player_id)
      )
    `);

    // Create index for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_players_email ON players(email);
      CREATE INDEX IF NOT EXISTS idx_game_sessions_player_id ON game_sessions(player_id);
      CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at ON game_sessions(created_at);
      CREATE INDEX IF NOT EXISTS idx_player_profiles_player_id ON player_profiles(player_id);
      CREATE INDEX IF NOT EXISTS idx_player_profiles_skill_level ON player_profiles(skill_level);
      CREATE INDEX IF NOT EXISTS idx_player_profiles_engagement ON player_profiles(engagement_level);
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

    console.log('🎯 Received save-player request:', {
      name,
      email,
      mode,
      durationInSeconds,
      guessesCount: guesses ? guesses.length : 0,
      correctCount,
      sharedOnSocial
    });

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name and email are required' 
      });
    }

    // Insert or get player (prevent duplicates)
    let playerId;
    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();
    
    const playerResult = await client.query(
      'SELECT id FROM players WHERE email = $1',
      [cleanEmail]
    );

    if (playerResult.rows.length > 0) {
      playerId = playerResult.rows[0].id;
      // Update name if it's different (in case user entered different capitalization)
      await client.query(
        'UPDATE players SET name = $1 WHERE id = $2',
        [cleanName, playerId]
      );
      console.log(`🔄 Found existing player: ${cleanName} (${cleanEmail})`);
    } else {
      const newPlayerResult = await client.query(
        'INSERT INTO players (name, email) VALUES ($1, $2) RETURNING id',
        [cleanName, cleanEmail]
      );
      playerId = newPlayerResult.rows[0].id;
      console.log(`✨ Created new player: ${cleanName} (${cleanEmail})`);
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

    // Update player profile after game session
    console.log(`🔄 Starting profile update for player ${playerId}...`);
    await updatePlayerProfile(playerId);

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

// Player profiling endpoint (uses stored profiles)
app.get('/player-profile/:email?', async (req, res) => {
  try {
    const { email } = req.params;
    
    let query;
    let params = [];
    
    if (email) {
      query = `
        SELECT 
          p.id, p.name, p.email, p.created_at as player_since,
          pp.skill_level, pp.player_type, pp.engagement_level,
          pp.total_games, pp.avg_correct, pp.avg_duration, pp.avg_guesses,
          pp.challenge_games, pp.easy_games, pp.social_shares,
          pp.best_score, pp.fastest_time, pp.insights, pp.recommendations,
          pp.last_calculated, pp.created_at as profile_created
        FROM players p
        LEFT JOIN player_profiles pp ON p.id = pp.player_id
        WHERE p.email = $1
      `;
      params = [email.toLowerCase().trim()];
    } else {
      query = `
        SELECT 
          p.id, p.name, p.email, p.created_at as player_since,
          pp.skill_level, pp.player_type, pp.engagement_level,
          pp.total_games, pp.avg_correct, pp.avg_duration, pp.avg_guesses,
          pp.challenge_games, pp.easy_games, pp.social_shares,
          pp.best_score, pp.fastest_time, pp.insights, pp.recommendations,
          pp.last_calculated, pp.created_at as profile_created
        FROM players p
        LEFT JOIN player_profiles pp ON p.id = pp.player_id
        WHERE pp.total_games > 0
        ORDER BY pp.total_games DESC, pp.avg_correct DESC
      `;
    }

    const result = await pool.query(query, params);
    
    // If profile doesn't exist yet, calculate it
    if (email && result.rows.length > 0 && !result.rows[0].skill_level) {
      await updatePlayerProfile(result.rows[0].id);
      // Re-query to get updated profile
      const updatedResult = await pool.query(query, params);
      result.rows = updatedResult.rows;
    }

    const profiles = result.rows.map(row => ({
      ...row,
      insights: row.insights || [],
      recommendations: row.recommendations || []
    }));

    res.json({ 
      success: true, 
      data: email ? profiles[0] : profiles 
    });

  } catch (error) {
    console.error('❌ Player profiling error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate player profiles' 
    });
  }
});

// Function to update/calculate player profile
async function updatePlayerProfile(playerId) {
  try {
    console.log(`📊 Calculating profile for player ${playerId}...`);
    const client = await pool.connect();
    
    // Calculate profile data from game sessions
    const result = await client.query(`
      SELECT 
        p.id,
        p.name,
        p.email,
        COUNT(gs.id) as total_games,
        COALESCE(AVG(gs.correct_count), 0) as avg_correct,
        COALESCE(AVG(gs.duration_seconds), 0) as avg_duration,
        COALESCE(AVG(jsonb_array_length(gs.guesses)), 0) as avg_guesses,
        COUNT(CASE WHEN gs.mode = 'challenge' THEN 1 END) as challenge_games,
        COUNT(CASE WHEN gs.mode = 'easy' THEN 1 END) as easy_games,
        COUNT(CASE WHEN gs.shared_on_social THEN 1 END) as social_shares,
        COALESCE(MAX(gs.correct_count), 0) as best_score,
        COALESCE(MIN(gs.duration_seconds), 0) as fastest_time
      FROM players p
      LEFT JOIN game_sessions gs ON p.id = gs.player_id AND gs.mode != 'form-submission'
      WHERE p.id = $1
      GROUP BY p.id, p.name, p.email
    `, [playerId]);

    if (result.rows.length === 0) {
      console.log(`⚠️ No data found for player ${playerId}`);
      client.release();
      return;
    }
    
    const player = result.rows[0];
    console.log(`📈 Player stats:`, {
      id: player.id,
      name: player.name,
      totalGames: player.total_games,
      avgCorrect: player.avg_correct,
      challengeGames: player.challenge_games,
      easyGames: player.easy_games
    });
    
    // Calculate categories
    const skillLevel = calculateSkillLevel(player);
    const playerType = calculatePlayerType(player);
    const engagementLevel = calculateEngagementLevel(player);
    const insights = generatePlayerInsights(player);
    const recommendations = generateRecommendations({...player, skill_level: skillLevel, player_type: playerType, engagement_level: engagementLevel});

    // Upsert profile data
    await client.query(`
      INSERT INTO player_profiles (
        player_id, skill_level, player_type, engagement_level,
        total_games, avg_correct, avg_duration, avg_guesses,
        challenge_games, easy_games, social_shares, best_score, fastest_time,
        insights, recommendations, last_calculated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      ON CONFLICT (player_id) 
      DO UPDATE SET
        skill_level = $2, player_type = $3, engagement_level = $4,
        total_games = $5, avg_correct = $6, avg_duration = $7, avg_guesses = $8,
        challenge_games = $9, easy_games = $10, social_shares = $11, 
        best_score = $12, fastest_time = $13, insights = $14, recommendations = $15,
        last_calculated = NOW()
    `, [
      playerId, skillLevel, playerType, engagementLevel,
      player.total_games, player.avg_correct, player.avg_duration, player.avg_guesses,
      player.challenge_games, player.easy_games, player.social_shares, 
      player.best_score, player.fastest_time,
      JSON.stringify(insights), JSON.stringify(recommendations)
    ]);

    client.release();
    console.log(`📊 Updated profile for player ${playerId}: ${skillLevel}, ${playerType}, ${engagementLevel}`);
    
  } catch (error) {
    console.error('❌ Error updating player profile:', error);
  }
}

// Helper functions for categorization
function calculateSkillLevel(player) {
  if (player.avg_correct >= 1.5 && player.avg_duration <= 60) return 'Expert';
  if (player.avg_correct >= 1.0 && player.avg_duration <= 120) return 'Advanced';
  if (player.avg_correct >= 0.5) return 'Intermediate';
  return 'Beginner';
}

function calculatePlayerType(player) {
  if (player.challenge_games > player.easy_games) return 'Risk Taker';
  if (player.avg_guesses <= 2) return 'Quick Guesser';
  if (player.social_shares > 0) return 'Social Player';
  if (player.avg_duration > 300) return 'Methodical Thinker';
  return 'Casual Player';
}

function calculateEngagementLevel(player) {
  if (player.total_games >= 10) return 'Highly Engaged';
  if (player.total_games >= 5) return 'Engaged';
  if (player.total_games >= 2) return 'Moderately Engaged';
  return 'Low Engagement';
}

// Generate player insights based on performance
function generatePlayerInsights(player) {
  const insights = [];
  
  if (player.total_games === 0) {
    insights.push("Welcome! Play some games to unlock insights about your playing style.");
    return insights;
  }
  
  if (player.avg_correct >= 1.5) {
    insights.push("You're excellent at guessing players quickly!");
  }
  
  if (player.challenge_games > player.easy_games) {
    insights.push("You prefer challenging yourself over taking the easy route.");
  }
  
  if (player.social_shares > 0) {
    insights.push("You like sharing your achievements with others!");
  }
  
  if (player.avg_duration > 300) {
    insights.push("You take your time to think through your guesses carefully.");
  }
  
  if (player.total_games >= 5) {
    insights.push("You're becoming a regular player!");
  }
  
  return insights;
}

// Generate personalized recommendations
function generateRecommendations(player) {
  const recommendations = [];
  
  if (player.total_games === 0) {
    recommendations.push("Try playing your first game to get started!");
    return recommendations;
  }
  
  if (player.challenge_games === 0 && player.easy_games > 0) {
    recommendations.push("Ready for a challenge? Try Challenge Mode next!");
  }
  
  if (player.avg_correct < 0.5) {
    recommendations.push("Take your time and study the team logos carefully.");
  }
  
  if (player.social_shares === 0) {
    recommendations.push("Share your best games with friends!");
  }
  
  if (player.skill_level === 'Expert') {
    recommendations.push("You've mastered this game! Challenge your friends to beat your scores.");
  }
  
  if (player.total_games >= 10) {
    recommendations.push("You're a dedicated player! Check out your detailed stats.");
  }
  
  return recommendations;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Received SIGTERM, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

// Bulk profile update endpoint (admin use)
app.post('/update-all-profiles', async (req, res) => {
  try {
    const playersResult = await pool.query('SELECT id FROM players');
    const playerIds = playersResult.rows.map(row => row.id);
    
    let updated = 0;
    for (const playerId of playerIds) {
      await updatePlayerProfile(playerId);
      updated++;
    }

    res.json({ 
      success: true, 
      message: `Updated ${updated} player profiles`,
      updated 
    });

  } catch (error) {
    console.error('❌ Bulk profile update error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update profiles' 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🎮 Journeyman Backend with PostgreSQL running on port ${PORT}`);
  console.log(`📊 Analytics: GET /analytics/journeyman`);
  console.log(`🏆 Leaderboard: GET /leaderboard/journeyman`);
  console.log(`👤 Player Profiles: GET /player-profile or /player-profile/:email`);
  console.log(`🔄 Update Profiles: POST /update-all-profiles`);
  console.log(`❤️  Health check: GET /health`);
});