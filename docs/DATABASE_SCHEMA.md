# Database Schema

## Overview
The database uses PostgreSQL and consists of three main tables that support multi-game player tracking, analytics, and profiling.

## Tables

### players
Stores basic player information and registration data.

```sql
CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_players_email ON players(email);
```

**Fields:**
- `id` - Auto-incrementing primary key
- `name` - Player's display name (trimmed on input)
- `email` - Player's email address (lowercase, trimmed, used for deduplication)
- `created_at` - When the player first registered

**Constraints:**
- Email is used for deduplication (case-insensitive)
- Name and email are required

### game_sessions
Stores individual game session data for all games.

```sql
CREATE TABLE game_sessions (
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
);

-- Indexes
CREATE INDEX idx_game_sessions_player_id ON game_sessions(player_id);
CREATE INDEX idx_game_sessions_created_at ON game_sessions(created_at);
```

**Fields:**
- `id` - Auto-incrementing primary key
- `player_id` - Foreign key to players table
- `game_type` - Type of game ("journeyman", "your-game-name", etc.)
- `mode` - Game mode ("challenge", "easy", "form-submission", etc.)
- `duration_seconds` - Time taken to complete the game
- `guesses` - JSONB array of player inputs/guesses
- `correct_count` - Number of correct answers (used for scoring)
- `shared_on_social` - Whether the player shared this session on social media
- `session_data` - JSONB object for game-specific data
- `created_at` - When the session was completed

**Special Modes:**
- `form-submission` - Used for player registration without game data
- Other modes are game-specific (e.g., "challenge", "easy", "multiplayer")

**Game Types:**
- `journeyman` - Default game type
- Add your game type here (e.g., "puzzle-master", "word-game")

### player_profiles
Stores calculated player profiles and analytics (cached for performance).

```sql
CREATE TABLE player_profiles (
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
);

-- Indexes
CREATE INDEX idx_player_profiles_player_id ON player_profiles(player_id);
CREATE INDEX idx_player_profiles_skill_level ON player_profiles(skill_level);
CREATE INDEX idx_player_profiles_engagement ON player_profiles(engagement_level);
```

**Fields:**
- `id` - Auto-incrementing primary key
- `player_id` - Foreign key to players table (unique)
- `skill_level` - Calculated skill category
- `player_type` - Calculated player behavior type
- `engagement_level` - Calculated engagement category
- `total_games` - Count of non-form-submission sessions
- `avg_correct` - Average correct count across all sessions
- `avg_duration` - Average session duration in seconds
- `avg_guesses` - Average number of guesses per session
- `challenge_games` - Count of challenge mode sessions
- `easy_games` - Count of easy mode sessions
- `social_shares` - Count of sessions shared on social media
- `best_score` - Highest correct count achieved
- `fastest_time` - Shortest session duration
- `insights` - JSONB array of generated insights (future use)
- `recommendations` - JSONB array of recommendations (future use)
- `last_calculated` - When the profile was last updated
- `created_at` - When the profile was first created

**Profile Categories:**

*Skill Levels:*
- `Expert` - avg_correct ≥ 1.5 AND avg_duration ≤ 60 seconds
- `Advanced` - avg_correct ≥ 1.0 AND avg_duration ≤ 120 seconds
- `Intermediate` - avg_correct ≥ 0.5
- `Beginner` - Everything else

*Player Types:*
- `Risk Taker` - More challenge games than easy games
- `Quick Guesser` - Average guesses ≤ 2
- `Social Player` - Has shared games on social media
- `Methodical Thinker` - Average duration > 300 seconds
- `Casual Player` - Default for others

*Engagement Levels:*
- `Highly Engaged` - 10+ games played
- `Engaged` - 5-9 games played
- `Moderately Engaged` - 2-4 games played
- `Low Engagement` - 0-1 games played

## Data Flow

### Player Registration
1. Player submits form with name and email
2. System checks for existing player by email
3. If new, creates player record
4. If existing, updates name if different

### Game Session
1. Player completes game
2. Frontend sends session data to `/save-player`
3. System creates/updates player record
4. System creates game session record
5. System automatically updates player profile

### Profile Updates
1. Triggered after each game session
2. Calculates statistics from all player's sessions
3. Determines skill level, player type, engagement level
4. Updates or creates profile record
5. Available immediately via `/player-profile` endpoint

## Multi-Game Support

### Adding a New Game
1. Use existing tables (no schema changes needed)
2. Set `game_type` to your game name
3. Use appropriate `mode` values for your game
4. Store game-specific data in `session_data` JSONB field
5. Analytics and profiles work automatically

### Game-Specific Analytics
- Filter by `game_type` in analytics queries
- Each game gets its own leaderboard
- Player profiles aggregate across all games (or can be filtered)

## Performance Considerations

### Indexes
- All foreign keys are indexed
- Email lookups are indexed
- Time-based queries are indexed
- Profile categorization fields are indexed

### JSONB Usage
- `guesses` and `session_data` use JSONB for flexibility
- Allows arbitrary game-specific data without schema changes
- Queryable and indexable if needed

### Profile Caching
- Profiles are pre-calculated and stored
- Avoids expensive aggregation queries on every request
- Updated automatically after each session

## Data Types

### JSONB Examples

**guesses field:**
```json
["Team A", "Team B", "Team C"]
```

**session_data field:**
```json
{
  "difficulty": "hard",
  "powerUpsUsed": 2,
  "achievements": ["speed-demon", "perfectionist"],
  "level": 5,
  "customMetrics": {
    "combo": 15,
    "streak": 8
  }
}
```

**insights field:**
```json
[
  "You're improving your speed!",
  "Try more challenge modes",
  "You have a 75% win rate"
]
```

**recommendations field:**
```json
[
  "Try the new puzzle mode",
  "Challenge yourself with harder difficulty",
  "Share your achievements on social media"
]
```

## Backup and Migration

### Important Notes
- All player data is preserved across deployments
- JSONB fields allow schema evolution without migrations
- Foreign key constraints ensure data integrity
- Timestamps are stored in UTC

### Migration Strategy
- Tables are created automatically on startup
- Indexes are created if they don't exist
- Safe to redeploy without data loss
- Use Railway's PostgreSQL backup features for production
