import { describe, it, expect } from 'vitest';
import { getSeasonYear, transformToSeasonalData, type SnowDataPoint } from '../lib/seasonUtils';

describe('seasonUtils', () => {
  describe('getSeasonYear', () => {
    it('should return the current year for dates before September', () => {
      // Month is 0-indexed in Date constructor. Jan=0, Aug=7
      expect(getSeasonYear(new Date(2023, 0, 1))).toBe(2023);
      expect(getSeasonYear(new Date(2023, 7, 31))).toBe(2023);
    });

    it('should return the next year for dates in or after September', () => {
      // Sep=8, Dec=11
      expect(getSeasonYear(new Date(2023, 8, 1))).toBe(2024);
      expect(getSeasonYear(new Date(2023, 11, 31))).toBe(2024);
    });
  });

  describe('transformToSeasonalData', () => {
    it('should group and transform data by season year', () => {
      const data: SnowDataPoint[] = [
        { date: '2023-08-05', depth: 0, snow_water_equivalent: 0, temperature: 70 },
        { date: '2023-01-15', depth: 20, snow_water_equivalent: 4, temperature: 25 },
        { date: '2022-12-01', depth: 10, snow_water_equivalent: 2, temperature: 30 },
      ];

      const transformed = transformToSeasonalData(data);

      expect(Object.keys(transformed)).toContain('2023');
      // The function reverses the data, so order should be Dec, Jan, Aug
      expect(transformed['2023'].originalDates).toEqual(['2022-12-01', '2023-01-15', '2023-08-05']);
      expect(transformed['2023'].depths).toEqual([10, 20, 0]);
    });

    it('should normalize dates for plotting (Sep-Dec -> 2000, Jan-Aug -> 2001)', () => {
      const data: SnowDataPoint[] = [
        { date: '2022-12-01', depth: 10, snow_water_equivalent: 2, temperature: 30 },
        { date: '2023-01-15', depth: 20, snow_water_equivalent: 4, temperature: 25 },
      ];

      const transformed = transformToSeasonalData(data);
      const season = transformed['2023'];

      expect(season.dates).toContain('2000-12-01');
      expect(season.dates).toContain('2001-01-15');
    });
  });
});
