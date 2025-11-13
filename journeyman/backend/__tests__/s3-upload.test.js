const { S3Manager } = require('../config/awsConfig');
const DataService = require('../services/dataServices');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  return {
    S3: jest.fn().mockImplementation(() => ({
      upload: jest.fn().mockImplementation((params) => ({
        promise: jest.fn().mockResolvedValue({
          Location: `https://s3.amazonaws.com/${params.Bucket}/${params.Key}`,
          Key: params.Key,
          Bucket: params.Bucket,
          ETag: '"abc123"'
        })
      })),
      listObjectsV2: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Contents: [
            { Key: 'file1.json', Size: 1024, LastModified: new Date() },
            { Key: 'file2.json', Size: 2048, LastModified: new Date() }
          ]
        })
      }),
      getObject: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Body: Buffer.from(JSON.stringify({
            sessionId: 'test',
            email: 'test@example.com',
            correctCount: 5,
            durationInSeconds: 100,
            guesses: ['a', 'b']
          }))
        })
      })
    })),
    config: {
      update: jest.fn()
    }
  };
});

// Mock database
jest.mock('../config/database', () => ({
  execute: jest.fn().mockResolvedValue([{ insertId: 123 }, null])
}));

describe('S3Manager', () => {
  let s3Manager;

  beforeEach(() => {
    // Set AWS_ENABLED to true for testing
    process.env.AWS_ENABLED = 'true';
    process.env.AWS_S3_BUCKET = 'test-bucket';
    jest.clearAllMocks();
    // Create a fresh instance for each test
    s3Manager = new S3Manager();
  });

  describe('uploadData', () => {
    it('should upload data to S3 successfully', async () => {
      const testData = { player: 'test', score: 100 };
      const testKey = 'test/data.json';

      const result = await s3Manager.uploadData(testKey, testData);

      expect(result).toHaveProperty('Location');
      expect(result.Key).toBe(testKey);
      expect(s3Manager.s3.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: testKey,
          Body: JSON.stringify(testData, null, 2),
          ContentType: 'application/json'
        })
      );
    });

    it('should include metadata in uploads', async () => {
      const testData = { player: 'test' };
      const testKey = 'test/data.json';
      const metadata = { custom: 'metadata' };

      await s3Manager.uploadData(testKey, testData, metadata);

      expect(s3Manager.s3.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          Metadata: expect.objectContaining({
            uploadedAt: expect.any(String),
            source: 'journeyman-game',
            custom: 'metadata'
          })
        })
      );
    });

    it('should work in mock mode when AWS disabled', async () => {
      process.env.AWS_ENABLED = 'false';
      const mockS3Manager = new S3Manager();

      const result = await mockS3Manager.uploadData('test.json', { test: 'data' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Local storage mode');
      expect(result.location).toContain('mock://');
    });

    it('should handle upload errors', async () => {
      const errorS3Manager = new S3Manager();
      const originalUpload = errorS3Manager.s3.upload;

      errorS3Manager.s3.upload = jest.fn().mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('S3 Upload Failed'))
      });

      await expect(
        errorS3Manager.uploadData('test.json', { test: 'data' })
      ).rejects.toThrow('S3 Upload Failed');

      // Restore original
      errorS3Manager.s3.upload = originalUpload;
    });
  });

  describe('uploadPlayerData', () => {
    it('should upload player data with correct structure', async () => {
      const playerData = {
        name: 'John Doe',
        email: 'john@example.com',
        gameType: 'journeyman',
        mode: 'daily',
        correctCount: 5
      };

      const result = await s3Manager.uploadPlayerData(playerData);

      expect(s3Manager.s3.upload).toHaveBeenCalled();
      const uploadCall = s3Manager.s3.upload.mock.calls[0][0];
      const uploadedData = JSON.parse(uploadCall.Body);

      expect(uploadedData).toMatchObject(playerData);
      expect(uploadedData).toHaveProperty('uploadTimestamp');
      expect(uploadedData).toHaveProperty('dataVersion', '1.0');
      expect(uploadedData).toHaveProperty('source', 'game-client');
    });

    it('should use correct S3 key naming convention', async () => {
      const playerData = {
        gameType: 'journeyman',
        email: 'test@example.com'
      };

      await s3Manager.uploadPlayerData(playerData);

      const uploadCall = s3Manager.s3.upload.mock.calls[0][0];
      expect(uploadCall.Key).toMatch(/^raw-data\/journeyman\/\d{4}-\d{2}-\d{2}\/.+\.json$/);
    });
  });

  describe('uploadAnalyticsData', () => {
    it('should upload analytics data with correct structure', async () => {
      const analyticsData = {
        totalSessions: 100,
        averageScore: 75,
        completionRate: 0.85
      };

      await s3Manager.uploadAnalyticsData(analyticsData, 'daily');

      expect(s3Manager.s3.upload).toHaveBeenCalled();
      const uploadCall = s3Manager.s3.upload.mock.calls[0][0];

      expect(uploadCall.Metadata).toMatchObject({
        analyticsType: 'daily',
        generatedAt: expect.any(String)
      });
    });

    it('should use correct analytics key naming', async () => {
      await s3Manager.uploadAnalyticsData({ test: 'data' }, 'hourly');

      const uploadCall = s3Manager.s3.upload.mock.calls[0][0];
      expect(uploadCall.Key).toMatch(/^analytics\/hourly\/\d{4}-\d{2}-\d{2}\/.+\.json$/);
    });
  });

  describe('batchUpload', () => {
    it('should upload multiple files successfully', async () => {
      const dataArray = [
        { id: 1, data: 'test1' },
        { id: 2, data: 'test2' },
        { id: 3, data: 'test3' }
      ];
      const pathGenerator = (data, index) => `batch/${index}.json`;

      const result = await s3Manager.batchUpload(dataArray, pathGenerator);

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(s3Manager.s3.upload).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures in batch upload', async () => {
      // Mock delay to speed up test
      const originalDelay = s3Manager.delay.bind(s3Manager);
      s3Manager.delay = jest.fn().mockImplementation(() => originalDelay(0));

      const uploadCounts = {};
      s3Manager.s3.upload = jest.fn().mockImplementation((params) => ({
        promise: jest.fn().mockImplementation(() => {
          const key = params.Key;
          uploadCounts[key] = (uploadCounts[key] || 0) + 1;

          // Make file with id=2 always fail
          if (key === 'batch/2.json') {
            return Promise.reject(new Error('Upload failed'));
          }
          return Promise.resolve({ Location: 'test', Key: key });
        })
      }));

      const dataArray = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const pathGenerator = (data) => `batch/${data.id}.json`;

      const result = await s3Manager.batchUpload(dataArray, pathGenerator);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('should report batch upload statistics', async () => {
      const dataArray = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const pathGenerator = (data) => `batch/${data.id}.json`;

      const result = await s3Manager.batchUpload(dataArray, pathGenerator);

      expect(result).toHaveProperty('successful');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('results');
      expect(result.results).toHaveLength(10);
    });
  });

  describe('listFiles', () => {
    it('should list files with prefix', async () => {
      const files = await s3Manager.listFiles('raw-data/journeyman');

      expect(files).toHaveLength(2);
      expect(files[0]).toHaveProperty('Key');
      expect(files[0]).toHaveProperty('Size');
      expect(files[0]).toHaveProperty('LastModified');
    });

    it('should respect maxKeys parameter', async () => {
      await s3Manager.listFiles('test-prefix', 50);

      expect(s3Manager.s3.listObjectsV2).toHaveBeenCalledWith(
        expect.objectContaining({
          MaxKeys: 50
        })
      );
    });

    it('should return empty array in mock mode', async () => {
      process.env.AWS_ENABLED = 'false';
      const mockS3Manager = new S3Manager();

      const files = await mockS3Manager.listFiles('test');

      expect(files).toEqual([]);
    });
  });

  describe('downloadData', () => {
    it('should download and parse JSON data', async () => {
      const data = await s3Manager.downloadData('test/file.json');

      expect(data).toHaveProperty('sessionId');
      expect(data).toHaveProperty('email');
      expect(s3Manager.s3.getObject).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'test/file.json'
        })
      );
    });

    it('should return mock data when AWS disabled', async () => {
      process.env.AWS_ENABLED = 'false';
      const mockS3Manager = new S3Manager();

      const data = await mockS3Manager.downloadData('test.json');

      expect(data.mock).toBe(true);
      expect(data.message).toContain('Local storage mode');
    });
  });

  describe('createDailyExport', () => {
    it('should create daily export by combining files', async () => {
      const result = await s3Manager.createDailyExport('2025-01-15', 'journeyman');

      expect(s3Manager.s3.listObjectsV2).toHaveBeenCalled();
      expect(s3Manager.s3.getObject).toHaveBeenCalledTimes(2);
      expect(s3Manager.s3.upload).toHaveBeenCalled();

      const uploadCall = s3Manager.s3.upload.mock.calls[0][0];
      expect(uploadCall.Key).toMatch(/^exports\/daily\/journeyman\/2025-01-15_export\.json$/);
    });

    it('should include correct metadata in daily export', async () => {
      await s3Manager.createDailyExport('2025-01-15', 'journeyman');

      const uploadCall = s3Manager.s3.upload.mock.calls[0][0];
      const exportData = JSON.parse(uploadCall.Body);

      expect(exportData).toHaveProperty('exportDate', '2025-01-15');
      expect(exportData).toHaveProperty('gameType', 'journeyman');
      expect(exportData).toHaveProperty('totalRecords');
      expect(exportData).toHaveProperty('data');
      expect(exportData).toHaveProperty('generatedAt');
    });
  });
});

describe('DataService S3 Integration', () => {
  let dataService;

  beforeEach(() => {
    process.env.AWS_ENABLED = 'true';
    process.env.AWS_S3_BUCKET = 'test-bucket';
    dataService = new DataService();
    jest.clearAllMocks();
  });

  describe('savePlayerData', () => {
    it('should save to database and trigger S3 pipeline', async () => {
      const playerData = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        gameType: 'journeyman',
        mode: 'daily',
        correctCount: 5,
        durationInSeconds: 120,
        guesses: ['guess1', 'guess2']
      };

      const result = await dataService.savePlayerData(playerData);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('timestamp');
      expect(result.message).toContain('saved successfully');

      // Wait for async S3 pipeline
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should enrich player data before saving', async () => {
      const playerData = {
        name: 'John Doe',
        email: 'john@example.com'
      };

      const result = await dataService.savePlayerData(playerData);

      expect(result).toHaveProperty('sessionId');
      expect(result.sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
    });

    it('should fallback to S3 when database fails', async () => {
      const pool = require('../config/database');
      const originalExecute = pool.execute;
      pool.execute = jest.fn().mockRejectedValueOnce(new Error('Database connection failed'));

      const playerData = {
        name: 'Test User',
        email: 'test@example.com',
        gameType: 'journeyman'
      };

      const result = await dataService.savePlayerData(playerData);

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.message).toContain('S3 (DB unavailable)');

      // Restore original mock
      pool.execute = originalExecute;
    });
  });

  describe('S3 Pipeline', () => {
    it('should execute all three upload strategies', async () => {
      const data = {
        sessionId: 'test-session',
        email: 'test@example.com',
        gameType: 'journeyman',
        correctCount: 5,
        guesses: ['a', 'b', 'c']
      };

      const uploadPlayerDataSpy = jest.spyOn(dataService.s3Manager, 'uploadPlayerData');
      const uploadDataSpy = jest.spyOn(dataService.s3Manager, 'uploadData');

      await dataService.sendToS3Pipeline(data);

      expect(uploadPlayerDataSpy).toHaveBeenCalled();
      // uploadData is called 3 times: once by uploadPlayerData, once by daily aggregation, once by analytics
      expect(uploadDataSpy).toHaveBeenCalledTimes(3);
    });

    it('should handle S3 pipeline failures gracefully', async () => {
      const originalUploadPlayerData = dataService.s3Manager.uploadPlayerData;
      dataService.s3Manager.uploadPlayerData = jest.fn().mockRejectedValue(
        new Error('S3 error')
      );

      const data = { sessionId: 'test', email: 'test@example.com' };

      const results = await dataService.sendToS3Pipeline(data);

      expect(results).toHaveLength(3);
      expect(results.some(r => r.status === 'rejected')).toBe(true);

      // Restore original method
      dataService.s3Manager.uploadPlayerData = originalUploadPlayerData;
    });
  });

  describe('Analytics Export', () => {
    it('should create analytics export for date range', async () => {
      const result = await dataService.createAnalyticsExport(
        '2025-01-01',
        '2025-01-03',
        'journeyman'
      );

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('exportKey');
      expect(result).toHaveProperty('metrics');
    });

    it('should process data in chunks', async () => {
      const originalListFiles = dataService.s3Manager.listFiles;
      const originalDownloadData = dataService.s3Manager.downloadData;

      // Mock large file list
      dataService.s3Manager.listFiles = jest.fn().mockResolvedValue(
        Array.from({ length: 250 }, (_, i) => ({ Key: `file${i}.json` }))
      );

      dataService.s3Manager.downloadData = jest.fn().mockResolvedValue({
        sessionId: 'test',
        email: 'test@example.com',
        correctCount: 5,
        durationInSeconds: 100,
        guesses: ['a', 'b']
      });

      await dataService.createAnalyticsExport('2025-01-01', '2025-01-01', 'journeyman');

      expect(dataService.s3Manager.downloadData).toHaveBeenCalledTimes(250);

      // Restore original methods
      dataService.s3Manager.listFiles = originalListFiles;
      dataService.s3Manager.downloadData = originalDownloadData;
    });

    it('should calculate aggregate metrics correctly', async () => {
      const sessions = [
        { score: 10, duration: 100, accuracy: 0.8, completed: true, sharedSocial: true, mode: 'daily', timestamp: '2025-01-01T10:00:00Z' },
        { score: 20, duration: 200, accuracy: 0.9, completed: true, sharedSocial: false, mode: 'daily', timestamp: '2025-01-01T11:00:00Z' },
        { score: 5, duration: 50, accuracy: 0.5, completed: false, sharedSocial: false, mode: 'practice', timestamp: '2025-01-01T12:00:00Z' }
      ];

      const metrics = dataService.calculateAggregateMetrics(sessions);

      expect(metrics.totalSessions).toBe(3);
      expect(metrics.averageScore).toBeCloseTo(11.67, 1);
      expect(metrics.averageDuration).toBeCloseTo(116.67, 1);
      expect(metrics.averageAccuracy).toBeCloseTo(0.73, 1);
      expect(metrics.completionRate).toBeCloseTo(0.67, 1);
      expect(metrics.socialShareRate).toBeCloseTo(0.33, 1);
    });
  });

  describe('Data Privacy', () => {
    it('should hash emails in daily aggregation', async () => {
      const data = {
        sessionId: 'test',
        email: 'test@example.com',
        gameType: 'journeyman',
        correctCount: 5,
        timestamp: new Date().toISOString()
      };

      const uploadDataSpy = jest.spyOn(dataService.s3Manager, 'uploadData');

      await dataService.addToDailyAggregation(data);

      const aggregationCall = uploadDataSpy.mock.calls[0];
      const aggregationData = aggregationCall[1];

      expect(aggregationData).not.toHaveProperty('email');
      expect(aggregationData).toHaveProperty('playerHash');
      expect(aggregationData.playerHash).toHaveLength(16);
    });

    it('should use consistent hashing for same email', () => {
      const email = 'test@example.com';
      const hash1 = dataService.hashEmail(email);
      const hash2 = dataService.hashEmail(email);

      expect(hash1).toBe(hash2);
    });
  });
});
