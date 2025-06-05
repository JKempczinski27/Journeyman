import React from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';

export default function LandingPage({ onModeSelect }) {
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
      <Typography variant="h2" gutterBottom sx={{ fontWeight: 'bold', letterSpacing: 2 }}>
        Journeyman
      </Typography>
      <Typography variant="h5" gutterBottom>
        Choose your mode
      </Typography>
      <Stack direction="row" spacing={4} mt={4}>
        <Button
          variant="contained"
          color="primary"
          size="large"
          onClick={() => onModeSelect('easy')}
        >
          Easy Mode
        </Button>
        <Button
          variant="contained"
          color="secondary"
          size="large"
          onClick={() => onModeSelect('challenge')}
        >
          Challenge Mode
        </Button>
      </Stack>
    </Box>
  );
}