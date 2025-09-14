// src/utils/dataUploadService.js
// Enhanced data upload service with S3 pipeline integration

class DataUploadService {
  constructor() {
    this.apiBase = process.env.REACT_APP_API_URL || 'https://journeyman-production.up.railway.app';
    this.retryAttempts = 3;
    this.uploadQueue = [];
    this.isProcessingQueue = false;
  }

  // Enhanced single game data upload
  async uploadGameData(gameData) {
    const uploadData = {
      ...gameData,
      clientTimestamp: new Date().toISOString(),
      browserInfo: this.getBrowserInfo(),
      sessionInfo: this.getSessionInfo()
    };

    console.log('🚀 Uploading game data to S3 pipeline:', {
      sessionId: uploadData.sessionId,
      playerName: uploadData.name,
      gameType: uploadData.gameType || 'journeyman'
    });

    try {
      const response = await this.makeRequest('/save-player', uploadData);

      if (response.success) {
        console.log('✅ Game data uploaded successfully:', response);
        return response;
      } else {
        throw new Error(response.message || 'Upload failed');
      }
    } catch (error) {
      console.error('❌ Game data upload failed:', error);

      // Add to retry queue
      this.addToQueue(uploadData);

      throw error;
    }
  }

  // Batch upload for multiple sessions
  async batchUpload(sessions) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      throw new Error('Sessions must be a non-empty array');
    }

    const enrichedSessions = sessions.map(session => ({
      ...session,
      clientTimestamp: new Date().toISOString(),
      browserInfo: this.getBrowserInfo(),
      batchUpload: true
    }));

    try {
      const response = await this.makeRequest('/batch-upload', {
        sessions: enrichedSessions,
        batchSize: enrichedSessions.length,
        batchTimestamp: new Date().toISOString()
      });

      console.log(`✅ Batch upload completed: ${response.successful}/${response.processed} successful`);
      return response;
    } catch (error) {
      console.error('❌ Batch upload failed:', error);

      // Add failed sessions to individual retry queue
      enrichedSessions.forEach(session => this.addToQueue(session));

      throw error;
    }
  }

  // Queue management for failed uploads
  addToQueue(data) {
    this.uploadQueue.push({
      data,
      attempts: 0,
      timestamp: new Date().toISOString()
    });

    // Start processing queue if not already running
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.uploadQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;

    while (this.uploadQueue.length > 0) {
      const queueItem = this.uploadQueue.shift();

      try {
        await this.retryUpload(queueItem);
        console.log('✅ Queued upload successful');
      } catch (error) {
        if (queueItem.attempts < this.retryAttempts) {
          queueItem.attempts++;
          this.uploadQueue.push(queueItem);
          console.log(`🔄 Retrying upload, attempt ${queueItem.attempts}`);
        } else {
          console.error('❌ Upload failed after max retries:', error);
          this.storeFailedUpload(queueItem);
        }
      }

      // Wait between retries
      await this.delay(1000 * queueItem.attempts);
    }

    this.isProcessingQueue = false;
  }

  async retryUpload(queueItem) {
    return this.makeRequest('/save-player', queueItem.data);
  }

  // Store failed uploads locally for manual retry
  storeFailedUpload(queueItem) {
    try {
      const failedUploads = JSON.parse(localStorage.getItem('failedUploads') || '[]');
      failedUploads.push({
        ...queueItem,
        failedAt: new Date().toISOString()
      });

      // Keep only last 50 failed uploads
      const trimmed = failedUploads.slice(-50);
      localStorage.setItem('failedUploads', JSON.stringify(trimmed));

      console.log('💾 Failed upload stored locally for manual retry');
    } catch (error) {
      console.error('Failed to store upload locally:', error);
    }
  }

  // Retry all failed uploads
  async retryFailedUploads() {
    try {
      const failedUploads = JSON.parse(localStorage.getItem('failedUploads') || '[]');

      if (failedUploads.length === 0) {
        console.log('No failed uploads to retry');
        return { success: true, retried: 0 };
      }

      console.log(`🔄 Retrying ${failedUploads.length} failed uploads`);

      const retryPromises = failedUploads.map(item =>
        this.makeRequest('/save-player', item.data)
          .then(() => ({ success: true, item }))
          .catch(error => ({ success: false, item, error }))
      );

      const results = await Promise.allSettled(retryPromises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

      // Remove successful uploads from local storage
      const stillFailed = failedUploads.filter((item, index) => {
        const result = results[index];
        return !(result.status === 'fulfilled' && result.value.success);
      });

      localStorage.setItem('failedUploads', JSON.stringify(stillFailed));

      return {
        success: true,
        total: failedUploads.length,
        successful,
        stillFailed: stillFailed.length
      };
    } catch (error) {
      console.error('Error retrying failed uploads:', error);
      throw error;
    }
  }

  // Analytics export request
  async requestAnalyticsExport(startDate, endDate, gameType = 'journeyman') {
    try {
      const response = await this.makeRequest('/export-analytics', {
        startDate,
        endDate,
        gameType,
        requestedBy: 'frontend',
        requestTimestamp: new Date().toISOString()
      });

      console.log('📊 Analytics export requested:', response);
      return response;
    } catch (error) {
      console.error('❌ Analytics export request failed:', error);
      throw error;
    }
  }

  // Get S3 status and recent files
  async getS3Status() {
    try {
      const response = await fetch(`${this.apiBase}/s3/status`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ Failed to get S3 status:', error);
      throw error;
    }
  }

  // Download data from S3
  async downloadFromS3(key) {
    try {
      const response = await fetch(`${this.apiBase}/s3/download/${encodeURIComponent(key)}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`❌ Failed to download ${key} from S3:`, error);
      throw error;
    }
  }

  // Utility functions
  async makeRequest(endpoint, data) {
    const response = await fetch(`${this.apiBase}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  getBrowserInfo() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screen: {
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine
    };
  }

  getSessionInfo() {
    return {
      sessionStart: sessionStorage.getItem('sessionStart') || new Date().toISOString(),
      pageLoadTime: performance.now(),
      referrer: document.referrer,
      url: window.location.href
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get upload queue status
  getQueueStatus() {
    return {
      queueLength: this.uploadQueue.length,
      isProcessing: this.isProcessingQueue,
      failedUploadsCount: JSON.parse(localStorage.getItem('failedUploads') || '[]').length
    };
  }
}

// Create singleton instance
const dataUploadService = new DataUploadService();

// Set session start time
if (!sessionStorage.getItem('sessionStart')) {
  sessionStorage.setItem('sessionStart', new Date().toISOString());
}

export default dataUploadService;

// Convenience exports
export const uploadGameData = (gameData) => dataUploadService.uploadGameData(gameData);
export const batchUpload = (sessions) => dataUploadService.batchUpload(sessions);
export const retryFailedUploads = () => dataUploadService.retryFailedUploads();
export const getS3Status = () => dataUploadService.getS3Status();
export const requestAnalyticsExport = (startDate, endDate, gameType) =>
  dataUploadService.requestAnalyticsExport(startDate, endDate, gameType);
