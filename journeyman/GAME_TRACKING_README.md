# 🎮 Game Hub Player Tracking System

A comprehensive, reusable player tracking system for React-based games with Node.js backend.

## 🚀 Features

### Frontend Tracking
- ✅ Player registration with email validation
- ✅ Real-time game session tracking
- ✅ Performance metrics (guesses, correct answers, duration)
- ✅ Social media sharing tracking
- ✅ Customizable game-specific data
- ✅ Manual game completion controls
- ✅ Reusable components for consistent UX

### Backend Analytics
- ✅ Multi-game support with separate log files
- ✅ Comprehensive player data collection
- ✅ Analytics endpoint for each game
- ✅ Session ID generation
- ✅ Error handling and validation
- ✅ Health check endpoint

## 📁 File Structure

```
your-game/
├── src/
│   ├── GameTrackingTemplate.js     # Reusable tracking system
│   ├── ExampleGameWithTracking.js  # Implementation example
│   └── YourGame.js                 # Your actual game
├── backend/
│   ├── server.js                   # Enhanced backend server
│   ├── journeyman-players.json     # Auto-generated logs
│   └── [game-name]-players.json    # Game-specific logs
└── package.json
```

## 🛠️ Setup Instructions

### 1. Backend Setup

```bash
cd backend
npm install express cors fs path
```

The server is already configured in `server.js` with:
- Multi-game support
- Analytics endpoints
- Health checks
- Enhanced error handling

### 2. Frontend Setup

Import the tracking system in your game:

```javascript
import { 
  useGameTracking, 
  PlayerForm, 
  SocialSharing, 
  GameControls 
} from './GameTrackingTemplate';
```

### 3. Game Configuration

Update the `gameConfig` object in `GameTrackingTemplate.js`:

```javascript
const gameConfig = {
  gameType: 'your-game-name',           // Unique identifier
  gameTitle: 'Your Game Title',         // Display name
  railwayUrl: 'https://your-url.up.railway.app',
  
  rules: {
    description: 'Your game description...',
    modes: [
      { name: 'Easy Mode', description: '...', color: '#0B6623' },
      { name: 'Hard Mode', description: '...', color: '#D30000' }
    ],
    instructions: ['Step 1', 'Step 2', 'Step 3']
  },
  
  social: {
    url: 'https://yourgameurl.com',
    text: 'Try this awesome game!'
  }
};
```

## 💻 Implementation Guide

### Basic Game Structure

```javascript
export default function YourGame() {
  // Initialize tracking
  const tracking = useGameTracking('your-game-type');
  
  // Game states
  const [page, setPage] = useState('playerForm');
  const [gameSpecificState, setGameSpecificState] = useState();
  
  // Start timer when game begins
  useEffect(() => {
    if (page === 'game') {
      tracking.startGameTimer();
    }
  }, [page]);

  // Handle player registration
  const handleFormSubmit = (name, email) => {
    tracking.setPlayerName(name);
    tracking.setPlayerEmail(email);
    setPage('landing');
  };

  // Handle game actions
  const handleGameAction = (userInput) => {
    tracking.addGuess(userInput);
    
    if (isCorrect(userInput)) {
      tracking.incrementCorrect();
      tracking.setScore(prev => prev + points);
    }
  };

  // End game with custom data
  const finishGame = () => {
    tracking.endGame({
      customMetric: someValue,
      gameSpecificData: moreData
    });
  };

  // Render pages
  if (page === 'playerForm') {
    return <PlayerForm onSubmit={handleFormSubmit} />;
  }
  
  if (page === 'landing') {
    return /* Your landing page */;
  }
  
  return /* Your game page */;
}
```

### Available Tracking Methods

```javascript
const tracking = useGameTracking('game-type');

// State values
tracking.playerName, tracking.playerEmail
tracking.guesses, tracking.correctCount
tracking.score, tracking.level
tracking.achievements, tracking.gameSpecificData

// Actions
tracking.startGameTimer()
tracking.addGuess(guess)
tracking.incrementCorrect()
tracking.trackSocialShare()
tracking.addAchievement(achievement)
tracking.setScore(newScore)
tracking.endGame(additionalData)
```

### Reusable Components

```javascript
// Player registration form
<PlayerForm onSubmit={handleFormSubmit} gameTitle="Your Game" />

// Social sharing buttons
<SocialSharing onShare={tracking.trackSocialShare} />

// Game control buttons
<GameControls
  onSubmitGuess={handleGuess}
  onNextItem={nextRound}
  onFinishGame={finishGame}
  onQuitGame={quitGame}
  showNextButton={gameState === 'correct'}
  showFinishButton={gameState === 'correct'}
/>
```

## 📊 Analytics

### Access Game Analytics

```bash
GET /analytics/{gameType}
```

Returns:
```json
{
  "success": true,
  "data": {
    "totalPlayers": 150,
    "totalSessions": 200,
    "averageDuration": 180.5,
    "socialShares": 45,
    "averageCorrectCount": 3.2,
    "modeDistribution": {
      "easy": 120,
      "hard": 80
    },
    "lastPlayed": "2025-06-30T10:30:00.000Z"
  }
}
```

### Health Check

```bash
GET /health
```

## 🔧 Backend API

### Save Player Data

```bash
POST /save-player
```

Request body:
```json
{
  "name": "Player Name",
  "email": "player@email.com",
  "gameType": "your-game",
  "mode": "easy",
  "durationInSeconds": 120,
  "guesses": ["guess1", "guess2"],
  "correctCount": 2,
  "score": 50,
  "sharedOnSocial": true,
  "gameSpecificData": {
    "customField": "value"
  }
}
```

## 🎯 Quick Start Checklist

- [ ] Update `gameConfig` with your game details
- [ ] Replace `'your-game-name'` with your actual game type
- [ ] Update Railway URL in config
- [ ] Customize player form and landing page
- [ ] Implement game-specific logic
- [ ] Add game-specific tracking metrics
- [ ] Test form submission and game completion
- [ ] Verify data appears in backend logs
- [ ] Test social sharing functionality
- [ ] Check analytics endpoint

## 🔄 Migration from Existing Games

If you have an existing game, follow these steps:

1. **Add tracking hook**: Replace existing state management
2. **Update form handling**: Use `PlayerForm` component
3. **Add game controls**: Use `GameControls` component
4. **Track user actions**: Add `tracking.addGuess()` calls
5. **Handle completion**: Replace existing completion logic
6. **Add social sharing**: Use `SocialSharing` component

## 🚀 Deployment

1. Deploy backend to Railway
2. Update `railwayUrl` in config
3. Deploy frontend to your hosting platform
4. Test end-to-end functionality

## 📈 Data Structure

Each game session creates a log entry like:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "gameType": "word-guessing",
  "mode": "easy",
  "durationInSeconds": 145,
  "guesses": ["REACT", "GAMES", "CODES"],
  "correctCount": 2,
  "score": 20,
  "level": 1,
  "hintsUsed": 0,
  "sharedOnSocial": true,
  "achievements": ["first_correct"],
  "gameSpecificData": {
    "wordsCompleted": 2,
    "difficulty": "beginner"
  },
  "timestamp": "2025-06-30T10:30:00.000Z",
  "sessionId": "1719742200000-abc123def",
  "userAgent": "Mozilla/5.0..."
}
```

## 🤝 Support

For questions or issues:
1. Check the example implementation
2. Review the tracking hook documentation
3. Test with the provided backend
4. Verify Railway deployment configuration

Happy gaming! 🎮
