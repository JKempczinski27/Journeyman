/**
 * WebSocket Service with Redis Adapter
 * Enables real-time updates across multiple server instances
 */

const socketIO = require('socket.io');
const redisAdapter = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const { getMetricsCollector } = require('../middleware/monitoring');

class WebSocketService {
  constructor() {
    this.io = null;
    this.pubClient = null;
    this.subClient = null;
    this.connectedClients = new Map();
    this.rooms = new Map();
  }

  /**
   * Initialize WebSocket server with Redis adapter
   */
  async initialize(httpServer, options = {}) {
    const {
      cors = {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true
      },
      transports = ['websocket', 'polling'],
      pingTimeout = 60000,
      pingInterval = 25000
    } = options;

    // Create Socket.IO server
    this.io = socketIO(httpServer, {
      cors,
      transports,
      pingTimeout,
      pingInterval,
      maxHttpBufferSize: 1e6, // 1MB
      connectTimeout: 45000
    });

    // Setup Redis adapter for horizontal scaling
    if (process.env.REDIS_HOST) {
      try {
        const redisConfig = {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_PUBSUB_DB || '3')
        };

        this.pubClient = new Redis(redisConfig);
        this.subClient = this.pubClient.duplicate();

        this.io.adapter(redisAdapter(this.pubClient, this.subClient));

        console.log('✓ WebSocket Redis adapter initialized');
      } catch (error) {
        console.error('WebSocket Redis adapter error:', error.message);
        console.log('⚠ Running WebSocket without Redis adapter (single instance only)');
      }
    }

    // Setup event handlers
    this.setupEventHandlers();

    console.log('✓ WebSocket service initialized');

    return this.io;
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    const metrics = getMetricsCollector();

    this.io.on('connection', (socket) => {
      const clientId = socket.id;
      const clientInfo = {
        id: clientId,
        connectedAt: Date.now(),
        rooms: new Set(),
        ip: socket.handshake.address
      };

      this.connectedClients.set(clientId, clientInfo);
      metrics.wsConnections.set(this.connectedClients.size);

      console.log(`WebSocket connected: ${clientId} (${this.connectedClients.size} total)`);

      // Authentication
      socket.on('authenticate', (data) => {
        this.handleAuthentication(socket, data);
      });

      // Join room
      socket.on('join', (room) => {
        this.handleJoinRoom(socket, room);
      });

      // Leave room
      socket.on('leave', (room) => {
        this.handleLeaveRoom(socket, room);
      });

      // Game updates
      socket.on('game:update', (data) => {
        metrics.wsMessagesTotal.inc({ direction: 'inbound' });
        this.handleGameUpdate(socket, data);
      });

      // Live scores subscription
      socket.on('scores:subscribe', (data) => {
        this.handleScoresSubscribe(socket, data);
      });

      // Leaderboard subscription
      socket.on('leaderboard:subscribe', (gameType) => {
        this.handleLeaderboardSubscribe(socket, gameType);
      });

      // Disconnect
      socket.on('disconnect', (reason) => {
        this.handleDisconnect(socket, reason);
        metrics.wsConnections.set(this.connectedClients.size);
      });

      // Error handling
      socket.on('error', (error) => {
        console.error(`WebSocket error for ${clientId}:`, error.message);
      });

      // Send welcome message
      socket.emit('connected', {
        clientId,
        serverTime: Date.now(),
        message: 'Connected to Journeyman live updates'
      });
    });

    // Handle adapter errors
    if (this.io.adapter) {
      this.io.of('/').adapter.on('error', (error) => {
        console.error('Redis adapter error:', error.message);
      });
    }
  }

  /**
   * Handle authentication
   */
  handleAuthentication(socket, data) {
    const { token, userId } = data;

    // Verify token (implement your auth logic)
    // For now, simple validation
    if (!token || !userId) {
      socket.emit('auth:error', { message: 'Invalid credentials' });
      return;
    }

    const clientInfo = this.connectedClients.get(socket.id);
    if (clientInfo) {
      clientInfo.userId = userId;
      clientInfo.authenticated = true;
      this.connectedClients.set(socket.id, clientInfo);
    }

    socket.emit('auth:success', { userId });
    console.log(`WebSocket authenticated: ${socket.id} as user ${userId}`);
  }

  /**
   * Handle join room
   */
  handleJoinRoom(socket, room) {
    socket.join(room);

    const clientInfo = this.connectedClients.get(socket.id);
    if (clientInfo) {
      clientInfo.rooms.add(room);
    }

    // Track room members
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room).add(socket.id);

    socket.emit('room:joined', { room });
    console.log(`Client ${socket.id} joined room: ${room}`);
  }

  /**
   * Handle leave room
   */
  handleLeaveRoom(socket, room) {
    socket.leave(room);

    const clientInfo = this.connectedClients.get(socket.id);
    if (clientInfo) {
      clientInfo.rooms.delete(room);
    }

    // Update room tracking
    if (this.rooms.has(room)) {
      this.rooms.get(room).delete(socket.id);
      if (this.rooms.get(room).size === 0) {
        this.rooms.delete(room);
      }
    }

    socket.emit('room:left', { room });
    console.log(`Client ${socket.id} left room: ${room}`);
  }

  /**
   * Handle game update
   */
  handleGameUpdate(socket, data) {
    const clientInfo = this.connectedClients.get(socket.id);

    if (!clientInfo || !clientInfo.authenticated) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    // Broadcast update to relevant rooms
    const { gameType, update } = data;
    const room = `game:${gameType}`;

    this.broadcastToRoom(room, 'game:updated', {
      gameType,
      update,
      timestamp: Date.now()
    });
  }

  /**
   * Handle scores subscription
   */
  handleScoresSubscribe(socket, data) {
    const { gameType } = data;
    const room = `scores:${gameType}`;

    this.handleJoinRoom(socket, room);

    socket.emit('scores:subscribed', { gameType });
  }

  /**
   * Handle leaderboard subscription
   */
  handleLeaderboardSubscribe(socket, gameType) {
    const room = `leaderboard:${gameType}`;

    this.handleJoinRoom(socket, room);

    socket.emit('leaderboard:subscribed', { gameType });
  }

  /**
   * Handle disconnect
   */
  handleDisconnect(socket, reason) {
    const clientInfo = this.connectedClients.get(socket.id);

    if (clientInfo) {
      // Clean up rooms
      clientInfo.rooms.forEach(room => {
        if (this.rooms.has(room)) {
          this.rooms.get(room).delete(socket.id);
          if (this.rooms.get(room).size === 0) {
            this.rooms.delete(room);
          }
        }
      });

      this.connectedClients.delete(socket.id);
    }

    console.log(`WebSocket disconnected: ${socket.id} (${reason})`);
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event, data) {
    const metrics = getMetricsCollector();
    this.io.emit(event, data);
    metrics.wsMessagesTotal.inc({ direction: 'outbound' });
  }

  /**
   * Broadcast to specific room
   */
  broadcastToRoom(room, event, data) {
    const metrics = getMetricsCollector();
    this.io.to(room).emit(event, data);
    metrics.wsMessagesTotal.inc({ direction: 'outbound' });
  }

  /**
   * Send to specific client
   */
  sendToClient(clientId, event, data) {
    const metrics = getMetricsCollector();
    this.io.to(clientId).emit(event, data);
    metrics.wsMessagesTotal.inc({ direction: 'outbound' });
  }

  /**
   * Broadcast live score update
   */
  broadcastScoreUpdate(gameType, scoreData) {
    this.broadcastToRoom(`scores:${gameType}`, 'score:update', {
      gameType,
      ...scoreData,
      timestamp: Date.now()
    });
  }

  /**
   * Broadcast leaderboard update
   */
  broadcastLeaderboardUpdate(gameType, leaderboardData) {
    this.broadcastToRoom(`leaderboard:${gameType}`, 'leaderboard:update', {
      gameType,
      leaderboard: leaderboardData,
      timestamp: Date.now()
    });
  }

  /**
   * Broadcast game event
   */
  broadcastGameEvent(gameType, eventType, eventData) {
    this.broadcastToRoom(`game:${gameType}`, 'game:event', {
      gameType,
      eventType,
      data: eventData,
      timestamp: Date.now()
    });
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      totalConnections: this.connectedClients.size,
      totalRooms: this.rooms.size,
      rooms: Array.from(this.rooms.entries()).map(([name, members]) => ({
        name,
        members: members.size
      })),
      authenticated: Array.from(this.connectedClients.values())
        .filter(c => c.authenticated).length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get room members
   */
  getRoomMembers(room) {
    return Array.from(this.rooms.get(room) || []);
  }

  /**
   * Disconnect client
   */
  disconnectClient(clientId, reason = 'Server initiated disconnect') {
    const socket = this.io.sockets.sockets.get(clientId);
    if (socket) {
      socket.disconnect(true);
      console.log(`Disconnected client ${clientId}: ${reason}`);
    }
  }

  /**
   * Close WebSocket service
   */
  async close() {
    if (this.io) {
      this.io.close();
    }

    if (this.pubClient) {
      await this.pubClient.quit();
    }

    if (this.subClient) {
      await this.subClient.quit();
    }

    console.log('✓ WebSocket service closed');
  }
}

// Singleton instance
let wsServiceInstance = null;

function getWebSocketService() {
  if (!wsServiceInstance) {
    wsServiceInstance = new WebSocketService();
  }
  return wsServiceInstance;
}

module.exports = {
  WebSocketService,
  getWebSocketService
};
