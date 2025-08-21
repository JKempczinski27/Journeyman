const request = require('supertest');
const app = require('../server');

describe('API Integration', () => {
  it('should save a player', async () => {
    const res = await request(app)
      .post('/save-player')
      .send({ name: 'Jane Doe', email: 'jane@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('should handle missing fields', async () => {
    const res = await request(app)
      .post('/save-player')
      .send({ name: '' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});