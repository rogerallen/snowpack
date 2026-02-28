import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.ts';
import axios from 'axios';

vi.mock('axios');

describe('API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockStationData = {
    data: [
      {
        Date: '2023-01-01',
        'Snow Depth (in)': 10,
        'Snow Water Equivalent (in)': 2.5,
        'Observed Air Temperature (degrees farenheit)': 32,
      },
    ],
  };

  describe('GET /api/snow', () => {
    it('should return 400 if station is missing', async () => {
      const response = await request(app).get('/api/snow');
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Station ID is required');
    });

    it('should return snow data for a specific station', async () => {
      const station = '701:OR:SNTL';
      vi.mocked(axios.get).mockResolvedValue({ data: mockStationData });

      const response = await request(app).get(`/api/snow?station=${station}`);
      expect(response.status).toBe(200);
      expect(response.body.station).toBe(station);
      expect(response.body.data).toHaveProperty('2023');
      expect(response.body.data['2023'].depths[0]).toBe(10);
    });

    it('should handle upstream API errors', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('API Down'));

      const station = 'NON_EXISTENT_STATION_' + Date.now();
      const response = await request(app).get(`/api/snow?station=${station}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch snow data');
    });

    it('should return seasonal data from cache on HIT', async () => {
      // First call to populate cache
      vi.mocked(axios.get).mockResolvedValue({ data: mockStationData });
      const station = 'CACHE_HIT_TEST';
      await request(app).get(`/api/snow?station=${station}`);

      // Clear mocks to ensure no further API calls
      vi.mocked(axios.get).mockClear();

      // Second call should be a cache hit
      const response = await request(app).get(`/api/snow?station=${station}`);
      expect(response.status).toBe(200);
      expect(response.body.fromCache).toBe(true);
      expect(response.body.data).toHaveProperty('2023');
      expect(response.body.data['2023'].depths[0]).toBe(10);
      expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
    });

    it('should return 5-year averages in the seasonal data', async () => {
      const station = 'AVERAGE_TEST';
      const mockMultiYearData = {
        data: [
          {
            Date: '2023-01-01',
            'Snow Depth (in)': 10,
            'Snow Water Equivalent (in)': 2.5,
            'Observed Air Temperature (degrees farenheit)': 32,
          },
          {
            Date: '2024-01-01',
            'Snow Depth (in)': 20,
            'Snow Water Equivalent (in)': 5.0,
            'Observed Air Temperature (degrees farenheit)': 30,
          },
        ],
      };
      vi.mocked(axios.get).mockResolvedValue({ data: mockMultiYearData });

      const response = await request(app).get(`/api/snow?station=${station}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('2023');
      expect(response.body.data).toHaveProperty('2024');
      expect(response.body.data).toHaveProperty('2021-2025 Average'); // Adjusted to match service logic

      const avgData = response.body.data['2021-2025 Average'];
      // Average of 10 and 20 is 15
      // Note: 2023-01-01 and 2024-01-01 normalize to the same date '2001-01-01'
      expect(avgData.depths[0]).toBe(15);
      expect(avgData.swes[0]).toBe(3.8); // (2.5 + 5.0) / 2 = 3.75 -> 3.8
      expect(avgData.temps[0]).toBe(31); // (32 + 30) / 2 = 31
    });
  });
});
