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

    // Strictly cast to Number to prevent string concatenation during averaging.
    const depth = Number(point['Snow Depth (in)']);
    const swe = Number(point['Snow Water Equivalent (in)']);
    const airTemp = Number(
      point['Observed Air Temperature (degrees farenheit)'],
    );

    // Also handle common SNOTEL error values (like -99.9) by treating them as 0.
    seasons[seasonLabel].depths.push(isNaN(depth) || depth < 0 ? 0 : depth);
    seasons[seasonLabel].swes.push(isNaN(swe) || swe < 0 ? 0 : swe);
    seasons[seasonLabel].temps.push(airTemp);
  });

  return seasons;
}

/**
 * Calculates 5-year averages for snow depth and SWE.
 * Groups years into buckets like 1985-1990, 1990-1995, etc.
 */
function calculateAverages(
  seasonalData: SeasonalPlotlyData,
): SeasonalPlotlyData {
  const years = Object.keys(seasonalData)
    .map(Number)
    .filter((y) => !isNaN(y))
    .sort((a, b) => a - b);
  if (years.length === 0) return {};

  logger.info({ yearCount: years.length }, 'Calculating 5-year averages');

  const buckets: Record<string, number[]> = {};
  years.forEach((year) => {
    // Group into 1-inclusive buckets: 2001-2005, 2006-2010, etc.
    const startYear = Math.floor((year - 1) / 5) * 5 + 1;
    const endYear = startYear + 4;
    const label = `${startYear}-${endYear} Average`;
    if (!buckets[label]) buckets[label] = [];
    buckets[label].push(year);
  });

  const averages: SeasonalPlotlyData = {};

  Object.entries(buckets).forEach(([label, bucketYears]) => {
    // Only create averages for buckets with more than 1 year of data
    if (bucketYears.length <= 1) return;

    // Map of normalizedDate -> { sumDepths, sumSwes, sumTemps, count }
    const dailyAggregates: Record<
      string,
      { depths: number; swes: number; temps: number; count: number }
    > = {};

    bucketYears.forEach((year) => {
      const data = seasonalData[year.toString()];
      if (!data || !data.dates) return;

      data.dates.forEach((date, i) => {
        if (!dailyAggregates[date]) {
          dailyAggregates[date] = { depths: 0, swes: 0, temps: 0, count: 0 };
        }
        dailyAggregates[date].depths += data.depths[i] || 0;
        dailyAggregates[date].swes += data.swes[i] || 0;
        dailyAggregates[date].temps += data.temps[i] || 0;
        dailyAggregates[date].count += 1;
      });
    });

    const sortedDates = Object.keys(dailyAggregates).sort();
    if (sortedDates.length === 0) return;

    const avgData: SeasonTraceData = {
      dates: [],
      originalDates: [],
      depths: [],
      swes: [],
      temps: [],
    };

    let hasNonZeroData = false;

    sortedDates.forEach((date) => {
      const agg = dailyAggregates[date];
      const avgDepth = Math.round((agg.depths / agg.count) * 10) / 10;
      const avgSwe = Math.round((agg.swes / agg.count) * 10) / 10;
      const avgTemp = Math.round((agg.temps / agg.count) * 10) / 10;

      if (avgDepth > 0 || avgSwe > 0) {
        hasNonZeroData = true;
      }

      avgData.dates.push(date);
      avgData.originalDates.push(date);
      avgData.depths.push(avgDepth);
      avgData.swes.push(avgSwe);
      avgData.temps.push(avgTemp);
    });

    if (hasNonZeroData) {
      averages[label] = avgData;
    }
  });

  logger.info(
    { averageBuckets: Object.keys(averages) },
    'Calculated 5-year average buckets',
  );
  return averages;
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
        const data = JSON.parse(cached.data);

        return {
          data,
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

    // Calculate averages and merge them
    const averagedData = calculateAverages(seasonalData);
    const finalData = { ...seasonalData, ...averagedData };

    // Update cache
    await run(
      'INSERT OR REPLACE INTO snow_cache (station_id, days, data, last_updated) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [stationId, days, JSON.stringify(finalData)],
    );

    return {
      data: finalData,
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
