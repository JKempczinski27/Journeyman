/**
 * Redis Cache Manager for High-Traffic Scenarios
 * Supports NFL.com-level traffic with distributed caching
 */

const Redis = require('ioredis');
const crypto = require('crypto');

class CacheManager {
  constructor() {
    this.redisClient = null;
    this.isConnected = false;
    this.defaultTTL = 300; // 5 minutes default
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0
    };
  }

  /**
   * Initialize Redis connection with cluster support
   */
  async initialize() {
    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_CACHE_DB || '1'),
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
        // Connection pool settings for high traffic
        connectionName: 'journeyman-cache',
        keepAlive: 30000,
        // Performance optimizations
        enableOfflineQueue: true,
        showFriendlyErrorStack: process.env.NODE_ENV !== 'production'
      };

      // Support for Redis Cluster (for extreme scale)
      if (process.env.REDIS_CLUSTER_ENABLED === 'true') {
        const nodes = (process.env.REDIS_CLUSTER_NODES || 'localhost:6379')
          .split(',')
          .map(node => {
            const [host, port] = node.split(':');
            return { host, port: parseInt(port) };
          });

        this.redisClient = new Redis.Cluster(nodes, {
          redisOptions: redisConfig,
          clusterRetryStrategy: (times) => Math.min(times * 100, 2000)
        });
      } else {
        this.redisClient = new Redis(redisConfig);
      }

      this.redisClient.on('connect', () => {
        console.log('✓ Redis cache connected');
        this.isConnected = true;
      });

      this.redisClient.on('error', (err) => {
        console.error('Redis cache error:', err.message);
        this.stats.errors++;
        this.isConnected = false;
      });

      this.redisClient.on('ready', () => {
        console.log('✓ Redis cache ready for high-traffic operations');
      });

      // Wait for connection
      await this.redisClient.ping();
      return true;
    } catch (error) {
      console.error('Failed to initialize Redis cache:', error.message);
      return false;
    }
  }

  /**
   * Generate cache key with namespace and versioning
   */
  generateKey(namespace, identifier, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {});

    const paramString = JSON.stringify(sortedParams);
    const hash = crypto
      .createHash('md5')
      .update(paramString)
      .digest('hex')
      .substring(0, 8);

    const version = process.env.CACHE_VERSION || 'v1';
    return `journeyman:${version}:${namespace}:${identifier}:${hash}`;
  }

  /**
   * Get cached value with automatic deserialization
   */
  async get(key) {
    if (!this.isConnected) {
      return null;
    }

    try {
      const value = await this.redisClient.get(key);

      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;

      try {
        return JSON.parse(value);
      } catch {
        return value; // Return as string if not JSON
      }
    } catch (error) {
      console.error('Cache get error:', error.message);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Set cached value with TTL
   */
  async set(key, value, ttl = this.defaultTTL) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const serialized = typeof value === 'string'
        ? value
        : JSON.stringify(value);

      await this.redisClient.setex(key, ttl, serialized);
      return true;
    } catch (error) {
      console.error('Cache set error:', error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Delete cached value(s) - supports pattern matching
   */
  async delete(pattern) {
    if (!this.isConnected) {
      return 0;
    }

    try {
      if (pattern.includes('*')) {
        // Pattern-based deletion
        const keys = await this.redisClient.keys(pattern);
        if (keys.length === 0) return 0;

        return await this.redisClient.del(...keys);
      } else {
        // Single key deletion
        return await this.redisClient.del(pattern);
      }
    } catch (error) {
      console.error('Cache delete error:', error.message);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Invalidate cache by namespace
   */
  async invalidateNamespace(namespace) {
    const pattern = `journeyman:*:${namespace}:*`;
    return await this.delete(pattern);
  }

  /**
   * Get or set (cache-aside pattern)
   */
  async getOrSet(key, fetchFunction, ttl = this.defaultTTL) {
    // Try to get from cache first
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from source
    try {
      const value = await fetchFunction();
      await this.set(key, value, ttl);
      return value;
    } catch (error) {
      console.error('Cache getOrSet error:', error.message);
      throw error;
    }
  }

  /**
   * Increment counter (for rate limiting, statistics)
   */
  async increment(key, ttl = 60) {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const value = await this.redisClient.incr(key);
      if (value === 1) {
        // First increment, set TTL
        await this.redisClient.expire(key, ttl);
      }
      return value;
    } catch (error) {
      console.error('Cache increment error:', error.message);
      return 0;
    }
  }

  /**
   * Cache warming - pre-load hot data
   */
  async warmCache(namespace, dataLoader, ttl = 600) {
    try {
      const data = await dataLoader();
      const promises = data.map(item =>
        this.set(
          this.generateKey(namespace, item.id || item.key),
          item,
          ttl
        )
      );
      await Promise.all(promises);
      console.log(`✓ Warmed ${data.length} items in ${namespace} cache`);
      return data.length;
    } catch (error) {
      console.error('Cache warming error:', error.message);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;

    return {
      ...this.stats,
      total,
      hitRate: `${hitRate}%`,
      isConnected: this.isConnected
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = { hits: 0, misses: 0, errors: 0 };
  }

  /**
   * Multi-get operation for batch retrieval
   */
  async mget(keys) {
    if (!this.isConnected || keys.length === 0) {
      return [];
    }

    try {
      const values = await this.redisClient.mget(...keys);
      return values.map(value => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }
        this.stats.hits++;
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    } catch (error) {
      console.error('Cache mget error:', error.message);
      this.stats.errors++;
      return new Array(keys.length).fill(null);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const result = await this.redisClient.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error.message);
      return false;
    }
  }

  /**
   * Set TTL on existing key
   */
  async expire(key, ttl) {
    if (!this.isConnected) {
      return false;
    }

    try {
      const result = await this.redisClient.expire(key, ttl);
      return result === 1;
    } catch (error) {
      console.error('Cache expire error:', error.message);
      return false;
    }
  }

  /**
   * Close Redis connection gracefully
   */
  async close() {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.isConnected = false;
      console.log('✓ Redis cache connection closed');
    }
  }
}

// Singleton instance
let cacheInstance = null;

/**
 * Get or create cache manager instance
 */
function getCacheManager() {
  if (!cacheInstance) {
    cacheInstance = new CacheManager();
  }
  return cacheInstance;
}

module.exports = {
  CacheManager,
  getCacheManager
};
