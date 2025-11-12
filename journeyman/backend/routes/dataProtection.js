const express = require('express');
const router = express.Router();
const dataProtection = require('../services/dataProtection');

// Health check for data protection service
router.get('/health', async (req, res) => {
  try {
    const health = await dataProtection.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GDPR Export
router.get('/gdpr/export/:userId', async (req, res) => {
  try {
    const data = await dataProtection.exportUserData(req.params.userId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GDPR Delete
router.delete('/gdpr/delete/:userId', async (req, res) => {
  try {
    const result = await dataProtection.deleteUserData(req.params.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Consents
router.get('/consent/:userId', async (req, res) => {
  try {
    const consents = await dataProtection.getUserConsents(req.params.userId);
    res.json(consents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Record Consent
router.post('/consent/:userId', async (req, res) => {
  try {
    const { consentType, granted } = req.body;
    const result = await dataProtection.recordConsent(
      req.params.userId,
      consentType,
      granted,
      {
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      }
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Revoke Consent
router.delete('/consent/:userId/:consentType', async (req, res) => {
  try {
    const result = await dataProtection.revokeConsent(
      req.params.userId,
      req.params.consentType
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Encrypt data
router.post('/encrypt', async (req, res) => {
  try {
    const { plaintext } = req.body;
    const result = await dataProtection.encrypt(plaintext);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Decrypt data
router.post('/decrypt', async (req, res) => {
  try {
    const { ciphertext } = req.body;
    const result = await dataProtection.decrypt(ciphertext);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;