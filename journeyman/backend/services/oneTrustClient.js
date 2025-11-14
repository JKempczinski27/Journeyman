/**
 * OneTrust API Client for Node.js Backend
 *
 * This client provides methods to interact with the OneTrust API
 * for consent management, data subject requests, and compliance operations.
 *
 * API Documentation: https://developer.onetrust.com/onetrust/reference/
 *
 * Setup Instructions:
 * 1. Get your API credentials from OneTrust Admin Console:
 *    - Navigate to Integrations > API
 *    - Generate an API Key
 *    - Copy your Tenant ID
 * 2. Add credentials to your .env file:
 *    - ONETRUST_API_KEY=your-api-key
 *    - ONETRUST_TENANT_ID=your-tenant-id
 *    - ONETRUST_API_BASE_URL=https://app.onetrust.com/api
 */

const axios = require('axios');

class OneTrustClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.ONETRUST_API_KEY;
    this.tenantId = config.tenantId || process.env.ONETRUST_TENANT_ID;
    this.baseUrl = config.baseUrl || process.env.ONETRUST_API_BASE_URL || 'https://app.onetrust.com/api';
    this.enabled = config.enabled !== undefined ? config.enabled : process.env.ONETRUST_ENABLED === 'true';

    if (this.enabled && (!this.apiKey || !this.tenantId)) {
      console.warn('OneTrust API credentials not configured. Set ONETRUST_API_KEY and ONETRUST_TENANT_ID in .env file.');
    }

    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        console.error('OneTrust API Error:', {
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if OneTrust is enabled and configured
   */
  isEnabled() {
    return this.enabled && !!this.apiKey && !!this.tenantId;
  }

  /**
   * Get consent receipt for a user
   * @param {string} userId - The user ID or email
   * @returns {Promise<Object>} - Consent receipt data
   */
  async getConsentReceipt(userId) {
    if (!this.isEnabled()) {
      console.log('OneTrust is not enabled');
      return null;
    }

    try {
      const response = await this.client.get(`/consent/v1/users/${encodeURIComponent(userId)}/receipt`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get consent receipt for user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Record consent for a user
   * @param {Object} consentData - Consent data to record
   * @param {string} consentData.userId - User ID or email
   * @param {Array<string>} consentData.purposes - Array of consent purpose IDs
   * @param {string} consentData.source - Source of consent (e.g., 'web', 'mobile')
   * @param {Object} consentData.metadata - Additional metadata
   * @returns {Promise<Object>} - API response
   */
  async recordConsent(consentData) {
    if (!this.isEnabled()) {
      console.log('OneTrust is not enabled');
      return null;
    }

    try {
      const payload = {
        identifier: consentData.userId,
        requestInformation: {
          source: consentData.source || 'web',
          method: consentData.method || 'banner',
          timestamp: consentData.timestamp || new Date().toISOString()
        },
        purposes: consentData.purposes || [],
        metadata: consentData.metadata || {}
      };

      const response = await this.client.post('/consent/v1/receipts', payload);
      console.log(`Consent recorded for user ${consentData.userId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to record consent for user ${consentData.userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Update consent preferences for a user
   * @param {string} userId - User ID or email
   * @param {Object} preferences - Updated consent preferences
   * @returns {Promise<Object>} - API response
   */
  async updateConsent(userId, preferences) {
    if (!this.isEnabled()) {
      console.log('OneTrust is not enabled');
      return null;
    }

    try {
      const payload = {
        purposes: preferences.purposes || [],
        timestamp: new Date().toISOString()
      };

      const response = await this.client.put(
        `/consent/v1/users/${encodeURIComponent(userId)}`,
        payload
      );
      console.log(`Consent updated for user ${userId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to update consent for user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Revoke consent for a user
   * @param {string} userId - User ID or email
   * @param {Array<string>} purposes - Array of purpose IDs to revoke
   * @returns {Promise<Object>} - API response
   */
  async revokeConsent(userId, purposes = []) {
    if (!this.isEnabled()) {
      console.log('OneTrust is not enabled');
      return null;
    }

    try {
      const payload = {
        purposes: purposes,
        action: 'revoke',
        timestamp: new Date().toISOString()
      };

      const response = await this.client.post(
        `/consent/v1/users/${encodeURIComponent(userId)}/revoke`,
        payload
      );
      console.log(`Consent revoked for user ${userId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to revoke consent for user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get list of available consent purposes
   * @returns {Promise<Array>} - Array of consent purposes
   */
  async getConsentPurposes() {
    if (!this.isEnabled()) {
      console.log('OneTrust is not enabled');
      return [];
    }

    try {
      const response = await this.client.get('/consent/v1/purposes');
      return response.data;
    } catch (error) {
      console.error('Failed to get consent purposes:', error.message);
      throw error;
    }
  }

  /**
   * Submit a Data Subject Access Request (DSAR)
   * @param {Object} requestData - DSAR request data
   * @param {string} requestData.userId - User ID or email
   * @param {string} requestData.type - Request type ('access', 'delete', 'portability', 'rectification')
   * @param {Object} requestData.details - Additional request details
   * @returns {Promise<Object>} - API response with request ID
   */
  async submitDataSubjectRequest(requestData) {
    if (!this.isEnabled()) {
      console.log('OneTrust is not enabled');
      return null;
    }

    try {
      const payload = {
        dataSubject: {
          email: requestData.userId,
          firstName: requestData.firstName || '',
          lastName: requestData.lastName || ''
        },
        requestType: requestData.type || 'access',
        description: requestData.description || '',
        metadata: requestData.details || {}
      };

      const response = await this.client.post('/dsar/v2/requests', payload);
      console.log(`DSAR submitted for user ${requestData.userId} (Type: ${requestData.type})`);
      return response.data;
    } catch (error) {
      console.error(`Failed to submit DSAR for user ${requestData.userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get status of a Data Subject Access Request
   * @param {string} requestId - The DSAR request ID
   * @returns {Promise<Object>} - DSAR status
   */
  async getDataSubjectRequestStatus(requestId) {
    if (!this.isEnabled()) {
      console.log('OneTrust is not enabled');
      return null;
    }

    try {
      const response = await this.client.get(`/dsar/v2/requests/${requestId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get DSAR status for request ${requestId}:`, error.message);
      throw error;
    }
  }

  /**
   * Verify webhook signature from OneTrust
   * @param {string} signature - Signature from webhook header
   * @param {string} body - Raw request body
   * @param {string} secret - Webhook secret from OneTrust
   * @returns {boolean} - True if signature is valid
   */
  verifyWebhookSignature(signature, body, secret) {
    try {
      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', secret || process.env.WEBHOOK_SECRET);
      const calculatedSignature = hmac.update(body).digest('hex');
      return signature === calculatedSignature;
    } catch (error) {
      console.error('Failed to verify webhook signature:', error.message);
      return false;
    }
  }

  /**
   * Get consent statistics
   * @param {Object} filters - Optional filters (date range, purpose, etc.)
   * @returns {Promise<Object>} - Consent statistics
   */
  async getConsentStatistics(filters = {}) {
    if (!this.isEnabled()) {
      console.log('OneTrust is not enabled');
      return null;
    }

    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.purpose) params.append('purpose', filters.purpose);

      const response = await this.client.get(`/consent/v1/statistics?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get consent statistics:', error.message);
      throw error;
    }
  }

  /**
   * Bulk import consent records
   * @param {Array<Object>} consentRecords - Array of consent records to import
   * @returns {Promise<Object>} - Import result
   */
  async bulkImportConsent(consentRecords) {
    if (!this.isEnabled()) {
      console.log('OneTrust is not enabled');
      return null;
    }

    try {
      const payload = {
        records: consentRecords
      };

      const response = await this.client.post('/consent/v1/bulk-import', payload);
      console.log(`Bulk imported ${consentRecords.length} consent records`);
      return response.data;
    } catch (error) {
      console.error('Failed to bulk import consent records:', error.message);
      throw error;
    }
  }
}

// Create singleton instance
const oneTrustClient = new OneTrustClient();

// Export the class and singleton instance
module.exports = {
  OneTrustClient,
  oneTrustClient
};
