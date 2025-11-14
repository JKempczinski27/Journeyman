/**
 * OneTrust Configuration
 *
 * This file configures OneTrust Cookie Consent & Privacy Management
 *
 * Setup Instructions:
 * 1. Get your Domain Script ID from OneTrust Admin Console:
 *    - Navigate to Scripts > Cookie Compliance
 *    - Copy the Domain Script ID (looks like: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 * 2. Add it to your .env file as REACT_APP_ONETRUST_DOMAIN_SCRIPT_ID
 * 3. Configure consent categories in OneTrust Admin Console
 */

const oneTrustConfig = {
  // Enable/disable OneTrust based on environment variable
  enabled: process.env.REACT_APP_ONETRUST_ENABLED === 'true',

  // Domain Script ID from OneTrust Admin Console
  domainScriptId: process.env.REACT_APP_ONETRUST_DOMAIN_SCRIPT_ID || 'your-domain-script-id',

  // Test mode (shows additional console logs)
  testMode: process.env.REACT_APP_ONETRUST_TEST_MODE === 'true',

  // OneTrust SDK URL
  sdkUrl: 'https://cdn.cookielaw.org/scripttemplates/otSDKStub.js',

  // Consent categories (customize based on your OneTrust setup)
  consentCategories: {
    STRICTLY_NECESSARY: 'C0001', // Always active, cannot be disabled
    PERFORMANCE: 'C0002',        // Analytics and performance cookies
    FUNCTIONAL: 'C0003',          // Functionality cookies
    TARGETING: 'C0004',           // Advertising and targeting cookies
    SOCIAL_MEDIA: 'C0005'         // Social media cookies
  },

  // Auto-block settings
  autoBlock: {
    enabled: true, // Automatically block cookies until consent is given
    enableGoogleAnalytics: false, // Block GA until consent
    enableAdobeAnalytics: true // Block Adobe Analytics until consent
  },

  // Banner configuration
  banner: {
    autoDisplay: true, // Automatically show banner on first visit
    position: 'bottom', // 'top' or 'bottom'
    language: 'en' // Default language
  },

  // Geolocation rules (automatically handled by OneTrust)
  geolocation: {
    enabled: true,
    rules: {
      gdpr: ['EU', 'UK'], // Show GDPR-compliant banner for EU/UK
      ccpa: ['US-CA'],    // Show CCPA-compliant banner for California
      global: 'default'   // Default banner for other regions
    }
  }
};

/**
 * Initialize OneTrust SDK
 * Call this function in your App.js or index.js
 */
export const initializeOneTrust = () => {
  if (!oneTrustConfig.enabled) {
    console.log('OneTrust is disabled via environment variable');
    return false;
  }

  if (!oneTrustConfig.domainScriptId || oneTrustConfig.domainScriptId === 'your-domain-script-id') {
    console.error('OneTrust Domain Script ID is not configured. Please add REACT_APP_ONETRUST_DOMAIN_SCRIPT_ID to your .env file.');
    return false;
  }

  // Set the domain script ID in window object
  window.OptanonWrapper = oneTrustConfig.domainScriptId;

  // Create and inject OneTrust script
  const script = document.createElement('script');
  script.src = oneTrustConfig.sdkUrl;
  script.type = 'text/javascript';
  script.charset = 'UTF-8';
  script.setAttribute('data-domain-script', oneTrustConfig.domainScriptId);

  if (oneTrustConfig.testMode) {
    script.setAttribute('data-document-language', 'true');
    console.log('OneTrust initialized in test mode');
  }

  document.head.appendChild(script);

  if (oneTrustConfig.testMode) {
    console.log('OneTrust SDK initialized with config:', {
      domainScriptId: oneTrustConfig.domainScriptId,
      enabled: oneTrustConfig.enabled,
      autoBlock: oneTrustConfig.autoBlock
    });
  }

  return true;
};

/**
 * Check if a specific consent category is allowed
 * @param {string} category - The consent category to check (use consentCategories constants)
 * @returns {boolean} - True if consent is granted
 */
export const hasConsent = (category) => {
  if (!oneTrustConfig.enabled) {
    // If OneTrust is disabled, assume consent is granted
    return true;
  }

  // Check if OneTrust is loaded
  if (typeof window.OnetrustActiveGroups === 'undefined') {
    console.warn('OneTrust not yet loaded. Defaulting to no consent.');
    return false;
  }

  // Check if the category is in the active groups
  return window.OnetrustActiveGroups.includes(category);
};

/**
 * Check if performance/analytics consent is granted
 * Use this before initializing analytics tools like Adobe Analytics
 */
export const hasAnalyticsConsent = () => {
  return hasConsent(oneTrustConfig.consentCategories.PERFORMANCE);
};

/**
 * Check if targeting/advertising consent is granted
 */
export const hasTargetingConsent = () => {
  return hasConsent(oneTrustConfig.consentCategories.TARGETING);
};

/**
 * Check if functional consent is granted
 */
export const hasFunctionalConsent = () => {
  return hasConsent(oneTrustConfig.consentCategories.FUNCTIONAL);
};

/**
 * Get all active consent categories
 * @returns {Array<string>} - Array of active category IDs
 */
export const getActiveConsentGroups = () => {
  if (!oneTrustConfig.enabled || typeof window.OnetrustActiveGroups === 'undefined') {
    return [];
  }

  return window.OnetrustActiveGroups.split(',').map(group => group.trim());
};

/**
 * Open OneTrust Preference Center
 * Allows users to change their consent preferences
 */
export const openPreferenceCenter = () => {
  if (window.OneTrust && window.OneTrust.ToggleInfoDisplay) {
    window.OneTrust.ToggleInfoDisplay();
  } else {
    console.warn('OneTrust Preference Center is not available');
  }
};

/**
 * Set up event listeners for consent changes
 * @param {Function} callback - Function to call when consent changes
 */
export const onConsentChange = (callback) => {
  if (!oneTrustConfig.enabled) {
    return;
  }

  // OneTrust fires this event when consent is updated
  window.addEventListener('consent.onetrust', (event) => {
    if (oneTrustConfig.testMode) {
      console.log('OneTrust consent changed:', event.detail);
    }
    callback(event.detail);
  });
};

/**
 * Sync OneTrust consent to backend
 * @param {string} userId - The user ID (optional)
 */
export const syncConsentToBackend = async (userId = null) => {
  if (!oneTrustConfig.enabled) {
    return;
  }

  try {
    const consentData = {
      userId,
      timestamp: new Date().toISOString(),
      consentGroups: getActiveConsentGroups(),
      hasAnalyticsConsent: hasAnalyticsConsent(),
      hasTargetingConsent: hasTargetingConsent(),
      hasFunctionalConsent: hasFunctionalConsent(),
      source: 'onetrust'
    };

    // Send to backend (adjust endpoint as needed)
    const response = await fetch('/api/data-protection/consent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(consentData)
    });

    if (!response.ok) {
      console.error('Failed to sync consent to backend:', response.statusText);
    } else if (oneTrustConfig.testMode) {
      console.log('Consent synced to backend:', consentData);
    }
  } catch (error) {
    console.error('Error syncing consent to backend:', error);
  }
};

export default oneTrustConfig;
