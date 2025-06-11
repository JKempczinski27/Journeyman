const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const filePath = path.join(__dirname, 'players.json');

// Create file if it doesn't exist
if (!fs.existsSync(filePath)) {
  fs.writeFileSync(filePath, JSON.stringify([]));
}

app.post('/save-player', (req, res) => {
  const { name, email } = req.body;

  let data = [];
  if (fs.existsSync(filePath)) {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  data.push({ name, email, timestamp: new Date().toISOString() });

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
