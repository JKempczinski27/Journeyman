// GameTrackingTemplate.js - Reusable player tracking system for any game
import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Stack } from '@mui/material';

// Configuration object that each game should customize
const gameConfig = {
  gameType: 'your-game-name', // Change this for each game
  gameTitle: 'Your Game Title',
  railwayUrl: 'https://your-railway-url.up.railway.app',
  
  // Game-specific rules and instructions
  rules: {
    description: 'Your game description goes here...',
    modes: [
      { name: 'Easy Mode', description: 'Description of easy mode', color: '#0B6623' },
      { name: 'Hard Mode', description: 'Description of hard mode', color: '#D30000' }
    ],
    instructions: [
      'Instruction 1',
      'Instruction 2',
      'Instruction 3'
    ]
  },
  
  // Social sharing configuration
  social: {
    url: 'https://yourgameurl.com',
    text: 'Try this awesome game!'
  }
};

// Main tracking hook that any game can use
export const useGameTracking = (customGameType = null) => {
  // Core tracking states
  const [playerName, setPlayerName] = useState('');
  const [playerEmail, setPlayerEmail] = useState('');
  const [startTime, setStartTime] = useState(null);
  const [durationInSeconds, setDurationInSeconds] = useState(0);
  const [guesses, setGuesses] = useState([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [sharedOnSocial, setSharedOnSocial] = useState(false);
  
  // Game-specific states (can be extended)
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [gameSpecificData, setGameSpecificData] = useState({});

  // Start timing when game begins
  const startGameTimer = () => {
    setStartTime(Date.now());
  };

  // Add a guess to the tracking array
  const addGuess = (guess) => {
    setGuesses(prev => [...prev, guess.trim()]);
  };

  // Increment correct count
  const incrementCorrect = () => {
    setCorrectCount(prev => prev + 1);
  };

  // Track social sharing
  const trackSocialShare = () => {
    setSharedOnSocial(true);
  };

  // Add achievement
  const addAchievement = (achievement) => {
    setAchievements(prev => [...prev, achievement]);
  };

  // Send game data to backend
  const sendGameData = async (durationOverride = null, additionalData = {}) => {
    try {
      const response = await fetch(`${gameConfig.railwayUrl}/save-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: playerName,
          email: playerEmail,
          gameType: customGameType || gameConfig.gameType,
          durationInSeconds: durationOverride ?? durationInSeconds,
          guesses,
          correctCount,
          sharedOnSocial,
          score,
          level,
          hintsUsed,
          achievements,
          gameSpecificData: { ...gameSpecificData, ...additionalData },
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        console.log('Game data sent successfully:', result);
      }
      return result;
    } catch (err) {
      console.error('Failed to send game data:', err);
      return { success: false, error: err.message };
    }
  };

  // End game and send data
  const endGame = (additionalData = {}) => {
    const endTime = Date.now();
    const duration = Math.floor((endTime - startTime) / 1000);
    setDurationInSeconds(duration);
    return sendGameData(duration, additionalData);
  };

  return {
    // State values
    playerName, setPlayerName,
    playerEmail, setPlayerEmail,
    startTime, durationInSeconds,
    guesses, correctCount,
    sharedOnSocial, score, setScore,
    level, setLevel,
    hintsUsed, setHintsUsed,
    achievements, gameSpecificData, setGameSpecificData,
    
    // Actions
    startGameTimer,
    addGuess,
    incrementCorrect,
    trackSocialShare,
    addAchievement,
    sendGameData,
    endGame
  };
};

// Reusable Player Form Component
export const PlayerForm = ({ onSubmit, gameTitle = gameConfig.gameTitle }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name.trim() || !email.trim()) {
      setError('Please enter both name and email.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setError('');
    
    // Send initial form data
    try {
      const response = await fetch(`${gameConfig.railwayUrl}/save-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          gameType: gameConfig.gameType
        }),
      });

      const result = await response.json();
      if (result.success) {
        onSubmit(name.trim(), email.trim());
      } else {
        setError('Server error. Please try again later.');
      }
    } catch (error) {
      console.error('Error saving player info:', error);
      setError('Connection error. Please try again later.');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        minWidth: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        bgcolor: '#222',
        px: 2,
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          bgcolor: 'rgba(0,0,0,0.7)',
          borderRadius: 2,
          p: 4,
          boxShadow: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: 350,
        }}
      >
        <Typography variant="h4" sx={{ mb: 2, fontFamily: 'Endzone' }}>
          Welcome to {gameTitle}
        </Typography>
        <TextField
          label="Name"
          variant="outlined"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          sx={{ mb: 2, backgroundColor: 'white', borderRadius: 1 }}
          InputProps={{ style: { fontFamily: 'Endzone' } }}
        />
        <TextField
          label="Email"
          variant="outlined"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          sx={{ mb: 2, backgroundColor: 'white', borderRadius: 1 }}
          InputProps={{ style: { fontFamily: 'Endzone' } }}
        />
        {error && (
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}
        <Button type="submit" variant="contained" sx={{ fontFamily: 'Endzone', width: '100%' }}>
          Start Game
        </Button>
      </Box>
    </Box>
  );
};

// Reusable Social Sharing Component
export const SocialSharing = ({ onShare, gameUrl = gameConfig.social.url, shareText = gameConfig.social.text }) => {
  const handleShare = (platform) => {
    onShare();
    // The actual sharing is handled by the link href
  };

  return (
    <Box mt={4} display="flex" justifyContent="center" gap={2}>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${gameUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on Facebook"
        onClick={() => handleShare('facebook')}
      >
        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/facebook.svg" alt="Facebook" width={32} height={32} style={{ filter: 'invert(1)' }} />
      </a>
      <a
        href={`https://twitter.com/intent/tweet?url=${gameUrl}&text=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on Twitter"
        onClick={() => handleShare('twitter')}
      >
        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/x.svg" alt="Twitter/X" width={32} height={32} style={{ filter: 'invert(1)' }} />
      </a>
      <a
        href={`https://www.reddit.com/submit?url=${gameUrl}&title=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on Reddit"
        onClick={() => handleShare('reddit')}
      >
        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/reddit.svg" alt="Reddit" width={32} height={32} style={{ filter: 'invert(1)' }} />
      </a>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${gameUrl}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on WhatsApp"
        onClick={() => handleShare('whatsapp')}
      >
        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/whatsapp.svg" alt="WhatsApp" width={32} height={32} style={{ filter: 'invert(1)' }} />
      </a>
    </Box>
  );
};

// Reusable Game Control Buttons
export const GameControls = ({ 
  onSubmitGuess, 
  onNextItem, 
  onFinishGame, 
  onQuitGame, 
  showNextButton = false, 
  showFinishButton = false,
  submitLabel = "Submit",
  nextLabel = "Next",
  finishLabel = "Finish Game",
  quitLabel = "Quit Game"
}) => {
  return (
    <>
      <Box mt={4}>
        <Button variant="contained" onClick={onSubmitGuess} sx={{ fontFamily: 'Endzone', mr: 2 }}>
          {submitLabel}
        </Button>
        <Button 
          variant="outlined" 
          onClick={onQuitGame} 
          sx={{ 
            fontFamily: 'Endzone', 
            color: 'white', 
            borderColor: 'white',
            '&:hover': {
              borderColor: 'lightgray',
              color: 'lightgray'
            }
          }}
        >
          {quitLabel}
        </Button>
      </Box>
      
      {(showNextButton || showFinishButton) && (
        <Box mt={4} display="flex" gap={2} justifyContent="center">
          {showNextButton && (
            <Button 
              onClick={onNextItem} 
              variant="contained"
              sx={{ fontFamily: 'Endzone' }}
            >
              {nextLabel}
            </Button>
          )}
          {showFinishButton && (
            <Button 
              onClick={onFinishGame} 
              variant="outlined"
              sx={{ 
                fontFamily: 'Endzone', 
                color: 'white', 
                borderColor: 'white',
                '&:hover': {
                  borderColor: 'lightgray',
                  color: 'lightgray'
                }
              }}
            >
              {finishLabel}
            </Button>
          )}
        </Box>
      )}
    </>
  );
};

export default { useGameTracking, PlayerForm, SocialSharing, GameControls, gameConfig };
