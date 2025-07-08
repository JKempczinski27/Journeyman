# Game Integration Guide

## Overview
This guide explains how to integrate a new game into the existing Journeyman database system. The system is designed to handle multiple games while maintaining consistent player tracking, analytics, and profiling.

## Database Architecture

### Current Tables
- **players** - Stores player information (name, email, registration date)
- **game_sessions** - Stores individual game session data
- **player_profiles** - Stores calculated player profiles and analytics

### Multi-Game Support
The system supports multiple games through the `game_type` field in the `game_sessions` table. Each game can have its own:
- Game modes (challenge, easy, custom modes)
- Scoring systems
- Duration tracking
- Custom game-specific data

## Integration Process

### 1. Frontend Integration
Your new game needs to send data to the existing `/save-player` endpoint with the following structure:

```javascript
// Required fields
{
  name: "Player Name",
  email: "player@email.com",
  
  // Game-specific fields
  mode: "your-game-mode", // e.g., "challenge", "easy", "custom"
  durationInSeconds: 120,
  guesses: ["guess1", "guess2"], // Array of player inputs
  correctCount: 3, // Number correct (for scoring)
  sharedOnSocial: false,
  gameSpecificData: {
    // Any additional data specific to your game
    difficulty: "hard",
    powerUpsUsed: 2,
    achievements: ["first-win"],
    customMetrics: {...}
  }
}
```

### 2. Backend Configuration
Update the backend to recognize your new game type:

```javascript
// In your game's frontend, specify the game type
const gameData = {
  // ... other fields
  gameType: "your-game-name" // This will be set in the backend
};
```

### 3. Analytics Integration
Your game will automatically get:
- Player tracking
- Session analytics
- Leaderboards
- Player profiling

## API Endpoints Available

### Game Session Saving
- **POST /save-player** - Save game session data
- Automatically creates player profiles
- Updates analytics in real-time

### Analytics
- **GET /analytics/:gameType** - Get analytics for your specific game
- **GET /analytics** - Get analytics for all games (defaults to journeyman)

### Leaderboards
- **GET /leaderboard/:gameType** - Get leaderboard for your specific game
- **GET /leaderboard** - Get leaderboard for all games

### Player Profiles
- **GET /player-profile/:email** - Get profile for specific player
- **GET /player-profile** - Get all player profiles
- Profiles are automatically updated after each game session

### Utility
- **GET /health** - Health check
- **POST /update-all-profiles** - Bulk update all player profiles

## Game-Specific Customization

### Custom Game Modes
Define your game modes in the `mode` field:
```javascript
// Examples for different game types
mode: "puzzle-rush"     // For puzzle games
mode: "time-attack"     // For timed games
mode: "survival"        // For endless games
mode: "multiplayer"     // For competitive games
```

### Custom Scoring
Use the `correctCount` field creatively:
```javascript
correctCount: pointsScored    // For point-based games
correctCount: levelsCompleted // For level-based games
correctCount: accuracy        // For accuracy-based games
```

### Custom Metrics
Store game-specific data in `gameSpecificData`:
```javascript
gameSpecificData: {
  level: 5,
  powerUpsUsed: ["shield", "boost"],
  combo: 15,
  streakCount: 8,
  difficulty: "expert",
  achievements: ["speed-demon", "perfectionist"]
}
```

## Player Profiling System

### Automatic Categorization
Players are automatically categorized based on:
- **Skill Level**: Performance and speed
- **Player Type**: Play style and preferences
- **Engagement Level**: Frequency of play

### Customizing Profiles for Your Game
You may want to extend the profiling system for game-specific insights:

1. **Add custom metrics** to the player analysis
2. **Create game-specific categories** (e.g., "Puzzle Master", "Speed Runner")
3. **Generate personalized recommendations** based on game data

## Implementation Checklist

### Frontend Requirements
- [ ] Send player data to `/save-player` endpoint
- [ ] Include all required fields (name, email)
- [ ] Set appropriate `mode` for your game
- [ ] Include meaningful `correctCount` for scoring
- [ ] Add game-specific data to `gameSpecificData`
- [ ] Handle success/error responses

### Backend Updates
- [ ] Update game type in `/save-player` endpoint (if needed)
- [ ] Test analytics endpoints with your game type
- [ ] Verify leaderboard functionality
- [ ] Confirm player profiles are being created

### Testing
- [ ] Test player registration
- [ ] Test game session saving
- [ ] Verify analytics data
- [ ] Check leaderboard entries
- [ ] Confirm player profiles update

## Next Steps

1. **Review the API Documentation** - See detailed endpoint specifications
2. **Check Database Schema** - Understand the data structure
3. **Implement Frontend Integration** - Follow the integration examples
4. **Test Your Integration** - Use the testing checklist
5. **Customize Analytics** - Extend profiling if needed

## Support

For questions or issues:
1. Check the API documentation
2. Review the database schema
3. Test with the health endpoint
4. Check server logs for debugging

The system is designed to be flexible and accommodate various game types while maintaining consistent player tracking and analytics across all games.
