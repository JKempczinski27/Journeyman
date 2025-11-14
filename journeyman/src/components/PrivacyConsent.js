import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Typography,
  Box,
  Link,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Stack
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SecurityIcon from '@mui/icons-material/Security';
import DataUsageIcon from '@mui/icons-material/DataUsage';
import { useAdobeExperiencePlatform } from '../hooks/useAdobeExperiencePlatform';
import useOneTrust from '../hooks/useOneTrust';

const PrivacyConsent = () => {
  const [open, setOpen] = useState(false);
  const [hasShownConsent, setHasShownConsent] = useState(false);

  // Adobe Experience Platform hook
  const {
    grantConsent,
    denyConsent,
    consentGiven,
    isInitialized,
    loading
  } = useAdobeExperiencePlatform();

  // OneTrust hook with consent update callback
  const {
    isOneTrustLoaded,
    isInitialized: oneTrustInitialized,
    analyticsConsent: oneTrustAnalyticsConsent,
    openSettings: openOneTrustSettings,
    syncConsent
  } = useOneTrust({
    autoInit: true,
    syncToBackend: true,
    onConsentUpdate: (consentData) => {
      console.log('OneTrust consent updated:', consentData);
      // When OneTrust analytics consent is granted, also grant Adobe consent
      if (consentData.analyticsConsent && !consentGiven) {
        grantConsent();
      } else if (!consentData.analyticsConsent && consentGiven) {
        denyConsent();
      }
    }
  });

  useEffect(() => {
    // If OneTrust is enabled and loaded, let it handle the consent banner
    // Otherwise, show our custom dialog
    if (oneTrustInitialized && isOneTrustLoaded) {
      console.log('OneTrust is managing consent');
      // OneTrust will show its own banner, so we don't show ours
      return;
    }

    // Fallback to custom consent dialog if OneTrust is not available
    const hasShownBefore = localStorage.getItem('privacy_consent_shown');
    const existingConsent = localStorage.getItem('adobe_consent');

    // Show consent dialog if:
    // 1. AEP is initialized
    // 2. No consent has been given
    // 3. We haven't shown the dialog before in this session
    // 4. No existing consent choice exists
    // 5. OneTrust is not managing consent
    if (isInitialized &&
        !consentGiven &&
        !hasShownBefore &&
        !existingConsent &&
        !loading &&
        !oneTrustInitialized) {
      setOpen(true);
      setHasShownConsent(true);
      localStorage.setItem('privacy_consent_shown', 'true');
    }
  }, [isInitialized, consentGiven, loading, oneTrustInitialized, isOneTrustLoaded]);

  const handleAccept = async () => {
    try {
      await grantConsent();
      setOpen(false);

      // Track consent acceptance
      console.log('✅ User granted analytics consent');

      // Optional: Track this as an event once consent is given
      setTimeout(() => {
        if (window.adobeAnalytics?.trackEvent) {
          window.adobeAnalytics.trackEvent('privacy_consent_granted', {
            consentType: 'analytics',
            timestamp: new Date().toISOString()
          });
        }
      }, 1000);

    } catch (error) {
      console.error('Failed to grant consent:', error);
    }
  };

  const handleDecline = async () => {
    try {
      await denyConsent();
      setOpen(false);

      console.log('ℹ️ User declined analytics consent');

    } catch (error) {
      console.error('Failed to deny consent:', error);
    }
  };

  const handleCustomizePreferences = () => {
    // If OneTrust is loaded, open OneTrust preference center
    if (oneTrustInitialized && isOneTrustLoaded) {
      openOneTrustSettings();
      setOpen(false);
    } else {
      // For now, just show the full options
      // In a real implementation, you might have granular controls
      console.log('🔧 User wants to customize privacy preferences');
    }
  };

  // Don't render if AEP is not enabled or not initialized
  if (!isInitialized && !loading) {
    return null;
  }

  return (
    <Dialog
      open={open}
      maxWidth="md"
      fullWidth
      disableEscapeKeyDown
      sx={{
        '& .MuiDialog-paper': {
          borderRadius: 2,
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pb: 1
      }}>
        <SecurityIcon color="primary" />
        <Typography variant="h5" component="div" sx={{ fontFamily: 'Endzone' }}>
          Privacy & Analytics
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body1" paragraph>
          We use {oneTrustInitialized ? 'OneTrust and ' : ''}Adobe Experience Platform to enhance your Journeyman gaming experience
          through analytics and personalization{oneTrustInitialized ? ', with enterprise-grade privacy compliance' : ''}.
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
            <Chip
              icon={<DataUsageIcon />}
              label="Game Analytics"
              size="small"
              color="primary"
              variant="outlined"
            />
            <Chip
              label="Performance Tracking"
              size="small"
              color="secondary"
              variant="outlined"
            />
            <Chip
              label="User Experience"
              size="small"
              color="success"
              variant="outlined"
            />
          </Stack>
        </Box>

        <Accordion sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" fontWeight="bold">
              📊 What data do we collect?
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" component="div">
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                <li>Game performance metrics (scores, completion rates)</li>
                <li>User interaction patterns (button clicks, time spent)</li>
                <li>Device and browser information (screen size, browser type)</li>
                <li>Session data (game duration, difficulty chosen)</li>
                <li>Basic demographics (if provided voluntarily)</li>
              </ul>
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  <strong>Note:</strong> All data is anonymized and used only for improving
                  the game experience. We never sell your data to third parties.
                </Typography>
              </Box>
            </Typography>
          </AccordionDetails>
        </Accordion>

        <Accordion sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" fontWeight="bold">
              🎯 How do we use this data?
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" component="div">
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                <li><strong>Game Improvements:</strong> Understand which features are most engaging</li>
                <li><strong>Performance Optimization:</strong> Identify and fix technical issues</li>
                <li><strong>Content Creation:</strong> Develop new players and game modes based on popularity</li>
                <li><strong>User Experience:</strong> Personalize difficulty and recommendations</li>
                <li><strong>Bug Detection:</strong> Monitor for crashes or errors in real-time</li>
              </ul>
            </Typography>
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" fontWeight="bold">
              🔒 Your privacy rights
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" component="div">
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                <li>You can withdraw consent at any time</li>
                <li>Data is automatically deleted after 24 months of inactivity</li>
                <li>You can request a copy of your data</li>
                <li>You can request data deletion</li>
                <li>All data is encrypted and securely stored</li>
              </ul>
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  For privacy questions, contact us at{' '}
                  <Link href="mailto:privacy@journeyman-game.com">
                    privacy@journeyman-game.com
                  </Link>
                </Typography>
              </Box>
            </Typography>
          </AccordionDetails>
        </Accordion>

        <Box sx={{ mt: 3, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
          <Typography variant="body2" color="info.dark">
            <strong>🎮 Game Experience:</strong> Accepting analytics helps us make Journeyman
            better for everyone. Declining won't affect your ability to play, but we won't
            be able to track your progress or provide personalized features.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 1 }}>
        <Box sx={{ display: 'flex', gap: 1, width: '100%', flexDirection: { xs: 'column', sm: 'row' } }}>
          <Button
            onClick={handleDecline}
            color="secondary"
            variant="outlined"
            sx={{ fontFamily: 'Endzone', flex: { sm: 1 } }}
          >
            Decline Analytics
          </Button>

          <Button
            onClick={handleCustomizePreferences}
            color="info"
            variant="text"
            size="small"
            sx={{
              fontFamily: 'Endzone',
              fontSize: '0.75rem',
              display: { xs: 'none', sm: 'inline-flex' }
            }}
          >
            Customize
          </Button>

          <Button
            onClick={handleAccept}
            color="primary"
            variant="contained"
            sx={{ fontFamily: 'Endzone', flex: { sm: 2 } }}
          >
            Accept & Continue Playing
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default PrivacyConsent;
