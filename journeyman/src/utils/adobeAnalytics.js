// src/utils/adobeAnalytics.js
// Adobe Analytics utility functions for Journeyman game

class AdobeAnalytics {
  constructor() {
    this.isInitialized = false;
    this.dataLayer = window.dataLayer || [];
    this.s = window.s || null; // Adobe Analytics object
  }

  // Initialize Adobe Analytics
  initialize(reportSuiteId, trackingServer) {
    try {
      if (typeof window !== 'undefined' && !this.isInitialized) {
        // Load Adobe Analytics library if not already loaded
        if (!window.s) {
          this.loadAdobeScript(reportSuiteId, trackingServer);
        }
        
        this.isInitialized = true;
        console.log('Adobe Analytics initialized for Journeyman');
      }
    } catch (error) {
      console.error('Failed to initialize Adobe Analytics:', error);
    }
  }

  // Load Adobe Analytics script
  loadAdobeScript(reportSuiteId, trackingServer) {
    const script = document.createElement('script');
    script.src = '/path/to/adobe-analytics.js'; // Replace with your Adobe Analytics library path
    script.async = true;
    script.onload = () => {
      if (window.s) {
        this.s = window.s;
        this.configureAnalytics(reportSuiteId, trackingServer);
      }
    };
    document.head.appendChild(script);
  }

  // Configure Adobe Analytics settings
  configureAnalytics(reportSuiteId, trackingServer) {
    if (this.s) {
      this.s.account = reportSuiteId;
      this.s.trackingServer = trackingServer;
      this.s.trackingServerSecure = trackingServer;
      this.s.visitorNamespace = "journeyman";
      this.s.cookieDomainPeriods = "2";
      this.s.charSet = "UTF-8";
      this.s.currencyCode = "USD";
      this.s.trackInlineStats = true;
      this.s.linkLeaveQueryString = false;
      this.s.linkInternalFilters = "javascript:,journeyman.com";
      this.s.linkExternalFilters = "";
      this.s.linkTrackVars = "None";
      this.s.linkTrackEvents = "None";
      this.s.usePlugins = true;
    }
  }

  // Track page views
  trackPageView(pageName, section = 'journeyman') {
    try {
      if (this.s) {
        // Clear previous page variables
        this.s.clearVars();
        
        // Set page tracking variables
        this.s.pageName = pageName;
        this.s.channel = section;
        this.s.server = window.location.hostname;
        this.s.hier1 = `${section}|${pageName}`;
        
        // Send the page view
        this.s.t();
        console.log(`Adobe Analytics: Page view tracked - ${pageName}`);
      }
    } catch (error) {
      console.error('Failed to track page view:', error);
    }
  }

  // Track custom events
  trackEvent(eventName, eventData = {}) {
    try {
      if (this.s) {
        // Map common events to Adobe Analytics events
        const eventMappings = {
          'game_start': 'event1',
          'game_complete': 'event2',
          'guess_submitted': 'event3',
          'correct_guess': 'event4',
          'wrong_guess': 'event5',
          'game_quit': 'event6',
          'mode_selected': 'event7',
          'social_share': 'event8',
          'player_registration': 'event9',
          'next_player': 'event10'
        };

        const adobeEvent = eventMappings[eventName] || 'event100';
        
        // Set event variables
        this.s.linkTrackVars = 'events,prop1,prop2,prop3,prop4,prop5,eVar1,eVar2,eVar3,eVar4,eVar5';
        this.s.linkTrackEvents = adobeEvent;
        this.s.events = adobeEvent;
        
        // Set custom properties and eVars based on event data
        if (eventData.playerName) this.s.prop1 = eventData.playerName;
        if (eventData.gameMode) this.s.prop2 = eventData.gameMode;
        if (eventData.currentPlayer) this.s.prop3 = eventData.currentPlayer;
        if (eventData.score) this.s.prop4 = eventData.score.toString();
        if (eventData.duration) this.s.prop5 = eventData.duration.toString();
        
        // Set eVars for conversion tracking
        if (eventData.playerEmail) this.s.eVar1 = eventData.playerEmail;
        if (eventData.gameMode) this.s.eVar2 = eventData.gameMode;
        if (eventData.sessionId) this.s.eVar3 = eventData.sessionId;
        if (eventData.difficulty) this.s.eVar4 = eventData.difficulty;
        if (eventData.device) this.s.eVar5 = eventData.device;
        
        // Send the event
        this.s.tl(true, 'o', eventName);
        console.log(`Adobe Analytics: Event tracked - ${eventName}`, eventData);
      }
    } catch (error) {
      console.error('Failed to track event:', error);
    }
  }

  // Track game-specific metrics
  trackGameStart(playerData, gameMode) {
    this.trackEvent('game_start', {
      playerName: playerData.name,
      playerEmail: playerData.email,
      gameMode: gameMode,
      timestamp: new Date().toISOString(),
      device: this.getDeviceType(),
      sessionId: this.generateSessionId()
    });
  }

  trackGameComplete(gameData) {
    this.trackEvent('game_complete', {
      playerName: gameData.playerName,
      playerEmail: gameData.playerEmail,
      gameMode: gameData.mode,
      score: gameData.correctCount,
      duration: gameData.durationInSeconds,
      totalGuesses: gameData.guesses.length,
      completed: true,
      sharedOnSocial: gameData.sharedOnSocial,
      device: this.getDeviceType()
    });
  }

  trackGuess(playerName, guess, isCorrect, currentPlayer, gameMode) {
    const eventName = isCorrect ? 'correct_guess' : 'wrong_guess';
    this.trackEvent(eventName, {
      playerName: playerName,
      guess: guess,
      currentPlayer: currentPlayer,
      gameMode: gameMode,
      isCorrect: isCorrect,
      device: this.getDeviceType()
    });
  }

  trackModeSelection(playerName, selectedMode) {
    this.trackEvent('mode_selected', {
      playerName: playerName,
      gameMode: selectedMode,
      device: this.getDeviceType()
    });
  }

  trackSocialShare(platform, playerName, gameMode) {
    this.trackEvent('social_share', {
      platform: platform,
      playerName: playerName,
      gameMode: gameMode,
      device: this.getDeviceType()
    });
  }

  trackPlayerRegistration(playerData) {
    this.trackEvent('player_registration', {
      playerName: playerData.name,
      playerEmail: playerData.email,
      device: this.getDeviceType(),
      timestamp: new Date().toISOString()
    });
  }

  trackGameQuit(playerName, gameMode, reason = 'user_quit') {
    this.trackEvent('game_quit', {
      playerName: playerName,
      gameMode: gameMode,
      reason: reason,
      device: this.getDeviceType()
    });
  }

  // Utility functions
  getDeviceType() {
    const userAgent = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
      return 'tablet';
    }
    if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
      return 'mobile';
    }
    return 'desktop';
  }

  generateSessionId() {
    return 'journeyman_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Set custom dimensions for detailed analysis
  setCustomDimensions(dimensions) {
    try {
      if (this.s && dimensions) {
        Object.keys(dimensions).forEach((key, index) => {
          const propIndex = index + 10; // Start from prop10 to avoid conflicts
          const eVarIndex = index + 10; // Start from eVar10 to avoid conflicts
          
          if (propIndex <= 75 && this.s[`prop${propIndex}`] !== undefined) {
            this.s[`prop${propIndex}`] = dimensions[key];
          }
          if (eVarIndex <= 250 && this.s[`eVar${eVarIndex}`] !== undefined) {
            this.s[`eVar${eVarIndex}`] = dimensions[key];
          }
        });
      }
    } catch (error) {
      console.error('Failed to set custom dimensions:', error);
    }
  }

  // Track user engagement metrics
  trackEngagement(engagementData) {
    this.trackEvent('user_engagement', {
      timeOnPage: engagementData.timeOnPage,
      scrollDepth: engagementData.scrollDepth,
      clickCount: engagementData.clickCount,
      device: this.getDeviceType()
    });
  }

  // Track errors
  trackError(errorType, errorMessage, page) {
    this.trackEvent('error_occurred', {
      errorType: errorType,
      errorMessage: errorMessage,
      page: page,
      device: this.getDeviceType(),
      timestamp: new Date().toISOString()
    });
  }
}

// Create singleton instance
const adobeAnalytics = new AdobeAnalytics();

// Export the instance and utility functions
export default adobeAnalytics;

// Convenience functions for easy import
export const trackPageView = (pageName, section) => adobeAnalytics.trackPageView(pageName, section);
export const trackEvent = (eventName, eventData) => adobeAnalytics.trackEvent(eventName, eventData);
export const trackGameStart = (playerData, gameMode) => adobeAnalytics.trackGameStart(playerData, gameMode);
export const trackGameComplete = (gameData) => adobeAnalytics.trackGameComplete(gameData);
export const trackGuess = (playerName, guess, isCorrect, currentPlayer, gameMode) => 
  adobeAnalytics.trackGuess(playerName, guess, isCorrect, currentPlayer, gameMode);
export const trackModeSelection = (playerName, selectedMode) => 
  adobeAnalytics.trackModeSelection(playerName, selectedMode);
export const trackSocialShare = (platform, playerName, gameMode) => 
  adobeAnalytics.trackSocialShare(platform, playerName, gameMode);
export const initializeAnalytics = (reportSuiteId, trackingServer) => 
  adobeAnalytics.initialize(reportSuiteId, trackingServer);