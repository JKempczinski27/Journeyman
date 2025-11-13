# Backend API Documentation

## New Analytics Endpoints

### 1. GET /trends/:gameType

Returns time-based trends for a specific game type with period-over-period analysis.

**Parameters:**
- `gameType` (path, required): The type of game - `journeyman`, `challenge`, or `easy`

**Query Parameters:**
- `startDate` (optional): ISO 8601 date string (default: 30 days ago)
- `endDate` (optional): ISO 8601 date string (default: today)
- `interval` (optional): Grouping interval - `daily`, `weekly`, or `monthly` (default: `daily`)

**Example Request:**
```bash
GET /trends/journeyman?startDate=2025-10-01&endDate=2025-11-13&interval=weekly
```

**Example Response:**
```json
{
  "success": true,
  "gameType": "journeyman",
  "interval": "weekly",
  "dateRange": {
    "start": "2025-10-01T00:00:00.000Z",
    "end": "2025-11-13T23:59:59.999Z"
  },
  "trends": [
    {
      "period": "2025-41",
      "metrics": {
        "totalSessions": 150,
        "uniquePlayers": 45,
        "avgScore": "3.45",
        "avgDuration": "245.67",
        "maxScore": 10,
        "minScore": 0,
        "socialShares": 23,
        "avgGuesses": "4.2"
      }
    },
    {
      "period": "2025-42",
      "metrics": {
        "totalSessions": 175,
        "uniquePlayers": 52,
        "avgScore": "3.82",
        "avgDuration": "232.45",
        "maxScore": 10,
        "minScore": 0,
        "socialShares": 31,
        "avgGuesses": "4.0"
      },
      "changes": {
        "sessions": "16.67%",
        "players": "15.56%",
        "avgScore": "10.72%"
      }
    }
  ],
  "summary": {
    "totalPeriods": 6,
    "totalSessions": 892,
    "uniquePlayers": 52
  },
  "timestamp": "2025-11-13T12:00:00.000Z"
}
```

**Error Responses:**
- `400`: Invalid game type or date range
- `500`: Server error

---

### 2. GET /player-progression/:email

Returns individual player's progression data over time with performance metrics.

**Parameters:**
- `email` (path, required): Player's email address

**Query Parameters:**
- `limit` (optional): Number of sessions to return (default: 100, max: 1000)
- `offset` (optional): Number of sessions to skip for pagination (default: 0)
- `gameType` (optional): Filter by game type - `journeyman`, `challenge`, or `easy`

**Example Request:**
```bash
GET /player-progression/player@example.com?limit=50&gameType=journeyman
```

**Example Response:**
```json
{
  "success": true,
  "player": {
    "email": "player@example.com",
    "name": "John Doe"
  },
  "progression": {
    "sessions": [
      {
        "sessionId": "session_123456",
        "gameType": "journeyman",
        "correctCount": 5,
        "duration": 234,
        "guesses": ["Team A", "Team B", "Team C"],
        "sharedOnSocial": true,
        "date": "2025-11-13T10:30:00.000Z"
      }
    ],
    "stats": {
      "totalSessions": 50,
      "avgScore": 4.25,
      "avgDuration": 245.5,
      "bestScore": 10,
      "fastestTime": 120,
      "socialShares": 15,
      "improvementTrend": {
        "percentageChange": "15.5%",
        "direction": "improving"
      }
    }
  },
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 50,
    "hasMore": false
  },
  "timestamp": "2025-11-13T12:00:00.000Z"
}
```

**Error Responses:**
- `400`: Invalid email format
- `404`: No player data found for email
- `500`: Server error

---

### 3. GET /advanced-analytics/:gameType

Returns comprehensive analytics with customizable metrics for a specific game type.

**Parameters:**
- `gameType` (path, required): The type of game - `journeyman`, `challenge`, or `easy`

**Query Parameters:**
- `startDate` (optional): ISO 8601 date string (default: 30 days ago)
- `endDate` (optional): ISO 8601 date string (default: today)
- `metrics` (optional): Array of metrics to include. Valid values:
  - `completion_rate`
  - `average_score`
  - `player_retention`
  - `social_share_rate`
  - `difficulty_distribution`
  - `time_distribution`
  - Default: all metrics

**Example Request:**
```bash
GET /advanced-analytics/journeyman?startDate=2025-10-01&metrics=completion_rate&metrics=average_score
```

**Example Response:**
```json
{
  "success": true,
  "gameType": "journeyman",
  "dateRange": {
    "start": "2025-10-01T00:00:00.000Z",
    "end": "2025-11-13T23:59:59.999Z"
  },
  "overview": {
    "totalSessions": 892,
    "uniquePlayers": 234,
    "avgSessionsPerPlayer": "3.81"
  },
  "metrics": {
    "completionRate": {
      "rate": "78.50%",
      "completedSessions": 700,
      "incompleteSessions": 192
    },
    "scoreAnalysis": {
      "mean": "4.25",
      "median": "4.00",
      "mode": null,
      "stdDev": "2.15",
      "min": 0,
      "max": 10,
      "q1": "2.00",
      "q3": "6.00"
    },
    "playerRetention": {
      "returningPlayers": 123,
      "newPlayers": 111,
      "retentionRate": "52.56%"
    },
    "socialEngagement": {
      "shareRate": "25.67%",
      "totalShares": 229,
      "nonShares": 663
    },
    "scoreDistribution": {
      "no_score": 192,
      "low": 156,
      "medium": 301,
      "high": 189,
      "expert": 54
    },
    "timeDistribution": {
      "hourly": {
        "0:00": 12,
        "1:00": 8,
        "14:00": 89,
        "15:00": 102,
        "20:00": 75
      },
      "peakHour": "15:00"
    }
  },
  "timestamp": "2025-11-13T12:00:00.000Z"
}
```

**Error Responses:**
- `400`: Invalid game type or metrics
- `500`: Server error

---

## Data Validation

All endpoints include:
- **Input Validation**: Validates all parameters before processing
- **Error Handling**: Returns consistent error responses with timestamps
- **Security Logging**: All requests are logged for security monitoring
- **Rate Limiting**: Subject to general rate limits (100 req/15min)

## Common Error Response Format

```json
{
  "success": false,
  "error": "Error message here",
  "timestamp": "2025-11-13T12:00:00.000Z"
}
```

## Security Features

- **SQL Injection Protection**: Parameterized queries
- **Input Sanitization**: All inputs are sanitized
- **Email Privacy**: Player progression requires exact email match
- **Request Logging**: All analytics access is logged
- **Rate Limiting**: Prevents abuse

## Usage Notes

1. **Date Ranges**: All dates should be in ISO 8601 format (YYYY-MM-DD or full ISO timestamp)
2. **Pagination**: Use `limit` and `offset` for large result sets
3. **Performance**: Larger date ranges may take longer to process
4. **Caching**: Consider implementing caching for frequently accessed analytics

## Example cURL Commands

### Get daily trends for journeyman game
```bash
curl -X GET "http://localhost:3001/trends/journeyman?interval=daily&startDate=2025-11-01"
```

### Get player progression
```bash
curl -X GET "http://localhost:3001/player-progression/player@example.com?limit=20"
```

### Get advanced analytics with specific metrics
```bash
curl -X GET "http://localhost:3001/advanced-analytics/journeyman?metrics=completion_rate&metrics=player_retention"
```
