/**
 * Alert Notification Module
 * Send notifications for critical events via email, webhooks, and logging
 */

const https = require('https');
const http = require('http');

class AlertNotificationService {
  constructor() {
    this.config = {
      email: {
        enabled: process.env.ALERT_EMAIL_ENABLED === 'true',
        recipients: (process.env.ALERT_EMAIL_RECIPIENTS || '').split(',').filter(Boolean),
        smtpHost: process.env.SMTP_HOST,
        smtpPort: process.env.SMTP_PORT || 587,
        smtpUser: process.env.SMTP_USER,
        smtpPassword: process.env.SMTP_PASSWORD,
        from: process.env.SMTP_FROM || 'alerts@journeyman.com'
      },
      webhook: {
        enabled: process.env.ALERT_WEBHOOK_ENABLED === 'true',
        urls: (process.env.ALERT_WEBHOOK_URLS || '').split(',').filter(Boolean),
        headers: this.parseWebhookHeaders()
      },
      slack: {
        enabled: process.env.SLACK_WEBHOOK_URL ? true : false,
        webhookUrl: process.env.SLACK_WEBHOOK_URL
      },
      pagerduty: {
        enabled: process.env.PAGERDUTY_INTEGRATION_KEY ? true : false,
        integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY
      },
      thresholds: {
        errorRate: parseFloat(process.env.ALERT_ERROR_RATE_THRESHOLD) || 10, // errors per minute
        responseTime: parseInt(process.env.ALERT_RESPONSE_TIME_THRESHOLD) || 5000, // ms
        cpuUsage: parseFloat(process.env.ALERT_CPU_THRESHOLD) || 90, // percentage
        memoryUsage: parseFloat(process.env.ALERT_MEMORY_THRESHOLD) || 90 // percentage
      }
    };

    this.alertHistory = [];
    this.maxHistorySize = 500;
    this.recentAlerts = new Map(); // For deduplication
    this.deduplicationWindow = 300000; // 5 minutes
  }

  /**
   * Parse webhook headers from environment
   */
  parseWebhookHeaders() {
    try {
      return JSON.parse(process.env.ALERT_WEBHOOK_HEADERS || '{}');
    } catch {
      return {};
    }
  }

  /**
   * Send alert
   */
  async sendAlert(alert) {
    // Check if we should deduplicate this alert
    if (this.shouldDeduplicate(alert)) {
      console.log('⏭️  Alert deduplicated:', alert.title);
      return;
    }

    // Record alert
    this.recordAlert(alert);

    // Log alert
    this.logAlert(alert);

    // Send through configured channels
    const promises = [];

    if (this.config.slack.enabled) {
      promises.push(this.sendSlackAlert(alert));
    }

    if (this.config.webhook.enabled) {
      promises.push(this.sendWebhookAlert(alert));
    }

    if (this.config.pagerduty.enabled && alert.severity === 'critical') {
      promises.push(this.sendPagerDutyAlert(alert));
    }

    // Wait for all notifications to complete
    const results = await Promise.allSettled(promises);

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error('Alert notification failed:', result.reason);
      }
    });
  }

  /**
   * Check if alert should be deduplicated
   */
  shouldDeduplicate(alert) {
    const key = `${alert.type}:${alert.title}`;
    const now = Date.now();

    if (this.recentAlerts.has(key)) {
      const lastAlert = this.recentAlerts.get(key);
      if (now - lastAlert < this.deduplicationWindow) {
        return true;
      }
    }

    this.recentAlerts.set(key, now);

    // Clean up old entries
    for (const [k, timestamp] of this.recentAlerts.entries()) {
      if (now - timestamp > this.deduplicationWindow) {
        this.recentAlerts.delete(k);
      }
    }

    return false;
  }

  /**
   * Record alert in history
   */
  recordAlert(alert) {
    const record = {
      ...alert,
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    this.alertHistory.unshift(record);

    // Maintain max history size
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Log alert to console
   */
  logAlert(alert) {
    const emoji = this.getSeverityEmoji(alert.severity);
    console.error(`${emoji} ALERT [${alert.severity.toUpperCase()}]: ${alert.title}`, {
      type: alert.type,
      message: alert.message,
      metadata: alert.metadata
    });
  }

  /**
   * Get emoji for severity level
   */
  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢',
      info: 'ℹ️'
    };
    return emojis[severity] || '⚠️';
  }

  /**
   * Send alert to Slack
   */
  async sendSlackAlert(alert) {
    if (!this.config.slack.webhookUrl) {
      return;
    }

    const color = {
      critical: '#dc3545',
      high: '#fd7e14',
      medium: '#ffc107',
      low: '#28a745',
      info: '#17a2b8'
    }[alert.severity] || '#6c757d';

    const payload = {
      username: 'Journeyman Monitoring',
      icon_emoji: ':warning:',
      attachments: [{
        color,
        title: alert.title,
        text: alert.message,
        fields: [
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true
          },
          {
            title: 'Type',
            value: alert.type,
            short: true
          },
          {
            title: 'Timestamp',
            value: new Date().toISOString(),
            short: false
          }
        ],
        footer: 'Journeyman Monitoring',
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    // Add metadata fields if present
    if (alert.metadata) {
      Object.entries(alert.metadata).forEach(([key, value]) => {
        payload.attachments[0].fields.push({
          title: key,
          value: String(value),
          short: true
        });
      });
    }

    return this.sendHttpRequest(this.config.slack.webhookUrl, payload);
  }

  /**
   * Send alert to webhook
   */
  async sendWebhookAlert(alert) {
    const payload = {
      alert: {
        ...alert,
        timestamp: new Date().toISOString(),
        service: 'journeyman-backend',
        environment: process.env.NODE_ENV || 'development'
      }
    };

    const promises = this.config.webhook.urls.map(url =>
      this.sendHttpRequest(url, payload, this.config.webhook.headers)
    );

    return Promise.allSettled(promises);
  }

  /**
   * Send alert to PagerDuty
   */
  async sendPagerDutyAlert(alert) {
    if (!this.config.pagerduty.integrationKey) {
      return;
    }

    const payload = {
      routing_key: this.config.pagerduty.integrationKey,
      event_action: 'trigger',
      payload: {
        summary: alert.title,
        severity: alert.severity,
        source: 'journeyman-backend',
        timestamp: new Date().toISOString(),
        custom_details: {
          message: alert.message,
          type: alert.type,
          ...alert.metadata
        }
      }
    };

    return this.sendHttpRequest('https://events.pagerduty.com/v2/enqueue', payload);
  }

  /**
   * Send HTTP request (for webhooks)
   */
  sendHttpRequest(url, payload, headers = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      const req = protocol.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  /**
   * Create health check alert
   */
  createHealthAlert(healthStatus) {
    if (healthStatus.status === 'unhealthy') {
      return {
        type: 'health_check',
        severity: 'critical',
        title: 'Application Health Check Failed',
        message: 'One or more critical services are unhealthy',
        metadata: {
          services: Object.entries(healthStatus.services)
            .filter(([_, s]) => s.status === 'unhealthy')
            .map(([name]) => name)
            .join(', ')
        }
      };
    }
    return null;
  }

  /**
   * Create error rate alert
   */
  createErrorRateAlert(errorRate) {
    if (errorRate > this.config.thresholds.errorRate) {
      return {
        type: 'error_rate',
        severity: 'high',
        title: 'High Error Rate Detected',
        message: `Error rate (${errorRate}/min) exceeded threshold (${this.config.thresholds.errorRate}/min)`,
        metadata: {
          currentRate: errorRate,
          threshold: this.config.thresholds.errorRate
        }
      };
    }
    return null;
  }

  /**
   * Create response time alert
   */
  createResponseTimeAlert(avgResponseTime) {
    if (avgResponseTime > this.config.thresholds.responseTime) {
      return {
        type: 'response_time',
        severity: 'medium',
        title: 'High Response Time Detected',
        message: `Average response time (${avgResponseTime}ms) exceeded threshold (${this.config.thresholds.responseTime}ms)`,
        metadata: {
          currentResponseTime: avgResponseTime,
          threshold: this.config.thresholds.responseTime
        }
      };
    }
    return null;
  }

  /**
   * Create memory usage alert
   */
  createMemoryAlert(percentUsed) {
    if (percentUsed > this.config.thresholds.memoryUsage) {
      return {
        type: 'memory_usage',
        severity: percentUsed > 95 ? 'critical' : 'high',
        title: 'High Memory Usage Detected',
        message: `Memory usage (${percentUsed}%) exceeded threshold (${this.config.thresholds.memoryUsage}%)`,
        metadata: {
          currentUsage: percentUsed,
          threshold: this.config.thresholds.memoryUsage
        }
      };
    }
    return null;
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 100, severity = null) {
    let alerts = this.alertHistory;

    if (severity) {
      alerts = alerts.filter(a => a.severity === severity);
    }

    return alerts.slice(0, limit);
  }

  /**
   * Get alert statistics
   */
  getAlertStats(timeWindow = 3600000) { // Default 1 hour
    const now = Date.now();
    const windowStart = now - timeWindow;

    const recentAlerts = this.alertHistory.filter(a =>
      new Date(a.timestamp).getTime() > windowStart
    );

    const bySeverity = {
      critical: recentAlerts.filter(a => a.severity === 'critical').length,
      high: recentAlerts.filter(a => a.severity === 'high').length,
      medium: recentAlerts.filter(a => a.severity === 'medium').length,
      low: recentAlerts.filter(a => a.severity === 'low').length,
      info: recentAlerts.filter(a => a.severity === 'info').length
    };

    const byType = {};
    recentAlerts.forEach(a => {
      byType[a.type] = (byType[a.type] || 0) + 1;
    });

    return {
      timeWindow: `${timeWindow / 1000}s`,
      totalAlerts: recentAlerts.length,
      bySeverity,
      byType,
      alertRate: `${(recentAlerts.length / (timeWindow / 60000)).toFixed(2)} alerts/min`
    };
  }

  /**
   * Test alert system
   */
  async testAlert() {
    const testAlert = {
      type: 'test',
      severity: 'info',
      title: 'Test Alert',
      message: 'This is a test alert to verify the notification system is working correctly',
      metadata: {
        test: true,
        timestamp: new Date().toISOString()
      }
    };

    await this.sendAlert(testAlert);
    return testAlert;
  }
}

module.exports = new AlertNotificationService();
