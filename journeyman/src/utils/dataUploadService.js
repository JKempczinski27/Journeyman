// src/utils/dataUploadService.js
// Enhanced data upload service with S3 pipeline integration

class DataUploadService {
  constructor() {
    this.apiBase = this.resolveApiBase();
    this.retryAttempts = 3;
    this.uploadQueue = [];
    this.isProcessingQueue = false;
    this.adminCredentials = this.loadAdminCredentials();
  }

  resolveApiBase() {
    const explicitBase = process.env.REACT_APP_API_URL
      || (typeof window !== 'undefined'
        && window.__JOURNEYMAN_CONFIG__
        && window.__JOURNEYMAN_CONFIG__.apiBase);

    if (explicitBase) {
      return explicitBase.replace(/\/$/, '');
    }

    if (typeof window !== 'undefined' && window.location) {
      return window.location.origin;
    }

    return '';
  }

  loadAdminCredentials() {
    const fromEnv = {
      apiKey: process.env.REACT_APP_ADMIN_API_KEY || '',
      token: process.env.REACT_APP_ADMIN_JWT || ''
    };

    if (typeof window === 'undefined') {
      return fromEnv;
    }

    try {
      const stored = window.localStorage.getItem('journeyman.adminCredentials');
      if (!stored) {
        return fromEnv;
      }

      const parsed = JSON.parse(stored);
      return {
        apiKey: parsed.apiKey || fromEnv.apiKey,
        token: parsed.token || fromEnv.token
      };
    } catch (error) {
      console.warn('Failed to load stored admin credentials:', error);
      return fromEnv;
    }
  }

  persistAdminCredentials() {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(
        'journeyman.adminCredentials',
        JSON.stringify(this.adminCredentials)
      );
    } catch (error) {
      console.warn('Failed to persist admin credentials:', error);
    }
  }

  setAdminCredentials(credentials = {}, options = {}) {
    const { apiKey, token } = credentials;

    this.adminCredentials = {
      apiKey: apiKey ?? this.adminCredentials.apiKey,
      token: token ?? this.adminCredentials.token
    };

    if (options.persist !== false) {
      this.persistAdminCredentials();
    }

    return this.adminCredentials;
  }

  clearAdminCredentials() {
    this.adminCredentials = { apiKey: '', token: '' };
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('journeyman.adminCredentials');
    }
  }

  buildUrl(endpoint) {
    const base = this.apiBase || '';
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${normalizedBase}${normalizedEndpoint}`;
  }

  buildHeaders({ requiresAdmin = false, includeJson = true, extraHeaders = {} } = {}) {
    const headers = {};

    if (includeJson && !extraHeaders['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const { apiKey, token } = this.adminCredentials;

    if (requiresAdmin) {
      if (!apiKey) {
        throw new Error('Admin API key is not configured');
      }

      if (!token) {
        throw new Error('Admin JWT is not configured');
      }
    }

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return { ...headers, ...extraHeaders };
  }

  async authorizedFetch(endpoint, {
    method = 'GET',
    body,
    requiresAdmin = false,
    headers = {}
  } = {}) {
    const includeJson = body !== undefined && body !== null;
    const requestHeaders = this.buildHeaders({
      requiresAdmin,
      includeJson,
      extraHeaders: headers
    });

    const response = await fetch(this.buildUrl(endpoint), {
      method,
      headers: requestHeaders,
      body
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
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
      return await this.authorizedFetch('/s3/status', {
        method: 'GET',
        requiresAdmin: true
      });
    } catch (error) {
      console.error('❌ Failed to get S3 status:', error);
      throw error;
    }
  }

  // Download data from S3
  async downloadFromS3(key) {
    try {
      return await this.authorizedFetch(`/s3/download/${encodeURIComponent(key)}`, {
        method: 'GET',
        requiresAdmin: true
      });
    } catch (error) {
      console.error(`❌ Failed to download ${key} from S3:`, error);
      throw error;
    }
  }

  // Utility functions
  async makeRequest(endpoint, data, options = {}) {
    const body = data !== undefined && data !== null
      ? JSON.stringify(data)
      : undefined;

    return this.authorizedFetch(endpoint, {
      method: options.method || 'POST',
      body,
      requiresAdmin: options.requiresAdmin || false,
      headers: options.headers || {}
    });
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
export const configureAdminAuth = (credentials, options) =>
  dataUploadService.setAdminCredentials(credentials, options);
export const clearAdminAuth = () => dataUploadService.clearAdminCredentials();
export const getAdminAuth = () => ({ ...dataUploadService.adminCredentials });
