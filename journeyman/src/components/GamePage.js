import React from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';
import teamLogos from '../TeamLogos';

export default function GamePage({ 
  currentPlayer, shuffledTeams, guess, setGuess, handleGuess, feedback 
}) {
  return (
    <div>
      <Typography data-cy="game-header" variant="h4">Who Am I?</Typography>
      <img 
        src={currentPlayer.image} 
        alt={`Portrait of ${currentPlayer.name}`}
        loading="lazy"                // <-- lazy-load portrait
        height="160" 
        /* …styles… */ 
      />
      <Box /* team‐logo grid */>
        {shuffledTeams.map(team => (
          <Box key={team} /*…*/>
            <img 
              src={teamLogos[team]} 
              alt={team} 
              loading="lazy"          // <-- lazy-load logos
              width="80" 
              height="80" 
            />
          </Box>
        ))}
      </Box>
      {/* …guess input + buttons… */}
      <Typography>{feedback}</Typography>
    </div>
  );
}