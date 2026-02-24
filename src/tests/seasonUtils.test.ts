import { describe, it, expect } from 'vitest';
import { getSeasonYear, groupDataBySeason } from '../lib/seasonUtils';
import { SnowDataPoint } from '../hooks/useSnowData';

describe('seasonUtils', () => {
  describe('getSeasonYear', () => {
    it('should return the current year for dates before September', () => {
      // Month is 0-indexed. Jan=0, Aug=7
      expect(getSeasonYear(new Date(2023, 0, 1))).toBe(2023);
      expect(getSeasonYear(new Date(2023, 7, 31))).toBe(2023);
    });

    it('should return the next year for dates in or after September', () => {
      // Sep=8, Dec=11
      expect(getSeasonYear(new Date(2023, 8, 1))).toBe(2024);
      expect(getSeasonYear(new Date(2023, 11, 31))).toBe(2024);
    });
  });

  describe('groupDataBySeason', () => {
    it('should group data by season year', () => {
      const data: SnowDataPoint[] = [
        { date: '2022-12-01', depth: 10, snow_water_equivalent: 2, temperature: 30 },
        { date: '2023-01-15', depth: 20, snow_water_equivalent: 4, temperature: 25 },
        { date: '2023-08-05', depth: 0, snow_water_equivalent: 0, temperature: 70 },
      ];

      const grouped = groupDataBySeason(data);

      expect(Object.keys(grouped)).toContain('2023');
      expect(grouped['2023']).toHaveLength(3); // Dec 2022, Jan 2023, Aug 2023
    });

    it('should normalize dates for plotting', () => {
      const data: SnowDataPoint[] = [
        { date: '2022-12-01', depth: 10, snow_water_equivalent: 2, temperature: 30 },
        { date: '2023-01-15', depth: 20, snow_water_equivalent: 4, temperature: 25 },
      ];

      const grouped = groupDataBySeason(data);
      const points = grouped['2023'];

      expect(points[0].seasonDate.getFullYear()).toBe(2000); // Dec
      expect(points[1].seasonDate.getFullYear()).toBe(2001); // Jan
    });
  });
});
