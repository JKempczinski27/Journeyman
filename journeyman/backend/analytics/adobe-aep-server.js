const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class AdobeExperiencePlatformServer {
  constructor() {
    this.config = null;
    this.initialized = false;
    this.eventQueue = [];
    this.processing = false;
    this.maxBatchSize = 100;
    this.flushInterval = 30000; // 30 seconds
    this.accessToken = null;
    this.tokenExpiresAt = null;
  }

  async init() {
    if (this.initialized) return;

    try {
      logger.info('🔧 Initializing Adobe Experience Platform Server...');

      // Get configuration from environment variables
      this.config = {
        // Adobe Experience Platform Configuration
        aepConfig: {
          edgeConfigId: process.env.ADOBE_EDGE_CONFIG_ID,
          orgId: process.env.ADOBE_ORG_ID,
          datasetId: process.env.ADOBE_DATASET_ID,
          tenantId: process.env.ADOBE_TENANT_ID,
          environment: process.env.NODE_ENV || 'development'
        },

        // Authentication
        auth: {
          clientId: process.env.ADOBE_CLIENT_ID,
          clientSecret: process.env.ADOBE_CLIENT_SECRET,
          technicalAccountId: process.env.ADOBE_TECHNICAL_ACCOUNT_ID,
          privateKey: process.env.ADOBE_PRIVATE_KEY,
          metascopes: ['https://ims-na1.adobelogin.com/s/ent_dataservices_sdk']
        },

        // Edge Network Configuration
        edge: {
          endpoint: process.env.ADOBE_EDGE_ENDPOINT || 'https://edge.adobedc.net',
          version: 'v1'
        },

        // Schema Configuration
        schema: {
          experienceEventSchema: process.env.ADOBE_XDM_SCHEMA || 'https://ns.adobe.com/yourorg/schemas/journeyman-experience-event',
          profileSchema: process.env.ADOBE_PROFILE_SCHEMA || 'https://ns.adobe.com/yourorg/schemas/journeyman-profile'
        }
      };

      // Validate required configuration
      const requiredFields = [
        'aepConfig.edgeConfigId',
        'aepConfig.orgId',
        'aepConfig.datasetId',
        'auth.clientId',
        'auth.clientSecret'
      ];

      const missingFields = requiredFields.filter(field => !this.getNestedValue(this.config, field));

      if (missingFields.length > 0) {
        logger.warn('⚠️ Missing AEP configuration, running without Adobe Experience Platform:', missingFields);
        this.config = null;
        return;
      }

      // Get JWT token for authentication
      await this.getAccessToken();

      this.initialized = true;
      logger.info(`✅ Adobe Experience Platform initialized for ${this.config.aepConfig.environment}`);

      // Start batch processing
      this.startBatchProcessor();

    } catch (error) {
      logger.error('❌ Failed to initialize Adobe Experience Platform:', error);
      this.config = null;
      this.initialized = false;
    }
  }

  // Generate JWT token for Adobe I/O authentication
  async getAccessToken() {
    try {
      // Check if token is still valid
      if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
        return this.accessToken;
      }

      const jwt = require('jsonwebtoken');

      const jwtPayload = {
        exp: Math.round(87000 + Date.now() / 1000),
        iss: this.config.auth.technicalAccountId,
        sub: this.config.auth.technicalAccountId,
        aud: `https://ims-na1.adobelogin.com/c/${this.config.auth.clientId}`,
        'https://ims-na1.adobelogin.com/s/ent_dataservices_sdk': true
      };

      const token = jwt.sign(jwtPayload, this.config.auth.privateKey, { algorithm: 'RS256' });

      const response = await axios.post('https://ims-na1.adobelogin.com/ims/exchange/jwt',
        new URLSearchParams({
          client_id: this.config.auth.clientId,
          client_secret: this.config.auth.clientSecret,
          jwt_token: token
        }), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 60000; // Refresh 1 min early

      logger.info('✅ Adobe I/O access token obtained');
      return this.accessToken;

    } catch (error) {
      logger.error('❌ Failed to get Adobe I/O access token:', error);
      throw error;
    }
  }

  // Send Experience Event to Adobe Experience Platform
  async sendExperienceEvent(eventData) {
    if (!this.initialized || !this.config) {
      logger.debug('⚠️ Adobe Experience Platform not configured, skipping event');
      return { success: false, reason: 'not_configured' };
    }

    try {
      const xdmEvent = this.buildXDMEvent(eventData);

      // Add to batch queue
      this.eventQueue.push({
        event: xdmEvent,
        timestamp: new Date().toISOString(),
        retryCount: 0
      });

      // Process immediately if queue is full
      if (this.eventQueue.length >= this.maxBatchSize) {
        await this.processBatch();
      }

      return { success: true, queued: true, queueSize: this.eventQueue.length };

    } catch (error) {
      logger.error('❌ Error queueing AEP event:', error);
      return { success: false, error: error.message };
    }
  }

  // Build XDM (Experience Data Model) compliant event
  buildXDMEvent(eventData) {
    const timestamp = new Date().toISOString();
    const eventId = this.generateEventId();

    return {
      header: {
        msgType: 'xdmEntityCreate',
        msgId: eventId,
        msgVersion: '1.0',
        xactionId: eventData.sessionId || eventId,
        datasetId: this.config.aepConfig.datasetId,
        source: {
          name: 'journeyman-game'
        }
      },
      body: {
        xdmMeta: {
          schemaRef: {
            id: this.config.schema.experienceEventSchema,
            contentType: 'application/vnd.adobe.xed+json; version=1.0'
          }
        },
        xdmEntity: {
          // Standard XDM ExperienceEvent fields
          '_id': eventId,
          'timestamp': timestamp,
          'eventType': eventData.eventType || 'game.interaction',

          // Identity Map
          'identityMap': {
            ...(eventData.playerEmail && {
              'email': [{
                'id': eventData.playerEmail,
                'authenticatedState': 'authenticated',
                'primary': true
              }]
            }),
            'ecid': [{
              'id': eventData.ecid || this.generateECID(),
              'authenticatedState': 'ambiguous',
              'primary': false
            }]
          },

          // Web Information
          'web': {
            'webPageDetails': {
              'name': eventData.pageName || 'journeyman-game',
              'URL': eventData.pageURL || 'https://journeyman-game.com',
              'server': process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost'
            },
            'webReferrer': {
              'URL': eventData.referrer || ''
            }
          },

          // Device Information
          'device': {
            'type': eventData.deviceType || 'desktop',
            'manufacturer': eventData.deviceManufacturer || 'unknown',
            'model': eventData.deviceModel || 'unknown'
          },

          // Environment
          'environment': {
            'type': 'browser',
            'browserDetails': {
              'name': eventData.browserName || 'unknown',
              'version': eventData.browserVersion || 'unknown',
              'userAgent': eventData.userAgent || ''
            }
          },

          // Commerce (for game completion events)
          ...(eventData.eventType === 'game.complete' && {
            'commerce': {
              'order': {
                'purchaseID': eventData.sessionId,
                'orderType': 'game_completion'
              }
            }
          }),

          // Custom Journeyman Game Fields
          [`_${this.config.aepConfig.tenantId}`]: {
            'journeymanGame': {
              'gameSession': {
                'sessionId': eventData.sessionId,
                'gameType': eventData.gameType || 'journeyman',
                'gameMode': eventData.gameMode || 'easy',
                'playerName': eventData.playerName,
                'playerEmail': eventData.playerEmail,
                'startTime': eventData.startTime,
                'endTime': eventData.endTime,
                'duration': eventData.duration || 0,
                'score': eventData.score || 0,
                'correctGuesses': eventData.correctGuesses || 0,
                'totalGuesses': eventData.totalGuesses || 0,
                'completed': eventData.completed || false,
                'sharedOnSocial': eventData.sharedOnSocial || false
              },
              'gameplay': {
                'currentPlayer': eventData.currentPlayer,
                'guess': eventData.guess,
                'isCorrect': eventData.isCorrect,
                'guessNumber': eventData.guessNumber || 1,
                'hintsUsed': eventData.hintsUsed || 0,
                'timeToGuess': eventData.timeToGuess || 0
              },
              'engagement': {
                'timeOnPage': eventData.timeOnPage || 0,
                'clickCount': eventData.clickCount || 0,
                'scrollDepth': eventData.scrollDepth || 0,
                'exitIntent': eventData.exitIntent || false
              }
            }
          }
        }
      }
    };
  }

  // Process batch of events
  async processBatch() {
    if (this.processing || this.eventQueue.length === 0) return;

    this.processing = true;
    const batchSize = Math.min(this.eventQueue.length, this.maxBatchSize);
    const batch = this.eventQueue.splice(0, batchSize);

    try {
      logger.info(`📊 Processing ${batch.length} AEP events...`);

      // Send to Adobe Edge Network
      const response = await this.sendToEdgeNetwork(batch);

      if (response.success) {
        logger.info(`✅ Successfully sent ${batch.length} events to Adobe Experience Platform`);
      } else {
        logger.error('❌ Failed to send events to AEP:', response.error);
        // Re-queue failed events with retry limit
        batch.forEach(event => {
          if (event.retryCount < 3) {
            event.retryCount++;
            this.eventQueue.push(event);
          } else {
            logger.error('❌ Event dropped after max retries:', event.event.body.xdmEntity._id);
          }
        });
      }

    } catch (error) {
      logger.error('❌ Error processing AEP batch:', error);
      // Re-queue events on error
      batch.forEach(event => {
        if (event.retryCount < 3) {
          event.retryCount++;
          this.eventQueue.push(event);
        }
      });
    } finally {
      this.processing = false;

      // Continue processing if more events in queue
      if (this.eventQueue.length > 0) {
        setTimeout(() => this.processBatch(), 2000);
      }
    }
  }

  // Send batch to Adobe Edge Network
  async sendToEdgeNetwork(batch) {
    try {
      // Ensure we have a valid access token
      await this.getAccessToken();

      const url = `${this.config.edge.endpoint}/${this.config.edge.version}/interact`;

      const payload = {
        'meta': {
          'configId': this.config.aepConfig.edgeConfigId,
          'orgId': this.config.aepConfig.orgId,
          'requestId': this.generateRequestId(),
          'state': {
            'domain': process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost',
            'cookiesEnabled': true
          }
        },
        'events': batch.map(item => ({
          'xdm': item.event.body.xdmEntity,
          'timestamp': item.event.body.xdmEntity.timestamp
        }))
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
          'X-Adobe-Edge-Request-Id': this.generateRequestId()
        },
        timeout: 30000
      });

      return { success: true, response: response.data };

    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired, refresh and retry once
        try {
          this.accessToken = null;
          this.tokenExpiresAt = null;
          await this.getAccessToken();
          return this.sendToEdgeNetwork(batch);
        } catch (retryError) {
          logger.error('❌ Failed to refresh token and retry:', retryError);
          return { success: false, error: retryError.message, status: 401 };
        }
      }

      return { success: false, error: error.message, status: error.response?.status };
    }
  }

  // Start automatic batch processor
  startBatchProcessor() {
    setInterval(async () => {
      if (this.eventQueue.length > 0 && !this.processing) {
        await this.processBatch();
      }
    }, this.flushInterval);
  }

  // Helper methods for Journeyman game events
  async trackGameStart(playerData) {
    return this.sendExperienceEvent({
      eventType: 'game.start',
      playerName: playerData.playerName,
      playerEmail: playerData.playerEmail,
      gameMode: playerData.gameMode,
      sessionId: playerData.sessionId,
      startTime: new Date().toISOString(),
      pageName: 'game-start'
    });
  }

  async trackGameComplete(gameData) {
    return this.sendExperienceEvent({
      eventType: 'game.complete',
      playerName: gameData.playerName,
      playerEmail: gameData.playerEmail,
      gameMode: gameData.gameMode,
      sessionId: gameData.sessionId,
      startTime: gameData.startTime,
      endTime: new Date().toISOString(),
      duration: gameData.durationInSeconds,
      score: gameData.correctCount,
      correctGuesses: gameData.correctCount,
      totalGuesses: gameData.guesses?.length || 0,
      completed: true,
      sharedOnSocial: gameData.sharedOnSocial || false,
      pageName: 'game-complete'
    });
  }

  async trackGuess(guessData) {
    return this.sendExperienceEvent({
      eventType: 'game.guess',
      playerName: guessData.playerName,
      playerEmail: guessData.playerEmail,
      sessionId: guessData.sessionId,
      currentPlayer: guessData.currentPlayer,
      guess: guessData.guess,
      isCorrect: guessData.isCorrect,
      guessNumber: guessData.guessNumber,
      timeToGuess: guessData.timeToGuess,
      pageName: 'game-play'
    });
  }

  // Utility functions
  generateEventId() {
    return `journeyman_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  generateRequestId() {
    return crypto.randomUUID();
  }

  generateECID() {
    return `${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // Get current status
  getStatus() {
    return {
      initialized: this.initialized,
      configured: !!this.config,
      queueLength: this.eventQueue.length,
      processing: this.processing,
      environment: this.config?.aepConfig?.environment,
      hasValidToken: !!(this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt)
    };
  }

  // Manual flush for testing
  async flush() {
    if (this.eventQueue.length > 0) {
      await this.processBatch();
    }
  }

  // Graceful shutdown
  async shutdown() {
    logger.info('🔄 Shutting down Adobe Experience Platform...');
    await this.flush();
    this.initialized = false;
  }
}

module.exports = new AdobeExperiencePlatformServer();
