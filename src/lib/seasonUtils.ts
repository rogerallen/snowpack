import { getMonth, getYear, parseISO, isValid } from 'date-fns';

/**
 * The clean shape sent from our server API
 */
export interface SnowDataPoint {
  date: string;
  depth: number | null;
  snow_water_equivalent: number | null;
  temperature: number | null;
}

/**
 * Data structured for Plotly traces, grouped by season.
 */
export interface SeasonTraceData {
  dates: string[];
  originalDates: string[];
  depths: number[];
  swes: number[];
  temps: number[];
}

export type SeasonalPlotlyData = Record<string, SeasonTraceData>;

/**
 * A season runs from September 1 of year X-1 to August 31 of year X.
 * We label the season by year X.
 * e.g., the 2023 season is from 2022-09-01 to 2023-08-31.
 */
export const getSeasonYear = (date: Date): number => {
  const month = getMonth(date); // 0-indexed (January is 0)
  const year = getYear(date);
  // If the month is September (8) or later, it's part of the next calendar year's season.
  return month >= 8 ? year + 1 : year;
};

/**
 * Normalizes a date to a common seasonal axis (Sep 1 to Aug 31).
 * Sep-Dec are mapped to year 2000, Jan-Aug to year 2001.
 */
export const getNormalizedDate = (date: Date): string => {
  const month = getMonth(date);
  const plotYear = month >= 8 ? 2000 : 2001;
  const normalizedMonth = (month + 1).toString().padStart(2, '0');
  const normalizedDay = date.getDate().toString().padStart(2, '0');
  return `${plotYear}-${normalizedMonth}-${normalizedDay}`;
};

/**
 * Transforms raw API data into seasonal groupings suitable for charting.
 */
export const transformToSeasonalData = (serverData: SnowDataPoint[]): SeasonalPlotlyData => {
  const seasonalData: SeasonalPlotlyData = {};

  for (const item of serverData) {
    if (!item.date) continue;

    const date = parseISO(item.date);
    if (!isValid(date)) continue;

    const seasonYear = getSeasonYear(date);
    const seasonString = String(seasonYear);

    if (!seasonalData[seasonString]) {
      seasonalData[seasonString] = {
        dates: [],
        originalDates: [],
        depths: [],
        swes: [],
        temps: [],
      };
    }

    const normalizedDate = getNormalizedDate(date);

    seasonalData[seasonString].dates.push(normalizedDate);
    seasonalData[seasonString].originalDates.push(item.date);
    seasonalData[seasonString].depths.push(item.depth ?? 0);
    seasonalData[seasonString].swes.push(item.snow_water_equivalent ?? 0);
    seasonalData[seasonString].temps.push(item.temperature ?? 0);
  }

  // Sort and clean up each season's data
  for (const year in seasonalData) {
    const season = seasonalData[year];
    
    // The data usually comes in descending order from the API.
    // We want ascending order for Plotly lines.
    season.dates.reverse();
    season.originalDates.reverse();
    season.depths.reverse();
    season.swes.reverse();
    season.temps.reverse();
  }

  return seasonalData;
};
