import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server';

// Mock the logger to prevent console output during tests
jest.mock('../server', () => {
  const originalModule = jest.requireActual('../server');
  return {
    ...originalModule,
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }
  };
});

describe('Media Pipeline API', () => {
  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/healthz')
        .expect(200);

      expect(response.body).toEqual({ ok: true });
    });
  });

  describe('Status Endpoint', () => {
    it('should return current status', async () => {
      const response = await request(app)
        .get('/api/status')
        .expect(200);

      expect(response.body).toHaveProperty('pipeline');
      expect(response.body).toHaveProperty('containerName');
      expect(response.body).toHaveProperty('vpn');
      expect(response.body).toHaveProperty('tor');
      expect(response.body.containerName).toBe('media-pipeline');
    });

    it('should start SSE stream for status', (done) => {
      const req = request(app)
        .get('/api/status/stream')
        .set('Accept', 'text/event-stream')
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);

      req.end((err) => {
        if (err) return done(err);
        done();
      });
    });
  });

  describe('Pipeline Control', () => {
    it('should start pipeline', async () => {
      const response = await request(app)
        .post('/api/pipeline/start')
        .expect(200);

      expect(response.body).toEqual({ ok: true });
    });

    it('should stop pipeline', async () => {
      const response = await request(app)
        .post('/api/pipeline/stop')
        .expect(200);

      expect(response.body).toEqual({ ok: true });
    });
  });

  describe('Links Management', () => {
    beforeEach(() => {
      // Mock successful file operations
      const fs = require('fs/promises');
      fs.readFile.mockResolvedValue('https://mega.nz/folder/test1\nhttps://mega.nz/folder/test2\n');
      fs.writeFile.mockResolvedValue(undefined);
      fs.rename.mockResolvedValue(undefined);
    });

    it('should get all links', async () => {
      const response = await request(app)
        .get('/api/links')
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('should add a new link', async () => {
      const fs = require('fs/promises');
      fs.readFile.mockResolvedValue(''); // Empty file for new link test

      const newLink = { url: 'https://mega.nz/folder/newtest' };
      
      const response = await request(app)
        .post('/api/links')
        .send(newLink)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('string');
    });

    it('should reject invalid URLs', async () => {
      const invalidLink = { url: 'https://example.com/invalid' };
      
      await request(app)
        .post('/api/links')
        .send(invalidLink)
        .expect(400);
    });

    it('should add bulk links', async () => {
      const fs = require('fs/promises');
      fs.readFile.mockResolvedValue(''); // Empty file for bulk test

      const bulkLinks = {
        urls: [
          'https://mega.nz/folder/bulk1',
          'https://mega.nz/folder/bulk2'
        ]
      };
      
      const response = await request(app)
        .post('/api/links/bulk')
        .send(bulkLinks)
        .expect(200);

      expect(response.body).toHaveProperty('created');
      expect(response.body.created).toBe(2);
    });

    it('should delete a link', async () => {
      // Mock link exists
      const fs = require('fs/promises');
      fs.readFile.mockResolvedValue('https://mega.nz/folder/test1\n');

      const testId = '3c7c2c7a1b2f8e1f5d6e4b8a9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e';
      
      const response = await request(app)
        .delete(`/api/links/${testId}`)
        .expect(200);

      expect(response.body).toEqual({ ok: true });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/links')
        .send({ invalid: 'data' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Authentication', () => {
    // Note: These tests run without API_TOKEN set, so auth is disabled
    // In a real test environment, you'd set API_TOKEN and test auth flows
    
    it('should allow requests when no token is configured', async () => {
      await request(app)
        .get('/api/status')
        .expect(200);
    });
  });
});