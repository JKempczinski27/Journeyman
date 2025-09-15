class AdobeExperiencePlatformClient {
  constructor() {
    this.isInitialized = false;
    this.config = null;
    this.adobeDataLayer = window.adobeDataLayer || [];
    this.alloy = null;
    this.consentGiven = false;
  }

  // Initialize Adobe Experience Platform Web SDK (Alloy)
  async initialize(config = {}) {
    if (this.isInitialized) return;

    try {
      this.config = {
        edgeConfigId: config.edgeConfigId || process.env.REACT_APP_ADOBE_EDGE_CONFIG_ID,
        orgId: config.orgId || process.env.REACT_APP_ADOBE_ORG_ID,
        tenantId: config.tenantId || process.env.REACT_APP_ADOBE_TENANT_ID,
        defaultConsent: config.defaultConsent || 'pending',
        clickCollectionEnabled: config.clickCollectionEnabled !== false,
        downloadLinkQualifier: config.downloadLinkQualifier || '\\.(exe|zip|wav|mp3|mov|mpg|avi|wmv|pdf|doc|docx|xls|xlsx|ppt|pptx)$',
        onBeforeEventSend: this.onBeforeEventSend.bind(this)
      };

      // Check if AEP is enabled
      if (!process.env.REACT_APP_AEP_ENABLED || process.env.REACT_APP_AEP_ENABLED !== 'true') {
        console.log('ℹ️ Adobe Experience Platform Web SDK is disabled');
        return;
      }

      if (!this.config.edgeConfigId || !this.config.orgId) {
        console.warn('⚠️ Adobe Experience Platform Web SDK configuration missing');
        return;
      }

      // Load Adobe Experience Platform Web SDK
      await this.loadAlloySDK();

      // Configure Alloy
      await this.configureAlloy();

      this.isInitialized = true;
      console.log('✅ Adobe Experience Platform Web SDK initialized');

      // Check for existing consent
      this.checkConsentStatus();

    } catch (error) {
      console.error('❌ Failed to initialize Adobe Experience Platform Web SDK:', error);
    }
  }

  // Load Alloy SDK dynamically
  async loadAlloySDK() {
    return new Promise((resolve, reject) => {
      if (window.alloy) {
        this.alloy = window.alloy;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn1.adoberesources.net/alloy/2.19.1/alloy.min.js';
      script.async = true;
      script.onload = () => {
        this.alloy = window.alloy;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Configure Alloy instance
  async configureAlloy() {
    await this.alloy('configure', {
      datastreamId: this.config.edgeConfigId,
      orgId: this.config.orgId,
      defaultConsent: this.config.defaultConsent,
      clickCollectionEnabled: this.config.clickCollectionEnabled,
      downloadLinkQualifier: this.config.downloadLinkQualifier,
      onBeforeEventSend: this.config.onBeforeEventSend,
      debugEnabled: process.env.NODE_ENV === 'development'
    });
  }

  // Check existing consent status
  checkConsentStatus() {
    const consent = localStorage.getItem('adobe_consent');
    if (consent === 'granted') {
      this.grantConsent();
    }
  }

  // Grant consent for data collection
  async grantConsent() {
    if (!this.alloy) return;

    try {
      await this.alloy('setConsent', {
        consent: [{
          standard: 'Adobe',
          version: '2.0',
          value: {
            collect: { val: 'y' },
            metadata: { time: new Date().toISOString() }
          }
        }]
      });

      this.consentGiven = true;
      localStorage.setItem('adobe_consent', 'granted');
      console.log('✅ Adobe Experience Platform consent granted');

      // Set identity if available
      await this.setIdentity();

    } catch (error) {
      console.error('❌ Failed to grant consent:', error);
    }
  }

  // Deny consent for data collection
  async denyConsent() {
    if (!this.alloy) return;

    try {
      await this.alloy('setConsent', {
        consent: [{
          standard: 'Adobe',
          version: '2.0',
          value: {
            collect: { val: 'n' },
            metadata: { time: new Date().toISOString() }
          }
        }]
      });

      this.consentGiven = false;
      localStorage.setItem('adobe_consent', 'denied');
      console.log('ℹ️ Adobe Experience Platform consent denied');

    } catch (error) {
      console.error('❌ Failed to deny consent:', error);
    }
  }

  // Set user identity
  async setIdentity(identityData = {}) {
    if (!this.alloy || !this.consentGiven) return;

    const email = identityData.email || this.getCurrentUserEmail();
    if (!email) return;

    const identityMap = {
      email: [{
        id: email,
        authenticatedState: 'authenticated',
        primary: true
      }]
    };

    try {
      await this.alloy('sendEvent', {
        type: 'identity.set',
        xdm: {
          identityMap
        }
      });

      console.log('✅ Adobe Experience Platform identity set');
    } catch (error) {
      console.error('❌ Failed to set identity:', error);
    }
  }

  // Send Experience Event
  async sendEvent(eventData) {
    if (!this.alloy || !this.isInitialized || !this.consentGiven) {
      console.debug('⚠️ Adobe Experience Platform not ready or consent not given');
      return;
    }

    try {
      const xdmData = this.buildClientXDMEvent(eventData);

      const result = await this.alloy('sendEvent', {
        type: eventData.eventType || 'web.webinteraction.linkClicks',
        xdm: xdmData,
        data: eventData.customData || {}
      });

      console.log('✅ Experience Event sent:', result);
      return result;

    } catch (error) {
      console.error('❌ Failed to send Experience Event:', error);
      throw error;
    }
  }

  // Build XDM event for client-side
  buildClientXDMEvent(eventData) {
    const timestamp = new Date().toISOString();

    return {
      timestamp,
      eventType: eventData.eventType || 'web.webinteraction.linkClicks',

      web: {
        webPageDetails: {
          name: eventData.pageName || document.title,
          URL: window.location.href,
          server: window.location.hostname
        },
        webReferrer: {
          URL: document.referrer
        }
      },

      device: {
        type: this.getDeviceType(),
        screenHeight: screen.height,
        screenWidth: screen.width
      },

      environment: {
        type: 'browser',
        browserDetails: {
          name: this.getBrowserName(),
          version: this.getBrowserVersion(),
          userAgent: navigator.userAgent
        }
      },

      // Custom game data
      [`_${this.config.tenantId || 'tenant'}`]: {
        journeymanGame: {
          gameSession: {
            sessionId: eventData.sessionId,
            gameType: eventData.gameType,
            gameMode: eventData.gameMode,
            playerName: eventData.playerName,
            score: eventData.score,
            duration: eventData.duration,
            completed: eventData.completed
          },
          interaction: {
            action: eventData.action,
            value: eventData.value,
            timestamp: timestamp
          }
        }
      }
    };
  }

  // Track game-specific events
  async trackGameStart(gameData) {
    return this.sendEvent({
      eventType: 'game.start',
      pageName: 'game-start',
      sessionId: gameData.sessionId,
      gameType: gameData.gameType,
      gameMode: gameData.gameMode,
      playerName: gameData.playerName,
      action: 'game_start'
    });
  }

  async trackGameComplete(gameData) {
    return this.sendEvent({
      eventType: 'game.complete',
      pageName: 'game-complete',
      sessionId: gameData.sessionId,
      gameType: gameData.gameType,
      gameMode: gameData.gameMode,
      playerName: gameData.playerName,
      score: gameData.score,
      duration: gameData.duration,
      completed: true,
      action: 'game_complete'
    });
  }

  async trackGuess(guessData) {
    return this.sendEvent({
      eventType: 'game.interaction',
      pageName: 'game-play',
      sessionId: guessData.sessionId,
      playerName: guessData.playerName,
      action: guessData.isCorrect ? 'correct_guess' : 'incorrect_guess',
      value: guessData.guess,
      customData: {
        currentPlayer: guessData.currentPlayer,
        guessNumber: guessData.guessNumber
      }
    });
  }

  // Event preprocessing
  onBeforeEventSend(event) {
    // Add common data to all events
    event.xdm.timestamp = new Date().toISOString();
    event.xdm.implementationDetails = {
      name: 'journeyman-game',
      version: '1.0.0',
      environment: process.env.NODE_ENV
    };

    // Privacy and data governance
    if (!this.consentGiven) {
      console.warn('⚠️ Event blocked - no consent given');
      return false; // Block the event
    }

    return event;
  }

  // Utility functions
  getDeviceType() {
    const userAgent = navigator.userAgent;
    if (/tablet|ipad/i.test(userAgent)) return 'tablet';
    if (/mobile|iphone|android/i.test(userAgent)) return 'mobile';
    return 'desktop';
  }

  getBrowserName() {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  getBrowserVersion() {
    const userAgent = navigator.userAgent;
    const match = userAgent.match(/(?:Chrome|Firefox|Safari|Edge)\/(\d+\.\d+)/);
    return match ? match[1] : 'Unknown';
  }

  getCurrentUserEmail() {
    // Get from session storage or global state
    return sessionStorage.getItem('playerEmail') || localStorage.getItem('playerEmail') || '';
  }

  // Get initialization status
  getStatus() {
    return {
      initialized: this.isInitialized,
      alloyLoaded: !!this.alloy,
      consentGiven: this.consentGiven,
      config: this.config ? { ...this.config, orgId: '***' } : null // Hide sensitive data
    };
  }
}

// Create singleton instance
const aepClient = new AdobeExperiencePlatformClient();

// Export for use in React app
export default aepClient;

// Convenience functions
export const initializeAEP = (config) => aepClient.initialize(config);
export const grantAEPConsent = () => aepClient.grantConsent();
export const denyAEPConsent = () => aepClient.denyConsent();
export const trackGameStart = (gameData) => aepClient.trackGameStart(gameData);
export const trackGameComplete = (gameData) => aepClient.trackGameComplete(gameData);
export const trackGuess = (guessData) => aepClient.trackGuess(guessData);
export const sendAEPEvent = (eventData) => aepClient.sendEvent(eventData);
export const getAEPStatus = () => aepClient.getStatus();
