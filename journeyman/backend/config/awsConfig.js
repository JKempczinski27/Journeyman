// backend/config/awsConfig.js
const AWS = require('aws-sdk');

// AWS S3 Configuration for Journeyman data pipeline
const awsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  bucketName: process.env.S3_BUCKET_NAME || 'journeyman-game-data',

  // S3 folder structure
  folders: {
    rawData: 'raw-data',
    processedData: 'processed-data',
    analytics: 'analytics',
    exports: 'exports',
    backups: 'backups'
  },

  // File naming conventions
  fileNaming: {
    rawData: (timestamp, gameType) => `${awsConfig.folders.rawData}/${gameType}/${timestamp.slice(0, 10)}/${timestamp}.json`,
    processedData: (timestamp, gameType) => `${awsConfig.folders.processedData}/${gameType}/${timestamp.slice(0, 10)}/processed_${timestamp}.json`,
    analytics: (date, type) => `${awsConfig.folders.analytics}/${type}/${date}/analytics_${Date.now()}.json`,
    dailyExport: (date, gameType) => `${awsConfig.folders.exports}/daily/${gameType}/${date}_export.json`,
    backup: (timestamp) => `${awsConfig.folders.backups}/${timestamp.slice(0, 7)}/${timestamp}_backup.json`
  }
};

// Initialize AWS SDK
AWS.config.update({
  region: awsConfig.region,
  accessKeyId: awsConfig.accessKeyId,
  secretAccessKey: awsConfig.secretAccessKey
});

// Create S3 client
const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  params: { Bucket: awsConfig.bucketName }
});

// S3 utility functions
class S3Manager {
  constructor() {
    this.enabled = process.env.AWS_ENABLED === 'true';
    this.bucket = process.env.AWS_S3_BUCKET || 'journeyman-data';

    if (this.enabled) {
      console.log('AWS S3 integration enabled');
    } else {
      console.log('AWS S3 integration disabled - using local storage');
    }
  }

  // Upload data to S3
  async uploadData(key, data, metadata = {}) {
    if (!this.enabled) {
      console.log(`Mock S3 upload: ${key}`);
      return {
        success: true,
        key,
        location: `mock://s3/${this.bucket}/${key}`,
        message: 'Local storage mode - file not uploaded to S3'
      };
    }

    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      Metadata: {
        uploadedAt: new Date().toISOString(),
        source: 'journeyman-game',
        ...metadata
      }
    };

    try {
      const result = await this.s3.upload(params).promise();
      console.log(`✅ Data uploaded to S3: ${key}`);
      return result;
    } catch (error) {
      console.error(`❌ S3 Upload Error for ${key}:`, error);
      throw error;
    }
  }

  // Upload raw player data
  async uploadPlayerData(playerData) {
    const timestamp = new Date().toISOString();
    const key = awsConfig.fileNaming.rawData(timestamp, playerData.gameType || 'journeyman');

    const enrichedData = {
      ...playerData,
      uploadTimestamp: timestamp,
      dataVersion: '1.0',
      source: 'game-client'
    };

    return this.uploadData(key, enrichedData, {
      playerEmail: playerData.email,
      gameType: playerData.gameType || 'journeyman',
      gameMode: playerData.mode
    });
  }

  // Upload processed analytics data
  async uploadAnalyticsData(analyticsData, type = 'daily') {
    const date = new Date().toISOString().slice(0, 10);
    const key = awsConfig.fileNaming.analytics(date, type);

    return this.uploadData(key, analyticsData, {
      analyticsType: type,
      generatedAt: new Date().toISOString()
    });
  }

  // Batch upload multiple files
  async batchUpload(dataArray, pathGenerator) {
    const uploadPromises = dataArray.map(async (data, index) => {
      const key = pathGenerator(data, index);
      return this.uploadData(key, data);
    });

    try {
      const results = await Promise.allSettled(uploadPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`📊 Batch upload completed: ${successful} successful, ${failed} failed`);
      return { successful, failed, results };
    } catch (error) {
      console.error('❌ Batch upload error:', error);
      throw error;
    }
  }

  // List files in bucket
  async listFiles(prefix = '', maxKeys = 1000) {
    if (!this.enabled) {
      console.log(`Mock S3 list: ${prefix}`);
      return {
        success: true,
        files: [],
        message: 'Local storage mode - no S3 files available'
      };
    }

    const params = {
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: maxKeys
    };

    try {
      const result = await this.s3.listObjectsV2(params).promise();
      return result.Contents;
    } catch (error) {
      console.error('❌ Error listing S3 files:', error);
      throw error;
    }
  }

  // Download data from S3
  async downloadData(key) {
    if (!this.enabled) {
      console.log(`Mock S3 download: ${key}`);
      return {
        success: true,
        data: null,
        message: 'Local storage mode - no S3 download available'
      };
    }

    const params = {
      Bucket: this.bucket,
      Key: key
    };

    try {
      const result = await this.s3.getObject(params).promise();
      return JSON.parse(result.Body.toString());
    } catch (error) {
      console.error(`❌ Error downloading ${key}:`, error);
      throw error;
    }
  }

  // Create daily export
  async createDailyExport(date, gameType = 'journeyman') {
    try {
      // List all files for the date
      const prefix = `${awsConfig.folders.rawData}/${gameType}/${date}`;
      const files = await this.listFiles(prefix);

      // Download and combine all data
      const combinedData = [];
      for (const file of files) {
        const data = await this.downloadData(file.Key);
        combinedData.push(data);
      }

      // Upload combined export
      const exportKey = awsConfig.fileNaming.dailyExport(date, gameType);
      return this.uploadData(exportKey, {
        exportDate: date,
        gameType: gameType,
        totalRecords: combinedData.length,
        data: combinedData,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error creating daily export:', error);
      throw error;
    }
  }
}

module.exports = {
  awsConfig,
  S3Manager,
  s3
};
