# Monitoring System Documentation

## Overview

The Journeyman backend monitoring system provides comprehensive application observability including:

- **Health Checks** - Monitor application and dependency health
- **Error Tracking** - Track, aggregate, and analyze errors
- **Performance Monitoring** - Collect and expose performance metrics
- **Uptime Monitoring** - Track availability and reliability
- **Alert Notifications** - Multi-channel alerting for critical events

## Quick Start

### 1. Configuration

Copy the monitoring configuration to your `.env` file:

```bash
cat .env.monitoring.example >> .env
```

Edit the values in `.env` to configure your monitoring preferences.

### 2. Basic Usage

The monitoring system is automatically initialized when the server starts:

```javascript
const { initializeMonitoring } = require('./monitoring');
initializeMonitoring(app);
```

### 3. Access Monitoring Endpoints

Once the server is running, you can access:

- **Basic Health**: `GET /health`
- **Detailed Health**: `GET /health/detailed`
- **Liveness Probe**: `GET /health/live`
- **Readiness Probe**: `GET /health/ready`
- **Metrics Dashboard**: `GET /monitoring/dashboard`
- **Prometheus Metrics**: `GET /metrics/prometheus`

## Monitoring Endpoints

### Health Checks

#### `GET /health`
Basic health check (existing endpoint).

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-13T10:30:00.000Z",
  "version": "1.0.0"
}
```

#### `GET /health/detailed`
Comprehensive health check including all dependencies.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-13T10:30:00.000Z",
  "uptime": "3600s",
  "version": "1.0.0",
  "environment": "production",
  "services": {
    "database": {
      "status": "healthy",
      "latency": "5ms",
      "connected": true
    },
    "s3": {
      "status": "healthy",
      "latency": "120ms",
      "connected": true
    },
    "redis": {
      "status": "not-configured"
    },
    "memory": {
      "status": "healthy",
      "heapUsed": "250MB",
      "heapTotal": "512MB",
      "percentUsed": "48%"
    },
    "cpu": {
      "status": "healthy",
      "user": "5000ms",
      "system": "2000ms"
    }
  }
}
```

#### `GET /health/live`
Kubernetes liveness probe - checks if the application is running.

**Response:**
```json
{
  "status": "alive",
  "timestamp": "2025-11-13T10:30:00.000Z",
  "uptime": "3600s"
}
```

#### `GET /health/ready`
Kubernetes readiness probe - checks if the application can accept traffic.

**Response:**
```json
{
  "status": "ready",
  "timestamp": "2025-11-13T10:30:00.000Z",
  "memory": "healthy"
}
```

### Performance Metrics

#### `GET /metrics`
Application performance metrics in JSON format.

**Response:**
```json
{
  "uptime": "3600s",
  "activeRequests": 5,
  "http": {
    "requests": {
      "total": 12450,
      "byMethod": { "GET": 8500, "POST": 3950 },
      "byStatus": { "200": 11200, "404": 450, "500": 800 }
    },
    "averageResponseTime": "125ms",
    "requestRate": "3.46 req/s"
  },
  "database": {
    "queries": { "total": 5200, "errors": 5, "slowQueries": 12 },
    "averageQueryTime": "45ms",
    "errorRate": "0.10%"
  },
  "s3": {
    "operations": { "total": 850, "uploads": 420, "downloads": 430 },
    "averageOperationTime": "180ms",
    "errorRate": "0.50%"
  }
}
```

#### `GET /metrics/prometheus`
Performance metrics in Prometheus format for scraping.

**Response:**
```
# HELP app_uptime_seconds Application uptime in seconds
# TYPE app_uptime_seconds counter
app_uptime_seconds 3600

# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total 12450
...
```

### Error Tracking

#### `GET /monitoring/errors`
Get recent errors with optional filtering.

**Query Parameters:**
- `limit` - Number of errors to return (default: 50)
- `severity` - Filter by severity: critical, high, medium, low

**Response:**
```json
{
  "errors": [
    {
      "id": "err_1699876543210_abc123",
      "timestamp": "2025-11-13T10:25:00.000Z",
      "message": "Database connection failed",
      "type": "Error",
      "severity": "critical",
      "stack": "Error: Database connection failed\n    at ...",
      "fingerprint": "Error:Database connection failed:at ...",
      "context": {
        "url": "/api/game-data",
        "method": "POST",
        "ip": "192.168.1.100"
      }
    }
  ],
  "total": 1
}
```

#### `GET /monitoring/errors/stats`
Error statistics over a time window.

**Query Parameters:**
- `window` - Time window in ms (default: 3600000 = 1 hour)

**Response:**
```json
{
  "timeWindow": "3600s",
  "totalErrors": 45,
  "bySeverity": {
    "critical": 2,
    "high": 8,
    "medium": 15,
    "low": 20
  },
  "byType": {
    "Error": 30,
    "ValidationError": 10,
    "DatabaseError": 5
  },
  "topErrors": [
    {
      "fingerprint": "Error:Database timeout:at ...",
      "count": 8,
      "message": "Database timeout",
      "severity": "high"
    }
  ],
  "errorRate": "0.75 errors/min"
}
```

#### `GET /monitoring/errors/:id`
Get details for a specific error by ID.

### Uptime Monitoring

#### `GET /monitoring/uptime`
Comprehensive uptime statistics.

**Response:**
```json
{
  "uptime": {
    "seconds": 86400,
    "formatted": "1d 0h 0m 0s",
    "since": "2025-11-12T10:30:00.000Z"
  },
  "availability": {
    "last24h": "99.950%",
    "last7d": "99.800%",
    "last30d": "99.650%",
    "allTime": "99.500%"
  },
  "healthChecks": {
    "total": 1440,
    "successful": 1438,
    "failed": 2
  },
  "incidents": {
    "total": 3,
    "active": 0,
    "recent": []
  }
}
```

#### `GET /monitoring/uptime/reliability`
Key reliability metrics.

**Response:**
```json
{
  "mtbf": "720h",
  "mttr": "15m",
  "uptime": "1d 0h 0m 0s",
  "availability": "99.650",
  "totalIncidents": 3,
  "activeIncidents": 0
}
```

#### `GET /monitoring/incidents`
Get incident history.

**Query Parameters:**
- `active` - Set to `true` to get only active incidents

### Alert Notifications

#### `GET /monitoring/alerts`
Get alert history.

**Query Parameters:**
- `limit` - Number of alerts to return (default: 100)
- `severity` - Filter by severity: critical, high, medium, low, info

**Response:**
```json
{
  "alerts": [
    {
      "id": "alert_1699876543210_xyz789",
      "timestamp": "2025-11-13T10:20:00.000Z",
      "type": "health_check",
      "severity": "critical",
      "title": "Application Health Check Failed",
      "message": "One or more critical services are unhealthy",
      "metadata": {
        "services": "database"
      }
    }
  ],
  "total": 1
}
```

#### `GET /monitoring/alerts/stats`
Alert statistics over a time window.

**Query Parameters:**
- `window` - Time window in ms (default: 3600000 = 1 hour)

#### `POST /monitoring/alerts/test`
Send a test alert to verify notification channels.

**Response:**
```json
{
  "success": true,
  "message": "Test alert sent",
  "alert": { ... }
}
```

### Dashboard

#### `GET /monitoring/dashboard`
Comprehensive monitoring dashboard with all metrics.

**Response:**
```json
{
  "timestamp": "2025-11-13T10:30:00.000Z",
  "health": { ... },
  "metrics": { ... },
  "uptime": { ... },
  "errors": { ... },
  "alerts": { ... }
}
```

## Alert Configuration

### Slack Integration

1. Create a Slack webhook URL:
   - Go to https://api.slack.com/apps
   - Create a new app
   - Enable Incoming Webhooks
   - Copy the webhook URL

2. Add to `.env`:
```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### PagerDuty Integration

1. Get your integration key from PagerDuty
2. Add to `.env`:
```env
PAGERDUTY_INTEGRATION_KEY=your_integration_key
```

Critical alerts will automatically trigger PagerDuty incidents.

### Custom Webhooks

Send alerts to any HTTP endpoint:

```env
ALERT_WEBHOOK_ENABLED=true
ALERT_WEBHOOK_URLS=https://your-service.com/alerts
ALERT_WEBHOOK_HEADERS={"Authorization": "Bearer token123"}
```

## Kubernetes Integration

The health check endpoints are designed for Kubernetes:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3001
  initialDelaySeconds: 30
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 15
```

## Prometheus Integration

Scrape metrics with Prometheus:

```yaml
scrape_configs:
  - job_name: 'journeyman-backend'
    static_configs:
      - targets: ['backend:3001']
    metrics_path: '/metrics/prometheus'
    scrape_interval: 15s
```

## Custom Metrics

Track custom application metrics:

```javascript
const { performanceMonitoring } = require('./monitoring');

// Track a custom metric
performanceMonitoring.trackCustomMetric('game_completions', 1, {
  gameType: 'journeyman',
  difficulty: 'hard'
});
```

## Error Tracking

The error tracking middleware automatically captures errors:

```javascript
const { errorTracking } = require('./monitoring');

// Manual error tracking
try {
  // Your code
} catch (error) {
  errorTracking.trackError(error, {
    context: 'custom_operation',
    userId: req.user?.id
  });
  throw error;
}
```

## Performance Monitoring

Track database and S3 operations:

```javascript
const { performanceMonitoring } = require('./monitoring');

// Track database query
const start = Date.now();
try {
  await db.query('SELECT ...');
  performanceMonitoring.trackDatabaseQuery(Date.now() - start);
} catch (error) {
  performanceMonitoring.trackDatabaseQuery(Date.now() - start, error);
}

// Track S3 operation
const s3Start = Date.now();
try {
  await s3.upload(...);
  performanceMonitoring.trackS3Operation('upload', Date.now() - s3Start);
} catch (error) {
  performanceMonitoring.trackS3Operation('upload', Date.now() - s3Start, error);
}
```

## Best Practices

1. **Set Realistic Thresholds**: Adjust alert thresholds based on your application's normal behavior
2. **Monitor Trends**: Regularly review metrics to identify trends before they become issues
3. **Test Alerts**: Use the `/monitoring/alerts/test` endpoint to verify notification channels
4. **Secure Endpoints**: Protect monitoring endpoints with authentication in production
5. **Regular Cleanup**: The system automatically cleans up old errors and alerts, but monitor storage if needed

## Troubleshooting

### No alerts being sent

1. Check environment variables are set correctly
2. Verify webhook URLs are accessible
3. Test with `/monitoring/alerts/test` endpoint
4. Check application logs for alert failures

### High memory usage

The monitoring system stores recent errors and alerts in memory. Adjust limits:

```javascript
// In monitoring modules
errorTracking.maxStoredErrors = 500;  // Default: 1000
alertNotifications.maxHistorySize = 250;  // Default: 500
```

### Missing metrics

Ensure the monitoring system is initialized before other middleware:

```javascript
initializeMonitoring(app);  // Must be early in middleware chain
```

## Production Recommendations

1. **Enable Persistent Storage**: Integrate with external services (Datadog, New Relic, Sentry)
2. **Set Up Dashboards**: Use Grafana with Prometheus metrics
3. **Configure Alerts**: Set up PagerDuty or similar for critical alerts
4. **Log Aggregation**: Send logs to ELK Stack or Splunk
5. **Distributed Tracing**: Add OpenTelemetry for request tracing

## Support

For issues or questions about the monitoring system:
- Check application logs
- Review this documentation
- Test individual endpoints manually
- Verify environment configuration
