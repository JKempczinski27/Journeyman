const { S3Manager } = require('../config/awsConfig');

// Mock AWS SDK with controllable behavior
jest.mock('aws-sdk', () => {
  return {
    S3: jest.fn().mockImplementation(() => ({
      upload: jest.fn(),
      listObjectsV2: jest.fn(),
      getObject: jest.fn()
    })),
    config: {
      update: jest.fn()
    }
  };
});

describe('S3 Retry Mechanism', () => {
  let s3Manager;

  beforeEach(() => {
    process.env.AWS_ENABLED = 'true';
    process.env.AWS_S3_BUCKET = 'test-bucket';
    jest.clearAllMocks();
    s3Manager = new S3Manager();
  });

  describe('Retry Logic', () => {
    it('should retry failed uploads with exponential backoff', async () => {
      let attemptCount = 0;
      s3Manager.s3.upload = jest.fn().mockImplementation(() => ({
        promise: jest.fn().mockImplementation(() => {
          attemptCount++;
          if (attemptCount < 3) {
            return Promise.reject(new Error('Temporary S3 error'));
          }
          return Promise.resolve({
            Location: 'https://s3.amazonaws.com/test-bucket/test.json',
            Key: 'test.json',
            Bucket: 'test-bucket'
          });
        })
      }));

      const result = await s3Manager.uploadData('test.json', { test: 'data' });

      expect(attemptCount).toBe(3);
      expect(result).toHaveProperty('Location');
      expect(s3Manager.s3.upload).toHaveBeenCalledTimes(3);
    });

    it('should succeed on first attempt if no errors', async () => {
      s3Manager.s3.upload = jest.fn().mockImplementation(() => ({
        promise: jest.fn().mockResolvedValue({
          Location: 'https://s3.amazonaws.com/test-bucket/test.json',
          Key: 'test.json',
          Bucket: 'test-bucket'
        })
      }));

      const result = await s3Manager.uploadData('test.json', { test: 'data' });

      expect(result).toHaveProperty('Location');
      expect(s3Manager.s3.upload).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries are exhausted', async () => {
      s3Manager.s3.upload = jest.fn().mockImplementation(() => ({
        promise: jest.fn().mockRejectedValue(new Error('Persistent S3 error'))
      }));

      await expect(
        s3Manager.uploadData('test.json', { test: 'data' })
      ).rejects.toThrow('Persistent S3 error');

      expect(s3Manager.s3.upload).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff between retries', async () => {
      const delays = [];
      const originalDelay = s3Manager.delay.bind(s3Manager);

      s3Manager.delay = jest.fn().mockImplementation((ms) => {
        delays.push(ms);
        return originalDelay(0); // Don't actually wait in tests
      });

      s3Manager.s3.upload = jest.fn().mockImplementation(() => ({
        promise: jest.fn().mockRejectedValue(new Error('S3 error'))
      }));

      try {
        await s3Manager.uploadData('test.json', { test: 'data' });
      } catch (error) {
        // Expected to fail
      }

      // Verify exponential backoff: 1000ms, 2000ms
      expect(delays).toEqual([1000, 2000]);
    });

    it('should respect custom retry count', async () => {
      const originalDelay = s3Manager.delay.bind(s3Manager);
      s3Manager.delay = jest.fn().mockImplementation(() => originalDelay(0));

      s3Manager.s3.upload = jest.fn().mockImplementation(() => ({
        promise: jest.fn().mockRejectedValue(new Error('S3 error'))
      }));

      try {
        await s3Manager.uploadData('test.json', { test: 'data' }, {}, 5);
      } catch (error) {
        // Expected to fail
      }

      expect(s3Manager.s3.upload).toHaveBeenCalledTimes(5);
    });

    it('should not retry when retries set to 1', async () => {
      const originalDelay = s3Manager.delay.bind(s3Manager);
      s3Manager.delay = jest.fn().mockImplementation(() => originalDelay(0));

      s3Manager.s3.upload = jest.fn().mockImplementation(() => ({
        promise: jest.fn().mockRejectedValue(new Error('S3 error'))
      }));

      try {
        await s3Manager.uploadData('test.json', { test: 'data' }, {}, 1);
      } catch (error) {
        // Expected to fail
      }

      expect(s3Manager.s3.upload).toHaveBeenCalledTimes(1);
    });

    it('should cap exponential backoff at 10 seconds', async () => {
      const delays = [];
      const originalDelay = s3Manager.delay.bind(s3Manager);

      s3Manager.delay = jest.fn().mockImplementation((ms) => {
        delays.push(ms);
        return originalDelay(0);
      });

      s3Manager.s3.upload = jest.fn().mockImplementation(() => ({
        promise: jest.fn().mockRejectedValue(new Error('S3 error'))
      }));

      try {
        // Use 10 retries to test the cap
        await s3Manager.uploadData('test.json', { test: 'data' }, {}, 10);
      } catch (error) {
        // Expected to fail
      }

      // Verify delays cap at 10000ms: 1000, 2000, 4000, 8000, 10000, 10000...
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
      expect(delays[3]).toBe(8000);
      expect(delays[4]).toBe(10000);
      expect(delays[5]).toBe(10000);
    });
  });

  describe('Player Data Upload Retry', () => {
    it('should retry player data uploads', async () => {
      let attemptCount = 0;
      s3Manager.s3.upload = jest.fn().mockImplementation(() => ({
        promise: jest.fn().mockImplementation(() => {
          attemptCount++;
          if (attemptCount < 2) {
            return Promise.reject(new Error('Temporary error'));
          }
          return Promise.resolve({
            Location: 'https://s3.amazonaws.com/test-bucket/test.json',
            Key: 'test.json',
            Bucket: 'test-bucket'
          });
        })
      }));

      const playerData = {
        name: 'Test User',
        email: 'test@example.com',
        gameType: 'journeyman'
      };

      const result = await s3Manager.uploadPlayerData(playerData);

      expect(attemptCount).toBe(2);
      expect(result).toHaveProperty('Location');
    });
  });

  describe('Batch Upload Retry', () => {
    it('should handle retries for each file in batch upload', async () => {
      const uploadAttempts = {};

      s3Manager.s3.upload = jest.fn().mockImplementation((params) => ({
        promise: jest.fn().mockImplementation(() => {
          const key = params.Key;
          uploadAttempts[key] = (uploadAttempts[key] || 0) + 1;

          // Make file2 fail once, then succeed
          if (key === 'batch/1.json' && uploadAttempts[key] < 2) {
            return Promise.reject(new Error('Temporary error for file2'));
          }

          return Promise.resolve({
            Location: `https://s3.amazonaws.com/test-bucket/${key}`,
            Key: key,
            Bucket: 'test-bucket'
          });
        })
      }));

      const dataArray = [
        { id: 0, data: 'test0' },
        { id: 1, data: 'test1' },
        { id: 2, data: 'test2' }
      ];
      const pathGenerator = (data, index) => `batch/${index}.json`;

      const result = await s3Manager.batchUpload(dataArray, pathGenerator);

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(uploadAttempts['batch/1.json']).toBe(2); // Retried once
    });
  });
});
