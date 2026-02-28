import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.ts';
import * as nrcsService from '../services/nrcsService.ts';

vi.mock('../services/nrcsService.ts');

describe('API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/snow', () => {
    it('should return 400 if station is missing', async () => {
      const response = await request(app).get('/api/snow');
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Station ID is required');
    });

    it('should trigger ingestion for a new station', async () => {
      const station = 'NEW_STATION';
      vi.mocked(nrcsService.ingestStation).mockResolvedValue(undefined);

      const response = await request(app).get(`/api/snow?station=${station}`);
      expect(response.status).toBe(200);
      expect(nrcsService.ingestStation).toHaveBeenCalledWith(station);
      expect(response.body.fromCache).toBe(false);
    });

    it('should handle ingestion errors', async () => {
      const station = 'FAIL_STATION';
      vi.mocked(nrcsService.ingestStation).mockRejectedValue(
        new Error('NRCS Down'),
      );

      const response = await request(app).get(`/api/snow?station=${station}`);
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch snow data');
    });

    it('should return data in 122-period format', async () => {
      const station = 'FORMAT_TEST';
      vi.mocked(nrcsService.ingestStation).mockResolvedValue(undefined);

      const response = await request(app).get(`/api/snow?station=${station}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });
});
