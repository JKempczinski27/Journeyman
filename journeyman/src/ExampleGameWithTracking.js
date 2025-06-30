// ExampleGameWithTracking.js - Example of how to implement the tracking system in any game
import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Stack } from '@mui/material';
import { 
  useGameTracking, 
  PlayerForm, 
  SocialSharing, 
  GameControls 
} from './GameTrackingTemplate';

// Example: Word Guessing Game
export default function WordGuessingGame() {
  // Initialize tracking system
  const tracking = useGameTracking('word-guessing-game');
  
  // Game-specific states
  const [page, setPage] = useState('playerForm');
  const [currentWord, setCurrentWord] = useState('REACT');
  const [currentGuess, setCurrentGuess] = useState('');
  const [feedback, setFeedback] = useState('');
  const [gameMode, setGameMode] = useState('easy');
  
  // Sample words for the game
  const words = {
    easy: ['REACT', 'GAME', 'CODE', 'PLAY'],
    hard: ['JAVASCRIPT', 'COMPONENT', 'ALGORITHM', 'FUNCTION']
  };

  // Start game timer when entering game page
  useEffect(() => {
    if (page === 'game') {
      tracking.startGameTimer();
    }
  }, [page]);

  // Handle form submission
  const handleFormSubmit = (name, email) => {
    tracking.setPlayerName(name);
    tracking.setPlayerEmail(email);
    setPage('landing');
  };

  // Handle game guess
  const handleGuess = () => {
    const guess = currentGuess.trim().toUpperCase();
    
    // Track the guess
    tracking.addGuess(guess);
    
    if (guess === currentWord) {
      setFeedback('✅ Correct!');
      tracking.incrementCorrect();
      tracking.setScore(prev => prev + 10);
    } else {
      setFeedback('❌ Try again!');
    }
    
    setCurrentGuess('');
  };

  // Move to next word
  const nextWord = () => {
    const wordList = words[gameMode];
    const nextIndex = Math.floor(Math.random() * wordList.length);
    setCurrentWord(wordList[nextIndex]);
    setFeedback('');
    setCurrentGuess('');
  };

  // Finish game
  const finishGame = () => {
    tracking.endGame({
      finalWord: currentWord,
      gameMode: gameMode,
      wordsCompleted: tracking.correctCount
    });
    alert('Game completed! Your data has been saved.');
  };

  // Quit game
  const quitGame = () => {
    tracking.endGame({
      completed: false,
      reason: 'quit'
    });
    alert('Game ended. Your progress has been saved.');
  };

  // Player Form Page
  if (page === 'playerForm') {
    return <PlayerForm onSubmit={handleFormSubmit} gameTitle="Word Guessing Game" />;
  }

  // Landing/Rules Page
  if (page === 'landing') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          px: 2,
        }}
      >
        <Typography variant="h2" gutterBottom sx={{ fontFamily: 'Endzone' }}>
          Word Guessing Game
        </Typography>
        
        <Box sx={{ maxWidth: 500, bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 2, p: 3, mb: 4 }}>
          <Typography variant="body1" paragraph>
            Guess the hidden word! You'll see the number of letters, and you need to guess the complete word.
          </Typography>
          
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mt: 2 }}>
            🎯 Modes:
          </Typography>
          <Typography variant="body2">
            🟢 <b>Easy Mode:</b> 4-letter words<br />
            🔴 <b>Hard Mode:</b> 8+ letter words
          </Typography>
        </Box>

        <Typography variant="h5" gutterBottom>
          Choose your difficulty
        </Typography>
        <Stack direction="row" spacing={4} mt={2}>
          <Button
            variant="contained"
            onClick={() => {
              setGameMode('easy');
              setCurrentWord(words.easy[0]);
              setPage('game');
            }}
            sx={{ backgroundColor: '#0B6623' }}
          >
            Easy Mode
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setGameMode('hard');
              setCurrentWord(words.hard[0]);
              setPage('game');
            }}
            sx={{ backgroundColor: '#D30000' }}
          >
            Hard Mode
          </Button>
        </Stack>
      </Box>
    );
  }

  // Game Page
  return (
    <Box sx={{ padding: 4, textAlign: 'center', color: 'white' }}>
      <Typography variant="h4" gutterBottom>
        Guess the Word!
      </Typography>
      
      <Typography variant="h6" sx={{ mb: 2 }}>
        Mode: {gameMode.toUpperCase()} | Score: {tracking.score} | Correct: {tracking.correctCount}
      </Typography>
      
      {/* Word display (showing length) */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" sx={{ letterSpacing: 4 }}>
          {'_ '.repeat(currentWord.length)}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          {currentWord.length} letters
        </Typography>
      </Box>

      {/* Guess input */}
      <TextField
        value={currentGuess}
        onChange={(e) => setCurrentGuess(e.target.value)}
        placeholder="Enter your guess"
        variant="outlined"
        sx={{ backgroundColor: 'white', borderRadius: 1, mb: 2 }}
      />

      {/* Feedback */}
      <Typography sx={{ mb: 2, minHeight: '24px' }}>
        {feedback}
      </Typography>

      {/* Game Controls */}
      <GameControls
        onSubmitGuess={handleGuess}
        onNextItem={nextWord}
        onFinishGame={finishGame}
        onQuitGame={quitGame}
        showNextButton={feedback === '✅ Correct!'}
        showFinishButton={feedback === '✅ Correct!'}
        nextLabel="Next Word"
      />

      {/* Social Sharing */}
      <SocialSharing 
        onShare={tracking.trackSocialShare}
        shareText="I'm playing this awesome word guessing game!"
      />

      {/* Game Stats */}
      <Box sx={{ mt: 4, opacity: 0.7 }}>
        <Typography variant="body2">
          Guesses made: {tracking.guesses.length} | 
          Time played: {Math.floor((Date.now() - tracking.startTime) / 1000)}s
        </Typography>
      </Box>
    </Box>
  );
}
