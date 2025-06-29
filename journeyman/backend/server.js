const express = require('express');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/save-player', (req, res) => {
    const {
        name,
        email,
        mode,
        durationInSeconds,
        guesses,
        correctCount,
        sharedOnSocial
    } = req.body;

    const logEntry = {
        name,
        email,
        mode,
        durationInSeconds,
        guesses,
        correctCount,
        sharedOnSocial,
        timestamp: new Date().toISOString()
    };

    try {
        fs.appendFileSync('players.json', JSON.stringify(logEntry) + '\n');
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving player data:', error);
        res.status(500).json({ success: false, error: 'Failed to save player data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});