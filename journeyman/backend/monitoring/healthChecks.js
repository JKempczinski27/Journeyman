/**
 * Health Check Module
 * Comprehensive health monitoring for all application dependencies
 */

const { Pool } = require('pg');
const { S3Manager } = require('../config/awsConfig');

class HealthCheckService {
  constructor() {
    this.startTime = Date.now();
    this.healthStatus = {
      overall: 'healthy',
      services: {},
      lastCheck: null
    };
  }

  /**
   * Get server uptime in seconds
   */
  getUptime() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Check database connectivity
   */
  async checkDatabase() {
    try {
      const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'journeyman',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        max: 1,
        connectionTimeoutMillis: 5000,
      });

      const start = Date.now();
      const result = await pool.query('SELECT NOW()');
      const latency = Date.now() - start;

      await pool.end();

      return {
        status: 'healthy',
        latency: `${latency}ms`,
        connected: true,
        timestamp: result.rows[0].now
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connected: false
      };
    }
  }

  /**
   * Check S3 connectivity
   */
  async checkS3() {
    try {
      const s3Manager = new S3Manager();

      if (!s3Manager.enabled) {
        return {
          status: 'degraded',
          mode: 'mock',
          message: 'Running in mock mode - S3 disabled'
        };
      }

      const start = Date.now();
      await s3Manager.listFiles('', 1);
      const latency = Date.now() - start;

      return {
        status: 'healthy',
        latency: `${latency}ms`,
        connected: true,
        bucket: process.env.AWS_S3_BUCKET || 'not-configured'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connected: false
      };
    }
  }

  /**
   * Check Redis connectivity (if configured)
   */
  async checkRedis() {
    // Redis is optional, return healthy if not configured
    if (!process.env.REDIS_URL) {
      return {
        status: 'not-configured',
        message: 'Redis not configured'
      };
    }

    try {
      const redis = require('redis');
      const client = redis.createClient({
        url: process.env.REDIS_URL,
        socket: {
          connectTimeout: 5000
        }
      });

      const start = Date.now();
      await client.connect();
      await client.ping();
      const latency = Date.now() - start;
      await client.quit();

      return {
        status: 'healthy',
        latency: `${latency}ms`,
        connected: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connected: false
      };
    }
  }

  /**
   * Check memory usage
   */
  checkMemory() {
    const used = process.memoryUsage();
    const mbUsed = Math.round(used.heapUsed / 1024 / 1024);
    const mbTotal = Math.round(used.heapTotal / 1024 / 1024);
    const percentUsed = Math.round((used.heapUsed / used.heapTotal) * 100);

    return {
      status: percentUsed > 90 ? 'critical' : percentUsed > 75 ? 'warning' : 'healthy',
      heapUsed: `${mbUsed}MB`,
      heapTotal: `${mbTotal}MB`,
      percentUsed: `${percentUsed}%`,
      rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
      external: `${Math.round(used.external / 1024 / 1024)}MB`
    };
  }

  /**
   * Check CPU usage
   */
  checkCPU() {
    const cpuUsage = process.cpuUsage();
    const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds

    return {
      status: 'healthy',
      user: `${Math.round(cpuUsage.user / 1000)}ms`,
      system: `${Math.round(cpuUsage.system / 1000)}ms`,
      total: `${totalUsage.toFixed(2)}s`
    };
  }

  /**
   * Comprehensive health check
   */
  async performHealthCheck() {
    const checks = {
      timestamp: new Date().toISOString(),
      uptime: `${this.getUptime()}s`,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {}
    };

    // Run all checks in parallel
    const [database, s3, redis, memory, cpu] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkS3(),
      this.checkRedis(),
      Promise.resolve(this.checkMemory()),
      Promise.resolve(this.checkCPU())
    ]);

    checks.services.database = database.status === 'fulfilled' ? database.value : { status: 'error', error: database.reason?.message };
    checks.services.s3 = s3.status === 'fulfilled' ? s3.value : { status: 'error', error: s3.reason?.message };
    checks.services.redis = redis.status === 'fulfilled' ? redis.value : { status: 'error', error: redis.reason?.message };
    checks.services.memory = memory.status === 'fulfilled' ? memory.value : { status: 'error' };
    checks.services.cpu = cpu.status === 'fulfilled' ? cpu.value : { status: 'error' };

    // Determine overall status
    const statuses = Object.values(checks.services).map(s => s.status);
    if (statuses.includes('unhealthy') || statuses.includes('critical')) {
      checks.status = 'unhealthy';
    } else if (statuses.includes('degraded') || statuses.includes('warning')) {
      checks.status = 'degraded';
    } else {
      checks.status = 'healthy';
    }

    this.healthStatus = checks;
    this.healthStatus.lastCheck = checks.timestamp;

    return checks;
  }

  /**
   * Get cached health status (for quick checks)
   */
  getCachedStatus() {
    return this.healthStatus;
  }

  /**
   * Liveness probe - simple check that server is running
   */
  livenessProbe() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: `${this.getUptime()}s`
    };
  }

  /**
   * Readiness probe - check if server is ready to accept traffic
   */
  async readinessProbe() {
    const memory = this.checkMemory();

    // Server is ready if memory isn't critical
    const isReady = memory.status !== 'critical';

    return {
      status: isReady ? 'ready' : 'not-ready',
      timestamp: new Date().toISOString(),
      memory: memory.status
    };
  }
}

module.exports = new HealthCheckService();
