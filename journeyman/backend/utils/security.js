// journeyman/src/utils/security.js
// Frontend security utilities and CSP implementation

class FrontendSecurity {
  constructor() {
    this.apiBaseUrl = process.env.REACT_APP_API_URL || 'https://journeyman-production.up.railway.app';
    this.maxRetries = 3;
    this.requestTimeout = 10000; // 10 seconds
    this.csrfToken = null;
  }

  // Input sanitization and validation
  sanitizeInput(input, type = 'text') {
    if (typeof input !== 'string') {
      input = String(input);
    }

    switch (type) {
      case 'email':
        return this.sanitizeEmail(input);
      case 'name':
        return this.sanitizeName(input);
      case 'url':
        return this.sanitizeUrl(input);
      default:
        return this.sanitizeText(input);
    }
  }

  sanitizeText(text) {
    if (!text) return '';

    // Remove potentially dangerous characters
    return text
      .replace(/[<>\"']/g, '') // Remove HTML/script injection characters
      .replace(/javascript:/gi, '') // Remove javascript protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim()
      .substring(0, 1000); // Limit length
  }

  sanitizeEmail(email) {
    if (!email) return '';

    // Basic email sanitization
    return email
      .toLowerCase()
      .replace(/[^a-z0-9@._-]/g, '')
      .trim()
      .substring(0, 254); // RFC 5321 limit
  }

  sanitizeName(name) {
    if (!name) return '';

    // Allow letters, spaces, hyphens, apostrophes
    return name
      .replace(/[^a-zA-Z\s\-']/g, '')
      .trim()
      .substring(0, 100);
  }

  sanitizeUrl(url) {
    if (!url) return '';

    try {
      const parsedUrl = new URL(url);

      // Only allow HTTP/HTTPS
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return '';
      }

      // Block local/private addresses
      const hostname = parsedUrl.hostname;
      const blockedPatterns = [
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^localhost$/i
      ];

      for (const pattern of blockedPatterns) {
        if (pattern.test(hostname)) {
          return '';
        }
      }

      return parsedUrl.toString();
    } catch {
      return '';
    }
  }

  // Validate input data
  validatePlayerData(data) {
    const errors = [];

    // Name validation
    if (!data.name || typeof data.name !== 'string') {
      errors.push('Name is required');
    } else if (data.name.length < 1 || data.name.length > 100) {
      errors.push('Name must be between 1 and 100 characters');
    } else if (!/^[a-zA-Z\s\-']+$/.test(data.name)) {
      errors.push('Name contains invalid characters');
    }

    // Email validation
    if (!data.email || typeof data.email !== 'string') {
      errors.push('Email is required');
    } else if (data.email.length > 254) {
      errors.push('Email is too long');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('Email format is invalid');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateGameData(data) {
    const errors = [];

    if (data.correctCount !== undefined) {
      if (!Number.isInteger(data.correctCount) || data.correctCount < 0 || data.correctCount > 1000) {
        errors.push('Invalid correct count');
      }
    }

    if (data.durationInSeconds !== undefined) {
      if (!Number.isInteger(data.durationInSeconds) || data.durationInSeconds < 0 || data.durationInSeconds > 86400) {
        errors.push('Invalid duration');
      }
    }

    if (data.gameType !== undefined) {
      const validGameTypes = ['journeyman', 'challenge', 'easy'];
      if (!validGameTypes.includes(data.gameType)) {
        errors.push('Invalid game type');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Secure API request wrapper
  async secureRequest(endpoint, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const url = `${this.apiBaseUrl}${endpoint}`;

      // Validate URL
      if (!this.sanitizeUrl(url)) {
        throw new Error('Invalid URL');
      }

      const defaultOptions = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // CSRF protection
        },
        credentials: 'include', // Include cookies for session management
        signal: controller.signal
      };

      // Add CSRF token if available
      if (this.csrfToken) {
        defaultOptions.headers['X-CSRF-Token'] = this.csrfToken;
      }

      // Merge options
      const requestOptions = {
        ...defaultOptions,
        ...options,
        headers: {
          ...defaultOptions.headers,
          ...options.headers
        }
      };

      // Sanitize request body
      if (requestOptions.body && typeof requestOptions.body === 'object') {
        requestOptions.body = JSON.stringify(this.sanitizeRequestBody(requestOptions.body));
      }

      const response = await fetch(url, requestOptions);

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      throw error;
    }
  }

  sanitizeRequestBody(body) {
    const sanitized = {};

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeInput(value);
      } else if (typeof value === 'number') {
        sanitized[key] = Number.isFinite(value) ? value : 0;
      } else if (typeof value === 'boolean') {
        sanitized[key] = Boolean(value);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item =>
          typeof item === 'string' ? this.sanitizeInput(item) : item
        ).slice(0, 100); // Limit array size
      } else if (value && typeof value === 'object') {
        sanitized[key] = this.sanitizeRequestBody(value);
      }
    }

    return sanitized;
  }

  // Rate limiting for client-side
  createRateLimiter(maxRequests, windowMs) {
    const requests = new Map();

    return (key) => {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Clean old requests
      const keyRequests = requests.get(key) || [];
      const recentRequests = keyRequests.filter(time => time > windowStart);

      if (recentRequests.length >= maxRequests) {
        return false; // Rate limited
      }

      recentRequests.push(now);
      requests.set(key, recentRequests);

      return true; // Allow request
    };
  }

  // Content Security Policy violation reporting
  setupCSPReporting() {
    document.addEventListener('securitypolicyviolation', (event) => {
      const violationData = {
        blockedURI: event.blockedURI,
        directive: event.violatedDirective,
        originalPolicy: event.originalPolicy,
        referrer: event.referrer,
        statusCode: event.statusCode,
        timestamp: new Date().toISOString()
      };

      // Report CSP violation to backend
      this.reportSecurityEvent('csp_violation', violationData);
    });
  }

  // Report security events to backend
  async reportSecurityEvent(eventType, data) {
    try {
      await this.secureRequest('/api/security-event', {
        method: 'POST',
        body: {
          eventType,
          data,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href
        }
      });
    } catch (error) {
      console.error('Failed to report security event:', error);
    }
  }

  // Detect and prevent common XSS attempts
  detectXSS(input) {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
      /expression\s*\(/gi,
      /vbscript:/gi,
      /data:text\/html/gi
    ];

    for (const pattern of xssPatterns) {
      if (pattern.test(input)) {
        this.reportSecurityEvent('xss_attempt', { input, pattern: pattern.toString() });
        return true;
      }
    }

    return false;
  }

  // Secure local storage wrapper
  secureStorage = {
    setItem: (key, value) => {
      try {
        // Don't store sensitive data in localStorage
        const sensitiveKeys = ['password', 'token', 'email', 'ssn', 'credit'];
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          console.warn('Attempting to store sensitive data in localStorage');
          return false;
        }

        const sanitizedKey = this.sanitizeInput(key);
        const sanitizedValue = typeof value === 'string' ? this.sanitizeInput(value) : JSON.stringify(value);

        localStorage.setItem(sanitizedKey, sanitizedValue);
        return true;
      } catch (error) {
        console.error('Failed to set localStorage item:', error);
        return false;
      }
    },

    getItem: (key) => {
      try {
        const sanitizedKey = this.sanitizeInput(key);
        return localStorage.getItem(sanitizedKey);
      } catch (error) {
        console.error('Failed to get localStorage item:', error);
        return null;
      }
    },

    removeItem: (key) => {
      try {
        const sanitizedKey = this.sanitizeInput(key);
        localStorage.removeItem(sanitizedKey);
        return true;
      } catch (error) {
        console.error('Failed to remove localStorage item:', error);
        return false;
      }
    }
  };

  // Initialize security measures
  initialize() {
    // Setup CSP reporting
    this.setupCSPReporting();

    // Create rate limiters for different actions
    this.submitGameLimiter = this.createRateLimiter(5, 60000); // 5 requests per minute
    this.generalLimiter = this.createRateLimiter(100, 60000); // 100 requests per minute

    // Prevent clickjacking
    if (window.self !== window.top) {
      this.reportSecurityEvent('potential_clickjacking', { referrer: document.referrer });
    }

    // Detect devtools (basic)
    let devtools = { open: false };
    const element = new Image();
    Object.defineProperty(element, 'id', {
      get: function() {
        devtools.open = true;
        frontendSecurity.reportSecurityEvent('devtools_detected', {});
      }
    });

    setInterval(() => {
      console.dir(element);
      console.clear();
    }, 500);

    console.log('🛡️ Frontend security initialized');
  }
}

// Create singleton instance
const frontendSecurity = new FrontendSecurity();

export default frontendSecurity;

// Convenience exports
export const {
  sanitizeInput,
  validatePlayerData,
  validateGameData,
  secureRequest,
  secureStorage,
  detectXSS,
  reportSecurityEvent
} = frontendSecurity;
