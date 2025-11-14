// src/JourneymanGame.jsx
import React, { Suspense, lazy, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  CircularProgress
} from '@mui/material';

// Your existing imports
import teamLogos from './TeamLogos.js';
import './App.css';
import adobeAnalytics, {
  initializeAnalytics,
  trackPageView,
  trackModeSelection,
  trackSocialShare,
  trackPlayerRegistration,
  trackGameQuit,
  trackGameStart,
  trackGuess,
  trackGameComplete as trackAdobeGameComplete
} from './utils/adobeAnalytics';
import ADOBE_CONFIG from './config/adobeConfig';
import dataUploadService, { uploadGameData, getS3Status } from './utils/dataUploadService';
import PrivacyConsent from './components/PrivacyConsent';

// Add this import fix for the AEP hook
import { useAdobeExperiencePlatform } from './hooks/useAdobeExperiencePlatform';

const PlayerForm   = lazy(() => import('./components/PlayerForm'));
const LandingPage  = lazy(() => import('./components/LandingPage'));
const GamePage     = lazy(() => import('./components/GamePage'));

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
    const {
        trackGameStart: trackAepGameStart,
        trackGameComplete: trackAepGameComplete,
        trackGuess: trackAepGuess,
        setUserIdentity
    } = useAdobeExperiencePlatform();

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
    const [sessionId, setSessionId] = useState('');
    const [uploadStatus, setUploadStatus] = useState('idle'); // 'idle', 'uploading', 'success', 'error'
    const [s3Status, setS3Status] = useState(null);

    const currentPlayer = playersData[currentIndex];

    // Initialize Adobe Analytics on component mount
    useEffect(() => {
        initializeAnalytics(ADOBE_CONFIG.reportSuiteId, ADOBE_CONFIG.trackingServer);

        // Generate session ID
        const newSessionId = `journeyman_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSessionId(newSessionId);

        // Track initial page view
        trackPageView('player-form', 'journeyman-game');

        // Set custom dimensions for the session
        adobeAnalytics.setCustomDimensions({
            gameVersion: '1.0.0',
            platform: 'web',
            sessionId: newSessionId,
            userAgent: navigator.userAgent
        });
    }, []);

    // Track page changes
    useEffect(() => {
        const pageNames = {
            'playerForm': 'player-form',
            'landing': 'game-selection',
            'game': 'game-play'
        };

        if (pageNames[page]) {
            trackPageView(pageNames[page], 'journeyman-game');
        }
    }, [page]);

    // Shuffle teams when player or mode changes
    useEffect(() => {
        if (challengeMode) {
            setShuffledTeams(shuffle(currentPlayer.teams));
        } else {
            setShuffledTeams(currentPlayer.teams);
        }
    }, [currentIndex, challengeMode]);

    // Start game timer and track game start
    useEffect(() => {
        if (page === 'game') {
            setStartTime(Date.now());

            // Track game start
            trackGameStart({
                name: playerName,
                email: playerEmail
            }, challengeMode ? 'challenge' : 'easy');
        }
    }, [page, playerName, playerEmail, challengeMode]);

    // Check S3 status on component mount
    useEffect(() => {
        const checkS3Status = async () => {
            try {
                const status = await getS3Status();
                setS3Status(status);
                console.log('📊 S3 Status:', status);
            } catch (error) {
                console.error('Failed to get S3 status:', error);
            }
        };
        checkS3Status();
    }, []);

    const handleGuess = () => {
        const trimmedGuess = guess.trim();
        setGuesses(prev => [...prev, trimmedGuess]);

        const isCorrect = trimmedGuess.toLowerCase() === currentPlayer.name.toLowerCase();

        // Track the guess in Adobe Analytics
        trackGuess(playerName, trimmedGuess, isCorrect, currentPlayer.name, challengeMode ? 'challenge' : 'easy');

        if (isCorrect) {
            setFeedback('✅ Correct!');
            setCorrectCount(prev => prev + 1);
        } else {
            setFeedback('❌ Try again!');
        }
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();

        // Validate form fields
        if (!playerName.trim()) {
            setFormError('Please enter your name');
            return;
        }

        if (!playerEmail.trim()) {
            setFormError('Please enter your email');
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(playerEmail)) {
            setFormError('Please enter a valid email address');
            return;
        }

        // Clear any previous errors
        setFormError('');

        // Track player registration in Adobe Analytics
        trackPlayerRegistration({
            name: playerName,
            email: playerEmail
        });

        // Set user identity in Adobe Experience Platform
        setUserIdentity({
            email: playerEmail,
            name: playerName
        });

        console.log('✅ Player registered:', { playerName, playerEmail });

        // Navigate to landing page
        setPage('landing');
    };

    const handleModeSelection = (mode) => {
        const isChallenge = mode === 'challenge';
        setChallengeMode(isChallenge);

        // Track mode selection in Adobe Analytics
        trackModeSelection(playerName, mode);

        console.log(`✅ Mode selected: ${mode}`);

        // Navigate to game page
        setPage('game');
    };

    const nextPlayer = () => {
        // Track next player event
        adobeAnalytics.trackEvent('next_player', {
            playerName: playerName,
            currentPlayer: currentPlayer.name,
            gameMode: challengeMode ? 'challenge' : 'easy',
            correctGuesses: correctCount,
            device: adobeAnalytics.getDeviceType()
        });

        setFeedback('');
        setGuess('');
        setCurrentIndex((prev) => (prev + 1) % playersData.length);
    };

    // Enhanced sendGameData function with S3 pipeline
    const sendGameData = async (durationOverride) => {
        console.log('🎯 sendGameData called with S3 pipeline:', {
            mode: challengeMode ? 'challenge' : 'easy',
            durationOverride,
            guesses,
            correctCount
        });

        setUploadStatus('uploading');

        try {
            const gameData = {
                name: playerName,
                email: playerEmail,
                gameType: 'journeyman',
                mode: challengeMode ? 'challenge' : 'easy',
                durationInSeconds: durationOverride ?? durationInSeconds,
                guesses,
                correctCount,
                sharedOnSocial,
                sessionId,
                gameSpecificData: {
                    currentPlayerIndex: currentIndex,
                    currentPlayerName: currentPlayer.name,
                    totalPlayers: playersData.length,
                    challengeMode,
                    playersAttempted: [currentPlayer.name],
                    guessDetails: guesses.map((guess, index) => ({
                        guess,
                        correct: guess.toLowerCase() === currentPlayer.name.toLowerCase(),
                        timestamp: new Date().toISOString(),
                        playerAttempted: currentPlayer.name
                    })),
                    gameFlow: {
                        startedAt: new Date(startTime).toISOString(),
                        endedAt: new Date().toISOString(),
                        timeToFirstGuess: guesses.length > 0 ? Math.floor((Date.now() - startTime) / 1000 / guesses.length) : null
                    }
                },
                analyticsData: {
                    accuracyRate: correctCount / Math.max(guesses.length, 1),
                    averageGuessTime: (durationOverride ?? durationInSeconds) / Math.max(guesses.length, 1),
                    gameCompletionStatus: correctCount > 0 ? 'completed' : 'abandoned',
                    difficulty: challengeMode ? 'hard' : 'easy',
                    playerEngagement: {
                        socialShare: sharedOnSocial,
                        sessionDuration: durationOverride ?? durationInSeconds,
                        guessPattern: guesses.length > 0 ? 'active' : 'passive'
                    }
                }
            };

            console.log('🚀 Sending enhanced game data to S3 pipeline:', gameData);

            // Track game completion in Adobe Analytics (if enabled)
            if (ADOBE_CONFIG.enabled) {
                trackGameComplete({
                    playerName: playerName,
                    playerEmail: playerEmail,
                    mode: challengeMode ? 'challenge' : 'easy',
                    correctCount: correctCount,
                    durationInSeconds: durationOverride ?? durationInSeconds,
                    guesses: guesses,
                    sharedOnSocial: sharedOnSocial
                });
            }

            // Upload to S3 pipeline via enhanced service
            const result = await uploadGameData(gameData);

            console.log('✅ S3 pipeline upload successful:', result);

            setUploadStatus('success');
            setGameEndMessage('🎮 Game data saved to analytics pipeline! Thanks for playing!');

            return result;
        } catch (err) {
            console.error('❌ Failed to send game data to S3 pipeline:', err);
            setUploadStatus('error');
            setGameEndMessage('⚠️ Game data saved locally, will retry upload automatically.');

            // Track error in Adobe Analytics
            if (ADOBE_CONFIG.enabled) {
                adobeAnalytics.trackError('s3_pipeline_upload_failed', err.message, 'game-complete');
            }

            // The dataUploadService will automatically queue failed uploads for retry
            throw err;
        }
    };

    // Add a function to retry failed uploads
    const retryFailedUploads = async () => {
        try {
            setUploadStatus('uploading');
            const result = await dataUploadService.retryFailedUploads();

            if (result.successful > 0) {
                setGameEndMessage(`✅ Successfully uploaded ${result.successful} queued game sessions!`);
                setUploadStatus('success');
            } else {
                setGameEndMessage('ℹ️ No failed uploads to retry.');
                setUploadStatus('idle');
            }

            console.log('🔄 Retry results:', result);
        } catch (error) {
            console.error('❌ Failed to retry uploads:', error);
            setUploadStatus('error');
            setGameEndMessage('❌ Failed to retry uploads. Will try again later.');
        }
    };

    // Add upload status indicator to your game UI
    const renderUploadStatus = () => {
        const queueStatus = dataUploadService.getQueueStatus?.() || { isProcessing: false, failedUploadsCount: 0, queueLength: 0 };

        if (uploadStatus === 'uploading' || queueStatus.isProcessing) {
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                    <CircularProgress size={16} />
                    <Typography variant="caption" sx={{ color: '#90EE90' }}>
                        Uploading to analytics pipeline...
                    </Typography>
                </Box>
            );
        }

        if (queueStatus.failedUploadsCount > 0) {
            return (
                <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" sx={{ color: '#FFA500' }}>
                        {queueStatus.failedUploadsCount} uploads pending retry
                    </Typography>
                    <Button
                        size="small"
                        onClick={retryFailedUploads}
                        sx={{ ml: 1, fontSize: '0.7rem' }}
                    >
                        Retry Now
                    </Button>
                </Box>
            );
        }

        if (uploadStatus === 'success') {
            return (
                <Typography variant="caption" sx={{ color: '#90EE90', mt: 2, display: 'block' }}>
                    ✅ Data uploaded to analytics pipeline
                </Typography>
            );
        }

        return null;
    };

    // Add S3 status indicator to your dashboard
    const renderS3Status = () => {
        if (!s3Status) return null;

        return (
            <Box sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1000 }}>
                <Typography
                    variant="caption"
                    sx={{
                        color: s3Status.s3Status === 'connected' ? '#90EE90' : '#FF6B6B',
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        padding: '4px 8px',
                        borderRadius: '4px'
                    }}
                >
                    S3: {s3Status.s3Status} | Files: {s3Status.totalFiles}
                </Typography>
            </Box>
        );
    };

    // Debug panel for development
    const renderDebugPanel = () => {
        if (process.env.NODE_ENV !== 'development') return null;

        const queueStatus = dataUploadService.getQueueStatus?.() || { queueLength: 0, failedUploadsCount: 0 };

        return (
            <Box sx={{
                position: 'fixed',
                top: 16,
                left: 16,
                backgroundColor: 'rgba(0,0,0,0.8)',
                color: 'white',
                padding: 2,
                borderRadius: 1,
                fontSize: '0.8rem',
                zIndex: 1000
            }}>
                <Typography variant="h6" sx={{ fontSize: '1rem', mb: 1 }}>Debug Panel</Typography>
                <Typography>Upload Status: {uploadStatus}</Typography>
                <Typography>Queue Length: {queueStatus.queueLength}</Typography>
                <Typography>Failed Uploads: {queueStatus.failedUploadsCount}</Typography>
                <Typography>S3 Status: {s3Status?.s3Status || 'Unknown'}</Typography>
                <Button
                    size="small"
                    onClick={() => dataUploadService.debugCurrentState?.()}
                    sx={{ mt: 1, color: 'white' }}
                >
                    Log Debug Info
                </Button>
            </Box>
        );
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
                        You get the logos in order of when they played there. It's like using bumpers at a bowling alley—no shame.
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
                        • No Googling. Pretend it's 2004 and you're using pure memory.<br />
                        • Spelling matters. "Ochocinco" = ✅, "Ochochoco" = 🍫🚫<br />
                        • Limited guesses. Don't just shotgun "McCown" every time (even if odds are decent).<br />
                        • <i>Tip:</i> If you see 6 logos and none of them are the Patriots, it's probably not Tom Brady.
                    </Typography>
                </Box>
                <Typography variant="h5" sx={{ fontFamily:'Endzone' }} gutterBottom>
                    Choose your mode
                </Typography>
                <Stack direction="row" spacing={4} mt={4}>
                    <Button
                        data-cy="easy-mode"
                        variant="contained"
                        size="large"
                        onClick={() => handleModeSelection('easy')}
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
                        data-cy="challenge-mode"
                        variant="contained"
                        size="large"
                        onClick={() => handleModeSelection('challenge')}
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
    if (page === 'game') {
        return (
            <div>
                <Typography
                    data-cy="game-header"
                    data-testid="game-header"
                    variant="h4"
                    gutterBottom
                    sx={{ fontFamily: 'Endzone' }}
                >
                    Who Am I?
                </Typography>

                <img
                    src={currentPlayer.image}
                    alt={`Portrait of ${currentPlayer.name}`}
                    height="160"
                    style={{
                        borderRadius: '50%',
                        objectFit: 'cover',
                        filter: 'grayscale(1) brightness(0.1)',
                        transition: 'filter 0.4s',
                        border: '4px solid white',
                        background: '#222',
                    }}
                />

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
                    {gameEnded && (
                        <Box mt={3}>
                            <Typography sx={{ fontFamily: 'Endzone', color: '#FFD700' }}>
                                🏆 Game Complete! 🏆
                            </Typography>
                            <Typography sx={{ fontFamily: 'Endzone', fontSize: '0.9rem', mt: 1 }}>
                                Score: {correctCount} correct | Time: {Math.floor(durationInSeconds / 60)}:{(durationInSeconds % 60).toString().padStart(2, '0')}
                            </Typography>
                            <Button
                                onClick={() => window.location.reload()}
                                variant="contained"
                                sx={{
                                    fontFamily: 'Endzone',
                                    mt: 2,
                                    backgroundColor: '#4CAF50',
                                    '&:hover': { backgroundColor: '#45a049' }
                                }}
                            >
                                Play Again
                            </Button>
                        </Box>
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

                <Box mt={4} display="flex" justifyContent="center" gap={2}>
                    <a
                        href="https://www.facebook.com/sharer/sharer.php?u=https://yourgameurl.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Share on Facebook"
                        onClick={() => setSharedOnSocial(true)}
                    >
                        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/facebook.svg" alt="Facebook" width={32} height={32} style={{ filter: 'invert(1)' }} />
                    </a>
                    <a
                        href="https://twitter.com/intent/tweet?url=https://yourgameurl.com&text=I%20just%20crushed%20the%20Journeyman%20game!%20Can%20you%20guess%20which%20NFL%20players%20were%20traded%20more%20than%20your%20ex%20changed%20their%20relationship%20status?%20🏈"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Share on Twitter"
                        onClick={() => setSharedOnSocial(true)}
                    >
                        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/x.svg" alt="Twitter/X" width={32} height={32} style={{ filter: 'invert(1)' }} />
                    </a>
                    <a
                        href="https://www.reddit.com/submit?url=https://yourgameurl.com&title=This%20NFL%20Journeyman%20guessing%20game%20is%20harder%20than%20it%20looks"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Share on Reddit"
                        onClick={() => setSharedOnSocial(true)}
                    >
                        <img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/reddit.svg" alt="Reddit" width={32} height={32} style={{ filter: 'invert(1)' }} />
                    </a>
                </Box>
                {renderUploadStatus()}
                {renderS3Status()}
                {renderDebugPanel()}
            </div>
        );
    }

    return null;
}
