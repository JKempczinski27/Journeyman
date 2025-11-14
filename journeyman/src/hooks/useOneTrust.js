import { useState, useEffect, useCallback } from 'react';
import {
  initializeOneTrust,
  hasConsent,
  hasAnalyticsConsent,
  hasTargetingConsent,
  hasFunctionalConsent,
  getActiveConsentGroups,
  openPreferenceCenter,
  syncConsentToBackend,
  onConsentChange
} from '../config/oneTrustConfig';

/**
 * Custom React Hook for OneTrust Cookie Consent Management
 *
 * Usage:
 * ```
 * const {
 *   isOneTrustLoaded,
 *   analyticsConsent,
 *   targetingConsent,
 *   openSettings
 * } = useOneTrust();
 *
 * if (analyticsConsent) {
 *   // Initialize Adobe Analytics
 * }
 * ```
 */
const useOneTrust = (options = {}) => {
  const {
    autoInit = true,
    syncToBackend = true,
    userId = null,
    onConsentUpdate = null
  } = options;

  // State to track OneTrust initialization and consent status
  const [isOneTrustLoaded, setIsOneTrustLoaded] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [targetingConsent, setTargetingConsent] = useState(false);
  const [functionalConsent, setFunctionalConsent] = useState(false);
  const [activeGroups, setActiveGroups] = useState([]);
  const [bannerShown, setBannerShown] = useState(false);

  /**
   * Update consent state based on OneTrust data
   */
  const updateConsentState = useCallback(() => {
    setAnalyticsConsent(hasAnalyticsConsent());
    setTargetingConsent(hasTargetingConsent());
    setFunctionalConsent(hasFunctionalConsent());
    setActiveGroups(getActiveConsentGroups());
  }, []);

  /**
   * Handle consent changes
   */
  const handleConsentChange = useCallback((detail) => {
    updateConsentState();

    // Sync to backend if enabled
    if (syncToBackend) {
      syncConsentToBackend(userId);
    }

    // Call custom callback if provided
    if (onConsentUpdate) {
      onConsentUpdate({
        analyticsConsent: hasAnalyticsConsent(),
        targetingConsent: hasTargetingConsent(),
        functionalConsent: hasFunctionalConsent(),
        activeGroups: getActiveConsentGroups()
      });
    }
  }, [syncToBackend, userId, onConsentUpdate, updateConsentState]);

  /**
   * Initialize OneTrust SDK
   */
  useEffect(() => {
    if (!autoInit || isInitialized) {
      return;
    }

    const initialized = initializeOneTrust();
    setIsInitialized(initialized);

    if (!initialized) {
      console.warn('OneTrust initialization failed. Check your configuration.');
      return;
    }

    // Wait for OneTrust to be loaded
    const checkOneTrustLoaded = setInterval(() => {
      if (window.OneTrust || window.OnetrustActiveGroups !== undefined) {
        setIsOneTrustLoaded(true);
        updateConsentState();
        clearInterval(checkOneTrustLoaded);
      }
    }, 100);

    // Clean up interval after 10 seconds if OneTrust doesn't load
    const timeout = setTimeout(() => {
      clearInterval(checkOneTrustLoaded);
      if (!isOneTrustLoaded) {
        console.warn('OneTrust failed to load within 10 seconds');
      }
    }, 10000);

    return () => {
      clearInterval(checkOneTrustLoaded);
      clearTimeout(timeout);
    };
  }, [autoInit, isInitialized, isOneTrustLoaded, updateConsentState]);

  /**
   * Set up consent change listeners
   */
  useEffect(() => {
    if (!isOneTrustLoaded) {
      return;
    }

    // Listen for consent changes
    onConsentChange(handleConsentChange);

    // Listen for banner shown event
    window.addEventListener('OneTrustBannerLoaded', () => {
      setBannerShown(true);
    });

    // Listen for banner accepted event
    window.addEventListener('OneTrustGroupsUpdated', () => {
      updateConsentState();
      if (syncToBackend) {
        syncConsentToBackend(userId);
      }
    });
  }, [isOneTrustLoaded, handleConsentChange, syncToBackend, userId, updateConsentState]);

  /**
   * Check if a specific consent category is allowed
   */
  const checkConsent = useCallback((category) => {
    return hasConsent(category);
  }, []);

  /**
   * Open OneTrust preference center
   */
  const openSettings = useCallback(() => {
    openPreferenceCenter();
  }, []);

  /**
   * Manually trigger consent sync to backend
   */
  const syncConsent = useCallback(() => {
    syncConsentToBackend(userId);
  }, [userId]);

  /**
   * Force update consent state
   */
  const refreshConsent = useCallback(() => {
    updateConsentState();
  }, [updateConsentState]);

  return {
    // Loading state
    isOneTrustLoaded,
    isInitialized,
    bannerShown,

    // Consent states
    analyticsConsent,
    targetingConsent,
    functionalConsent,
    activeGroups,

    // Methods
    checkConsent,
    openSettings,
    syncConsent,
    refreshConsent,

    // Convenience methods
    canUseAnalytics: analyticsConsent,
    canUseTargeting: targetingConsent,
    canUseFunctional: functionalConsent
  };
};

export default useOneTrust;
