import { parseISO, getMonth, getYear } from 'date-fns';
import type { SnowDataPoint } from '../hooks/useSnowData';

/**
 * A season runs from August 1 of year X-1 to July 31 of year X.
 * We label the season by year X.
 * e.g., the 2023 season is from 2022-08-01 to 2023-07-31.
 * @param date The date to check.
 * @returns The season year.
 */
export const getSeasonYear = (date: Date): number => {
  const month = getMonth(date); // 0-indexed (January is 0)
  const year = getYear(date);
  // If the month is August (7) or later, it's part of the next calendar year's season.
  return month >= 7 ? year + 1 : year;
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
    // A season (e.g., 2023) runs from August 2022 to July 2023.
    // We'll map August-Dec to year 2000 and Jan-July to year 2001.
    const month = getMonth(date);
    const displayYear = month >= 7 ? 2000 : 2001;
    const seasonDate = new Date(displayYear, month, date.getDate());

    seasonalData[seasonString].push({ ...point, seasonDate });
  });

  return seasonalData;
};
