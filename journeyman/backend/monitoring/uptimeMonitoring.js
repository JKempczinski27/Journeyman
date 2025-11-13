/**
 * Uptime Monitoring Module
 * Track application uptime, downtime, and availability metrics
 */

class UptimeMonitor {
  constructor() {
    this.startTime = Date.now();
    this.incidents = [];
    this.healthCheckHistory = [];
    this.maxHistorySize = 1000;
    this.uptimeChecks = {
      total: 0,
      successful: 0,
      failed: 0
    };
  }

  /**
   * Get current uptime in seconds
   */
  getUptime() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get uptime formatted as human-readable string
   */
  getUptimeFormatted() {
    const seconds = this.getUptime();
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Record health check result
   */
  recordHealthCheck(isHealthy, details = {}) {
    const check = {
      timestamp: new Date().toISOString(),
      isHealthy,
      details
    };

    this.healthCheckHistory.unshift(check);

    // Maintain max history size
    if (this.healthCheckHistory.length > this.maxHistorySize) {
      this.healthCheckHistory = this.healthCheckHistory.slice(0, this.maxHistorySize);
    }

    // Update counts
    this.uptimeChecks.total++;
    if (isHealthy) {
      this.uptimeChecks.successful++;
    } else {
      this.uptimeChecks.failed++;
      this.recordIncident('Health check failed', details);
    }
  }

  /**
   * Record an incident
   */
  recordIncident(reason, details = {}) {
    const incident = {
      id: `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      reason,
      details,
      resolved: false,
      resolvedAt: null
    };

    this.incidents.unshift(incident);

    console.error('🚨 INCIDENT RECORDED:', {
      id: incident.id,
      reason: incident.reason,
      timestamp: incident.timestamp
    });

    return incident;
  }

  /**
   * Resolve an incident
   */
  resolveIncident(incidentId) {
    const incident = this.incidents.find(i => i.id === incidentId);
    if (incident) {
      incident.resolved = true;
      incident.resolvedAt = new Date().toISOString();

      console.log('✅ INCIDENT RESOLVED:', {
        id: incident.id,
        reason: incident.reason,
        duration: this.getIncidentDuration(incident)
      });
    }
  }

  /**
   * Get incident duration
   */
  getIncidentDuration(incident) {
    if (!incident.resolvedAt) {
      return 'ongoing';
    }

    const start = new Date(incident.timestamp).getTime();
    const end = new Date(incident.resolvedAt).getTime();
    const duration = Math.floor((end - start) / 1000);

    return `${duration}s`;
  }

  /**
   * Calculate uptime percentage over a time window
   */
  calculateUptimePercentage(timeWindow = 86400000) { // Default 24 hours
    const now = Date.now();
    const windowStart = now - timeWindow;

    const checksInWindow = this.healthCheckHistory.filter(check =>
      new Date(check.timestamp).getTime() > windowStart
    );

    if (checksInWindow.length === 0) {
      return 100; // No data means assume healthy
    }

    const successfulChecks = checksInWindow.filter(c => c.isHealthy).length;
    return ((successfulChecks / checksInWindow.length) * 100).toFixed(3);
  }

  /**
   * Get uptime statistics
   */
  getUptimeStats() {
    const uptime = this.getUptime();
    const activeIncidents = this.incidents.filter(i => !i.resolved);
    const recentIncidents = this.incidents.slice(0, 10);

    return {
      uptime: {
        seconds: uptime,
        formatted: this.getUptimeFormatted(),
        since: new Date(this.startTime).toISOString()
      },
      availability: {
        last24h: `${this.calculateUptimePercentage(86400000)}%`,
        last7d: `${this.calculateUptimePercentage(604800000)}%`,
        last30d: `${this.calculateUptimePercentage(2592000000)}%`,
        allTime: this.uptimeChecks.total > 0
          ? `${((this.uptimeChecks.successful / this.uptimeChecks.total) * 100).toFixed(3)}%`
          : '100%'
      },
      healthChecks: {
        total: this.uptimeChecks.total,
        successful: this.uptimeChecks.successful,
        failed: this.uptimeChecks.failed
      },
      incidents: {
        total: this.incidents.length,
        active: activeIncidents.length,
        recent: recentIncidents.map(inc => ({
          id: inc.id,
          timestamp: inc.timestamp,
          reason: inc.reason,
          resolved: inc.resolved,
          duration: this.getIncidentDuration(inc)
        }))
      }
    };
  }

  /**
   * Get recent health check history
   */
  getHealthCheckHistory(limit = 100) {
    return this.healthCheckHistory.slice(0, limit);
  }

  /**
   * Get all incidents
   */
  getIncidents(activeOnly = false) {
    if (activeOnly) {
      return this.incidents.filter(i => !i.resolved);
    }
    return this.incidents;
  }

  /**
   * Calculate MTBF (Mean Time Between Failures)
   */
  getMTBF() {
    if (this.incidents.length < 2) {
      return 'N/A';
    }

    const resolvedIncidents = this.incidents.filter(i => i.resolved);
    if (resolvedIncidents.length < 2) {
      return 'N/A';
    }

    const timeBetweenFailures = [];
    for (let i = 0; i < resolvedIncidents.length - 1; i++) {
      const current = new Date(resolvedIncidents[i].timestamp).getTime();
      const next = new Date(resolvedIncidents[i + 1].timestamp).getTime();
      timeBetweenFailures.push(next - current);
    }

    const avgTime = timeBetweenFailures.reduce((a, b) => a + b, 0) / timeBetweenFailures.length;
    const hours = Math.floor(avgTime / 3600000);
    return `${hours}h`;
  }

  /**
   * Calculate MTTR (Mean Time To Recovery)
   */
  getMTTR() {
    const resolvedIncidents = this.incidents.filter(i => i.resolved);

    if (resolvedIncidents.length === 0) {
      return 'N/A';
    }

    const recoveryTimes = resolvedIncidents.map(inc => {
      const start = new Date(inc.timestamp).getTime();
      const end = new Date(inc.resolvedAt).getTime();
      return end - start;
    });

    const avgTime = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length;
    const minutes = Math.floor(avgTime / 60000);
    return `${minutes}m`;
  }

  /**
   * Get reliability metrics
   */
  getReliabilityMetrics() {
    return {
      mtbf: this.getMTBF(),
      mttr: this.getMTTR(),
      uptime: this.getUptimeFormatted(),
      availability: this.calculateUptimePercentage(2592000000), // 30 days
      totalIncidents: this.incidents.length,
      activeIncidents: this.incidents.filter(i => !i.resolved).length
    };
  }

  /**
   * Reset uptime tracking (for testing)
   */
  reset() {
    this.startTime = Date.now();
    this.incidents = [];
    this.healthCheckHistory = [];
    this.uptimeChecks = {
      total: 0,
      successful: 0,
      failed: 0
    };
  }
}

module.exports = new UptimeMonitor();
