const VaultService = require('../../services/vaultService');
const axios = require('axios');

class AdobeAnalyticsServerHelper {
  constructor() {
    this.config = null;
    this.initialized = false;
    this.requestQueue = [];
    this.processing = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      console.log('🔧 Initializing Adobe Analytics Server Helper...');

      // Try to get configuration from Vault first
      try {
        const vaultService = require('../../services/vaultService');
        this.config = await vaultService.getSecret('adobe-analytics');
        console.log('✅ Adobe Analytics config loaded from Vault');
      } catch (vaultError) {
        console.warn('⚠️ Vault unavailable, using environment variables:', vaultError.message);

        // Fallback to environment variables
        this.config = {
          edgeConfigId: process.env.ADOBE_EDGE_CONFIG_ID,
          orgId: process.env.ADOBE_ORG_ID,
          reportSuiteId: process.env.NODE_ENV === 'production'
            ? process.env.ADOBE_REPORT_SUITE_PROD
            : process.env.ADOBE_REPORT_SUITE_DEV,
          trackingServer: process.env.ADOBE_TRACKING_SERVER,
          environment: process.env.NODE_ENV || 'development'
        };

        // Validate required config
        const requiredFields = ['edgeConfigId', 'orgId', 'trackingServer'];
        const missingFields = requiredFields.filter(field => !this.config[field]);

        if (missingFields.length > 0) {
          console.error('❌ Missing Adobe Analytics configuration:', missingFields);
          this.config = null;
          return;
        }
      }

      this.initialized = true;
      console.log(`✅ Adobe Analytics initialized for ${this.config.environment} environment`);

      // Start processing queued requests
      this.processQueue();

    } catch (error) {
      console.error('❌ Failed to initialize Adobe Analytics:', error);
      this.config = null;
      this.initialized = false;
    }
  }

  async trackEvent(eventData) {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.config) {
      console.warn('⚠️ Adobe Analytics not configured, skipping event tracking');
      return { success: false, reason: 'not_configured' };
    }

    const payload = this.buildEventPayload(eventData);

    // Add to queue for batch processing
    this.requestQueue.push({
      payload,
      timestamp: new Date().toISOString(),
      eventType: eventData.eventType || 'custom'
    });

    // Process queue if not already processing
    if (!this.processing) {
      this.processQueue();
    }

    return { success: true, queued: true };
  }

  buildEventPayload(eventData) {
    const basePayload = {
      // Adobe Analytics standard fields
      reportSuiteId: this.config.reportSuiteId,
      timestamp: new Date().toISOString(),
      visitorId: eventData.sessionId || this.generateVisitorId(),

      // Page and event information
      pageName: eventData.pageName || 'journeyman-game',
      pageURL: eventData.pageURL || 'https://journeyman-game.com',
      events: eventData.events || 'event1',

      // Custom dimensions
      eVar1: eventData.playerName || '',
      eVar2: eventData.gameMode || '',
      eVar3: eventData.gameType || 'journeyman',
      eVar4: eventData.sessionId || '',
      eVar5: eventData.userAgent || '',

      // Metrics
      prop1: eventData.score?.toString() || '0',
      prop2: eventData.duration?.toString() || '0',
      prop3: eventData.correctGuesses?.toString() || '0',

      // Game-specific data
      contextData: {
        'game.name': 'journeyman',
        'game.version': '2.0.0',
        'game.mode': eventData.gameMode || 'easy',
        'game.score': eventData.score || 0,
        'game.duration': eventData.duration || 0,
        'game.correct_guesses': eventData.correctGuesses || 0,
        'game.total_guesses': eventData.totalGuesses || 0,
        'player.email': eventData.playerEmail || '',
        'session.id': eventData.sessionId || '',
        'environment': this.config.environment
      }
    };

    // Add event-specific data
    if (eventData.eventType) {
      basePayload.contextData[`event.type`] = eventData.eventType;
    }

    if (eventData.customData) {
      Object.keys(eventData.customData).forEach(key => {
        basePayload.contextData[`custom.${key}`] = eventData.customData[key];
      });
    }

    return basePayload;
  }

  async processQueue() {
    if (this.processing || this.requestQueue.length === 0) return;

    this.processing = true;

    try {
      const batchSize = Math.min(this.requestQueue.length, 10); // Process up to 10 events at once
      const batch = this.requestQueue.splice(0, batchSize);

      console.log(`📊 Processing ${batch.length} Adobe Analytics events...`);

      // Send batch request to Adobe Analytics
      const response = await this.sendBatchRequest(batch);

      if (response.success) {
        console.log(`✅ Successfully sent ${batch.length} events to Adobe Analytics`);
      } else {
        console.error('❌ Failed to send events to Adobe Analytics:', response.error);
        // Re-queue failed events (with limit to prevent infinite loops)
        if (batch.every(event => (event.retryCount || 0) < 3)) {
          batch.forEach(event => {
            event.retryCount = (event.retryCount || 0) + 1;
            this.requestQueue.push(event);
          });
        }
      }

    } catch (error) {
      console.error('❌ Error processing Adobe Analytics queue:', error);
    } finally {
      this.processing = false;

      // Continue processing if there are more items in queue
      if (this.requestQueue.length > 0) {
        setTimeout(() => this.processQueue(), 1000); // Wait 1 second before next batch
      }
    }
  }

  async sendBatchRequest(batch) {
    try {
      const url = `https://${this.config.trackingServer}/b/ss/${this.config.reportSuiteId}/0`;

      // Convert batch to Adobe Analytics format
      const requests = batch.map(item => this.formatForAdobeRequest(item.payload));

      const response = await axios.post(url, {
        requests: requests
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Journeyman-Game-Server/2.0.0'
        },
        timeout: 5000
      });

      return { success: true, response: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  formatForAdobeRequest(payload) {
    // Convert our payload format to Adobe Analytics format
    const formatted = {
      // Required Adobe Analytics fields
      c: payload.contextData,
      g: payload.pageURL,
      gn: payload.pageName,
      pe: payload.events,
      r: payload.referrer || '',
      t: new Date().toISOString(),
      v: payload.visitorId,

      // eVars
      v1: payload.eVar1,
      v2: payload.eVar2,
      v3: payload.eVar3,
      v4: payload.eVar4,
      v5: payload.eVar5,

      // props
      c1: payload.prop1,
      c2: payload.prop2,
      c3: payload.prop3
    };

    return formatted;
  }

  generateVisitorId() {
    return `journeyman_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper methods for common game events
  async trackGameStart(playerData) {
    return this.trackEvent({
      eventType: 'game_start',
      events: 'event1',
      pageName: 'game-start',
      playerName: playerData.playerName,
      playerEmail: playerData.playerEmail,
      gameMode: playerData.gameMode,
      sessionId: playerData.sessionId,
      customData: {
        challenge_mode: playerData.challengeMode || false,
        player_count: playerData.playerCount || 1
      }
    });
  }

  async trackGameComplete(gameData) {
    return this.trackEvent({
      eventType: 'game_complete',
      events: 'event2',
      pageName: 'game-complete',
      playerName: gameData.playerName,
      playerEmail: gameData.playerEmail,
      gameMode: gameData.gameMode,
      sessionId: gameData.sessionId,
      score: gameData.correctCount,
      duration: gameData.durationInSeconds,
      correctGuesses: gameData.correctCount,
      totalGuesses: gameData.guesses?.length || 0,
      customData: {
        shared_social: gameData.sharedOnSocial || false,
        completion_rate: gameData.correctCount / Math.max(gameData.guesses?.length || 1, 1)
      }
    });
  }

  async trackError(errorType, errorMessage, context = '') {
    return this.trackEvent({
      eventType: 'error',
      events: 'event3',
      pageName: 'error',
      customData: {
        error_type: errorType,
        error_message: errorMessage,
        error_context: context,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Get current queue status
  getQueueStatus() {
    return {
      queueLength: this.requestQueue.length,
      processing: this.processing,
      initialized: this.initialized,
      configured: !!this.config
    };
  }

  // Manual flush for testing
  async flush() {
    if (this.requestQueue.length > 0) {
      await this.processQueue();
    }
  }
}
module.exports = new AdobeAnalyticsServerHelper();
