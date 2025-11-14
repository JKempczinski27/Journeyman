/**
 * Monitoring and Metrics for High-Traffic Applications
 * Prometheus-compatible metrics collection
 */

const promClient = require('prom-client');

class MetricsCollector {
  constructor() {
    // Create a Registry to register the metrics
    this.register = new promClient.Registry();

    // Add default metrics (CPU, memory, etc.)
    promClient.collectDefaultMetrics({
      register: this.register,
      prefix: 'journeyman_',
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
    });

    // HTTP request metrics
    this.httpRequestDuration = new promClient.Histogram({
      name: 'journeyman_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
    });

    this.httpRequestTotal = new promClient.Counter({
      name: 'journeyman_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code']
    });

    this.httpRequestSize = new promClient.Histogram({
      name: 'journeyman_http_request_size_bytes',
      help: 'Size of HTTP requests in bytes',
      labelNames: ['method', 'route'],
      buckets: [100, 1000, 10000, 100000, 1000000]
    });

    this.httpResponseSize = new promClient.Histogram({
      name: 'journeyman_http_response_size_bytes',
      help: 'Size of HTTP responses in bytes',
      labelNames: ['method', 'route'],
      buckets: [100, 1000, 10000, 100000, 1000000]
    });

    // Cache metrics
    this.cacheHits = new promClient.Counter({
      name: 'journeyman_cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_name']
    });

    this.cacheMisses = new promClient.Counter({
      name: 'journeyman_cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_name']
    });

    // Database metrics
    this.dbQueryDuration = new promClient.Histogram({
      name: 'journeyman_db_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['query_type', 'table'],
      buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
    });

    this.dbConnectionPool = new promClient.Gauge({
      name: 'journeyman_db_connection_pool',
      help: 'Database connection pool metrics',
      labelNames: ['state'] // active, idle, waiting
    });

    // Queue metrics
    this.queueJobsTotal = new promClient.Counter({
      name: 'journeyman_queue_jobs_total',
      help: 'Total number of queue jobs',
      labelNames: ['queue', 'status'] // completed, failed
    });

    this.queueJobDuration = new promClient.Histogram({
      name: 'journeyman_queue_job_duration_seconds',
      help: 'Duration of queue jobs in seconds',
      labelNames: ['queue'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
    });

    this.queueSize = new promClient.Gauge({
      name: 'journeyman_queue_size',
      help: 'Current size of queue',
      labelNames: ['queue', 'state'] // waiting, active, delayed
    });

    // Business metrics
    this.gameCompletions = new promClient.Counter({
      name: 'journeyman_game_completions_total',
      help: 'Total number of game completions',
      labelNames: ['game_type']
    });

    this.userSessions = new promClient.Gauge({
      name: 'journeyman_active_sessions',
      help: 'Number of active user sessions'
    });

    this.errorRate = new promClient.Counter({
      name: 'journeyman_errors_total',
      help: 'Total number of errors',
      labelNames: ['type', 'severity']
    });

    // Rate limiting metrics
    this.rateLimitHits = new promClient.Counter({
      name: 'journeyman_rate_limit_hits_total',
      help: 'Total number of rate limit hits',
      labelNames: ['tier']
    });

    // WebSocket metrics
    this.wsConnections = new promClient.Gauge({
      name: 'journeyman_websocket_connections',
      help: 'Number of active WebSocket connections'
    });

    this.wsMessagesTotal = new promClient.Counter({
      name: 'journeyman_websocket_messages_total',
      help: 'Total number of WebSocket messages',
      labelNames: ['direction'] // inbound, outbound
    });

    // Register all metrics
    this.register.registerMetric(this.httpRequestDuration);
    this.register.registerMetric(this.httpRequestTotal);
    this.register.registerMetric(this.httpRequestSize);
    this.register.registerMetric(this.httpResponseSize);
    this.register.registerMetric(this.cacheHits);
    this.register.registerMetric(this.cacheMisses);
    this.register.registerMetric(this.dbQueryDuration);
    this.register.registerMetric(this.dbConnectionPool);
    this.register.registerMetric(this.queueJobsTotal);
    this.register.registerMetric(this.queueJobDuration);
    this.register.registerMetric(this.queueSize);
    this.register.registerMetric(this.gameCompletions);
    this.register.registerMetric(this.userSessions);
    this.register.registerMetric(this.errorRate);
    this.register.registerMetric(this.rateLimitHits);
    this.register.registerMetric(this.wsConnections);
    this.register.registerMetric(this.wsMessagesTotal);
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics() {
    return await this.register.metrics();
  }

  /**
   * Get metrics in JSON format
   */
  async getMetricsJSON() {
    return await this.register.getMetricsAsJSON();
  }
}

// Singleton instance
let metricsInstance = null;

function getMetricsCollector() {
  if (!metricsInstance) {
    metricsInstance = new MetricsCollector();
  }
  return metricsInstance;
}

/**
 * HTTP metrics middleware
 */
function metricsMiddleware() {
  const metrics = getMetricsCollector();

  return (req, res, next) => {
    const startTime = Date.now();

    // Track request size
    const requestSize = parseInt(req.get('content-length') || '0');
    const route = req.route?.path || req.path || 'unknown';

    // Intercept response to track metrics
    const originalSend = res.send;
    const originalJson = res.json;

    res.send = function (data) {
      const responseSize = Buffer.byteLength(data || '');
      trackResponseMetrics(responseSize);
      return originalSend.call(this, data);
    };

    res.json = function (data) {
      const responseSize = Buffer.byteLength(JSON.stringify(data));
      trackResponseMetrics(responseSize);
      return originalJson.call(this, data);
    };

    function trackResponseMetrics(responseSize) {
      const duration = (Date.now() - startTime) / 1000;

      const labels = {
        method: req.method,
        route,
        status_code: res.statusCode
      };

      metrics.httpRequestDuration.observe(labels, duration);
      metrics.httpRequestTotal.inc(labels);
      metrics.httpRequestSize.observe(
        { method: req.method, route },
        requestSize
      );
      metrics.httpResponseSize.observe(
        { method: req.method, route },
        responseSize
      );

      // Track errors
      if (res.statusCode >= 400) {
        const severity = res.statusCode >= 500 ? 'error' : 'warning';
        metrics.errorRate.inc({
          type: `http_${res.statusCode}`,
          severity
        });
      }
    }

    res.on('finish', () => {
      if (!res.headersSent) {
        trackResponseMetrics(0);
      }
    });

    next();
  };
}

/**
 * Database metrics wrapper
 */
function trackDbQuery(queryType, table, queryFunction) {
  const metrics = getMetricsCollector();
  const startTime = Date.now();

  return queryFunction()
    .then(result => {
      const duration = (Date.now() - startTime) / 1000;
      metrics.dbQueryDuration.observe({ query_type: queryType, table }, duration);
      return result;
    })
    .catch(error => {
      const duration = (Date.now() - startTime) / 1000;
      metrics.dbQueryDuration.observe({ query_type: queryType, table }, duration);
      metrics.errorRate.inc({ type: 'database_error', severity: 'error' });
      throw error;
    });
}

/**
 * Queue metrics tracking
 */
function trackQueueJob(queueName, jobFunction) {
  const metrics = getMetricsCollector();
  const startTime = Date.now();

  return jobFunction()
    .then(result => {
      const duration = (Date.now() - startTime) / 1000;
      metrics.queueJobDuration.observe({ queue: queueName }, duration);
      metrics.queueJobsTotal.inc({ queue: queueName, status: 'completed' });
      return result;
    })
    .catch(error => {
      const duration = (Date.now() - startTime) / 1000;
      metrics.queueJobDuration.observe({ queue: queueName }, duration);
      metrics.queueJobsTotal.inc({ queue: queueName, status: 'failed' });
      throw error;
    });
}

/**
 * Health check with detailed metrics
 */
async function healthCheck() {
  const metrics = getMetricsCollector();

  try {
    const metricsData = await metrics.getMetricsJSON();

    // Calculate health score
    const errorMetric = metricsData.find(m => m.name === 'journeyman_errors_total');
    const requestMetric = metricsData.find(m => m.name === 'journeyman_http_requests_total');

    const totalErrors = errorMetric?.values.reduce((sum, v) => sum + v.value, 0) || 0;
    const totalRequests = requestMetric?.values.reduce((sum, v) => sum + v.value, 0) || 0;

    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    const healthScore = Math.max(0, 100 - errorRate);

    return {
      status: healthScore > 90 ? 'healthy' : healthScore > 70 ? 'degraded' : 'unhealthy',
      healthScore: healthScore.toFixed(2),
      metrics: {
        totalRequests,
        totalErrors,
        errorRate: `${errorRate.toFixed(2)}%`
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Metrics endpoint handler
 */
async function metricsEndpoint(req, res) {
  const metrics = getMetricsCollector();

  try {
    res.set('Content-Type', promClient.register.contentType);
    const metricsOutput = await metrics.getMetrics();
    res.send(metricsOutput);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Performance monitoring middleware
 */
class PerformanceMonitor {
  constructor() {
    this.measurements = [];
    this.maxMeasurements = 1000;
  }

  measure(name, duration, metadata = {}) {
    this.measurements.push({
      name,
      duration,
      metadata,
      timestamp: Date.now()
    });

    // Keep only recent measurements
    if (this.measurements.length > this.maxMeasurements) {
      this.measurements.shift();
    }
  }

  getStats(name, timeWindowMs = 60000) {
    const now = Date.now();
    const relevant = this.measurements.filter(
      m => m.name === name && (now - m.timestamp) < timeWindowMs
    );

    if (relevant.length === 0) {
      return null;
    }

    const durations = relevant.map(m => m.duration);
    const sorted = durations.sort((a, b) => a - b);

    return {
      count: relevant.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: durations.reduce((a, b) => a + b, 0) / durations.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
}

const performanceMonitor = new PerformanceMonitor();

module.exports = {
  MetricsCollector,
  getMetricsCollector,
  metricsMiddleware,
  trackDbQuery,
  trackQueueJob,
  healthCheck,
  metricsEndpoint,
  PerformanceMonitor,
  performanceMonitor
};
