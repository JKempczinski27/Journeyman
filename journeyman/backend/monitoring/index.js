/**
 * Monitoring Module - Main Export
 * Centralized monitoring system for the Journeyman backend
 */

const healthChecks = require('./healthChecks');
const errorTracking = require('./errorTracking');
const performanceMonitoring = require('./performanceMonitoring');
const uptimeMonitoring = require('./uptimeMonitoring');
const alertNotifications = require('./alertNotifications');

/**
 * Initialize monitoring system
 */
function initializeMonitoring(app) {
  console.log('🔍 Initializing monitoring system...');

  // Add performance monitoring middleware
  app.use(performanceMonitoring.middleware());

  // Add error tracking middleware
  app.use(errorTracking.middleware());

  // Start periodic health checks
  startPeriodicHealthChecks();

  // Setup monitoring endpoints
  setupMonitoringEndpoints(app);

  console.log('✅ Monitoring system initialized');
}

/**
 * Start periodic health checks
 */
function startPeriodicHealthChecks() {
  const checkInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL) || 60000; // Default 1 minute

  setInterval(async () => {
    try {
      const health = await healthChecks.performHealthCheck();
      const isHealthy = health.status === 'healthy' || health.status === 'degraded';

      uptimeMonitoring.recordHealthCheck(isHealthy, health);

      // Send alert if unhealthy
      if (!isHealthy) {
        const alert = alertNotifications.createHealthAlert(health);
        if (alert) {
          await alertNotifications.sendAlert(alert);
        }
      }
    } catch (error) {
      console.error('Health check failed:', error);
      uptimeMonitoring.recordHealthCheck(false, { error: error.message });
    }
  }, checkInterval);

  console.log(`📊 Periodic health checks started (interval: ${checkInterval}ms)`);
}

/**
 * Setup monitoring endpoints
 */
function setupMonitoringEndpoints(app) {
  // Enhanced health check endpoint
  app.get('/health/detailed', async (req, res) => {
    try {
      const health = await healthChecks.performHealthCheck();
      res.status(health.status === 'healthy' ? 200 : 503).json(health);
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message
      });
    }
  });

  // Liveness probe (Kubernetes)
  app.get('/health/live', (req, res) => {
    const liveness = healthChecks.livenessProbe();
    res.json(liveness);
  });

  // Readiness probe (Kubernetes)
  app.get('/health/ready', async (req, res) => {
    try {
      const readiness = await healthChecks.readinessProbe();
      res.status(readiness.status === 'ready' ? 200 : 503).json(readiness);
    } catch (error) {
      res.status(503).json({
        status: 'not-ready',
        error: error.message
      });
    }
  });

  // Performance metrics endpoint
  app.get('/metrics', (req, res) => {
    const metrics = performanceMonitoring.getMetrics();
    res.json(metrics);
  });

  // Prometheus metrics endpoint
  app.get('/metrics/prometheus', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(performanceMonitoring.getPrometheusMetrics());
  });

  // Error tracking endpoints
  app.get('/monitoring/errors', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const severity = req.query.severity;

    const errors = errorTracking.getRecentErrors(limit, severity);
    res.json({ errors, total: errors.length });
  });

  app.get('/monitoring/errors/stats', (req, res) => {
    const timeWindow = parseInt(req.query.window) || 3600000;
    const stats = errorTracking.getErrorStats(timeWindow);
    res.json(stats);
  });

  app.get('/monitoring/errors/:id', (req, res) => {
    const error = errorTracking.getErrorById(req.params.id);
    if (error) {
      res.json(error);
    } else {
      res.status(404).json({ error: 'Error not found' });
    }
  });

  // Uptime monitoring endpoints
  app.get('/monitoring/uptime', (req, res) => {
    const stats = uptimeMonitoring.getUptimeStats();
    res.json(stats);
  });

  app.get('/monitoring/uptime/reliability', (req, res) => {
    const metrics = uptimeMonitoring.getReliabilityMetrics();
    res.json(metrics);
  });

  app.get('/monitoring/incidents', (req, res) => {
    const activeOnly = req.query.active === 'true';
    const incidents = uptimeMonitoring.getIncidents(activeOnly);
    res.json({ incidents, total: incidents.length });
  });

  // Alert endpoints
  app.get('/monitoring/alerts', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const severity = req.query.severity;

    const alerts = alertNotifications.getAlertHistory(limit, severity);
    res.json({ alerts, total: alerts.length });
  });

  app.get('/monitoring/alerts/stats', (req, res) => {
    const timeWindow = parseInt(req.query.window) || 3600000;
    const stats = alertNotifications.getAlertStats(timeWindow);
    res.json(stats);
  });

  app.post('/monitoring/alerts/test', async (req, res) => {
    try {
      const alert = await alertNotifications.testAlert();
      res.json({
        success: true,
        message: 'Test alert sent',
        alert
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Comprehensive monitoring dashboard endpoint
  app.get('/monitoring/dashboard', async (req, res) => {
    try {
      const [health, metrics, uptimeStats, errorStats, alertStats] = await Promise.all([
        healthChecks.performHealthCheck(),
        Promise.resolve(performanceMonitoring.getMetrics()),
        Promise.resolve(uptimeMonitoring.getUptimeStats()),
        Promise.resolve(errorTracking.getErrorStats()),
        Promise.resolve(alertNotifications.getAlertStats())
      ]);

      res.json({
        timestamp: new Date().toISOString(),
        health,
        metrics,
        uptime: uptimeStats,
        errors: errorStats,
        alerts: alertStats
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to generate dashboard',
        message: error.message
      });
    }
  });

  console.log('📡 Monitoring endpoints configured');
}

module.exports = {
  initializeMonitoring,
  healthChecks,
  errorTracking,
  performanceMonitoring,
  uptimeMonitoring,
  alertNotifications
};
