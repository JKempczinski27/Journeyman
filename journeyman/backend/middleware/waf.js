// Web Application Firewall implementation

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const hpp = require('hpp');
const xss = require('xss');
const validator = require('validator');
const crypto = require('crypto');

class WAFMiddleware {
  constructor() {
    this.suspiciousIPs = new Set();
    this.blockedIPs = new Set();
    this.requestLog = new Map();
    this.alertThresholds = {
      requestsPerMinute: 100,
      errorRate: 0.5, // 50% error rate
      suspiciousPatterns: 10
    };
  }

  // Initialize WAF with all security middleware
  initialize() {
    return [
      this.securityHeaders(),
      this.rateLimiting(),
      this.slowDown(),
      this.ipFiltering.bind(this),
      this.requestSanitization.bind(this),
      this.sqlInjectionProtection.bind(this),
      this.xssProtection.bind(this),
      this.pathTraversalProtection.bind(this),
      this.httpMethodValidation.bind(this),
      this.contentTypeValidation.bind(this),
      this.requestSizeLimit.bind(this),
      this.anomalyDetection.bind(this),
      this.requestLogging.bind(this)
    ];
  }

  // Security headers using Helmet
  securityHeaders() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
          scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
          imgSrc: ["'self'", "data:", "https:", "https://a.espncdn.com", "https://cdn.jsdelivr.net"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          connectSrc: ["'self'", "https://journeyman-production.up.railway.app"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: []
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      frameguard: { action: 'deny' },
      xssFilter: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    });
  }

  // Rate limiting with different rules for different endpoints
  rateLimiting() {
    const generalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        this.logSecurityEvent('rate_limit_exceeded', req);
        res.status(429).json({
          error: 'Too many requests from this IP, please try again later.',
          code: 'RATE_LIMIT_EXCEEDED'
        });
      }
    });

    // Stricter limits for sensitive endpoints
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5, // 5 attempts per 15 minutes
      skipSuccessfulRequests: true,
      message: {
        error: 'Too many authentication attempts, please try again later.',
        code: 'AUTH_RATE_LIMIT_EXCEEDED'
      }
    });

    const apiLimiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 30, // 30 requests per minute for API endpoints
      message: {
        error: 'API rate limit exceeded',
        code: 'API_RATE_LIMIT_EXCEEDED'
      }
    });

    return (req, res, next) => {
      if (req.path.includes('/auth') || req.path.includes('/login')) {
        return authLimiter(req, res, next);
      } else if (req.path.startsWith('/api/')) {
        return apiLimiter(req, res, next);
      } else {
        return generalLimiter(req, res, next);
      }
    };
  }

  // Slow down repeated requests
  slowDown() {
    return slowDown({
      windowMs: 15 * 60 * 1000, // 15 minutes
      delayAfter: 20, // allow 20 requests per 15 minutes, then...
      delayMs: 500, // begin adding 500ms of delay per request above 20
      maxDelayMs: 10000, // maximum delay of 10 seconds
      onLimitReached: (req, res) => {
        this.logSecurityEvent('slow_down_triggered', req);
      }
    });
  }

  // IP filtering and blocking
  ipFiltering(req, res, next) {
    const clientIP = this.getClientIP(req);

    // Check if IP is blocked
    if (this.blockedIPs.has(clientIP)) {
      this.logSecurityEvent('blocked_ip_access', req, { ip: clientIP });
      return res.status(403).json({
        error: 'Access denied',
        code: 'IP_BLOCKED'
      });
    }

    // Check if IP is suspicious
    if (this.suspiciousIPs.has(clientIP)) {
      this.logSecurityEvent('suspicious_ip_access', req, { ip: clientIP });
      // Add additional scrutiny for suspicious IPs
      req.suspicious = true;
    }

    next();
  }

  // Request sanitization
  requestSanitization(req, res, next) {
    try {
      // Sanitize query parameters
      if (req.query) {
        for (const key in req.query) {
          if (typeof req.query[key] === 'string') {
            req.query[key] = xss(req.query[key]);
          }
        }
      }

      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        this.sanitizeObject(req.body);
      }

      // Sanitize headers
      this.sanitizeHeaders(req);

      next();
    } catch (error) {
      this.logSecurityEvent('sanitization_error', req, { error: error.message });
      return res.status(400).json({
        error: 'Invalid request format',
        code: 'SANITIZATION_ERROR'
      });
    }
  }

  // SQL injection protection
  sqlInjectionProtection(req, res, next) {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
      /('|(\\x27)|(\\x2D)){2,}/gi,
      /(;|\||`|\\|\|\||&&)/gi
    ];

    const checkSQLInjection = (str) => {
      if (typeof str !== 'string') return false;
      return sqlPatterns.some(pattern => pattern.test(str));
    };

    // Check query parameters
    for (const key in req.query) {
      if (checkSQLInjection(req.query[key])) {
        this.logSecurityEvent('sql_injection_attempt', req, {
          parameter: key,
          value: req.query[key]
        });
        return res.status(400).json({
          error: 'Invalid request parameters',
          code: 'SQL_INJECTION_DETECTED'
        });
      }
    }

    // Check request body
    if (req.body && typeof req.body === 'object') {
      const bodyStr = JSON.stringify(req.body);
      if (checkSQLInjection(bodyStr)) {
        this.logSecurityEvent('sql_injection_attempt', req, { body: bodyStr });
        return res.status(400).json({
          error: 'Invalid request body',
          code: 'SQL_INJECTION_DETECTED'
        });
      }
    }

    next();
  }

  // XSS protection
  xssProtection(req, res, next) {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<img[^>]+src[\\s]*=[\s"']*javascript:/gi
    ];

    const checkXSS = (str) => {
      if (typeof str !== 'string') return false;
      return xssPatterns.some(pattern => pattern.test(str));
    };

    // Check all string inputs
    const checkObject = (obj, path = '') => {
      for (const key in obj) {
        const currentPath = path ? `${path}.${key}` : key;
        if (typeof obj[key] === 'string' && checkXSS(obj[key])) {
          this.logSecurityEvent('xss_attempt', req, {
            path: currentPath,
            value: obj[key]
          });
          return true;
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          if (checkObject(obj[key], currentPath)) return true;
        }
      }
      return false;
    };

    if (req.query && checkObject(req.query, 'query')) {
      return res.status(400).json({
        error: 'Invalid request parameters',
        code: 'XSS_DETECTED'
      });
    }

    if (req.body && checkObject(req.body, 'body')) {
      return res.status(400).json({
        error: 'Invalid request body',
        code: 'XSS_DETECTED'
      });
    }

    next();
  }

  // Path traversal protection
  pathTraversalProtection(req, res, next) {
    const pathTraversalPatterns = [
      /\.\./g,
      /\.\\\./g,
      /%2e%2e/gi,
      /%252e%252e/gi,
      /\.\%2e/gi,
      /%2e\./gi
    ];

    const url = decodeURIComponent(req.url);

    if (pathTraversalPatterns.some(pattern => pattern.test(url))) {
      this.logSecurityEvent('path_traversal_attempt', req, { url });
      return res.status(400).json({
        error: 'Invalid request path',
        code: 'PATH_TRAVERSAL_DETECTED'
      });
    }

    next();
  }

  // HTTP method validation
  httpMethodValidation(req, res, next) {
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

    if (!allowedMethods.includes(req.method)) {
      this.logSecurityEvent('invalid_http_method', req, { method: req.method });
      return res.status(405).json({
        error: 'Method not allowed',
        code: 'INVALID_HTTP_METHOD'
      });
    }

    next();
  }

  // Content type validation
  contentTypeValidation(req, res, next) {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.get('Content-Type');
      const allowedTypes = [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data'
      ];

      if (contentType && !allowedTypes.some(type => contentType.includes(type))) {
        this.logSecurityEvent('invalid_content_type', req, { contentType });
        return res.status(415).json({
          error: 'Unsupported media type',
          code: 'INVALID_CONTENT_TYPE'
        });
      }
    }

    next();
  }

  // Request size limiting
  requestSizeLimit(req, res, next) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const contentLength = parseInt(req.get('Content-Length') || '0');

    if (contentLength > maxSize) {
      this.logSecurityEvent('request_size_exceeded', req, {
        size: contentLength,
        maxSize
      });
      return res.status(413).json({
        error: 'Request entity too large',
        code: 'REQUEST_SIZE_EXCEEDED'
      });
    }

    next();
  }

  // Anomaly detection
  anomalyDetection(req, res, next) {
    const clientIP = this.getClientIP(req);
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window

    // Track requests per IP
    if (!this.requestLog.has(clientIP)) {
      this.requestLog.set(clientIP, []);
    }

    const requests = this.requestLog.get(clientIP);
    requests.push({ timestamp: now, path: req.path, method: req.method });

    // Remove old entries
    const cutoff = now - windowMs;
    const recentRequests = requests.filter(r => r.timestamp > cutoff);
    this.requestLog.set(clientIP, recentRequests);

    // Check for anomalies
    if (recentRequests.length > this.alertThresholds.requestsPerMinute) {
      this.suspiciousIPs.add(clientIP);
      this.logSecurityEvent('anomaly_high_request_rate', req, {
        ip: clientIP,
        requestCount: recentRequests.length
      });
    }

    // Check for pattern anomalies
    const uniquePaths = new Set(recentRequests.map(r => r.path));
    if (uniquePaths.size > 20 && recentRequests.length > 30) {
      this.suspiciousIPs.add(clientIP);
      this.logSecurityEvent('anomaly_path_scanning', req, {
        ip: clientIP,
        uniquePaths: uniquePaths.size,
        totalRequests: recentRequests.length
      });
    }

    next();
  }

  // Request logging
  requestLogging(req, res, next) {
    const startTime = Date.now();

    // Log security-relevant request information
    const logData = {
      timestamp: new Date().toISOString(),
      ip: this.getClientIP(req),
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer'),
      suspicious: req.suspicious || false
    };

    // Override res.end to capture response status
    const originalEnd = res.end;
    res.end = function(...args) {
      logData.statusCode = res.statusCode;
      logData.responseTime = Date.now() - startTime;

      // Log security events for error responses
      if (res.statusCode >= 400) {
        console.log('[WAF] Security Event:', JSON.stringify(logData));
      }

      originalEnd.apply(this, args);
    };

    next();
  }

  // Helper methods
  getClientIP(req) {
    return req.ip ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           req.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
           req.get('X-Real-IP') ||
           'unknown';
  }

  sanitizeObject(obj) {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = xss(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.sanitizeObject(obj[key]);
      }
    }
  }

  sanitizeHeaders(req) {
    const dangerousHeaders = ['x-forwarded-host', 'x-original-url', 'x-rewrite-url'];
    dangerousHeaders.forEach(header => {
      if (req.get(header)) {
        this.logSecurityEvent('dangerous_header_detected', req, { header });
        delete req.headers[header];
      }
    });
  }

  logSecurityEvent(eventType, req, additionalData = {}) {
    const event = {
      timestamp: new Date().toISOString(),
      eventType,
      ip: this.getClientIP(req),
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      ...additionalData
    };

    console.log('[WAF] Security Event:', JSON.stringify(event));

    // You can add integration with external logging services here
    // this.sendToSIEM(event);
  }

  // IP management methods
  blockIP(ip, reason = 'Manual block') {
    this.blockedIPs.add(ip);
    this.logSecurityEvent('ip_blocked', null, { ip, reason });
  }

  unblockIP(ip) {
    this.blockedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);
    this.logSecurityEvent('ip_unblocked', null, { ip });
  }

  markSuspicious(ip, reason = 'Suspicious activity') {
    this.suspiciousIPs.add(ip);
    this.logSecurityEvent('ip_marked_suspicious', null, { ip, reason });
  }

  getStatus() {
    return {
      blockedIPs: Array.from(this.blockedIPs),
      suspiciousIPs: Array.from(this.suspiciousIPs),
      activeConnections: this.requestLog.size,
      alertThresholds: this.alertThresholds
    };
  }
}

module.exports = WAFMiddleware;
