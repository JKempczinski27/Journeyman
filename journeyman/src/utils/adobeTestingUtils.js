// src/utils/adobeTestingUtils.js
// Utilities for testing and debugging Adobe Analytics integration

class AdobeTestingUtils {
  constructor() {
    this.debugMode = process.env.NODE_ENV === 'development';
  }

  // Check if Adobe Analytics is properly loaded
  checkAdobeStatus() {
    const status = {
      scriptLoaded: !!window.s,
      configLoaded: !!window.adobeAnalyticsConfig,
      ready: !!window.s && window.s.account,
      reportSuite: window.s?.account || 'Not set',
      trackingServer: window.s?.trackingServer || 'Not set'
    };

    if (this.debugMode) {
      console.log('Adobe Analytics Status:', status);
    }

    return status;
  }

  // Test Adobe Analytics tracking
  testTracking() {
    if (!window.s) {
      console.error('Adobe Analytics not loaded');
      return false;
    }

    try {
      // Test page view
      window.s.pageName = 'test-page';
      window.s.channel = 'test';
      window.s.t();

      // Test custom event
      window.s.linkTrackVars = 'events,prop1';
      window.s.linkTrackEvents = 'event100';
      window.s.events = 'event100';
      window.s.prop1 = 'test-value';
      window.s.tl(true, 'o', 'test-event');

      console.log('Adobe Analytics test tracking sent');
      return true;
    } catch (error) {
      console.error('Adobe Analytics test failed:', error);
      return false;
    }
  }

  // Monitor Adobe Analytics calls
  monitorCalls() {
    if (!this.debugMode) return;

    const originalT = window.s?.t;
    const originalTl = window.s?.tl;

    if (originalT) {
      window.s.t = function() {
        console.log('Adobe Analytics Page View:', {
          pageName: this.pageName,
          channel: this.channel,
          events: this.events,
          timestamp: new Date().toISOString()
        });
        return originalT.apply(this, arguments);
      };
    }

    if (originalTl) {
      window.s.tl = function() {
        console.log('Adobe Analytics Event:', {
          linkName: arguments[2],
          events: this.events,
          props: this.getAllProps(),
          timestamp: new Date().toISOString()
        });
        return originalTl.apply(this, arguments);
      };
    }
  }

  // Get all current prop values
  getAllProps() {
    if (!window.s) return {};
    
    const props = {};
    for (let i = 1; i <= 75; i++) {
      const propKey = `prop${i}`;
      if (window.s[propKey]) {
        props[propKey] = window.s[propKey];
      }
    }
    return props;
  }

  // Validate Adobe Analytics setup for Journeyman
  validateJourneymanSetup() {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check if Adobe is loaded
    if (!window.s) {
      validation.valid = false;
      validation.errors.push('Adobe Analytics library not loaded');
      return validation;
    }

    // Check report suite
    if (!window.s.account || window.s.account === 'your-default-rsid') {
      validation.valid = false;
      validation.errors.push('Report suite ID not configured');
    }

    // Check tracking server
    if (!window.s.trackingServer || window.s.trackingServer.includes('your-tracking')) {
      validation.valid = false;
      validation.errors.push('Tracking server not configured');
    }

    // Check required events are mapped
    const requiredEvents = ['event1', 'event2', 'event3', 'event4', 'event5'];
    requiredEvents.forEach(event => {
      if (!window.s[event]) {
        validation.warnings.push(`Event ${event} not configured`);
      }
    });

    if (this.debugMode) {
      console.log('Adobe Analytics Validation:', validation);
    }

    return validation;
  }

  // Debug current Adobe state
  debugCurrentState() {
    if (!this.debugMode) return;

    console.group('Adobe Analytics Debug Info');
    console.log('Status:', this.checkAdobeStatus());
    console.log('Validation:', this.validateJourneymanSetup());
    console.log('Current Props:', this.getAllProps());
    console.log('Environment Variables:', {
      NODE_ENV: process.env.NODE_ENV,
      ADOBE_ENABLED: process.env.REACT_APP_ADOBE_ENABLED
    });
    console.groupEnd();
  }
}

// Create singleton instance
const adobeTesting = new AdobeTestingUtils();

// Auto-monitor in development
if (process.env.NODE_ENV === 'development') {
  // Wait for Adobe to load
  setTimeout(() => {
    adobeTesting.monitorCalls();
    adobeTesting.debugCurrentState();
  }, 2000);
}

export default adobeTesting;

// Convenience functions
export const checkAdobeStatus = () => adobeTesting.checkAdobeStatus();
export const testTracking = () => adobeTesting.testTracking();
export const validateSetup = () => adobeTesting.validateJourneymanSetup();
export const debugAdobe = () => adobeTesting.debugCurrentState();