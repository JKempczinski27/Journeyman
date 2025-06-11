const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const filePath = path.join(__dirname, 'players.json');

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

app.listen(3001, () => console.log('Backend listening on port 3001'));
