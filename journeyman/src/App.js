// src/JourneymanGame.jsx
import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Stack } from '@mui/material';
import teamLogos from './TeamLogos.js';
import './App.css'; // Assuming you have some basic styles in App.css
import Modal from './components/Modal';
import useOneTrust from './hooks/useOneTrust';
import { logEvent, flushEvents } from './utils/logEvent';

const playersData = [
    {
        name: 'Ryan Fitzpatrick',
        image: '/images/fitzpatrick.png',
        teams: [
            'Los Angeles Rams',
            'Cincinnati Bengals',
            'Buffalo Bills',
            'Tennessee Titans',
            'Houston Texans',
            'New York Jets',
            'Tampa Bay Buccaneers',
            'Miami Dolphins',
            'Washington Commanders',
        ],
    },
    {
        name: 'Josh McCown',
        image: '/images/mccown.png',
        teams: [
            'Arizona Cardinals',
            'Detroit Lions',
            'Las Vegas Raiders',
            'Carolina Panthers',
            'Chicago Bears',
            'Tampa Bay Buccaneers',
            'Cleveland Browns',
            'New York Jets',
            'Philadelphia Eagles',
        ],
    },
];

function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export default function App() {
    const [page, setPage] = useState('playerForm'); // 'playerForm', 'landing', or 'game'
    const [challengeMode, setChallengeMode] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [guess, setGuess] = useState('');
    const [feedback, setFeedback] = useState('');
    const [shuffledTeams, setShuffledTeams] = useState([]);
    const [playerName, setPlayerName] = useState('');
    const [playerEmail, setPlayerEmail] = useState('');
    const [formError, setFormError] = useState('');
    const [startTime, setStartTime] = useState(null);
    const [durationInSeconds, setDurationInSeconds] = useState(0);
    const [guesses, setGuesses] = useState([]);
    const [correctCount, setCorrectCount] = useState(0);
    const [sharedOnSocial, setSharedOnSocial] = useState(false);
    const [gameEnded, setGameEnded] = useState(false);
    const [gameEndMessage, setGameEndMessage] = useState('');
    const [sessionId, setSessionId] = useState(null);
    const [modalConfig, setModalConfig] = useState(null);
    const [questionStart, setQuestionStart] = useState(null);
    const { consentGranted, Overlay: ConsentOverlay } = useOneTrust();

    const currentPlayer = playersData[currentIndex];

    useEffect(() => {
        if (challengeMode) {
            setShuffledTeams(shuffle(currentPlayer.teams));
        } else {
            setShuffledTeams(currentPlayer.teams);
        }
        // eslint-disable-next-line
    }, [currentIndex, challengeMode]);

    useEffect(() => {
        if (startTime) {
            logEvent('question_display', { index: currentIndex });
            setQuestionStart(Date.now());
        }
        // eslint-disable-next-line
    }, [currentIndex, startTime]);

    const handleGuess = () => {
        const trimmedGuess = guess.trim();
        const now = Date.now();
        const timeTaken = questionStart ? now - questionStart : null;
        const correct = trimmedGuess.toLowerCase() === currentPlayer.name.toLowerCase();
        logEvent('guess', { guess: trimmedGuess, correct, timeTaken });
        setQuestionStart(now);
        setGuesses(prev => [...prev, trimmedGuess]);

        if (correct) {
            setFeedback('✅ Correct!');
            setCorrectCount(prev => prev + 1);
        } else {
            setFeedback('❌ Try again!');
        }
    };

    const nextPlayer = () => {
        logEvent('skip', { from: currentIndex });
        setFeedback('');
        setGuess('');
        setCurrentIndex((prev) => (prev + 1) % playersData.length);
    };

    const handleGameStart = async () => {
        if (!consentGranted) return;
        setModalConfig(null);
        try {
            const response = await fetch('http://localhost:3001/start-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: playerName,
                    email: playerEmail,
                    gameType: 'journeyman',
                    difficulty: challengeMode ? 'challenge' : 'easy'
                })
            });
            const result = await response.json();
            if (result.sessionId) {
                setSessionId(result.sessionId);
                logEvent('session_start', { sessionId: result.sessionId });
            }
        } catch (err) {
            setModalConfig({
                title: 'Error',
                message: 'Failed to start game.',
                buttons: [{ label: 'Close', onClick: () => setModalConfig(null) }],
                onClose: () => setModalConfig(null)
            });
            return;
        }
        const now = Date.now();
        setStartTime(now);
        setQuestionStart(now);
    };

    const showResultModal = () => {
        const timeDisplay = `${Math.floor(durationInSeconds / 60)}:${(durationInSeconds % 60).toString().padStart(2, '0')}`;
        const share = (platform) => {
            setSharedOnSocial(true);
            logEvent('share', { platform });
        };
        setModalConfig({
            title: 'Game Complete!',
            message: (
                <div>
                    <p>Score: {correctCount} correct</p>
                    <p>Time: {timeDisplay}</p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
                        <a href="https://www.facebook.com/sharer/sharer.php?u=https://yourgameurl.com" target="_blank" rel="noopener noreferrer" onClick={() => share('facebook')}><img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/facebook.svg" alt="Facebook" width={24} height={24} /></a>
                        <a href="https://twitter.com/intent/tweet?url=https://yourgameurl.com" target="_blank" rel="noopener noreferrer" onClick={() => share('twitter')}><img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/x.svg" alt="Twitter" width={24} height={24} /></a>
                        <a href="https://www.reddit.com/submit?url=https://yourgameurl.com" target="_blank" rel="noopener noreferrer" onClick={() => share('reddit')}><img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/reddit.svg" alt="Reddit" width={24} height={24} /></a>
                    </div>
                </div>
            ),
            buttons: [{ label: 'Play Again', onClick: () => window.location.reload() }],
            onClose: () => window.location.reload()
        });
    };

    const startGamePage = (isChallenge) => {
        setChallengeMode(isChallenge);
        setPage('game');
        setModalConfig({
            title: 'Are you ready?',
            message: 'Get ready to start the game!',
            buttons: [{ label: 'Start', onClick: handleGameStart }],
            onClose: handleGameStart
        });
    };

    const sendGameData = async (durationOverride, events) => {
        try {
            const gameData = {
                sessionId,
                durationInSeconds: durationOverride ?? durationInSeconds,
                guesses,
                correctCount,
                sharedOnSocial,
                sessionData: {
                    currentPlayerIndex: currentIndex,
                    currentPlayerName: currentPlayer.name,
                    totalPlayers: playersData.length,
                    challengeMode,
                    events,
                }
            };

            const response = await fetch('http://localhost:3001/complete-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gameData),
            });

            const result = await response.json();
            if (result.success) {
                setGameEndMessage('🎮 Game data saved successfully! Thanks for playing!');
                return true;
            } else {
                setModalConfig({
                    title: 'Error',
                    message: 'Game saved, but there was an issue with the data.',
                    buttons: [{ label: 'Close', onClick: () => setModalConfig(null) }],
                    onClose: () => setModalConfig(null)
                });
                return false;
            }
        } catch (err) {
            console.error('❌ Failed to send game data:', err);
            setModalConfig({
                title: 'Error',
                message: 'Failed to save game data, but thanks for playing!',
                buttons: [{ label: 'Close', onClick: () => setModalConfig(null) }],
                onClose: () => setModalConfig(null)
            });
            return false;
        }
    };

    const endGame = async () => {
        const endTime = Date.now();
        const duration = Math.floor((endTime - startTime) / 1000);
        setDurationInSeconds(duration);
        setGameEnded(true);
        setFeedback('🎯 Finishing game...');
        const events = flushEvents();
        const success = await sendGameData(duration, events);
        if (success) {
            showResultModal();
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        if (!playerName.trim() || !playerEmail.trim()) {
            setFormError('Please enter both name and email.');
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(playerEmail)) {
            setFormError('Please enter a valid email address.');
            return;
        }

        setFormError('');

        // Send name/email to backend - just validate, don't create player yet
        try {
            // Just proceed to landing page - player will be created when game data is sent
            setPage('landing');
        } catch (error) {
            console.error('Error:', error);
            setFormError('Connection error. Please try again later.');
            return;
        }
    };

    // Player info form page
    if (page === 'playerForm') {
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
                    bgcolor: '#222',
                    px: 2,
                }}
            >
                <ConsentOverlay />
                {modalConfig && <Modal {...modalConfig} />}
                <Box
                    component="form"
                    onSubmit={handleFormSubmit}
                    sx={{
                        bgcolor: 'rgba(0,0,0,0.7)',
                        borderRadius: 2,
                        p: 4,
                        boxShadow: 3,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        width: 350,
                    }}
                >
                    <Typography variant="h4" sx={{ mb: 2, fontFamily: 'Endzone' }}>
                        Welcome to Journeyman
                    </Typography>
                    <TextField
                        label="Name"
                        variant="outlined"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        fullWidth
                        sx={{ mb: 2, backgroundColor: 'white', borderRadius: 1 }}
                        InputProps={{ style: { fontFamily: 'Endzone' } }}
                    />
                    <TextField
                        label="Email"
                        variant="outlined"
                        value={playerEmail}
                        onChange={(e) => setPlayerEmail(e.target.value)}
                        fullWidth
                        sx={{ mb: 2, backgroundColor: 'white', borderRadius: 1 }}
                        InputProps={{ style: { fontFamily: 'Endzone' } }}
                    />
                    {formError && (
                        <Typography color="error" sx={{ mb: 2 }}>
                            {formError}
                        </Typography>
                    )}
                    <Button type="submit" variant="contained" sx={{ fontFamily: 'Endzone', width: '100%' }}>
                        Start
                    </Button>
                </Box>
            </Box>
        );
    }

    // Landing page
    if (page === 'landing') {
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
                    px: 2,
                }}
            >
                <ConsentOverlay />
                {modalConfig && <Modal {...modalConfig} />}
                <Typography variant="h2" gutterBottom sx={{ fontWeight: 'bold', letterSpacing: 2, fontFamily: 'Endzone' }}>
                    Journeyman
                </Typography>
                <Box
                    sx={{
                        maxWidth: 500,
                        bgcolor: 'rgba(0,0,0,0.5)',
                        borderRadius: 2,
                        p: 3,
                        mb: 8,
                        boxShadow: 3,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                    }}
                >
                    <Typography variant="body1" paragraph sx={{ fontSize: '0.750rem' }}>
                        Some NFL players stay loyal to one team their whole career.<br />
                        Others switched teams like it was part of a witness protection program.<br />
                        Your job? Look at the logos from every team they've played for and guess the mystery player.
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mt: 4 }}>
                        🔍 Modes:
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 2, fontSize: '0.750rem' }}>
                        🟢 <b>Easy Mode:</b><br />
                        You get the logos in order of when they played there. It’s like using bumpers at a bowling alley—no shame.
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 2, mt: 2, fontSize: '0.750rem' }}>
                        🔴 <b>Challenge Mode:</b><br />
                        Same logos, no order.<br />
                        Could be first, last, middle—pure chaos. Just like their career path.
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mt: 4, fontSize: '0.850 rem' }}>
                        📜 Rules (well, suggestions, really):
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 2, fontSize: '0.750rem' }}>
                        • Guess the player based on their team history.<br />
                        • No Googling. Pretend it’s 2004 and you’re using pure memory.<br />
                        • Spelling matters. “Ochocinco” = ✅, “Ochochoco” = 🍫🚫<br />
                        • Limited guesses. Don’t just shotgun “McCown” every time (even if odds are decent).<br />
                        • <i>Tip:</i> If you see 6 logos and none of them are the Patriots, it’s probably not Tom Brady.
                    </Typography>
                </Box>
                <Typography variant="h5" sx={{ fontFamily:'Endzone' }} gutterBottom>
                    Choose your mode
                </Typography>
                <Stack direction="row" spacing={4} mt={4}>
                    <Button
                        variant="contained"
                        size="large"
                        onClick={() => startGamePage(false)}
                        sx={{
                            backgroundColor: '#0B6623',
                            '&:hover': {
                                backgroundColor: '#08511a',
                            },
                        }}
                    >
                        Easy Mode
                    </Button>
                    <Button
                        variant="contained"
                        size="large"
                        onClick={() => startGamePage(true)}
                        sx={{
                            backgroundColor: '#D30000',
                            '&:hover': {
                                backgroundColor: '#a80000',
                            },
                        }}
                    >
                        Challenge Mode
                    </Button>
                </Stack>
            </Box>
        );
    }

    // Game page
    return (
        <Box sx={{ padding: 4, textAlign: 'center', color: 'white', fontWeight: 'bold', fontFamily: 'Endzone' }}>
            <ConsentOverlay />
            {modalConfig && <Modal {...modalConfig} />}
            <Typography variant="h4" gutterBottom sx={{ fontFamily: 'Endzone' }}>
                Who Am I?
            </Typography>
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    mb: 8,
                }}
            >
                <img
                    src={currentPlayer.image}
                    width={160}
                    height={160}
                    style={{
                        borderRadius: '50%',
                        objectFit: 'cover',
                        filter: feedback === '✅ Correct!' ? 'none' : 'grayscale(1) brightness(0.1)',
                        transition: 'filter 0.4s',
                        border: '4px solid white',
                        background: '#222',
                    }}
                />
            </Box>
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 4,
                    mt: 9,
                    mb: 8,
                }}
            >
                {shuffledTeams.map((team) => (
                    <Box
                        key={team}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 110,
                            height: 110,
                            background: 'white',
                            borderRadius: 3,
                            boxShadow: 3,
                            border: '2px solid #eee',
                            p: 1,
                        }}
                    >
                        <img
                            src={teamLogos[team]}
                            alt={team}
                            width={80}
                            height={80}
                            style={{ objectFit: 'contain' }}
                        />
                    </Box>
                ))}
            </Box>
            <Box mt={8}>
                <TextField
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    placeholder="Enter player name"
                    variant="outlined"
                    sx={{ backgroundColor: 'white', borderRadius: 1, width: '500px', fontFamily: 'Endzone' }}
                    InputProps={{
                        style: { fontFamily: 'Endzone' }
                    }}
                />
            </Box>
            <Box mt={4}>
                <Button variant="contained" onClick={handleGuess} sx={{ fontFamily: 'Endzone', mr: 2 }}>
                    Submit
                </Button>
                <Button 
                    variant="outlined" 
                    onClick={endGame} 
                    sx={{ 
                        fontFamily: 'Endzone', 
                        color: 'white', 
                        borderColor: 'white',
                        '&:hover': {
                            borderColor: 'lightgray',
                            color: 'lightgray'
                        }
                    }}
                >
                    Quit Game
                </Button>
            </Box>
            <Box mt={2}>
                <Typography sx={{ fontFamily: 'Endzone' }}>{feedback}</Typography>
                {gameEndMessage && (
                    <Typography sx={{ fontFamily: 'Endzone', color: '#90EE90', mt: 2 }}>
                        {gameEndMessage}
                    </Typography>
                )}
                {feedback === '✅ Correct!' && !gameEnded && (
                    <Box mt={4} display="flex" gap={2} justifyContent="center">
                        <Button
                            onClick={nextPlayer}
                            variant="contained"
                            sx={{ fontFamily: 'Endzone' }}
                        >
                            Next Player
                        </Button>
                        <Button 
                            onClick={endGame} 
                            variant="outlined"
                            sx={{ 
                                fontFamily: 'Endzone', 
                                color: 'white', 
                                borderColor: 'white',
                                '&:hover': {
                                    borderColor: 'lightgray',
                                    color: 'lightgray'
                                }
                            }}
                        >
                            Finish Game
                        </Button>
                    </Box>
                )}
            </Box>
            
        </Box>
    );
}