// backend/services/dataService.js
const { S3Manager } = require('../config/awsConfig');
const pool = require('../config/database'); // Assuming you have a DB connection

class DataService {
  constructor() {
    this.s3Manager = new S3Manager();
  }

  // Save player data with S3 pipeline
  async savePlayerData(playerData) {
    const timestamp = new Date().toISOString();
    const sessionId = playerData.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Enrich player data
    const enrichedData = {
      ...playerData,
      sessionId,
      timestamp,
      serverProcessedAt: timestamp,
      dataVersion: '2.0',
      ip: playerData.ip || 'unknown',
      userAgent: playerData.userAgent || 'unknown'
    };

    try {
      // 1. Save to database (primary storage)
      const dbResult = await this.saveToDatabase(enrichedData);

      // 2. Send to S3 (async, non-blocking)
      this.sendToS3Pipeline(enrichedData)
        .catch(error => console.error('S3 pipeline error (non-blocking):', error));

      // 3. Return immediate response
      return {
        success: true,
        sessionId,
        timestamp,
        message: 'Data saved successfully',
        dbId: dbResult.insertId
      };
    } catch (error) {
      console.error('❌ Error saving player data:', error);

      // Fallback: try S3 only if DB fails
      try {
        await this.s3Manager.uploadPlayerData(enrichedData);
        return {
          success: true,
          sessionId,
          timestamp,
          message: 'Data saved to S3 (DB unavailable)',
          fallback: true
        };
      } catch (s3Error) {
        console.error('❌ S3 fallback also failed:', s3Error);
        throw new Error('Failed to save data to both DB and S3');
      }
    }
  }

  // Save to database with deduplication and audit logging
  async saveToDatabase(data) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check for duplicate session (idempotency)
      const duplicateCheck = await client.query(
        'SELECT id FROM player_sessions WHERE session_id = $1',
        [data.sessionId]
      );

      if (duplicateCheck.rows.length > 0) {
        await client.query('COMMIT');
        console.log(`⚠️  Duplicate session detected: ${data.sessionId}`);
        return {
          insertId: duplicateCheck.rows[0].id,
          duplicate: true
        };
      }

      // Insert player session
      const query = `
        INSERT INTO player_sessions (
          session_id, name, email, game_type, mode, duration_seconds,
          correct_count, total_guesses, shared_on_social,
          game_specific_data, created_at, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `;

      const values = [
        data.sessionId,
        data.name,
        data.email,
        data.gameType || 'journeyman',
        data.mode,
        data.durationInSeconds,
        data.correctCount,
        data.guesses?.length || 0,
        data.sharedOnSocial,
        JSON.stringify(data.gameSpecificData || {}),
        data.timestamp,
        data.ip,
        data.userAgent
      ];

      const result = await client.query(query, values);
      const insertId = result.rows[0].id;

      // Add audit log entry
      await client.query(`
        INSERT INTO audit_logs (
          user_id, action, resource_type, resource_id,
          ip_address, user_agent, request_data, response_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        null, // No user_id for anonymous game sessions
        'data_collection',
        'player_session',
        insertId,
        data.ip,
        data.userAgent,
        JSON.stringify({
          gameType: data.gameType,
          mode: data.mode,
          email: this.hashEmail(data.email) // Store hashed email in audit log
        }),
        200
      ]);

      await client.query('COMMIT');

      return {
        insertId,
        duplicate: false
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Database save error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // S3 Pipeline - multiple upload strategies
  async sendToS3Pipeline(data) {
    const uploadPromises = [];

    try {
      // 1. Raw data upload
      uploadPromises.push(
        this.s3Manager.uploadPlayerData(data)
      );

      // 2. Daily aggregation bucket
      uploadPromises.push(
        this.addToDailyAggregation(data)
      );

      // 3. Real-time analytics feed
      uploadPromises.push(
        this.sendToAnalyticsFeed(data)
      );

      // Execute all uploads in parallel
      const results = await Promise.allSettled(uploadPromises);

      // Log results
      results.forEach((result, index) => {
        const uploadType = ['raw', 'daily', 'analytics'][index];
        if (result.status === 'rejected') {
          console.error(`❌ ${uploadType} upload failed:`, result.reason);
        } else {
          console.log(`✅ ${uploadType} upload successful`);
        }
      });

      return results;
    } catch (error) {
      console.error('❌ S3 Pipeline error:', error);
      throw error;
    }
  }

  // Add to daily aggregation
  async addToDailyAggregation(data) {
    const date = new Date().toISOString().slice(0, 10);
    const key = `aggregation/daily/${data.gameType || 'journeyman'}/${date}/session_${data.sessionId}.json`;

    const aggregationData = {
      sessionId: data.sessionId,
      timestamp: data.timestamp,
      playerHash: this.hashEmail(data.email), // Don't store raw email in aggregation
      gameType: data.gameType || 'journeyman',
      mode: data.mode,
      score: data.correctCount,
      duration: data.durationInSeconds,
      guessCount: data.guesses?.length || 0,
      completed: data.correctCount > 0,
      sharedSocial: data.sharedOnSocial
    };

    return this.s3Manager.uploadData(key, aggregationData, {
      type: 'daily-aggregation',
      date: date
    });
  }

  // Send to real-time analytics feed
  async sendToAnalyticsFeed(data) {
    const timestamp = new Date().toISOString();
    const key = `analytics/realtime/${timestamp.slice(0, 13)}/${data.sessionId}.json`; // Hourly folders

    const analyticsData = {
      sessionId: data.sessionId,
      timestamp: data.timestamp,
      gameType: data.gameType || 'journeyman',
      gameMode: data.mode,
      playerMetrics: {
        score: data.correctCount,
        accuracy: data.correctCount / (data.guesses?.length || 1),
        duration: data.durationInSeconds,
        guessesPerCorrect: (data.guesses?.length || 0) / Math.max(data.correctCount, 1)
      },
      engagement: {
        completed: data.correctCount > 0,
        sharedSocial: data.sharedOnSocial,
        timeToFirstGuess: this.calculateTimeToFirstGuess(data)
      }
    };

    return this.s3Manager.uploadData(key, analyticsData, {
      type: 'realtime-analytics',
      hour: timestamp.slice(0, 13)
    });
  }

  // Batch export for analytics
  async createAnalyticsExport(startDate, endDate, gameType = 'journeyman') {
    try {
      console.log(`📊 Creating analytics export: ${startDate} to ${endDate}`);

      // Get all raw data files in date range
      const files = [];
      const currentDate = new Date(startDate);
      const end = new Date(endDate);

      while (currentDate <= end) {
        const dateStr = currentDate.toISOString().slice(0, 10);
        const prefix = `raw-data/${gameType}/${dateStr}`;
        const dayFiles = await this.s3Manager.listFiles(prefix);
        files.push(...dayFiles);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Process data in chunks
      const chunkSize = 100;
      const analyticsData = {
        exportRange: { startDate, endDate },
        gameType,
        totalSessions: 0,
        totalPlayers: 0,
        aggregateMetrics: {},
        sessionData: []
      };

      for (let i = 0; i < files.length; i += chunkSize) {
        const chunk = files.slice(i, i + chunkSize);
        const chunkData = await Promise.all(
          chunk.map(file => this.s3Manager.downloadData(file.Key))
        );

        // Process chunk
        chunkData.forEach(session => {
          analyticsData.totalSessions++;
          analyticsData.sessionData.push(this.processSessionForAnalytics(session));
        });
      }

      // Calculate aggregate metrics
      analyticsData.aggregateMetrics = this.calculateAggregateMetrics(analyticsData.sessionData);
      analyticsData.totalPlayers = new Set(analyticsData.sessionData.map(s => s.playerHash)).size;

      // Upload export
      const exportKey = `exports/analytics/${gameType}/${startDate}_to_${endDate}_export.json`;
      await this.s3Manager.uploadData(exportKey, analyticsData, {
        type: 'analytics-export',
        dateRange: `${startDate}_to_${endDate}`
      });

      console.log(`✅ Analytics export completed: ${analyticsData.totalSessions} sessions`);
      return { success: true, exportKey, metrics: analyticsData.aggregateMetrics };
    } catch (error) {
      console.error('❌ Analytics export failed:', error);
      throw error;
    }
  }

  // Utility functions
  hashEmail(email) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(email).digest('hex').slice(0, 16);
  }

  calculateTimeToFirstGuess(data) {
    if (data.gameSpecificData?.guessDetails?.length > 0) {
      const firstGuess = new Date(data.gameSpecificData.guessDetails[0].timestamp);
      const gameStart = new Date(data.timestamp);
      return Math.max(0, (firstGuess - gameStart) / 1000);
    }
    return null;
  }

  processSessionForAnalytics(session) {
    return {
      sessionId: session.sessionId,
      timestamp: session.timestamp,
      playerHash: this.hashEmail(session.email),
      gameType: session.gameType || 'journeyman',
      mode: session.mode,
      score: session.correctCount,
      duration: session.durationInSeconds,
      accuracy: session.correctCount / Math.max(session.guesses?.length || 1, 1),
      completed: session.correctCount > 0,
      sharedSocial: session.sharedOnSocial
    };
  }

  calculateAggregateMetrics(sessions) {
    const total = sessions.length;
    if (total === 0) return {};

    return {
      totalSessions: total,
      averageScore: sessions.reduce((sum, s) => sum + s.score, 0) / total,
      averageDuration: sessions.reduce((sum, s) => sum + s.duration, 0) / total,
      averageAccuracy: sessions.reduce((sum, s) => sum + s.accuracy, 0) / total,
      completionRate: sessions.filter(s => s.completed).length / total,
      socialShareRate: sessions.filter(s => s.sharedSocial).length / total,
      modeBreakdown: this.groupBy(sessions, 'mode'),
      hourlyDistribution: this.getHourlyDistribution(sessions)
    };
  }

  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key] || 'unknown';
      groups[group] = (groups[group] || 0) + 1;
      return groups;
    }, {});
  }

  getHourlyDistribution(sessions) {
    return this.groupBy(
      sessions.map(s => new Date(s.timestamp).getHours()),
      s => s
    );
  }
}

module.exports = DataService;
