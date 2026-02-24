import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../server/index';
import axios from 'axios';

vi.mock('axios');

describe('API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockStationData = {
    station_information: { name: 'Test Station' },
    data: [
      {
        Date: '2023-01-01',
        'Snow Depth (in)': 10,
        'Snow Water Equivalent (in)': 2.5,
        'Change In Snow Depth (in)': 2,
        'Change In Snow Water Equivalent (in)': 0.5,
        'Observed Air Temperature (degrees farenheit)': 32
      }
    ]
  };

  describe('GET /api/snow', () => {
    it('should return snow data for the default station', async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: mockStationData });

      const response = await request(app).get('/api/snow');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data[0].depth).toBe(10);
    });

    it('should return snow data for a specific station', async () => {
      const station = '701:OR:SNTL';
      vi.mocked(axios.get).mockResolvedValue({ data: mockStationData });

      const response = await request(app).get(`/api/snow?station=${station}`);
      expect(response.status).toBe(200);
      expect(response.body.station_information.name).toBe('Test Station');
    });

    it('should handle upstream API errors', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('API Down'));
      
      const station = 'NON_EXISTENT_STATION_' + Date.now();
      const response = await request(app).get(`/api/snow?station=${station}`);
      
      expect(response.status).toBe(502);
      expect(response.body.message).toBe('Error fetching data from upstream API.');
    });
  });
});
