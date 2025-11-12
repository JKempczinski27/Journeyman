const axios = require('axios');

class DataProtectionService {
  constructor() {
    this.pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:5001';
  }

  /**
   * Check if Python backend is healthy
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.pythonBackendUrl}/api/health`);
      return response.data;
    } catch (error) {
      console.error('Python backend health check failed:', error.message);
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Encrypt sensitive data via Python backend
   */
  async encrypt(plaintext) {
    try {
      const response = await axios.post(`${this.pythonBackendUrl}/api/encrypt`, {
        plaintext
      });
      return response.data;
    } catch (error) {
      console.error('Encryption failed:', error.message);
      throw error;
    }
  }

  /**
   * Decrypt sensitive data via Python backend
   */
  async decrypt(ciphertext) {
    try {
      const response = await axios.post(`${this.pythonBackendUrl}/api/decrypt`, {
        ciphertext
      });
      return response.data;
    } catch (error) {
      console.error('Decryption failed:', error.message);
      throw error;
    }
  }

  /**
   * Export user data for GDPR compliance
   */
  async exportUserData(userId) {
    try {
      const response = await axios.get(
        `${this.pythonBackendUrl}/api/gdpr/export/${userId}`
      );
      return response.data;
    } catch (error) {
      console.error('Failed to export user data:', error.message);
      throw error;
    }
  }

  /**
   * Delete/anonymize user data
   */
  async deleteUserData(userId) {
    try {
      const response = await axios.delete(
        `${this.pythonBackendUrl}/api/gdpr/delete/${userId}`
      );
      return response.data;
    } catch (error) {
      console.error('Failed to delete user data:', error.message);
      throw error;
    }
  }

  /**
   * Record user consent
   */
  async recordConsent(userId, consentType, granted, metadata = {}) {
    try {
      const response = await axios.post(
        `${this.pythonBackendUrl}/api/consent/${userId}`,
        {
          consent_type: consentType,
          granted,
          ...metadata
        }
      );
      return response.data;
    } catch (error) {
      console.error('Failed to record consent:', error.message);
      throw error;
    }
  }

  /**
   * Get user consents
   */
  async getUserConsents(userId) {
    try {
      const response = await axios.get(
        `${this.pythonBackendUrl}/api/consent/${userId}`
      );
      return response.data;
    } catch (error) {
      console.error('Failed to get consents:', error.message);
      throw error;
    }
  }

  /**
   * Revoke user consent
   */
  async revokeConsent(userId, consentType) {
    try {
      const response = await axios.delete(
        `${this.pythonBackendUrl}/api/consent/${userId}/${consentType}`
      );
      return response.data;
    } catch (error) {
      console.error('Failed to revoke consent:', error.message);
      throw error;
    }
  }
}

module.exports = new DataProtectionService();