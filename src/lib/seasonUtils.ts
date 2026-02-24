import { parseISO, getMonth, getYear } from 'date-fns';
import type { SnowDataPoint } from '../hooks/useSnowData';

/**
 * A season runs from September 1 of year X-1 to August 31 of year X.
 * We label the season by year X.
 * e.g., the 2023 season is from 2022-09-01 to 2023-08-31.
 * @param date The date to check.
 * @returns The season year.
 */
export const getSeasonYear = (date: Date): number => {
  const month = getMonth(date); // 0-indexed (January is 0)
  const year = getYear(date);
  // If the month is September (8) or later, it's part of the next calendar year's season.
  return month >= 8 ? year + 1 : year;
};

export interface SeasonalDataPoint extends SnowDataPoint {
  // A date normalized to a common year range for comparable plotting
  seasonDate: Date;
}

export type SeasonalData = Record<string, SeasonalDataPoint[]>;

export const groupDataBySeason = (data: SnowDataPoint[]): SeasonalData => {
  const seasonalData: SeasonalData = {};

  data.forEach((point) => {
    const date = parseISO(point.date);
    const season = getSeasonYear(date);
    const seasonString = String(season);

    if (!seasonalData[seasonString]) {
      seasonalData[seasonString] = [];
    }

    // To make seasons comparable on the same x-axis, we normalize the dates.
    // A season (e.g., 2023) runs from September 2022 to August 2023.
    // We'll map Sep-Dec to year 2000 and Jan-Aug to year 2001.
    const month = getMonth(date);
    const displayYear = month >= 8 ? 2000 : 2001;
    const seasonDate = new Date(displayYear, month, date.getDate());

    seasonalData[seasonString].push({ ...point, seasonDate });
  });

  return seasonalData;
};
