// src/JourneymanGame.jsx
import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Grid } from '@mui/material';
import teamLogos from './TeamLogos.js';

const playersData = [
  {
    name: "Ryan Fitzpatrick",
    teams: [
      "Los Angeles Rams", "Cincinnati Bengals", "Buffalo Bills", "Tennessee Titans",
      "Houston Texans", "New York Jets", "Tampa Bay Buccaneers", "Miami Dolphins", "Washington Commanders"
    ],
  },
  {
    name: "Josh McCown",
    teams: [
      "Arizona Cardinals", "Detroit Lions", "Las Vegas Raiders", "Carolina Panthers",
      "Chicago Bears", "Tampa Bay Buccaneers", "Cleveland Browns", "New York Jets", "Philadelphia Eagles"
    ],
  },
];

export default function JourneymanGame() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [guess, setGuess] = useState('');
  const [feedback, setFeedback] = useState('');

  const currentPlayer = playersData[currentIndex];

  const handleGuess = () => {
    if (guess.trim().toLowerCase() === currentPlayer.name.toLowerCase()) {
      setFeedback('✅ Correct!');
    } else {
      setFeedback('❌ Try again!');
    }
  };

  const nextPlayer = () => {
    setFeedback('');
    setGuess('');
    setCurrentIndex((prev) => (prev + 1) % playersData.length);
  };

  return (
    <Box sx={{ padding: 4, textAlign: 'center', color: 'white' }}>
      <Typography variant="h4" gutterBottom>Guess the Player</Typography>
      <Grid container spacing={2} justifyContent="center">
        {currentPlayer.teams.map((team) => (
          <Grid item key={team}>
            <img src={teamLogos[team]} alt={team} width={60} height={60} />
          </Grid>
        ))}
      </Grid>
      <Box mt={3}>
        <TextField
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="Enter player name"
          variant="outlined"
          sx={{ backgroundColor: 'white', borderRadius: 1 }}
        />
      </Box>
      <Box mt={2}>
        <Button variant="contained" onClick={handleGuess}>Submit</Button>
      </Box>
      <Box mt={2}>
        <Typography>{feedback}</Typography>
        {feedback === '✅ Correct!' && (
          <Button onClick={nextPlayer} sx={{ mt: 2 }}>Next Player</Button>
        )}
      </Box>
    </Box>
  );
}
