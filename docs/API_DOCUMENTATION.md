# API Documentation

## Base URL
- Development: `http://localhost:3001`
- Production: Your Railway deployment URL

## Authentication
No authentication required for current endpoints.

## Endpoints

### Game Session Management

#### POST /save-player
Save a player's game session data.

**Request Body:**
```json
{
  "name": "string (required)",
  "email": "string (required)", 
  "mode": "string (optional)",
  "durationInSeconds": "number (optional)",
  "guesses": "array (optional)",
  "correctCount": "number (optional)",
  "sharedOnSocial": "boolean (optional)",
  "gameSpecificData": "object (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "playerId": 123,
  "sessionId": 456,
  "message": "Game session saved successfully"
}
```

**Behavior:**
- If `mode` is missing or `"form-submission"`, only registers the player
- If `mode` is provided with other game data, saves a full game session
- Automatically updates player profile after game session
- Prevents duplicate players based on email

**Example for form registration only:**
```json
{
  "name": "John Doe",
  "email": "john@example.com"
}
```

**Example for full game session:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "mode": "challenge",
  "durationInSeconds": 180,
  "guesses": ["Team A", "Team B", "Team C"],
  "correctCount": 2,
  "sharedOnSocial": true,
  "gameSpecificData": {
    "difficulty": "hard",
    "powerUpsUsed": 1,
    "achievements": ["speed-demon"]
  }
}
```

### Analytics

#### GET /analytics/:gameType?
Get analytics for a specific game type or all games.

**Parameters:**
- `gameType` (optional): Filter by game type (defaults to "journeyman")

**Response:**
```json
{
  "success": true,
  "data": {
    "totalPlayers": 150,
    "totalSessions": 340,
    "averageDuration": 165.5,
    "socialShares": 23,
    "averageCorrectCount": 1.8,
    "modeDistribution": {
      "challenge": 120,
      "easy": 85,
      "custom": 25
    },
    "lastPlayed": "2025-07-02T10:30:00Z"
  }
}
```

### Leaderboards

#### GET /leaderboard/:gameType?
Get leaderboard for a specific game type.

**Parameters:**
- `gameType` (optional): Filter by game type (defaults to "journeyman")
- `limit` (query param, optional): Number of results (max 50, default 10)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "John Doe",
      "best_score": 5,
      "fastest_time": 45,
      "games_played": 12,
      "last_played": "2025-07-02T10:30:00Z"
    }
  ]
}
```

### Player Profiles

#### GET /player-profile/:email?
Get player profile(s).

**Parameters:**
- `email` (optional): Get profile for specific player, or all profiles if omitted

**Response for specific player:**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "name": "John Doe",
    "email": "john@example.com",
    "player_since": "2025-06-01T00:00:00Z",
    "skill_level": "Advanced",
    "player_type": "Risk Taker",
    "engagement_level": "Highly Engaged",
    "total_games": 15,
    "avg_correct": 2.3,
    "avg_duration": 120,
    "avg_guesses": 3.2,
    "challenge_games": 10,
    "easy_games": 5,
    "social_shares": 3,
    "best_score": 5,
    "fastest_time": 45,
    "insights": [],
    "recommendations": [],
    "last_calculated": "2025-07-02T10:30:00Z",
    "profile_created": "2025-06-01T12:00:00Z"
  }
}
```

**Response for all profiles:**
```json
{
  "success": true,
  "data": [
    {
      // ... same structure as above for each player
    }
  ]
}
```

### Utility Endpoints

#### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-07-02T10:30:00Z",
  "port": 3001
}
```

#### POST /update-all-profiles
Bulk update all player profiles (admin use).

**Response:**
```json
{
  "success": true,
  "message": "Updated 150 player profiles",
  "updated": 150
}
```

## Error Responses

All endpoints return errors in this format:
```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (missing required fields)
- `500` - Internal Server Error

## Data Types and Validation

### Player Data
- `name`: String, required, trimmed
- `email`: String, required, lowercase, trimmed, used for deduplication

### Game Session Data
- `mode`: String, optional, determines if it's a game session or form submission
- `durationInSeconds`: Number, optional, game completion time
- `guesses`: Array, optional, player inputs during the game
- `correctCount`: Number, optional, scoring metric
- `sharedOnSocial`: Boolean, optional, social sharing flag
- `gameSpecificData`: Object, optional, custom game data

### Automatic Behaviors
- Player emails are automatically lowercased and trimmed
- Player names are automatically trimmed
- Duplicate players are prevented based on email
- Player profiles are automatically updated after each game session
- All timestamps are in UTC ISO format

## Rate Limiting
Currently no rate limiting is implemented.

## CORS
CORS is enabled for all origins in development. Configure appropriately for production.

## Database Schema
See DATABASE_SCHEMA.md for detailed table structures.
