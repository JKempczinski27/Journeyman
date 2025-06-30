const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Enhanced player tracking endpoint that works for any game
app.post('/save-player', (req, res) => {
    const {
        name,
        email,
        mode,
        durationInSeconds,
        guesses,
        correctCount,
        sharedOnSocial,
        gameType = 'journeyman', // Default to journeyman, but can be overridden
        score,
        level,
        hintsUsed,
        achievements,
        gameSpecificData = {}
    } = req.body;

    // Validate required fields
    if (!name || !email) {
        return res.status(400).json({ 
            success: false, 
            error: 'Name and email are required' 
        });
    }

    const logEntry = {
        // Core player info
        name: name.trim(),
        email: email.trim().toLowerCase(),
        
        // Game session data
        gameType,
        mode: mode || 'form-submission',
        durationInSeconds: durationInSeconds || 0,
        
        // Performance metrics
        guesses: guesses || [],
        correctCount: correctCount || 0,
        score: score || 0,
        level: level || 1,
        hintsUsed: hintsUsed || 0,
        
        // Engagement metrics
        sharedOnSocial: sharedOnSocial || false,
        achievements: achievements || [],
        
        // Game-specific data (flexible object for any game)
        gameSpecificData,
        
        // Metadata
        timestamp: new Date().toISOString(),
        sessionId: generateSessionId(),
        userAgent: req.headers['user-agent'] || 'unknown'
    };

    console.log(`${gameType.toUpperCase()} player data received:`, logEntry);

    try {
        // Create game-specific log file
        const logFileName = `${gameType}-players.json`;
        const logFilePath = path.join(__dirname, logFileName);
        
        // Ensure the file exists
        if (!fs.existsSync(logFilePath)) {
            fs.writeFileSync(logFilePath, '');
            console.log(`Created new log file: ${logFileName}`);
        }
        
        // Append the log entry
        fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n');
        console.log(`${gameType.toUpperCase()} player data saved successfully to ${logFileName}`);
        
        res.json({ 
            success: true, 
            sessionId: logEntry.sessionId,
            message: 'Player data saved successfully'
        });
        
    } catch (error) {
        console.error(`Error saving ${gameType} player data:`, error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save player data',
            details: error.message 
        });
    }
});

// Analytics endpoint to get game statistics
app.get('/analytics/:gameType', (req, res) => {
    try {
        const { gameType } = req.params;
        const logFileName = `${gameType}-players.json`;
        const logFilePath = path.join(__dirname, logFileName);
        
        if (!fs.existsSync(logFilePath)) {
            return res.json({ 
                success: true, 
                data: {
                    totalPlayers: 0,
                    totalSessions: 0,
                    averageDuration: 0,
                    socialShares: 0
                }
            });
        }
        
        const data = fs.readFileSync(logFilePath, 'utf8');
        const entries = data.trim().split('\n').filter(line => line).map(line => JSON.parse(line));
        
        const analytics = {
            totalPlayers: new Set(entries.map(e => e.email)).size,
            totalSessions: entries.length,
            averageDuration: entries.reduce((sum, e) => sum + e.durationInSeconds, 0) / entries.length || 0,
            socialShares: entries.filter(e => e.sharedOnSocial).length,
            averageCorrectCount: entries.reduce((sum, e) => sum + e.correctCount, 0) / entries.length || 0,
            modeDistribution: entries.reduce((acc, e) => {
                acc[e.mode] = (acc[e.mode] || 0) + 1;
                return acc;
            }, {}),
            lastPlayed: entries.length > 0 ? entries[entries.length - 1].timestamp : null
        };
        
        res.json({ success: true, data: analytics });
        
    } catch (error) {
        console.error('Error generating analytics:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate analytics' 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        port: PORT 
    });
});

// Generate unique session ID
function generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

app.listen(PORT, () => {
    console.log(`🎮 Game Hub Tracking Server is running on port ${PORT}`);
    console.log(`📊 Analytics available at /analytics/{gameType}`);
    console.log(`❤️  Health check at /health`);
});