import React from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';

export default function PlayerForm({ 
  playerName, setPlayerName, playerEmail, setPlayerEmail, formError, handleFormSubmit 
}) {
  return (
    <Box component="form" onSubmit={handleFormSubmit} /* …styles… */>
      <Typography variant="h4">Welcome to Journeyman</Typography>
      <TextField label="Name" value={playerName} onChange={e => setPlayerName(e.target.value)} /*…*/ />
      <TextField label="Email" value={playerEmail} onChange={e => setPlayerEmail(e.target.value)} /*…*/ />
      {formError && <Typography color="error">{formError}</Typography>}
      <Button type="submit">Start</Button>
    </Box>
  );
}
