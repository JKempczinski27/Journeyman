# 📊 Journeyman Dashboard

A comprehensive analytics dashboard for the Journeyman multi-game platform, providing real-time insights across multiple game types and player analytics.

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- Running Journeyman backend server (port 3001)

### Installation
```bash
cd journeyman/dashboard
npm install
```

### Running the Dashboard
```bash
# Start the dashboard server
npm start

# Or for development with auto-reload
npm run dev
```

The dashboard will be available at: `http://localhost:3002`

## 📋 Available Dashboards

| Dashboard | URL | Description |
|-----------|-----|-------------|
| **Hub** | `/` or `/hub` | Main dashboard selector |
| **Enhanced** | `/enhanced` | Comprehensive analytics with charts |
| **Mobile** | `/mobile` | Mobile-optimized interface |
| **Real-time** | `/realtime` | Live activity monitoring |
| **Classic** | `/classic` | Traditional analytics view |

## 🔧 Configuration

### Environment Variables
- `DASHBOARD_PORT` - Port for dashboard server (default: 3002)
- `NODE_ENV` - Environment mode (development/production)

### Backend Connection
The dashboard connects to the backend API at `http://localhost:3001`. Ensure the backend server is running for full functionality.

## 📊 Features

### Multi-Dashboard Views
- **Enhanced Dashboard**: Interactive charts, real-time updates, export functionality
- **Mobile Dashboard**: Touch-optimized interface for mobile devices
- **Real-time Dashboard**: Live activity feeds and streaming data
- **Classic Dashboard**: Traditional analytics with core metrics

### System Monitoring
- Backend server status
- Database connection monitoring
- Real-time player counts
- Auto-refresh capabilities

### Multi-Game Support
- Analytics for any game type
- Unified player tracking
- Cross-game leaderboards
- Custom game metrics

## 🛠️ Development

### File Structure
```
dashboard/
├── server.js              # Express server
├── package.json           # Dependencies and scripts
├── hub.html              # Main dashboard hub
├── enhanced-dashboard.html
├── mobile-dashboard.html
├── realtime-dashboard.html
├── index.html            # Classic dashboard
└── README.md
```

### Adding New Dashboards
1. Create new HTML file in the dashboard directory
2. Add route in `server.js`
3. Update hub navigation
4. Test with backend API

### API Integration
All dashboards connect to these backend endpoints:
- `GET /health` - System health check
- `GET /analytics/:gameType?` - Analytics data
- `GET /leaderboard/:gameType?` - Player leaderboards
- `GET /player-profile/:email?` - Player profiles

## 🔌 Backend Integration

### Required Backend Endpoints
Ensure your backend provides these endpoints:
```javascript
GET  /health                    // System status
GET  /analytics/:gameType?      // Game analytics
GET  /leaderboard/:gameType?    // Leaderboards
GET  /player-profile/:email?    // Player profiles
POST /save-player              // Save game sessions
```

### CORS Configuration
The dashboard server enables CORS for all routes. Ensure your backend also allows cross-origin requests from the dashboard domain.

## 🚦 Health Checks

### Dashboard Health
```bash
curl http://localhost:3002/health
```

### Backend Health
```bash
curl http://localhost:3001/health
```

## 📱 Mobile Support

The mobile dashboard is optimized for:
- Touch interfaces
- Small screens
- Fast loading
- Essential metrics only
- Offline indicators

## 🔄 Real-time Features

The real-time dashboard provides:
- Live activity feeds
- Streaming player data
- Auto-refreshing charts
- Real-time notifications
- Dark theme for better visibility

## 🎮 Multi-Game Integration

The dashboard supports multiple games through:
- Game type filtering in URLs
- Unified analytics across games
- Cross-game player profiles
- Game-specific metrics display

### Adding New Games
Games are automatically supported when they:
1. Use the `/save-player` endpoint
2. Specify a unique `game_type`
3. Follow the standard data structure

## 🐛 Troubleshooting

### Common Issues

1. **Dashboard won't start**
   ```bash
   # Check if port 3002 is available
   lsof -i :3002
   
   # Install dependencies
   npm install
   ```

2. **Backend connection failed**
   - Ensure backend server is running on port 3001
   - Check CORS configuration
   - Verify API endpoints are available

3. **Data not displaying**
   - Check browser console for errors
   - Verify backend health endpoint
   - Check database connection

### Debug Mode
Set `NODE_ENV=development` for additional logging:
```bash
NODE_ENV=development npm start
```

## 📈 Performance

### Optimization Features
- Response compression
- Static file caching
- Efficient routing
- Error handling
- Graceful shutdown

### Monitoring
- Request logging
- Health check endpoints
- Uptime tracking
- Error reporting

## 🔐 Security

### Best Practices
- Input validation
- CORS protection
- Error handling without exposing internals
- Secure headers (add helmet.js for production)

## 🚀 Deployment

### Production Setup
```bash
# Install production dependencies
npm install --production

# Start with PM2 (recommended)
pm2 start server.js --name "journeyman-dashboard"

# Or use npm
npm start
```

### Environment Variables
```bash
export DASHBOARD_PORT=3002
export NODE_ENV=production
```

## 📚 API Documentation

### Dashboard Routes
- `GET /` - Dashboard hub
- `GET /health` - Health check
- `GET /enhanced` - Enhanced dashboard
- `GET /mobile` - Mobile dashboard
- `GET /realtime` - Real-time dashboard
- `GET /classic` - Classic dashboard

### Error Responses
```json
{
  "error": "Error type",
  "message": "Human readable message",
  "timestamp": "2025-07-14T10:30:00.000Z"
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test all dashboard views
5. Submit a pull request

## 📄 License

MIT License - see the LICENSE file for details.

---

🎮 **Happy Gaming Analytics!** The dashboard provides comprehensive insights across all your connected games.
