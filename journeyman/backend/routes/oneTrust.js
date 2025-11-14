/**
 * OneTrust Routes for Express Backend
 *
 * Handles OneTrust webhook events and consent management operations
 */

const express = require('express');
const router = express.Router();
const { oneTrustClient } = require('../services/oneTrustClient');

/**
 * POST /api/onetrust/webhook
 * Receive and process OneTrust webhook events
 *
 * Webhook events include:
 * - Consent granted/updated/revoked
 * - DSAR requests submitted
 * - Preference center interactions
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-onetrust-signature'] || req.headers['x-webhook-signature'];
    const rawBody = req.body.toString('utf8');

    // Verify webhook signature for security
    if (signature) {
      const isValid = oneTrustClient.verifyWebhookSignature(
        signature,
        rawBody,
        process.env.WEBHOOK_SECRET
      );

      if (!isValid) {
        console.error('OneTrust webhook: Invalid signature');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    const event = JSON.parse(rawBody);
    console.log('OneTrust webhook received:', {
      type: event.type,
      timestamp: event.timestamp,
      userId: event.data?.userId
    });

    // Process different event types
    switch (event.type) {
      case 'consent.granted':
        await handleConsentGranted(event.data);
        break;

      case 'consent.updated':
        await handleConsentUpdated(event.data);
        break;

      case 'consent.revoked':
        await handleConsentRevoked(event.data);
        break;

      case 'dsar.submitted':
        await handleDSARSubmitted(event.data);
        break;

      case 'preference.updated':
        await handlePreferenceUpdated(event.data);
        break;

      default:
        console.log('Unknown OneTrust event type:', event.type);
    }

    // Acknowledge receipt of webhook
    res.status(200).json({ received: true, timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('Error processing OneTrust webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

/**
 * POST /api/onetrust/consent
 * Record consent from frontend
 */
router.post('/consent', async (req, res) => {
  try {
    const { userId, purposes, source, metadata } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await oneTrustClient.recordConsent({
      userId,
      purposes,
      source: source || 'web',
      metadata: {
        ...metadata,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
      }
    });

    res.status(200).json({
      success: true,
      message: 'Consent recorded successfully',
      data: result
    });

  } catch (error) {
    console.error('Error recording consent:', error);
    res.status(500).json({ error: 'Failed to record consent' });
  }
});

/**
 * GET /api/onetrust/consent/:userId
 * Get consent receipt for a user
 */
router.get('/consent/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const receipt = await oneTrustClient.getConsentReceipt(userId);

    if (!receipt) {
      return res.status(404).json({ error: 'Consent receipt not found' });
    }

    res.status(200).json({
      success: true,
      data: receipt
    });

  } catch (error) {
    console.error('Error getting consent receipt:', error);
    res.status(500).json({ error: 'Failed to get consent receipt' });
  }
});

/**
 * PUT /api/onetrust/consent/:userId
 * Update consent preferences for a user
 */
router.put('/consent/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { purposes } = req.body;

    const result = await oneTrustClient.updateConsent(userId, { purposes });

    res.status(200).json({
      success: true,
      message: 'Consent updated successfully',
      data: result
    });

  } catch (error) {
    console.error('Error updating consent:', error);
    res.status(500).json({ error: 'Failed to update consent' });
  }
});

/**
 * POST /api/onetrust/consent/:userId/revoke
 * Revoke consent for a user
 */
router.post('/consent/:userId/revoke', async (req, res) => {
  try {
    const { userId } = req.params;
    const { purposes } = req.body;

    const result = await oneTrustClient.revokeConsent(userId, purposes);

    res.status(200).json({
      success: true,
      message: 'Consent revoked successfully',
      data: result
    });

  } catch (error) {
    console.error('Error revoking consent:', error);
    res.status(500).json({ error: 'Failed to revoke consent' });
  }
});

/**
 * GET /api/onetrust/purposes
 * Get list of available consent purposes
 */
router.get('/purposes', async (req, res) => {
  try {
    const purposes = await oneTrustClient.getConsentPurposes();

    res.status(200).json({
      success: true,
      data: purposes
    });

  } catch (error) {
    console.error('Error getting consent purposes:', error);
    res.status(500).json({ error: 'Failed to get consent purposes' });
  }
});

/**
 * POST /api/onetrust/dsar
 * Submit a Data Subject Access Request
 */
router.post('/dsar', async (req, res) => {
  try {
    const { userId, type, firstName, lastName, description, details } = req.body;

    if (!userId || !type) {
      return res.status(400).json({ error: 'userId and type are required' });
    }

    const validTypes = ['access', 'delete', 'portability', 'rectification'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid request type' });
    }

    const result = await oneTrustClient.submitDataSubjectRequest({
      userId,
      type,
      firstName,
      lastName,
      description,
      details
    });

    res.status(200).json({
      success: true,
      message: 'DSAR submitted successfully',
      data: result
    });

  } catch (error) {
    console.error('Error submitting DSAR:', error);
    res.status(500).json({ error: 'Failed to submit DSAR' });
  }
});

/**
 * GET /api/onetrust/dsar/:requestId
 * Get status of a Data Subject Access Request
 */
router.get('/dsar/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;

    const status = await oneTrustClient.getDataSubjectRequestStatus(requestId);

    if (!status) {
      return res.status(404).json({ error: 'DSAR not found' });
    }

    res.status(200).json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Error getting DSAR status:', error);
    res.status(500).json({ error: 'Failed to get DSAR status' });
  }
});

/**
 * GET /api/onetrust/statistics
 * Get consent statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const { startDate, endDate, purpose } = req.query;

    const statistics = await oneTrustClient.getConsentStatistics({
      startDate,
      endDate,
      purpose
    });

    res.status(200).json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('Error getting consent statistics:', error);
    res.status(500).json({ error: 'Failed to get consent statistics' });
  }
});

/**
 * GET /api/onetrust/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  const isEnabled = oneTrustClient.isEnabled();

  res.status(200).json({
    success: true,
    enabled: isEnabled,
    configured: isEnabled,
    timestamp: new Date().toISOString()
  });
});

// Helper functions for webhook event handling

async function handleConsentGranted(data) {
  console.log('Consent granted:', data);
  // TODO: Update local database with consent grant
  // TODO: Trigger analytics initialization if needed
  // TODO: Send notification if required
}

async function handleConsentUpdated(data) {
  console.log('Consent updated:', data);
  // TODO: Update local database with consent changes
  // TODO: Update user preferences
}

async function handleConsentRevoked(data) {
  console.log('Consent revoked:', data);
  // TODO: Update local database
  // TODO: Stop data collection for user
  // TODO: Optionally delete user data based on policy
}

async function handleDSARSubmitted(data) {
  console.log('DSAR submitted:', data);
  // TODO: Create DSAR record in database
  // TODO: Trigger data collection workflow
  // TODO: Send notification to privacy team
}

async function handlePreferenceUpdated(data) {
  console.log('Preference updated:', data);
  // TODO: Update user preference settings
  // TODO: Sync with local database
}

module.exports = router;
