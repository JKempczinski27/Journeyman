import React from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';

export default function LandingPage({ setChallengeMode, setPage }) {
  return (
    <Box /* …styles… */>
      <Typography variant="h2">Journeyman</Typography>
      {/* …description… */}
      <Stack direction="row" spacing={4}>
        <Button data-cy="easy-mode" onClick={() => { setChallengeMode(false); setPage('game'); }}>Easy Mode</Button>
        <Button data-cy="challenge-mode" onClick={() => { setChallengeMode(true); setPage('game'); }}>Challenge Mode</Button>
      </Stack>
    </Box>
  );
}
