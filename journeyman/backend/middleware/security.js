const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const crypto = require('crypto');

// 1. OWASP A01:2021 - Broken Access Control
const authMiddleware = {
  // API key validation for admin endpoints
  validateApiKey: (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const validApiKey = process.env.API_KEY;

    if (!validApiKey) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!apiKey || !crypto.timingSafeEqual(
      Buffer.from(apiKey),
      Buffer.from(validApiKey)
    )) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
  },

  // Role-based access control
  requireRole: (role) => {
    return (req, res, next) => {
      if (!req.user || req.user.role !== role) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      next();
    };
  }
};

// 2. OWASP A02:2021 - Cryptographic Failures
const encryption = {
  // Encrypt sensitive data
  encrypt: (text) => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key.length !== 32) {
      throw new Error('Encryption key must be 32 characters');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipherGCM('aes-256-gcm', key);
    cipher.setAAD(Buffer.from('journeyman-game', 'utf8'));

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  },

  // Decrypt sensitive data
  decrypt: (encryptedData) => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key.length !== 32) {
      throw new Error('Encryption key must be 32 characters');
    }

    const decipher = crypto.createDecipherGCM('aes-256-gcm', key);
    decipher.setAAD(Buffer.from('journeyman-game', 'utf8'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  },

  // Hash passwords
  hashPassword: async (password) => {
    const bcrypt = require('bcrypt');
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  },

  // Verify passwords
  verifyPassword: async (password, hash) => {
    const bcrypt = require('bcrypt');
    return await bcrypt.compare(password, hash);
  },

  // Generate secure random tokens
  generateSecureToken: (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
  }
};

// 3. OWASP A03:2021 - Injection
const inputValidation = {
  // SQL injection prevention
  sanitizeInput: (req, res, next) => {
    // Remove NoSQL injection attempts
    mongoSanitize()(req, res, () => {
      // Remove XSS attempts
      xss()(req, res, next);
    });
  },

  // Validate player data
  validatePlayerData: (req, res, next) => {
    const { name, email } = req.body;

    // Name validation
    if (!name || typeof name !== 'string' || name.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid name format',
        field: 'name'
      });
    }

    // Check for suspicious patterns in name
    const suspiciousNamePatterns = /<script|javascript:|on\w+=/i;
    if (suspiciousNamePatterns.test(name)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid characters in name',
        field: 'name'
      });
    }

    // Email validation with stricter regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!email || !emailRegex.test(email) || email.length > 254) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        field: 'email'
      });
    }

    // Sanitize inputs
    req.body.name = name.trim().substring(0, 100);
    req.body.email = email.trim().toLowerCase().substring(0, 254);

    next();
  },

  // Validate game data
  validateGameData: (req, res, next) => {
    const { correctCount, durationInSeconds, gameType, guesses } = req.body;

    if (correctCount !== undefined) {
      if (!Number.isInteger(correctCount) || correctCount < 0 || correctCount > 1000) {
        return res.status(400).json({
          success: false,
          error: 'Invalid correctCount',
          field: 'correctCount'
        });
      }
    }

    if (durationInSeconds !== undefined) {
      if (!Number.isInteger(durationInSeconds) || durationInSeconds < 0 || durationInSeconds > 86400) {
        return res.status(400).json({
          success: false,
          error: 'Invalid duration',
          field: 'durationInSeconds'
        });
      }
    }

    if (gameType !== undefined) {
      const validGameTypes = ['journeyman', 'challenge', 'easy'];
      if (!validGameTypes.includes(gameType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid game type',
          field: 'gameType'
        });
      }
    }

    // Validate guesses array
    if (guesses !== undefined) {
      if (!Array.isArray(guesses) || guesses.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Invalid guesses format',
          field: 'guesses'
        });
      }

      // Validate each guess
      for (const guess of guesses) {
        if (typeof guess !== 'string' || guess.length > 200) {
          return res.status(400).json({
            success: false,
            error: 'Invalid guess format',
            field: 'guesses'
          });
        }
      }
    }

    next();
  }
};

// 4. OWASP A04:2021 - Insecure Design
const secureDesign = {
  // Implement secure session management
  sessionConfig: {
    secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
      sameSite: 'strict'
    },
    name: 'journeyman.sid', // Custom session name
    genid: () => crypto.randomUUID()
  },

  // Implement CSRF protection
  csrfProtection: require('csurf')({
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    }
  }),

  // Content type validation
  validateContentType: (req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT') {
      const contentType = req.get('Content-Type');
      if (!contentType || !contentType.includes('application/json')) {
        return res.status(400).json({ error: 'Content-Type must be application/json' });
      }
    }
    next();
  }
};

// 5. OWASP A05:2021 - Security Misconfiguration
const securityHeaders = helmet({
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
      mediaSrc: ["'self'"],
      workerSrc: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
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
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false, // Disabled for external images
  crossOriginResourcePolicy: { policy: "cross-origin" }
});

// 6. OWASP A06:2021 - Vulnerable and Outdated Components
const dependencyCheck = {
  // Check for known vulnerabilities (to be run during CI/CD)
  auditDependencies: async () => {
    try {
      const { execSync } = require('child_process');
      const result = execSync('npm audit --audit-level high --json', {
        encoding: 'utf8',
        timeout: 30000 // 30 second timeout
      });
      const audit = JSON.parse(result);

      if (audit.metadata.vulnerabilities.high > 0 || audit.metadata.vulnerabilities.critical > 0) {
        console.error('High or critical vulnerabilities found:', audit.metadata.vulnerabilities);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Dependency audit failed:', error.message);
      return false;
    }
  },

  // Runtime dependency verification
  verifyPackageIntegrity: () => {
    // This would implement package signature verification in production
    return true;
  }
};

// 7. OWASP A07:2021 - Identification and Authentication Failures
const authentication = {
  // Rate limiting for authentication attempts
  authLimiter: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: {
      error: 'Too many authentication attempts, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    }
  }),

  // Account lockout mechanism (Redis-based in production)
  accountLockout: new Map(),

  checkAccountLockout: (identifier) => {
    const attempts = authentication.accountLockout.get(identifier);
    if (attempts && attempts.count >= 5 && Date.now() - attempts.lastAttempt < 900000) { // 15 minutes
      return true;
    }
    return false;
  },

  recordFailedAttempt: (identifier) => {
    const current = authentication.accountLockout.get(identifier) || { count: 0, lastAttempt: 0 };
    current.count++;
    current.lastAttempt = Date.now();
    authentication.accountLockout.set(identifier, current);

    // Auto-cleanup after 1 hour
    setTimeout(() => {
      authentication.accountLockout.delete(identifier);
    }, 3600000);
  },

  clearFailedAttempts: (identifier) => {
    authentication.accountLockout.delete(identifier);
  }
};

// 8. OWASP A08:2021 - Software and Data Integrity Failures
const integrityChecks = {
  // Verify data integrity
  verifyDataIntegrity: (data, expectedHash) => {
    const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
  },

  // Generate data integrity hash
  generateIntegrityHash: (data) => {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  },

  // Verify request integrity with HMAC
  verifyRequestIntegrity: (req, res, next) => {
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];

    if (!signature || !timestamp) {
      return res.status(401).json({ error: 'Missing signature or timestamp' });
    }

    // Check timestamp to prevent replay attacks (5 minute window)
    const now = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp);
    if (Math.abs(now - requestTime) > 300) {
      return res.status(401).json({ error: 'Request timestamp too old' });
    }

    const payload = timestamp + JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET || 'default-secret')
      .update(payload)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(`sha256=${expectedSignature}`))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
  }
};

// 9. OWASP A09:2021 - Security Logging and Monitoring Failures
const securityLogging = {
  // Security event logger
  logSecurityEvent: (event, details, req) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      method: req.method,
      sessionId: req.sessionID,
      requestId: req.id || crypto.randomUUID()
    };

    console.log('SECURITY_EVENT:', JSON.stringify(logEntry));

    // In production, send to SIEM or security monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Example: sendToSIEM(logEntry);
      // Example: sendToDatadog(logEntry);
      // Example: sendToSplunk(logEntry);
    }
  },

  // Monitor for suspicious activity
  suspiciousActivityMiddleware: (req, res, next) => {
    const ip = req.ip;
    const userAgent = req.get('User-Agent') || '';

    // Check for common attack patterns
    const suspiciousPatterns = [
      { pattern: /sqlmap/i, severity: 'high' },
      { pattern: /nmap/i, severity: 'medium' },
      { pattern: /nikto/i, severity: 'high' },
      { pattern: /burp/i, severity: 'low' },
      { pattern: /sqlinjection/i, severity: 'high' },
      { pattern: /<script/i, severity: 'high' },
      { pattern: /javascript:/i, severity: 'high' },
      { pattern: /onload=/i, severity: 'high' },
      { pattern: /onerror=/i, severity: 'high' },
      { pattern: /union.*select/i, severity: 'critical' },
      { pattern: /drop.*table/i, severity: 'critical' }
    ];

    const requestString = `${req.originalUrl} ${userAgent} ${JSON.stringify(req.body)}`;

    for (const { pattern, severity } of suspiciousPatterns) {
      if (pattern.test(requestString)) {
        securityLogging.logSecurityEvent('SUSPICIOUS_REQUEST', {
          pattern: pattern.toString(),
          severity,
          matchedString: requestString.match(pattern)?.[0]
        }, req);

        // Block critical and high severity attacks
        if (['critical', 'high'].includes(severity)) {
          return res.status(400).json({ error: 'Request blocked' });
        }
      }
    }

    next();
  },

  // Request logging middleware
  requestLogger: (req, res, next) => {
    const startTime = Date.now();
    req.id = crypto.randomUUID();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const logEntry = {
        requestId: req.id,
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: res.get('Content-Length')
      };

      console.log('REQUEST:', JSON.stringify(logEntry));
    });

    next();
  }
};

// 10. OWASP A10:2021 - Server-Side Request Forgery (SSRF)
const ssrfProtection = {
  // Validate URLs to prevent SSRF
  validateUrl: (url) => {
    try {
      const parsedUrl = new URL(url);

      // Block private/local addresses
      const hostname = parsedUrl.hostname;
      const blockedPatterns = [
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^::1$/,
        /^localhost$/i,
        /^0\.0\.0\.0$/,
        /^metadata\.google\.internal$/i, // Google Cloud metadata
        /^169\.254\.169\.254$/, // AWS metadata
        /^fd00:ec2::254$/ // AWS IPv6 metadata
      ];

      for (const pattern of blockedPatterns) {
        if (pattern.test(hostname)) {
          return false;
        }
      }

      // Only allow HTTP/HTTPS
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return false;
      }

      // Block non-standard ports for security
      const port = parsedUrl.port;
      if (port && !['80', '443', '8080', '8443'].includes(port)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  },

  // URL validation middleware
  validateUrlMiddleware: (req, res, next) => {
    const { url } = req.body;

    if (url && !ssrfProtection.validateUrl(url)) {
      return res.status(400).json({ error: 'Invalid or blocked URL' });
    }

    next();
  }
};

// Rate limiting for general API endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and static assets
    return req.path === '/health' || req.path.startsWith('/static/');
  }
});

// Strict rate limiter for sensitive endpoints
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Very limited requests
  message: {
    error: 'Too many requests to sensitive endpoint'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Parameter pollution protection
const parameterPollutionProtection = hpp({
  whitelist: ['tags', 'categories', 'guesses'] // Allow arrays for these parameters
});

// Compression with security considerations
const secureCompression = compression({
  filter: (req, res) => {
    // Don't compress responses with authentication tokens
    if (res.getHeader('Authorization')) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Balance between compression and CPU usage
  threshold: 1024 // Only compress responses larger than 1KB
});

module.exports = {
  authMiddleware,
  encryption,
  inputValidation,
  secureDesign,
  securityHeaders,
  dependencyCheck,
  authentication,
  integrityChecks,
  securityLogging,
  ssrfProtection,
  generalLimiter,
  strictLimiter,
  parameterPollutionProtection,
  secureCompression
};
