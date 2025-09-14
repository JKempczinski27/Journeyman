const crypto = require('crypto');

/**
 * Security utility functions for the Journeyman backend
 */
class SecurityUtils {

  /**
   * Generate a secure random password
   * @param {number} length - Password length (default: 16)
   * @returns {string} Secure random password
   */
  static generateSecurePassword(length = 16) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }

    return password;
  }

  /**
   * Generate a secure API key
   * @param {number} length - Key length in bytes (default: 32)
   * @returns {string} Base64 encoded API key
   */
  static generateApiKey(length = 32) {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Generate a secure session secret
   * @param {number} length - Secret length in bytes (default: 64)
   * @returns {string} Hex encoded session secret
   */
  static generateSessionSecret(length = 64) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a secure encryption key
   * @returns {string} 32-byte hex encoded encryption key
   */
  static generateEncryptionKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} Validation result with score and feedback
   */
  static validatePasswordStrength(password) {
    const result = {
      score: 0,
      feedback: [],
      isStrong: false
    };

    if (password.length >= 8) result.score += 1;
    else result.feedback.push('Password should be at least 8 characters long');

    if (/[a-z]/.test(password)) result.score += 1;
    else result.feedback.push('Password should contain lowercase letters');

    if (/[A-Z]/.test(password)) result.score += 1;
    else result.feedback.push('Password should contain uppercase letters');

    if (/[0-9]/.test(password)) result.score += 1;
    else result.feedback.push('Password should contain numbers');

    if (/[^a-zA-Z0-9]/.test(password)) result.score += 1;
    else result.feedback.push('Password should contain special characters');

    if (password.length >= 12) result.score += 1;

    result.isStrong = result.score >= 4;
    return result;
  }

  /**
   * Sanitize filename for secure file operations
   * @param {string} filename - Original filename
   * @returns {string} Sanitized filename
   */
  static sanitizeFilename(filename) {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .replace(/^\./, '')
      .slice(0, 255);
  }

  /**
   * Generate secure headers for responses
   * @returns {Object} Security headers
   */
  static getSecurityHeaders() {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
    };
  }
}

module.exports = SecurityUtils;
