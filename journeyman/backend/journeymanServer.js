const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

const dataFile = path.join('/tmp', 'journeymanData.json');

// Ensure the data file exists
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify([]));
}

app.post('/api/journeyman/save', (req, res) => {
  const { name, email, gameMode, usedSocialShare, guesses, correctAnswer } = req.body;

  const entry = {
    name,
    email,
    gameMode,
    usedSocialShare,
    guesses,
    correctAnswer,
    timestamp: new Date().toISOString()
  };

  let data = [];
  try {
    const fileData = fs.readFileSync(dataFile, 'utf8');
    data = fileData ? JSON.parse(fileData) : [];
  } catch (err) {
    console.error('Error reading data file:', err);
  }

  data.push(entry);

  try {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error('Error writing data file:', err);
    res.status(500).json({ success: false });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Journeyman backend listening on port ${PORT}`);
});
