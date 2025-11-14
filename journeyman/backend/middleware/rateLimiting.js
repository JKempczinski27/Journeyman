/**
 * Distributed Rate Limiting using Redis
 * Handles NFL.com-level traffic with sophisticated rate limiting strategies
 */

const { getCacheManager } = require('../utils/cache');

/**
 * Token Bucket Rate Limiter
 * More sophisticated than fixed window, allows bursts
 */
class TokenBucketLimiter {
  constructor(options = {}) {
    this.capacity = options.capacity || 100; // Max tokens
    this.refillRate = options.refillRate || 10; // Tokens per second
    this.namespace = options.namespace || 'ratelimit';
    this.cache = getCacheManager();
  }

  /**
   * Try to consume tokens
   * @returns {Object} { allowed: boolean, remaining: number, resetIn: number }
   */
  async consume(identifier, tokens = 1) {
    if (!this.cache.isConnected) {
      // Fail open if Redis is down
      return { allowed: true, remaining: this.capacity, resetIn: 0 };
    }

    const key = this.cache.generateKey(this.namespace, identifier);
    const now = Date.now();

    try {
      // Get current bucket state
      const bucketData = await this.cache.get(key);

      let bucket;
      if (!bucketData) {
        // New bucket
        bucket = {
          tokens: this.capacity,
          lastRefill: now
        };
      } else {
        bucket = bucketData;

        // Calculate tokens to add based on time elapsed
        const timePassed = (now - bucket.lastRefill) / 1000;
        const tokensToAdd = timePassed * this.refillRate;

        bucket.tokens = Math.min(
          this.capacity,
          bucket.tokens + tokensToAdd
        );
        bucket.lastRefill = now;
      }

      // Try to consume tokens
      const allowed = bucket.tokens >= tokens;
      if (allowed) {
        bucket.tokens -= tokens;
      }

      // Save updated bucket
      await this.cache.set(key, bucket, 3600); // 1 hour TTL

      const resetIn = allowed
        ? Math.ceil((tokens - bucket.tokens) / this.refillRate)
        : Math.ceil((tokens - bucket.tokens) / this.refillRate);

      return {
        allowed,
        remaining: Math.floor(bucket.tokens),
        resetIn: Math.max(0, resetIn)
      };
    } catch (error) {
      console.error('Token bucket error:', error.message);
      // Fail open on error
      return { allowed: true, remaining: this.capacity, resetIn: 0 };
    }
  }
}

/**
 * Sliding Window Rate Limiter
 * More accurate than fixed window, prevents boundary issues
 */
class SlidingWindowLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.namespace = options.namespace || 'sliding';
    this.cache = getCacheManager();
  }

  async isAllowed(identifier) {
    if (!this.cache.isConnected) {
      return { allowed: true, remaining: this.maxRequests, resetIn: 0 };
    }

    const key = this.cache.generateKey(this.namespace, identifier);
    const now = Date.now();
    const windowStart = now - this.windowMs;

    try {
      // Get request timestamps
      const requests = (await this.cache.get(key)) || [];

      // Filter out old requests
      const recentRequests = requests.filter(timestamp => timestamp > windowStart);

      const allowed = recentRequests.length < this.maxRequests;

      if (allowed) {
        recentRequests.push(now);
      }

      // Save updated requests
      await this.cache.set(key, recentRequests, Math.ceil(this.windowMs / 1000));

      const remaining = Math.max(0, this.maxRequests - recentRequests.length);
      const oldestRequest = recentRequests[0] || now;
      const resetIn = Math.ceil((oldestRequest + this.windowMs - now) / 1000);

      return {
        allowed,
        remaining,
        resetIn: Math.max(0, resetIn)
      };
    } catch (error) {
      console.error('Sliding window error:', error.message);
      return { allowed: true, remaining: this.maxRequests, resetIn: 0 };
    }
  }
}

/**
 * Adaptive Rate Limiter
 * Adjusts limits based on system load and error rates
 */
class AdaptiveRateLimiter {
  constructor(options = {}) {
    this.baseLimit = options.baseLimit || 100;
    this.minLimit = options.minLimit || 10;
    this.maxLimit = options.maxLimit || 1000;
    this.windowMs = options.windowMs || 60000;
    this.namespace = options.namespace || 'adaptive';
    this.cache = getCacheManager();

    // System health metrics
    this.errorRate = 0;
    this.avgResponseTime = 0;
  }

  /**
   * Update system metrics
   */
  updateMetrics(metrics) {
    this.errorRate = metrics.errorRate || 0;
    this.avgResponseTime = metrics.avgResponseTime || 0;
  }

  /**
   * Calculate current limit based on system health
   */
  getCurrentLimit() {
    let limit = this.baseLimit;

    // Reduce limit if error rate is high
    if (this.errorRate > 0.05) {
      // > 5% error rate
      limit = Math.floor(limit * 0.5);
    } else if (this.errorRate > 0.02) {
      // > 2% error rate
      limit = Math.floor(limit * 0.7);
    }

    // Reduce limit if response time is high
    if (this.avgResponseTime > 2000) {
      // > 2s
      limit = Math.floor(limit * 0.6);
    } else if (this.avgResponseTime > 1000) {
      // > 1s
      limit = Math.floor(limit * 0.8);
    }

    return Math.max(this.minLimit, Math.min(this.maxLimit, limit));
  }

  async isAllowed(identifier) {
    const currentLimit = this.getCurrentLimit();
    const limiter = new SlidingWindowLimiter({
      maxRequests: currentLimit,
      windowMs: this.windowMs,
      namespace: this.namespace
    });

    const result = await limiter.isAllowed(identifier);
    return {
      ...result,
      currentLimit
    };
  }
}

/**
 * Distributed Rate Limiting Middleware
 */
function distributedRateLimit(options = {}) {
  const {
    strategy = 'token-bucket', // 'token-bucket', 'sliding-window', 'adaptive'
    keyGenerator = (req) => req.ip,
    skip = () => false,
    handler = null,
    ...strategyOptions
  } = options;

  let limiter;

  switch (strategy) {
    case 'token-bucket':
      limiter = new TokenBucketLimiter(strategyOptions);
      break;
    case 'sliding-window':
      limiter = new SlidingWindowLimiter(strategyOptions);
      break;
    case 'adaptive':
      limiter = new AdaptiveRateLimiter(strategyOptions);
      break;
    default:
      throw new Error(`Unknown rate limit strategy: ${strategy}`);
  }

  return async (req, res, next) => {
    if (skip(req)) {
      return next();
    }

    try {
      const identifier = keyGenerator(req);
      const result = strategy === 'token-bucket'
        ? await limiter.consume(identifier)
        : await limiter.isAllowed(identifier);

      // Set rate limit headers
      res.set('X-RateLimit-Limit', result.currentLimit || strategyOptions.capacity || strategyOptions.maxRequests);
      res.set('X-RateLimit-Remaining', result.remaining);
      res.set('X-RateLimit-Reset', result.resetIn);
      res.set('X-RateLimit-Strategy', strategy);

      if (!result.allowed) {
        res.set('Retry-After', result.resetIn);

        if (handler) {
          return handler(req, res, next);
        }

        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: result.resetIn,
          limit: result.currentLimit || strategyOptions.capacity || strategyOptions.maxRequests
        });
      }

      next();
    } catch (error) {
      console.error('Rate limit middleware error:', error.message);
      // Fail open on error
      next();
    }
  };
}

/**
 * Preset rate limiting configurations for different tiers
 */
const RateLimitTiers = {
  /**
   * Public/Anonymous users - Strict limits
   */
  public: {
    strategy: 'token-bucket',
    capacity: 50,
    refillRate: 5,
    namespace: 'public'
  },

  /**
   * Authenticated users - Moderate limits
   */
  authenticated: {
    strategy: 'token-bucket',
    capacity: 200,
    refillRate: 20,
    namespace: 'authenticated',
    keyGenerator: (req) => req.user?.id || req.ip
  },

  /**
   * Premium/VIP users - Higher limits
   */
  premium: {
    strategy: 'token-bucket',
    capacity: 1000,
    refillRate: 100,
    namespace: 'premium',
    keyGenerator: (req) => req.user?.id || req.ip
  },

  /**
   * API endpoints - Per-route limits
   */
  api: {
    strategy: 'sliding-window',
    maxRequests: 100,
    windowMs: 60000,
    namespace: 'api'
  },

  /**
   * Live game data - High frequency, short bursts
   */
  liveData: {
    strategy: 'token-bucket',
    capacity: 30,
    refillRate: 10,
    namespace: 'live'
  },

  /**
   * Write operations - Strict limits to protect database
   */
  mutation: {
    strategy: 'sliding-window',
    maxRequests: 20,
    windowMs: 60000,
    namespace: 'mutation'
  },

  /**
   * Adaptive for dynamic traffic patterns
   */
  adaptive: {
    strategy: 'adaptive',
    baseLimit: 100,
    minLimit: 10,
    maxLimit: 500,
    windowMs: 60000,
    namespace: 'adaptive'
  }
};

/**
 * IP-based DDoS protection
 */
function ddosProtection(options = {}) {
  const {
    maxRequestsPerSecond = 100,
    suspiciousThreshold = 200,
    banDuration = 3600, // 1 hour
    whitelist = []
  } = options;

  const cache = getCacheManager();

  return async (req, res, next) => {
    const ip = req.ip;

    // Check whitelist
    if (whitelist.includes(ip)) {
      return next();
    }

    try {
      // Check if IP is banned
      const banKey = cache.generateKey('ddos-ban', ip);
      const isBanned = await cache.exists(banKey);

      if (isBanned) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Your IP has been temporarily banned due to suspicious activity'
        });
      }

      // Count requests in current second
      const countKey = cache.generateKey('ddos-count', `${ip}:${Math.floor(Date.now() / 1000)}`);
      const count = await cache.increment(countKey, 2);

      // Check for suspicious activity
      if (count > suspiciousThreshold) {
        // Ban the IP
        await cache.set(banKey, true, banDuration);
        console.warn(`⚠ IP banned for suspicious activity: ${ip} (${count} req/s)`);

        return res.status(403).json({
          error: 'Forbidden',
          message: 'Your IP has been banned due to suspicious activity'
        });
      }

      // Apply rate limit
      if (count > maxRequestsPerSecond) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Request rate too high'
        });
      }

      next();
    } catch (error) {
      console.error('DDoS protection error:', error.message);
      // Fail open
      next();
    }
  };
}

module.exports = {
  distributedRateLimit,
  TokenBucketLimiter,
  SlidingWindowLimiter,
  AdaptiveRateLimiter,
  RateLimitTiers,
  ddosProtection
};
