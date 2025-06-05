// src/JourneymanGame.jsx
import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Grid, Switch, FormControlLabel, Stack } from '@mui/material';
import teamLogos from './TeamLogos.js';

const playersData = [
	{
		name: 'Ryan Fitzpatrick',
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
	const [page, setPage] = useState('landing'); // 'landing' or 'game'
	const [challengeMode, setChallengeMode] = useState(false);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [guess, setGuess] = useState('');
	const [feedback, setFeedback] = useState('');
	const [shuffledTeams, setShuffledTeams] = useState([]);

	const currentPlayer = playersData[currentIndex];

	// Only shuffle on mount or when player changes in challenge mode
	useEffect(() => {
		if (challengeMode) {
			setShuffledTeams(shuffle(currentPlayer.teams));
		} else {
			setShuffledTeams(currentPlayer.teams);
		}
		// eslint-disable-next-line
	}, [currentIndex, challengeMode]);

	const handleGuess = () => {
		if (guess.trim().toLowerCase() === currentPlayer.name.toLowerCase()) {
			setFeedback('✅ Correct!');
		} else {
			setFeedback('❌ Try again!');
		}
	};

	const nextPlayer = () => {
		setFeedback('');
		setGuess('');
		setCurrentIndex((prev) => (prev + 1) % playersData.length);
	};

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
						onClick={() => {
							setChallengeMode(false);
							setPage('game');
						}}
					>
						Easy Mode
					</Button>
					<Button
						variant="contained"
						color="secondary"
						size="large"
						onClick={() => {
							setChallengeMode(true);
							setPage('game');
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
		<Box sx={{ padding: 4, textAlign: 'center', color: 'white' }}>
			<Typography variant="h4" gutterBottom>
				Guess the Player
			</Typography>
			{!challengeMode && (
				<FormControlLabel
					control={
						<Switch
							checked={challengeMode}
							onChange={() => setChallengeMode((prev) => !prev)}
							color="primary"
						/>
					}
					label="Challenge Mode (Shuffle Teams)"
					sx={{ mb: 2 }}
				/>
			)}
			<Grid container spacing={10} justifyContent="center" mt={6}>
				{shuffledTeams.map((team) => (
					<Grid item key={team}>
						<Box
							sx={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 70,
								height: 45,
								background: 'none',
								border: 'none',
								boxShadow: 'none',
								clipPath: 'none',
							}}
						>
							<img src={teamLogos[team]} alt={team} width={200} height={160} />
						</Box>
					</Grid>
				))}
			</Grid>
			<Box mt={5}>
				<TextField
					value={guess}
					onChange={(e) => setGuess(e.target.value)}
					placeholder="Enter player name"
					variant="outlined"
					sx={{ backgroundColor: 'white', borderRadius: 1 }}
				/>
			</Box>
			<Box mt={2}>
				<Button variant="contained" onClick={handleGuess}>
					Submit
				</Button>
			</Box>
			<Box mt={2}>
				<Typography>{feedback}</Typography>
				{feedback === '✅ Correct!' && (
					<Button onClick={nextPlayer} sx={{ mt: 2 }}>
						Next Player
					</Button>
				)}
			</Box>
			<Box mt={4} display="flex" justifyContent="center" gap={2}>
				<a
					href="https://www.facebook.com/sharer/sharer.php?u=https://yourgameurl.com"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Share on Facebook"
				>
					<img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/facebook.svg" alt="Facebook" width={32} height={32} style={{ filter: 'invert(1)' }} />
				</a>
				<a
					href="https://twitter.com/intent/tweet?url=https://yourgameurl.com&text=Try%20the%20Journeyman%20game!"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Share on Twitter"
				>
					<img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/x.svg" alt="Twitter/X" width={32} height={32} style={{ filter: 'invert(1)' }} />
				</a>
				<a
					href="https://www.reddit.com/submit?url=https://yourgameurl.com&title=Try%20the%20Journeyman%20game!"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Share on Reddit"
				>
					<img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/reddit.svg" alt="Reddit" width={32} height={32} style={{ filter: 'invert(1)' }} />
				</a>
				<a
					href="https://wa.me/?text=Try%20the%20Journeyman%20game!%20https://yourgameurl.com"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Share on WhatsApp"
				>
					<img src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/whatsapp.svg" alt="WhatsApp" width={32} height={32} style={{ filter: 'invert(1)' }} />
				</a>
			</Box>
		</Box>
	);
}
