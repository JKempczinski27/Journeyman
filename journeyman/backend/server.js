const express = require('express');
const cors = require('cors');
const players = require('./players.json');

const app = express();
app.use(cors());
app.use(express.json());

// Example save-player route
app.post('/save-player', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email required' });
  }
  // your save logic here…
  return res.json({ success: true });
});

// any other routes…

// only start listening when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;