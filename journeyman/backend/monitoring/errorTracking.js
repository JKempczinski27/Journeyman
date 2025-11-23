/**
 * Error Tracking Module
 * Comprehensive error logging, tracking, and aggregation
 */

class ErrorTracker {
  constructor() {
    this.errors = [];
    this.errorCounts = new Map();
    this.maxStoredErrors = 1000;
    this.errorRateWindow = 60000; // 1 minute
    this.errorRateThreshold = 10; // errors per minute
  }

  /**
   * Track an error
   */
  trackError(error, context = {}) {
    const errorEntry = {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      message: error.message || String(error),
      stack: error.stack,
      type: error.constructor.name,
      severity: this.determineSeverity(error, context),
      context: {
        ...context,
        url: context.url || context.path,
        method: context.method,
        ip: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId
      },
      fingerprint: this.generateFingerprint(error, context)
    };

    // Store error
    this.errors.unshift(errorEntry);

    // Maintain max size
    if (this.errors.length > this.maxStoredErrors) {
      this.errors = this.errors.slice(0, this.maxStoredErrors);
    }

    // Update error counts for rate limiting
    const fingerprint = errorEntry.fingerprint;
    if (!this.errorCounts.has(fingerprint)) {
      this.errorCounts.set(fingerprint, []);
    }
    this.errorCounts.get(fingerprint).push(Date.now());

    // Log to console with severity
    this.logError(errorEntry);

    // Check if we should trigger an alert
    if (this.shouldAlert(errorEntry)) {
      this.triggerAlert(errorEntry);
    }

    return errorEntry;
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate error fingerprint for grouping similar errors
   */
  generateFingerprint(error, context) {
    const message = error.message || String(error);
    const type = error.constructor.name;
    const stackFirstLine = error.stack ? error.stack.split('\n')[1] : '';

    return `${type}:${message}:${stackFirstLine}`.replace(/[0-9]/g, 'X');
  }

  /**
   * Determine error severity
   */
  determineSeverity(error, context) {
    // Critical errors
    if (error.message?.includes('database') ||
        error.message?.includes('ECONNREFUSED') ||
        context.statusCode >= 500) {
      return 'critical';
    }

    // High severity
    if (error.message?.includes('auth') ||
        error.message?.includes('permission') ||
        context.statusCode === 403 || context.statusCode === 401) {
      return 'high';
    }

    // Medium severity
    if (context.statusCode >= 400 && context.statusCode < 500) {
      return 'medium';
    }

    // Low severity
    return 'low';
  }

  /**
   * Log error to console
   */
  logError(errorEntry) {
    const logObj = {
      timestamp: errorEntry.timestamp,
      errorId: errorEntry.id,
      type: errorEntry.type,
      severity: errorEntry.severity,
      message: errorEntry.message,
      fingerprint: errorEntry.fingerprint,
      context: errorEntry.context
    };

    const logLevel = errorEntry.severity === 'critical' ? 'error' :
                     errorEntry.severity === 'high' ? 'error' : 'warn';

    console[logLevel](JSON.stringify(logObj));
  }

  /**
   * Check if error should trigger an alert
   */
  shouldAlert(errorEntry) {
    // Always alert on critical errors
    if (errorEntry.severity === 'critical') {
      return true;
    }

    // Check error rate
    const fingerprint = errorEntry.fingerprint;
    const recentErrors = this.errorCounts.get(fingerprint) || [];
    const now = Date.now();

    // Filter to errors in the last minute
    const recentCount = recentErrors.filter(t => now - t < this.errorRateWindow).length;

    return recentCount >= this.errorRateThreshold;
  }

  /**
   * Trigger alert (placeholder for integration with notification system)
   */
  triggerAlert(errorEntry) {
    console.error('🚨 ALERT: Error threshold exceeded', {
      errorId: errorEntry.id,
      severity: errorEntry.severity,
      message: errorEntry.message,
      fingerprint: errorEntry.fingerprint
    });
  }

  /**
   * Get error statistics
   */
  getErrorStats(timeWindow = 3600000) { // Default 1 hour
    const now = Date.now();
    const windowStart = now - timeWindow;

    const recentErrors = this.errors.filter(e =>
      new Date(e.timestamp).getTime() > windowStart
    );

    // Group by severity
    const bySeverity = {
      critical: recentErrors.filter(e => e.severity === 'critical').length,
      high: recentErrors.filter(e => e.severity === 'high').length,
      medium: recentErrors.filter(e => e.severity === 'medium').length,
      low: recentErrors.filter(e => e.severity === 'low').length
    };

    // Group by type
    const byType = {};
    recentErrors.forEach(e => {
      byType[e.type] = (byType[e.type] || 0) + 1;
    });

    // Top errors by fingerprint
    const byFingerprint = {};
    recentErrors.forEach(e => {
      if (!byFingerprint[e.fingerprint]) {
        byFingerprint[e.fingerprint] = {
          count: 0,
          message: e.message,
          severity: e.severity,
          lastOccurrence: e.timestamp
        };
      }
      byFingerprint[e.fingerprint].count++;
    });

    const topErrors = Object.entries(byFingerprint)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([fingerprint, data]) => ({ fingerprint, ...data }));

    return {
      timeWindow: `${timeWindow / 1000}s`,
      totalErrors: recentErrors.length,
      bySeverity,
      byType,
      topErrors,
      errorRate: (recentErrors.length / (timeWindow / 60000)).toFixed(2) + ' errors/min'
    };
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 50, severity = null) {
    let errors = this.errors;

    if (severity) {
      errors = errors.filter(e => e.severity === severity);
    }

    return errors.slice(0, limit);
  }

  /**
   * Get error by ID
   */
  getErrorById(id) {
    return this.errors.find(e => e.id === id);
  }

  /**
   * Clear old errors (cleanup)
   */
  clearOldErrors(maxAge = 86400000) { // Default 24 hours
    const cutoff = Date.now() - maxAge;
    this.errors = this.errors.filter(e =>
      new Date(e.timestamp).getTime() > cutoff
    );

    // Clean up error counts
    for (const [fingerprint, timestamps] of this.errorCounts.entries()) {
      const recent = timestamps.filter(t => t > cutoff);
      if (recent.length === 0) {
        this.errorCounts.delete(fingerprint);
      } else {
        this.errorCounts.set(fingerprint, recent);
      }
    }
  }

  /**
   * Express middleware for automatic error tracking
   */
  middleware() {
    return (err, req, res, next) => {
      const context = {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        requestId: req.id,
        statusCode: res.statusCode || 500
      };

      this.trackError(err, context);
      next(err);
    };
  }
}

module.exports = new ErrorTracker();
