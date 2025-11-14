/**
 * Queue Service for Async Processing
 * Handles background jobs to offload heavy processing from API requests
 */

const Queue = require('bull');
const { getCacheManager } = require('../utils/cache');

class QueueService {
  constructor() {
    this.queues = {};
    this.processors = new Map();
    this.redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_QUEUE_DB || '2'),
      maxRetriesPerRequest: null, // Bull handles retries
      enableReadyCheck: false
    };
  }

  /**
   * Create or get a queue
   */
  getQueue(name, options = {}) {
    if (this.queues[name]) {
      return this.queues[name];
    }

    const queue = new Queue(name, {
      redis: this.redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs
        ...options.defaultJobOptions
      },
      ...options
    });

    // Event handlers
    queue.on('error', (error) => {
      console.error(`Queue ${name} error:`, error.message);
    });

    queue.on('waiting', (jobId) => {
      console.log(`Job ${jobId} is waiting in ${name} queue`);
    });

    queue.on('completed', (job, result) => {
      console.log(`✓ Job ${job.id} completed in ${name} queue`);
    });

    queue.on('failed', (job, err) => {
      console.error(`✗ Job ${job.id} failed in ${name} queue:`, err.message);
    });

    queue.on('stalled', (job) => {
      console.warn(`⚠ Job ${job.id} stalled in ${name} queue`);
    });

    this.queues[name] = queue;
    return queue;
  }

  /**
   * Register a job processor
   */
  registerProcessor(queueName, processor, options = {}) {
    const queue = this.getQueue(queueName);

    queue.process(
      options.concurrency || 5,
      async (job) => {
        try {
          console.log(`Processing job ${job.id} in ${queueName}:`, job.data);
          const result = await processor(job.data, job);
          return result;
        } catch (error) {
          console.error(`Error processing job ${job.id}:`, error.message);
          throw error;
        }
      }
    );

    this.processors.set(queueName, processor);
    console.log(`✓ Registered processor for ${queueName} queue`);
  }

  /**
   * Add a job to the queue
   */
  async addJob(queueName, data, options = {}) {
    const queue = this.getQueue(queueName);

    const job = await queue.add(data, {
      priority: options.priority || 0,
      delay: options.delay || 0,
      attempts: options.attempts || 3,
      timeout: options.timeout || 30000,
      ...options
    });

    return {
      id: job.id,
      queue: queueName,
      status: 'queued'
    };
  }

  /**
   * Get job status
   */
  async getJobStatus(queueName, jobId) {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      return { status: 'not_found' };
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      id: job.id,
      status: state,
      progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn
    };
  }

  /**
   * Get queue metrics
   */
  async getQueueMetrics(queueName) {
    const queue = this.getQueue(queueName);

    const [
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused
    ] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.getPausedCount()
    ]);

    return {
      queue: queueName,
      counts: {
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused,
        total: waiting + active + completed + failed + delayed
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Bulk add jobs
   */
  async addBulkJobs(queueName, jobs) {
    const queue = this.getQueue(queueName);

    const bulkJobs = jobs.map(job => ({
      data: job.data,
      opts: job.options || {}
    }));

    const addedJobs = await queue.addBulk(bulkJobs);

    return {
      count: addedJobs.length,
      ids: addedJobs.map(j => j.id)
    };
  }

  /**
   * Clean old jobs
   */
  async cleanQueue(queueName, grace = 86400000, status = 'completed') {
    const queue = this.getQueue(queueName);
    const jobs = await queue.clean(grace, status);
    console.log(`✓ Cleaned ${jobs.length} ${status} jobs from ${queueName} queue`);
    return jobs.length;
  }

  /**
   * Pause/Resume queue
   */
  async pauseQueue(queueName) {
    const queue = this.getQueue(queueName);
    await queue.pause();
    console.log(`⏸ Queue ${queueName} paused`);
  }

  async resumeQueue(queueName) {
    const queue = this.getQueue(queueName);
    await queue.resume();
    console.log(`▶ Queue ${queueName} resumed`);
  }

  /**
   * Close all queues
   */
  async closeAll() {
    const closePromises = Object.values(this.queues).map(queue => queue.close());
    await Promise.all(closePromises);
    console.log('✓ All queues closed');
  }
}

// Singleton instance
let queueServiceInstance = null;

function getQueueService() {
  if (!queueServiceInstance) {
    queueServiceInstance = new QueueService();
  }
  return queueServiceInstance;
}

/**
 * Predefined Job Processors
 */

/**
 * Game data processing - analyze and store game results
 */
async function processGameData(data) {
  const { userId, gameType, score, duration } = data;

  // Simulate heavy processing
  console.log(`Processing game data for user ${userId}: ${score} points`);

  // Could include:
  // - Calculate achievements
  // - Update leaderboards
  // - Generate statistics
  // - Send notifications
  // - Update user profile

  await new Promise(resolve => setTimeout(resolve, 100));

  return {
    userId,
    processed: true,
    achievements: ['game_completed'],
    timestamp: new Date().toISOString()
  };
}

/**
 * Email notification processing
 */
async function processEmailNotification(data) {
  const { to, subject, template, variables } = data;

  console.log(`Sending email to ${to}: ${subject}`);

  // Email sending logic here
  await new Promise(resolve => setTimeout(resolve, 200));

  return {
    to,
    sent: true,
    timestamp: new Date().toISOString()
  };
}

/**
 * Leaderboard calculation - expensive aggregation
 */
async function processLeaderboardUpdate(data) {
  const { gameType, timeframe } = data;

  console.log(`Calculating leaderboard for ${gameType} (${timeframe})`);

  // Heavy database aggregation
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    gameType,
    timeframe,
    calculated: true,
    timestamp: new Date().toISOString()
  };
}

/**
 * Analytics processing - batch analytics data
 */
async function processAnalytics(data) {
  const { events } = data;

  console.log(`Processing ${events.length} analytics events`);

  // Batch process analytics events
  await new Promise(resolve => setTimeout(resolve, 100));

  return {
    eventsProcessed: events.length,
    timestamp: new Date().toISOString()
  };
}

/**
 * Cache warming - pre-populate cache
 */
async function processCacheWarming(data) {
  const { routes } = data;
  const cache = getCacheManager();

  console.log(`Warming cache for ${routes.length} routes`);

  for (const route of routes) {
    // Fetch and cache data
    await cache.set(route.key, route.data, route.ttl || 300);
  }

  return {
    routesWarmed: routes.length,
    timestamp: new Date().toISOString()
  };
}

/**
 * Initialize default queues and processors
 */
function initializeQueues() {
  const queueService = getQueueService();

  // Game data processing queue
  queueService.registerProcessor('game-data', processGameData, {
    concurrency: 10 // Process 10 jobs concurrently
  });

  // Email queue
  queueService.registerProcessor('email', processEmailNotification, {
    concurrency: 5
  });

  // Leaderboard queue
  queueService.registerProcessor('leaderboard', processLeaderboardUpdate, {
    concurrency: 2 // CPU intensive
  });

  // Analytics queue
  queueService.registerProcessor('analytics', processAnalytics, {
    concurrency: 20 // High throughput
  });

  // Cache warming queue
  queueService.registerProcessor('cache-warming', processCacheWarming, {
    concurrency: 3
  });

  console.log('✓ Queue system initialized');
}

/**
 * Queue middleware - add job to queue instead of processing synchronously
 */
function queueJob(queueName, options = {}) {
  return async (req, res, next) => {
    const queueService = getQueueService();

    try {
      const jobData = options.dataExtractor
        ? options.dataExtractor(req)
        : req.body;

      const job = await queueService.addJob(queueName, jobData, options);

      // Store job ID in request for later reference
      req.jobId = job.id;

      if (options.wait) {
        // Wait for job completion (not recommended for high traffic)
        next();
      } else {
        // Return immediately with job ID
        res.json({
          success: true,
          message: 'Job queued for processing',
          jobId: job.id,
          queue: queueName
        });
      }
    } catch (error) {
      console.error('Queue middleware error:', error.message);
      next(error);
    }
  };
}

module.exports = {
  QueueService,
  getQueueService,
  initializeQueues,
  queueJob,
  processors: {
    processGameData,
    processEmailNotification,
    processLeaderboardUpdate,
    processAnalytics,
    processCacheWarming
  }
};
