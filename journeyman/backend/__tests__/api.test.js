const request = require('supertest');
const app = require('../server');

describe('API Integration', () => {
  it('should save a player', async () => {
    const res = await request(app)
      .post('/save-player')
      .send({ name: 'Jane Doe', email: 'jane@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Player data saved successfully'
    });
    expect(res.body).toHaveProperty('sessionId');
    expect(res.body.sessionId).toEqual(expect.any(String));
    expect(res.body).toHaveProperty('playerId');
    expect(res.body.playerId).toEqual(expect.any(String));
    expect(res.body).toHaveProperty('savedAt');
    expect(new Date(res.body.savedAt).toString()).not.toBe('Invalid Date');
    expect(res.body).toHaveProperty('metadata');
    expect(res.body.metadata).toMatchObject({
      gameType: 'journeyman',
      correctCount: null
    });
  });

  it('should handle missing fields', async () => {
    const res = await request(app)
      .post('/save-player')
      .send({ name: '' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ success: false });
    expect(res.body).toHaveProperty('error');
  });
});