/**
 * API Response Caching Middleware
 * Implements intelligent caching for high-traffic scenarios
 */

const { getCacheManager } = require('../utils/cache');

/**
 * Response caching middleware factory
 * @param {Object} options - Caching options
 * @param {number} options.ttl - Time to live in seconds
 * @param {string} options.namespace - Cache namespace
 * @param {Function} options.keyGenerator - Custom key generator
 * @param {Function} options.shouldCache - Determine if response should be cached
 * @param {Array} options.varyBy - Request properties to vary cache by (e.g., ['user', 'team'])
 */
function cacheResponse(options = {}) {
  const {
    ttl = 300, // 5 minutes default
    namespace = 'api',
    keyGenerator = null,
    shouldCache = (req, res, body) => res.statusCode === 200,
    varyBy = [],
    excludeParams = [] // Query params to exclude from cache key
  } = options;

  return async (req, res, next) => {
    const cache = getCacheManager();

    // Skip caching if not connected or for non-GET requests
    if (!cache.isConnected || req.method !== 'GET') {
      return next();
    }

    try {
      // Generate cache key
      let cacheKey;
      if (keyGenerator) {
        cacheKey = keyGenerator(req);
      } else {
        const baseKey = req.originalUrl || req.url;
        const params = { ...req.query };

        // Remove excluded params
        excludeParams.forEach(param => delete params[param]);

        // Add vary-by values
        const varyValues = {};
        varyBy.forEach(field => {
          if (req.user && req.user[field]) {
            varyValues[field] = req.user[field];
          } else if (req[field]) {
            varyValues[field] = req[field];
          }
        });

        cacheKey = cache.generateKey(namespace, baseKey, { ...params, ...varyValues });
      }

      // Try to get from cache
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        // Cache hit - return cached response
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-Key', cacheKey);
        return res.json(cachedResponse);
      }

      // Cache miss - intercept response
      res.set('X-Cache', 'MISS');
      res.set('X-Cache-Key', cacheKey);

      // Store original send function
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = function (body) {
        // Check if we should cache this response
        if (shouldCache(req, res, body)) {
          // Cache asynchronously (don't block response)
          setImmediate(async () => {
            try {
              await cache.set(cacheKey, body, ttl);
            } catch (error) {
              console.error('Error caching response:', error.message);
            }
          });
        }

        // Send original response
        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error.message);
      next();
    }
  };
}

/**
 * Conditional caching middleware
 * Only caches responses when conditions are met
 */
function conditionalCache(conditions) {
  return async (req, res, next) => {
    const cache = getCacheManager();

    // Check all conditions
    const shouldUseCache = conditions.every(condition => {
      if (typeof condition === 'function') {
        return condition(req);
      }
      return condition;
    });

    if (!shouldUseCache) {
      res.set('X-Cache', 'SKIP');
      return next();
    }

    next();
  };
}

/**
 * Cache invalidation middleware
 * Invalidates cache on mutations (POST, PUT, DELETE)
 */
function invalidateCache(namespaces = []) {
  return async (req, res, next) => {
    const cache = getCacheManager();

    // Only invalidate on mutations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    // Store original send to invalidate after response
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      // Invalidate cache asynchronously after successful response
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setImmediate(async () => {
          try {
            for (const namespace of namespaces) {
              await cache.invalidateNamespace(namespace);
              console.log(`✓ Invalidated cache namespace: ${namespace}`);
            }
          } catch (error) {
            console.error('Error invalidating cache:', error.message);
          }
        });
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Preset caching strategies for common use cases
 */
const CacheStrategies = {
  /**
   * Static data that rarely changes (standings, team info)
   * Long TTL, aggressive caching
   */
  staticData: {
    ttl: 3600, // 1 hour
    namespace: 'static',
    shouldCache: (req, res, body) => res.statusCode === 200 && body
  },

  /**
   * Dynamic game data (live scores, real-time updates)
   * Short TTL, frequent updates
   */
  liveData: {
    ttl: 30, // 30 seconds
    namespace: 'live',
    shouldCache: (req, res, body) => res.statusCode === 200
  },

  /**
   * User-specific data
   * Medium TTL, vary by user
   */
  userData: {
    ttl: 300, // 5 minutes
    namespace: 'user',
    varyBy: ['userId', 'sessionId'],
    shouldCache: (req, res, body) => res.statusCode === 200
  },

  /**
   * Leaderboard and rankings
   * Medium-short TTL, high traffic
   */
  leaderboard: {
    ttl: 120, // 2 minutes
    namespace: 'leaderboard',
    shouldCache: (req, res, body) => res.statusCode === 200 && body && body.rankings
  },

  /**
   * Game history and archives
   * Very long TTL, immutable data
   */
  archiveData: {
    ttl: 86400, // 24 hours
    namespace: 'archive',
    shouldCache: (req, res, body) => res.statusCode === 200
  }
};

/**
 * Batch cache warmer - preload common requests
 */
async function warmCommonRoutes(routes) {
  const cache = getCacheManager();

  console.log('Starting cache warming...');

  const results = await Promise.allSettled(
    routes.map(async route => {
      const { path, data, ttl, namespace } = route;
      const key = cache.generateKey(namespace || 'api', path);
      await cache.set(key, data, ttl || 300);
      return path;
    })
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  console.log(`✓ Cache warming complete: ${successful}/${routes.length} routes`);

  return successful;
}

/**
 * Cache stats endpoint middleware
 */
function cacheStatsEndpoint(req, res) {
  const cache = getCacheManager();
  const stats = cache.getStats();

  res.json({
    cache: stats,
    timestamp: new Date().toISOString(),
    strategies: Object.keys(CacheStrategies)
  });
}

/**
 * Cache control headers middleware
 */
function setCacheHeaders(maxAge = 300, options = {}) {
  const {
    public: isPublic = true,
    immutable = false,
    staleWhileRevalidate = 60,
    staleIfError = 86400
  } = options;

  return (req, res, next) => {
    const directives = [
      isPublic ? 'public' : 'private',
      `max-age=${maxAge}`,
      immutable ? 'immutable' : ''
    ].filter(Boolean);

    if (staleWhileRevalidate > 0) {
      directives.push(`stale-while-revalidate=${staleWhileRevalidate}`);
    }

    if (staleIfError > 0) {
      directives.push(`stale-if-error=${staleIfError}`);
    }

    res.set('Cache-Control', directives.join(', '));
    next();
  };
}

module.exports = {
  cacheResponse,
  conditionalCache,
  invalidateCache,
  CacheStrategies,
  warmCommonRoutes,
  cacheStatsEndpoint,
  setCacheHeaders
};
