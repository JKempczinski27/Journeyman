// public/adobe-analytics-loader.js
// Place this file in your public/ directory

(function() {
  'use strict';
  
  // Adobe Analytics loader for Journeyman game
  window.adobeAnalyticsConfig = {
    loaded: false,
    loading: false
  };

  function loadAdobeAnalytics() {
    if (window.adobeAnalyticsConfig.loading || window.adobeAnalyticsConfig.loaded) {
      return;
    }
    
    window.adobeAnalyticsConfig.loading = true;
    
    // Create script element for Adobe Analytics
    var script = document.createElement('script');
    script.async = true;
    
    // Replace with your actual Adobe Analytics library URL
    script.src = 'https://assets.adobedtm.com/your-property-id/your-environment.min.js';
    
    script.onload = function() {
      window.adobeAnalyticsConfig.loaded = true;
      window.adobeAnalyticsConfig.loading = false;
      console.log('Adobe Analytics library loaded successfully');
      
      // Initialize Adobe Analytics if s object is available
      if (window.s) {
        window.s.account = window.ADOBE_RSID || 'your-default-rsid';
        window.s.trackingServer = window.ADOBE_TRACKING_SERVER || 'your-tracking-server.sc.omtrdc.net';
      }
    };
    
    script.onerror = function() {
      window.adobeAnalyticsConfig.loading = false;
      console.error('Failed to load Adobe Analytics library');
    };
    
    document.head.appendChild(script);
  }

  // Load when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAdobeAnalytics);
  } else {
    loadAdobeAnalytics();
  }
})();