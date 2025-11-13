/**
 * Performance Monitoring Module
 * Track application performance metrics and expose Prometheus-compatible metrics
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      http: {
        requests: {
          total: 0,
          byMethod: {},
          byStatus: {},
          byRoute: {}
        },
        responseTime: {
          sum: 0,
          count: 0,
          histogram: {
            '0-100ms': 0,
            '100-500ms': 0,
            '500-1000ms': 0,
            '1000-5000ms': 0,
            '5000+ms': 0
          }
        }
      },
      database: {
        queries: {
          total: 0,
          errors: 0,
          slowQueries: 0 // queries > 1s
        },
        queryTime: {
          sum: 0,
          count: 0
        }
      },
      s3: {
        operations: {
          total: 0,
          uploads: 0,
          downloads: 0,
          errors: 0
        },
        operationTime: {
          sum: 0,
          count: 0
        }
      },
      errors: {
        total: 0,
        bySeverity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        }
      },
      custom: {}
    };

    this.activeRequests = 0;
    this.startTime = Date.now();
  }

  /**
   * Track HTTP request
   */
  trackRequest(req, res, responseTime) {
    const method = req.method;
    const status = res.statusCode;
    const route = this.normalizeRoute(req.route?.path || req.path);

    // Total requests
    this.metrics.http.requests.total++;

    // By method
    this.metrics.http.requests.byMethod[method] =
      (this.metrics.http.requests.byMethod[method] || 0) + 1;

    // By status
    this.metrics.http.requests.byStatus[status] =
      (this.metrics.http.requests.byStatus[status] || 0) + 1;

    // By route
    this.metrics.http.requests.byRoute[route] =
      (this.metrics.http.requests.byRoute[route] || 0) + 1;

    // Response time
    this.metrics.http.responseTime.sum += responseTime;
    this.metrics.http.responseTime.count++;

    // Response time histogram
    if (responseTime < 100) {
      this.metrics.http.responseTime.histogram['0-100ms']++;
    } else if (responseTime < 500) {
      this.metrics.http.responseTime.histogram['100-500ms']++;
    } else if (responseTime < 1000) {
      this.metrics.http.responseTime.histogram['500-1000ms']++;
    } else if (responseTime < 5000) {
      this.metrics.http.responseTime.histogram['1000-5000ms']++;
    } else {
      this.metrics.http.responseTime.histogram['5000+ms']++;
    }
  }

  /**
   * Normalize route for consistent metrics
   */
  normalizeRoute(path) {
    if (!path) return 'unknown';

    // Replace dynamic segments with placeholder
    return path
      .replace(/\/[0-9a-f]{24}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/gi, '/:uuid');
  }

  /**
   * Track database query
   */
  trackDatabaseQuery(queryTime, error = null) {
    this.metrics.database.queries.total++;

    if (error) {
      this.metrics.database.queries.errors++;
    }

    if (queryTime > 1000) {
      this.metrics.database.queries.slowQueries++;
    }

    this.metrics.database.queryTime.sum += queryTime;
    this.metrics.database.queryTime.count++;
  }

  /**
   * Track S3 operation
   */
  trackS3Operation(operation, operationTime, error = null) {
    this.metrics.s3.operations.total++;

    if (operation === 'upload') {
      this.metrics.s3.operations.uploads++;
    } else if (operation === 'download') {
      this.metrics.s3.operations.downloads++;
    }

    if (error) {
      this.metrics.s3.operations.errors++;
    }

    this.metrics.s3.operationTime.sum += operationTime;
    this.metrics.s3.operationTime.count++;
  }

  /**
   * Track error
   */
  trackError(severity = 'medium') {
    this.metrics.errors.total++;
    this.metrics.errors.bySeverity[severity] =
      (this.metrics.errors.bySeverity[severity] || 0) + 1;
  }

  /**
   * Track custom metric
   */
  trackCustomMetric(name, value, labels = {}) {
    if (!this.metrics.custom[name]) {
      this.metrics.custom[name] = {
        count: 0,
        sum: 0,
        values: [],
        labels: {}
      };
    }

    this.metrics.custom[name].count++;
    this.metrics.custom[name].sum += value;
    this.metrics.custom[name].values.push(value);

    // Store labeled metrics
    if (Object.keys(labels).length > 0) {
      const labelKey = JSON.stringify(labels);
      if (!this.metrics.custom[name].labels[labelKey]) {
        this.metrics.custom[name].labels[labelKey] = { count: 0, sum: 0 };
      }
      this.metrics.custom[name].labels[labelKey].count++;
      this.metrics.custom[name].labels[labelKey].sum += value;
    }
  }

  /**
   * Increment active request count
   */
  incrementActiveRequests() {
    this.activeRequests++;
  }

  /**
   * Decrement active request count
   */
  decrementActiveRequests() {
    this.activeRequests--;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      uptime: `${uptime}s`,
      activeRequests: this.activeRequests,
      http: {
        ...this.metrics.http,
        averageResponseTime: this.metrics.http.responseTime.count > 0
          ? `${Math.round(this.metrics.http.responseTime.sum / this.metrics.http.responseTime.count)}ms`
          : '0ms',
        requestRate: `${(this.metrics.http.requests.total / uptime).toFixed(2)} req/s`
      },
      database: {
        ...this.metrics.database,
        averageQueryTime: this.metrics.database.queryTime.count > 0
          ? `${Math.round(this.metrics.database.queryTime.sum / this.metrics.database.queryTime.count)}ms`
          : '0ms',
        errorRate: this.metrics.database.queries.total > 0
          ? `${((this.metrics.database.queries.errors / this.metrics.database.queries.total) * 100).toFixed(2)}%`
          : '0%'
      },
      s3: {
        ...this.metrics.s3,
        averageOperationTime: this.metrics.s3.operationTime.count > 0
          ? `${Math.round(this.metrics.s3.operationTime.sum / this.metrics.s3.operationTime.count)}ms`
          : '0ms',
        errorRate: this.metrics.s3.operations.total > 0
          ? `${((this.metrics.s3.operations.errors / this.metrics.s3.operations.total) * 100).toFixed(2)}%`
          : '0%'
      },
      errors: this.metrics.errors,
      custom: this.metrics.custom
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  getPrometheusMetrics() {
    const lines = [];
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    // Application uptime
    lines.push('# HELP app_uptime_seconds Application uptime in seconds');
    lines.push('# TYPE app_uptime_seconds counter');
    lines.push(`app_uptime_seconds ${uptime}`);

    // HTTP requests total
    lines.push('# HELP http_requests_total Total HTTP requests');
    lines.push('# TYPE http_requests_total counter');
    lines.push(`http_requests_total ${this.metrics.http.requests.total}`);

    // HTTP requests by method
    lines.push('# HELP http_requests_by_method Total HTTP requests by method');
    lines.push('# TYPE http_requests_by_method counter');
    Object.entries(this.metrics.http.requests.byMethod).forEach(([method, count]) => {
      lines.push(`http_requests_by_method{method="${method}"} ${count}`);
    });

    // HTTP requests by status
    lines.push('# HELP http_requests_by_status Total HTTP requests by status code');
    lines.push('# TYPE http_requests_by_status counter');
    Object.entries(this.metrics.http.requests.byStatus).forEach(([status, count]) => {
      lines.push(`http_requests_by_status{status="${status}"} ${count}`);
    });

    // Response time histogram
    lines.push('# HELP http_response_time_histogram Response time distribution');
    lines.push('# TYPE http_response_time_histogram histogram');
    Object.entries(this.metrics.http.responseTime.histogram).forEach(([bucket, count]) => {
      lines.push(`http_response_time_histogram{bucket="${bucket}"} ${count}`);
    });

    // Average response time
    const avgResponseTime = this.metrics.http.responseTime.count > 0
      ? this.metrics.http.responseTime.sum / this.metrics.http.responseTime.count
      : 0;
    lines.push('# HELP http_response_time_avg Average response time in ms');
    lines.push('# TYPE http_response_time_avg gauge');
    lines.push(`http_response_time_avg ${avgResponseTime.toFixed(2)}`);

    // Active requests
    lines.push('# HELP http_active_requests Current number of active requests');
    lines.push('# TYPE http_active_requests gauge');
    lines.push(`http_active_requests ${this.activeRequests}`);

    // Database metrics
    lines.push('# HELP db_queries_total Total database queries');
    lines.push('# TYPE db_queries_total counter');
    lines.push(`db_queries_total ${this.metrics.database.queries.total}`);

    lines.push('# HELP db_queries_errors Total database query errors');
    lines.push('# TYPE db_queries_errors counter');
    lines.push(`db_queries_errors ${this.metrics.database.queries.errors}`);

    lines.push('# HELP db_queries_slow Total slow database queries (>1s)');
    lines.push('# TYPE db_queries_slow counter');
    lines.push(`db_queries_slow ${this.metrics.database.queries.slowQueries}`);

    // S3 metrics
    lines.push('# HELP s3_operations_total Total S3 operations');
    lines.push('# TYPE s3_operations_total counter');
    lines.push(`s3_operations_total ${this.metrics.s3.operations.total}`);

    lines.push('# HELP s3_operations_errors Total S3 operation errors');
    lines.push('# TYPE s3_operations_errors counter');
    lines.push(`s3_operations_errors ${this.metrics.s3.operations.errors}`);

    // Errors
    lines.push('# HELP app_errors_total Total application errors');
    lines.push('# TYPE app_errors_total counter');
    lines.push(`app_errors_total ${this.metrics.errors.total}`);

    Object.entries(this.metrics.errors.bySeverity).forEach(([severity, count]) => {
      lines.push(`app_errors_by_severity{severity="${severity}"} ${count}`);
    });

    return lines.join('\n') + '\n';
  }

  /**
   * Performance monitoring middleware
   */
  middleware() {
    return (req, res, next) => {
      const start = Date.now();

      this.incrementActiveRequests();

      // Track response
      const originalSend = res.send;
      res.send = function(...args) {
        const duration = Date.now() - start;
        this.trackRequest(req, res, duration);
        this.decrementActiveRequests();
        return originalSend.apply(res, args);
      }.bind(this);

      next();
    };
  }

  /**
   * Reset metrics (for testing)
   */
  reset() {
    this.metrics = {
      http: {
        requests: { total: 0, byMethod: {}, byStatus: {}, byRoute: {} },
        responseTime: { sum: 0, count: 0, histogram: {
          '0-100ms': 0, '100-500ms': 0, '500-1000ms': 0,
          '1000-5000ms': 0, '5000+ms': 0
        }}
      },
      database: {
        queries: { total: 0, errors: 0, slowQueries: 0 },
        queryTime: { sum: 0, count: 0 }
      },
      s3: {
        operations: { total: 0, uploads: 0, downloads: 0, errors: 0 },
        operationTime: { sum: 0, count: 0 }
      },
      errors: {
        total: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 }
      },
      custom: {}
    };
    this.activeRequests = 0;
    this.startTime = Date.now();
  }
}

module.exports = new PerformanceMonitor();
