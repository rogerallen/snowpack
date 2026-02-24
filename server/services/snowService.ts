import axios from 'axios';
import { query, run } from '../lib/db.ts';
import logger from '../lib/logger.ts';

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

export interface RawSnowDataPoint {
  Date: string;
  'Snow Depth (in)': number;
  'Snow Water Equivalent (in)': number;
  'Observed Air Temperature (degrees farenheit)': number;
}

export interface CacheEntry {
  station_id: string;
  days: number;
  data: string;
  last_updated: string;
}

export interface SnowServiceResult {
  data: SeasonalPlotlyData;
  fromCache: boolean;
  stale: boolean;
}

const CACHE_EXPIRATION_HOURS = 24;

/**
 * Normalizes a date to a common season-relative year (e.g., all dates mapped to 2000-2001)
 * to allow overlaying multiple seasons on a single chart.
 * Our season starts Sept 1st.
 */
function normalizeDateToSeason(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getUTCMonth(); // 0-indexed (0 = Jan, 8 = Sept)
  const day = date.getUTCDate();

  // If month is Sept (8) or later, it belongs to the first half of the season (Year 2000)
  // If month is Aug (7) or earlier, it belongs to the second half (Year 2001)
  const normalizedYear = month >= 8 ? 2000 : 2001;
  const monthStr = (month + 1).toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');

  return `${normalizedYear}-${monthStr}-${dayStr}`;
}

/**
 * Groups raw data points into seasons (e.g., "2023-2024") and normalizes
 * the dates for consistent Plotly rendering.
 */
function transformToSeasonalData(data: RawSnowDataPoint[]): SeasonalPlotlyData {
  const seasons: SeasonalPlotlyData = {};

  // The API returns data in descending order (newest first).
  // We should process it so that the charts render correctly (usually ascending).
  // However, for grouping, order doesn't strictly matter as long as we sort later or reverse.
  // The previous implementation reversed it.

  const processedData = [...data].reverse();

  processedData.forEach((point) => {
    const date = new Date(point.Date);
    if (isNaN(date.getTime())) return;

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();

    // Determine the season label (e.g., Sept 2023 to Aug 2024 is the "2024" season)
    const seasonYear = month >= 8 ? year + 1 : year;
    const seasonLabel = seasonYear.toString();

    if (!seasons[seasonLabel]) {
      seasons[seasonLabel] = {
        dates: [],
        originalDates: [],
        depths: [],
        swes: [],
        temps: [],
      };
    }

    seasons[seasonLabel].dates.push(normalizeDateToSeason(point.Date));
    seasons[seasonLabel].originalDates.push(point.Date);
    seasons[seasonLabel].depths.push(point['Snow Depth (in)'] ?? 0);
    seasons[seasonLabel].swes.push(point['Snow Water Equivalent (in)'] ?? 0);
    seasons[seasonLabel].temps.push(
      point['Observed Air Temperature (degrees farenheit)'] ?? 0,
    );
  });

  return seasons;
}

export const getSnowData = async (
  stationId: string,
  days: number,
): Promise<SnowServiceResult> => {
  try {
    const rows = await query<CacheEntry>(
      'SELECT * FROM snow_cache WHERE station_id = ? AND days = ?',
      [stationId, days],
    );

    const cached = rows[0];
    const now = new Date();

    if (cached) {
      const lastUpdated = new Date(cached.last_updated + 'Z'); // Ensure UTC
      const ageHours =
        (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);

      if (ageHours < CACHE_EXPIRATION_HOURS) {
        logger.info({ stationId, ageHours }, 'Cache HIT');
        return {
          data: JSON.parse(cached.data),
          fromCache: true,
          stale: false,
        };
      }
      logger.info({ stationId, ageHours }, 'Cache STALE');
    } else {
      logger.info({ stationId }, 'Cache MISS');
    }

    // Fetch from the NRCS-based Powderlines API
    // Correct endpoint is /api/station/STATION_ID
    const apiUrl = `https://powderlines.kellysoftware.org/api/station/${stationId}?days=${days}`;
    logger.info({ apiUrl }, 'Fetching from upstream API');
    const response = await axios.get(apiUrl);
    const rawData: RawSnowDataPoint[] = response.data.data;

    if (!Array.isArray(rawData)) {
      throw new Error('Upstream API response did not contain a data array.');
    }

    // Transform raw data into seasonal Plotly format on the backend
    const seasonalData = transformToSeasonalData(rawData);

    // Update cache
    await run(
      'INSERT OR REPLACE INTO snow_cache (station_id, days, data, last_updated) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [stationId, days, JSON.stringify(seasonalData)],
    );

    return {
      data: seasonalData,
      fromCache: false,
      stale: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { error: errorMessage, stationId },
      'Error fetching snow data',
    );

    // If API fails, try to return stale cache data as a fallback
    const rows = await query<CacheEntry>(
      'SELECT * FROM snow_cache WHERE station_id = ? AND days = ?',
      [stationId, days],
    );
    if (rows[0]) {
      return {
        data: JSON.parse(rows[0].data),
        fromCache: true,
        stale: true,
      };
    }
    throw error;
  }
};
