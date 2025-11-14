/**
 * Circuit Breaker and Load Shedding
 * Prevents cascading failures and protects system during high load
 */

const { getCacheManager } = require('../utils/cache');
const { getMetricsCollector } = require('./monitoring');

/**
 * Circuit Breaker States
 */
const CircuitState = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failing, reject requests
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

/**
 * Circuit Breaker Implementation
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5; // Failures before opening
    this.successThreshold = options.successThreshold || 2; // Successes to close from half-open
    this.timeout = options.timeout || 60000; // Time before attempting recovery (ms)
    this.volumeThreshold = options.volumeThreshold || 10; // Minimum requests before considering failures

    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;

    this.cache = getCacheManager();
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn, fallback = null) {
    this.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttempt) {
        // Try to recover - move to half-open
        this.state = CircuitState.HALF_OPEN;
        console.log(`Circuit ${this.name}: OPEN -> HALF_OPEN (attempting recovery)`);
      } else {
        // Still open - reject request
        if (fallback) {
          return await fallback();
        }
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();

      // Success - record it
      this.onSuccess();

      return result;
    } catch (error) {
      // Failure - record it
      this.onFailure();

      if (fallback) {
        return await fallback();
      }

      throw error;
    }
  }

  /**
   * Record successful execution
   */
  onSuccess() {
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;

      if (this.successes >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successes = 0;
        console.log(`✓ Circuit ${this.name}: HALF_OPEN -> CLOSED (recovered)`);
      }
    }
  }

  /**
   * Record failed execution
   */
  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during recovery - back to open
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.timeout;
      this.successes = 0;
      console.warn(`⚠ Circuit ${this.name}: HALF_OPEN -> OPEN (recovery failed)`);
    } else if (
      this.state === CircuitState.CLOSED &&
      this.totalRequests >= this.volumeThreshold &&
      this.failures >= this.failureThreshold
    ) {
      // Too many failures - open circuit
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.timeout;
      console.warn(`⚠ Circuit ${this.name}: CLOSED -> OPEN (failure threshold reached)`);
    }
  }

  /**
   * Get circuit status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      failureRate: this.totalRequests > 0
        ? ((this.failures / this.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      nextAttempt: this.state === CircuitState.OPEN
        ? new Date(this.nextAttempt).toISOString()
        : null
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    console.log(`✓ Circuit ${this.name} reset`);
  }
}

/**
 * Circuit Breaker Middleware
 */
function circuitBreakerMiddleware(options = {}) {
  const breaker = new CircuitBreaker(options);

  return async (req, res, next) => {
    if (breaker.state === CircuitState.OPEN) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Circuit breaker is open - service is temporarily unavailable',
        retryAfter: Math.ceil((breaker.nextAttempt - Date.now()) / 1000)
      });
    }

    // Wrap the response to track success/failure
    const originalSend = res.send;
    const originalJson = res.json;

    res.send = function (data) {
      if (res.statusCode >= 500) {
        breaker.onFailure();
      } else {
        breaker.onSuccess();
      }
      return originalSend.call(this, data);
    };

    res.json = function (data) {
      if (res.statusCode >= 500) {
        breaker.onFailure();
      } else {
        breaker.onSuccess();
      }
      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Load Shedding Middleware
 * Reject requests when system is overloaded
 */
function loadShedding(options = {}) {
  const {
    maxConcurrent = 1000,
    maxQueueSize = 5000,
    priority = () => 1, // Function to determine request priority
    shedProbability = 0.5 // Probability of shedding low-priority requests when overloaded
  } = options;

  let activeConcurrent = 0;
  let queuedRequests = 0;

  return async (req, res, next) => {
    const requestPriority = priority(req);

    // Check if system is overloaded
    if (activeConcurrent >= maxConcurrent) {
      if (queuedRequests >= maxQueueSize) {
        // System is severely overloaded - shed load based on priority
        if (requestPriority < 5 && Math.random() < shedProbability) {
          return res.status(503).json({
            error: 'Service Overloaded',
            message: 'System is at capacity. Please try again later.',
            retryAfter: 30
          });
        }
      }

      queuedRequests++;
    }

    activeConcurrent++;

    // Track when request completes
    res.on('finish', () => {
      activeConcurrent--;
      if (queuedRequests > 0) {
        queuedRequests--;
      }
    });

    res.on('close', () => {
      activeConcurrent--;
      if (queuedRequests > 0) {
        queuedRequests--;
      }
    });

    next();
  };
}

/**
 * Graceful Degradation Middleware
 * Provides degraded service when dependencies fail
 */
function gracefulDegradation(options = {}) {
  const {
    dependencies = [], // List of dependencies to monitor
    degradedResponse = null // Function to generate degraded response
  } = options;

  const dependencyStatus = new Map();

  // Initialize dependency status
  dependencies.forEach(dep => {
    dependencyStatus.set(dep, { healthy: true, lastCheck: Date.now() });
  });

  return async (req, res, next) => {
    // Check dependency health
    const unhealthyDeps = Array.from(dependencyStatus.entries())
      .filter(([_, status]) => !status.healthy)
      .map(([name, _]) => name);

    if (unhealthyDeps.length > 0) {
      // Some dependencies are unhealthy
      res.set('X-Degraded-Mode', 'true');
      res.set('X-Unhealthy-Dependencies', unhealthyDeps.join(','));

      if (degradedResponse) {
        // Provide degraded response
        return degradedResponse(req, res, unhealthyDeps);
      }
    }

    next();
  };
}

/**
 * Timeout Middleware
 * Prevent requests from hanging indefinitely
 */
function timeoutMiddleware(timeoutMs = 30000) {
  return (req, res, next) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          error: 'Gateway Timeout',
          message: 'Request timed out',
          timeout: timeoutMs
        });
      }
    }, timeoutMs);

    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    next();
  };
}

/**
 * Bulkhead Pattern
 * Isolate resources to prevent cascading failures
 */
class Bulkhead {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.maxConcurrent = options.maxConcurrent || 10;
    this.maxQueue = options.maxQueue || 20;
    this.active = 0;
    this.queue = [];
  }

  async execute(fn) {
    if (this.active >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueue) {
        throw new Error(`Bulkhead ${this.name} is full`);
      }

      // Wait in queue
      await new Promise((resolve, reject) => {
        this.queue.push({ resolve, reject });
      });
    }

    this.active++;

    try {
      const result = await fn();
      return result;
    } finally {
      this.active--;

      // Process next queued request
      if (this.queue.length > 0) {
        const { resolve } = this.queue.shift();
        resolve();
      }
    }
  }

  getStatus() {
    return {
      name: this.name,
      active: this.active,
      queued: this.queue.length,
      capacity: this.maxConcurrent,
      utilization: ((this.active / this.maxConcurrent) * 100).toFixed(2) + '%'
    };
  }
}

/**
 * Retry with Exponential Backoff
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    shouldRetry = (error) => true
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));

      // Increase delay for next retry
      delay = Math.min(delay * backoffMultiplier, maxDelay);

      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
    }
  }

  throw lastError;
}

// Global circuit breakers registry
const circuitBreakers = new Map();

function getCircuitBreaker(name, options = {}) {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({ name, ...options }));
  }
  return circuitBreakers.get(name);
}

// Global bulkheads registry
const bulkheads = new Map();

function getBulkhead(name, options = {}) {
  if (!bulkheads.has(name)) {
    bulkheads.set(name, new Bulkhead({ name, ...options }));
  }
  return bulkheads.get(name);
}

module.exports = {
  CircuitBreaker,
  CircuitState,
  circuitBreakerMiddleware,
  loadShedding,
  gracefulDegradation,
  timeoutMiddleware,
  Bulkhead,
  retryWithBackoff,
  getCircuitBreaker,
  getBulkhead
};
