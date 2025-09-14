const { body, validationResult } = require('express-validator');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Player data validation rules
const playerValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters')
    .matches(/^[a-zA-Z\s\-'\.]+$/)
    .withMessage('Name can only contain letters, spaces, hyphens, apostrophes, and periods')
    .customSanitizer(value => purify.sanitize(value)),

  body('email')
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email must be less than 255 characters')
    .customSanitizer(value => purify.sanitize(value))
];

// Game data validation rules
const gameDataValidation = [
  body('gameType')
    .optional()
    .trim()
    .isIn(['journeyman', 'challenge'])
    .withMessage('Game type must be journeyman or challenge'),

  body('mode')
    .optional()
    .trim()
    .isIn(['easy', 'challenge'])
    .withMessage('Mode must be easy or challenge'),

  body('durationInSeconds')
    .optional()
    .isInt({ min: 0, max: 3600 })
    .withMessage('Duration must be between 0 and 3600 seconds'),

  body('correctCount')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Correct count must be between 0 and 100'),

  body('guesses')
    .optional()
    .isArray({ max: 100 })
    .withMessage('Guesses must be an array with maximum 100 items'),

  body('guesses.*')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Each guess must be less than 200 characters')
    .customSanitizer(value => purify.sanitize(value)),

  body('sessionId')
    .optional()
    .trim()
    .matches(/^[a-zA-Z0-9\-_]+$/)
    .withMessage('Session ID can only contain alphanumeric characters, hyphens, and underscores')
    .isLength({ max: 50 })
    .withMessage('Session ID must be less than 50 characters'),

  body('sharedOnSocial')
    .optional()
    .isBoolean()
    .withMessage('Shared on social must be a boolean')
];

// Analytics export validation
const analyticsExportValidation = [
  body('startDate')
    .trim()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),

  body('endDate')
    .trim()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      const startDate = new Date(req.body.startDate);
      const endDate = new Date(value);
      if (endDate <= startDate) {
        throw new Error('End date must be after start date');
      }
      const daysDiff = (endDate - startDate) / (1000 * 60 * 60 * 24);
      if (daysDiff > 365) {
        throw new Error('Date range cannot exceed 365 days');
      }
      return true;
    }),

  body('gameType')
    .optional()
    .trim()
    .isIn(['journeyman', 'challenge', 'all'])
    .withMessage('Game type must be journeyman, challenge, or all')
];

// Batch upload validation
const batchUploadValidation = [
  body('sessions')
    .isArray({ min: 1, max: 100 })
    .withMessage('Sessions must be an array with 1-100 items'),

  body('sessions.*.name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z\s\-'\.]+$/)
    .customSanitizer(value => purify.sanitize(value)),

  body('sessions.*.email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 255 })
    .customSanitizer(value => purify.sanitize(value)),

  body('sessions.*.gameType')
    .optional()
    .isIn(['journeyman', 'challenge']),

  body('sessions.*.mode')
    .optional()
    .isIn(['easy', 'challenge']),

  body('sessions.*.durationInSeconds')
    .optional()
    .isInt({ min: 0, max: 3600 }),

  body('sessions.*.correctCount')
    .optional()
    .isInt({ min: 0, max: 100 })
];

// S3 key validation for file operations
const s3KeyValidation = [
  body('key')
    .optional()
    .trim()
    .matches(/^[a-zA-Z0-9\/\-_\.]+$/)
    .withMessage('S3 key can only contain alphanumeric characters, forward slashes, hyphens, underscores, and periods')
    .isLength({ max: 1024 })
    .withMessage('S3 key must be less than 1024 characters'),

  body('prefix')
    .optional()
    .trim()
    .matches(/^[a-zA-Z0-9\/\-_\.]*$/)
    .withMessage('S3 prefix can only contain alphanumeric characters, forward slashes, hyphens, underscores, and periods')
    .isLength({ max: 256 })
    .withMessage('S3 prefix must be less than 256 characters')
];

// Request validation middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.warn('⚠️ Validation errors:', errors.array());
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: errors.array(),
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// Rate limiting validation
const rateLimitValidation = (windowMs = 900000, max = 100) => {
  return (req, res, next) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'unknown';

    // Simple in-memory rate limiting (use Redis in production)
    if (!rateLimitValidation.clients) {
      rateLimitValidation.clients = new Map();
    }

    const clientKey = `${clientIp}:${userAgent}`;
    const now = Date.now();
    const clientData = rateLimitValidation.clients.get(clientKey) || { requests: [], blocked: false };

    // Clean old requests outside window
    clientData.requests = clientData.requests.filter(timestamp => now - timestamp < windowMs);

    // Check if client is blocked
    if (clientData.blocked && now - clientData.blockedAt < windowMs) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((windowMs - (now - clientData.blockedAt)) / 1000),
        timestamp: new Date().toISOString()
      });
    }

    // Check rate limit
    if (clientData.requests.length >= max) {
      clientData.blocked = true;
      clientData.blockedAt = now;
      rateLimitValidation.clients.set(clientKey, clientData);

      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil(windowMs / 1000),
        timestamp: new Date().toISOString()
      });
    }

    // Add current request
    clientData.requests.push(now);
    clientData.blocked = false;
    rateLimitValidation.clients.set(clientKey, clientData);

    next();
  };
};

// Sanitize deep object properties
const sanitizeObject = (obj, maxDepth = 5, currentDepth = 0) => {
  if (currentDepth >= maxDepth || obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, maxDepth, currentDepth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = purify.sanitize(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value, maxDepth, currentDepth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

// General request sanitization middleware
const sanitizeRequest = (req, res, next) => {
  try {
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }
    next();
  } catch (error) {
    console.error('❌ Error sanitizing request:', error);
    res.status(500).json({
      success: false,
      error: 'Request sanitization failed',
      timestamp: new Date().toISOString()
    });
  }
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
  next();
};

module.exports = {
  playerValidation,
  gameDataValidation,
  analyticsExportValidation,
  batchUploadValidation,
  s3KeyValidation,
  validateRequest,
  rateLimitValidation,
  sanitizeRequest,
  securityHeaders,
  sanitizeObject
}
