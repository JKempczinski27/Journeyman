import React from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';

export default function LandingPage({ setChallengeMode, setPage }) {
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
        position: 'relative',
        zIndex: 1,
      }}
    >
      <Typography
        variant="h2"
        gutterBottom
        sx={{
          fontWeight: 'bold',
          letterSpacing: 2,
          fontFamily: 'Endzone, sans-serif'
        }}
      >
        Journeyman
      </Typography>
      <Typography variant="h5" gutterBottom sx={{ mb: 2 }}>
        Test your NFL knowledge - Guess which teams these journeyman players played for!
      </Typography>
      <Typography variant="body1" sx={{ mb: 4, maxWidth: '600px', textAlign: 'center' }}>
        Choose your difficulty level and see how many teams you can correctly identify.
      </Typography>
      <Stack direction="row" spacing={4} mt={4}>
        <Button
          data-cy="easy-mode"
          variant="contained"
          color="primary"
          size="large"
          sx={{
            fontFamily: 'Endzone, sans-serif',
            fontSize: '1.2rem',
            padding: '12px 32px',
            '&:hover': {
              transform: 'scale(1.05)',
              transition: 'transform 0.2s'
            }
          }}
          onClick={() => {
            setChallengeMode(false);
            setPage('game');
          }}
        >
          Easy Mode
        </Button>
        <Button
          data-cy="challenge-mode"
          variant="contained"
          color="secondary"
          size="large"
          sx={{
            fontFamily: 'Endzone, sans-serif',
            fontSize: '1.2rem',
            padding: '12px 32px',
            '&:hover': {
              transform: 'scale(1.05)',
              transition: 'transform 0.2s'
            }
          }}
          onClick={() => {
            setChallengeMode(true);
            setPage('game');
          }}
        >
          Challenge Mode
        </Button>
      </Stack>
    </Box>
  );
}
