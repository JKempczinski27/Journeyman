import { useEffect, useCallback, useState } from 'react';
import aepClient from '../utils/adobeExperiencePlatform';

export const useAdobeExperiencePlatform = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeAEP = async () => {
      try {
        await aepClient.initialize();
        const status = aepClient.getStatus();
        setIsInitialized(status.initialized);
        setConsentGiven(status.consentGiven);
        setError(null);
      } catch (err) {
        console.error('Failed to initialize AEP:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initializeAEP();
  }, []);

  const grantConsent = useCallback(async () => {
    try {
      await aepClient.grantConsent();
      setConsentGiven(true);
      setError(null);
    } catch (err) {
      console.error('Failed to grant consent:', err);
      setError(err.message);
    }
  }, []);

  const denyConsent = useCallback(async () => {
    try {
      await aepClient.denyConsent();
      setConsentGiven(false);
      setError(null);
    } catch (err) {
      console.error('Failed to deny consent:', err);
      setError(err.message);
    }
  }, []);

  const trackEvent = useCallback(async (eventData) => {
    if (!isInitialized || !consentGiven) {
      console.debug('AEP not ready or consent not given');
      return { success: false, reason: 'not_ready' };
    }

    try {
      const result = await aepClient.sendEvent(eventData);
      return { success: true, result };
    } catch (err) {
      console.error('Failed to track event:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [isInitialized, consentGiven]);

  const trackGameStart = useCallback((gameData) => {
    return trackEvent({
      eventType: 'game.start',
      pageName: 'game-start',
      action: 'game_start',
      ...gameData
    });
  }, [trackEvent]);

  const trackGameComplete = useCallback((gameData) => {
    return trackEvent({
      eventType: 'game.complete',
      pageName: 'game-complete',
      action: 'game_complete',
      completed: true,
      ...gameData
    });
  }, [trackEvent]);

  const trackGuess = useCallback((guessData) => {
    return trackEvent({
      eventType: 'game.interaction',
      pageName: 'game-play',
      action: guessData.isCorrect ? 'correct_guess' : 'incorrect_guess',
      ...guessData
    });
  }, [trackEvent]);

  const trackPageView = useCallback((pageData = {}) => {
    return trackEvent({
      eventType: 'web.webpagedetails.pageViews',
      pageName: pageData.pageName || document.title,
      action: 'page_view',
      ...pageData
    });
  }, [trackEvent]);

  const setUserIdentity = useCallback(async (identityData) => {
    if (!isInitialized || !consentGiven) {
      console.debug('AEP not ready or consent not given');
      return;
    }

    try {
      await aepClient.setIdentity(identityData);
      setError(null);
    } catch (err) {
      console.error('Failed to set user identity:', err);
      setError(err.message);
    }
  }, [isInitialized, consentGiven]);

  const getStatus = useCallback(() => {
    return {
      ...aepClient.getStatus(),
      loading,
      error
    };
  }, [loading, error]);

  return {
    // Status
    isInitialized,
    consentGiven,
    loading,
    error,

    // Consent management
    grantConsent,
    denyConsent,

    // Event tracking
    trackEvent,
    trackGameStart,
    trackGameComplete,
    trackGuess,
    trackPageView,

    // Identity management
    setUserIdentity,

    // Status
    getStatus
  };
};

export default useAdobeExperiencePlatform;
