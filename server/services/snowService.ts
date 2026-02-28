import axios from 'axios';
import db, { query, run } from '../lib/db.ts';
import logger from '../lib/logger.ts';
import { DATA_CONFIG } from '../lib/constants.ts';
import { ingestStation } from './nrcsService.ts';

export interface SeasonTraceData {
  dates: string[];
  originalDates: string[];
  depths: (number | null)[];
  swes: (number | null)[];
  temps: (number | null)[];
}

export type SeasonalPlotlyData = Record<string, SeasonTraceData>;

export interface RawSnowDataPoint {
  Date: string;
  'Snow Depth (in)': number | null;
  'Snow Water Equivalent (in)': number | null;
  'Observed Air Temperature (degrees farenheit)': number | null;
}

export interface SnowServiceResult {
  data: SeasonalPlotlyData;
  fromCache: boolean;
  stale: boolean;
  meta?: {
    minSnowYear: number | null;
    maxSnowYear: number | null;
    minTempYear: number | null;
    maxTempYear: number | null;
  };
}

interface StationRow {
  station_id: string;
  min_snow_year: number | null;
  max_snow_year: number | null;
  min_temp_year: number | null;
  max_temp_year: number | null;
  last_full_ingestion: string;
}

interface SnowDataRow {
  station_id: string;
  season: number;
  period_id: number;
  mean_depth: number | null;
  mean_swe: number | null;
  mean_temp: number | null;
}

const CACHE_EXPIRATION_HOURS = 24;

/**
 * Maps a periodId (0-121) back to a normalized date string for the frontend.
 * Season starts Sept 1st. Default baseYear 2000 is used for Plotly normalization.
 */
function periodIdToDate(periodId: number, baseYear: number = 2000): string {
  const seasonStart = new Date(Date.UTC(baseYear, 8, 1));
  const date = new Date(
    seasonStart.getTime() +
      periodId * DATA_CONFIG.SAMPLING_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
  );
  return date.toISOString().split('T')[0];
}

/**
 * Calculates 5-year averages for snow depth, SWE, and temp.
 */
function calculateAverages(
  seasonalData: SeasonalPlotlyData,
): SeasonalPlotlyData {
  const years = Object.keys(seasonalData)
    .map(Number)
    .filter((y) => !isNaN(y))
    .sort((a, b) => a - b);
  if (years.length === 0) return {};

  const buckets: Record<string, number[]> = {};
  years.forEach((year) => {
    const startYear = Math.floor((year - 1) / 5) * 5 + 1;
    const endYear = startYear + 4;
    const label = `${startYear}-${endYear} Average`;
    if (!buckets[label]) buckets[label] = [];
    buckets[label].push(year);
  });

  const averages: SeasonalPlotlyData = {};

  Object.entries(buckets).forEach(([label, bucketYears]) => {
    if (bucketYears.length <= 1) return;

    const avgData: SeasonTraceData = {
      dates: [],
      originalDates: [],
      depths: [],
      swes: [],
      temps: [],
    };

    for (let periodId = 0; periodId <= 121; periodId++) {
      let sumDepth = 0,
        countDepth = 0;
      let sumSwe = 0,
        countSwe = 0;
      let sumTemp = 0,
        countTemp = 0;

      bucketYears.forEach((year) => {
        const yearData = seasonalData[year.toString()];
        if (!yearData) return;

        const d = yearData.depths[periodId];
        const s = yearData.swes[periodId];
        const t = yearData.temps[periodId];

        if (d !== null) {
          sumDepth += d;
          countDepth++;
        }
        if (s !== null) {
          sumSwe += s;
          countSwe++;
        }
        if (t !== null) {
          sumTemp += t;
          countTemp++;
        }
      });

      avgData.dates.push(periodIdToDate(periodId));
      avgData.originalDates.push(periodIdToDate(periodId));
      avgData.depths.push(countDepth > 0 ? sumDepth / countDepth : null);
      avgData.swes.push(countSwe > 0 ? sumSwe / countSwe : null);
      avgData.temps.push(countTemp > 0 ? sumTemp / countTemp : null);
    }

    averages[label] = avgData;
  });

  return averages;
}

/**
 * Fetches recent data from Powderlines and upserts to DB using a transaction.
 */
async function updateRecentData(stationId: string): Promise<void> {
  const apiUrl = `${DATA_CONFIG.UPSTREAM_API_URL}/${stationId}?days=365`;
  logger.info({ apiUrl }, 'Fetching recent data from Powderlines');

  const response = await axios.get(apiUrl);
  const rawData: RawSnowDataPoint[] = response.data.data;

  if (!Array.isArray(rawData)) return;

  // Group into periods
  const periods: Record<
    number,
    Record<
      number,
      { depth: number | null; swe: number | null; temp: number | null }[]
    >
  > = {};

  rawData.forEach((point) => {
    const date = new Date(point.Date + 'T00:00:00Z');
    if (isNaN(date.getTime())) return;

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const season = month >= 8 ? year + 1 : year;
    const seasonStart = new Date(Date.UTC(season - 1, 8, 1));
    const diffDays = Math.floor(
      (date.getTime() - seasonStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const periodId = Math.floor(diffDays / DATA_CONFIG.SAMPLING_INTERVAL_DAYS);

    if (periodId < 0 || periodId > 121) return;

    if (!periods[season]) periods[season] = {};
    if (!periods[season][periodId]) periods[season][periodId] = [];

    periods[season][periodId].push({
      depth: point['Snow Depth (in)'],
      swe: point['Snow Water Equivalent (in)'],
      temp: point['Observed Air Temperature (degrees farenheit)'],
    });
  });

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO snow_data (station_id, season, period_id, mean_depth, mean_swe, mean_temp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const seasonStr in periods) {
        const season = parseInt(seasonStr);
        for (const periodIdStr in periods[season]) {
          const periodId = parseInt(periodIdStr);
          const points = periods[season][periodId];

          const validDepth = points
            .filter((p) => p.depth !== null && p.depth >= 0)
            .map((p) => p.depth!);
          const validSwe = points
            .filter((p) => p.swe !== null && p.swe >= 0)
            .map((p) => p.swe!);
          const validTemp = points
            .filter((p) => p.temp !== null)
            .map((p) => p.temp!);

          const meanDepth =
            validDepth.length > 0
              ? validDepth.reduce((a, b) => a + b, 0) / validDepth.length
              : null;
          const meanSwe =
            validSwe.length > 0
              ? validSwe.reduce((a, b) => a + b, 0) / validSwe.length
              : null;
          const meanTemp =
            validTemp.length > 0
              ? validTemp.reduce((a, b) => a + b, 0) / validTemp.length
              : null;

          stmt.run([stationId, season, periodId, meanDepth, meanSwe, meanTemp]);
        }
      }

      stmt.finalize();
      db.run('COMMIT', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

export const getSnowData = async (
  stationId: string,
): Promise<SnowServiceResult> => {
  try {
    const stations = await query<StationRow>(
      'SELECT * FROM stations WHERE station_id = ?',
      [stationId],
    );

    let fromCache = true;
    if (stations.length === 0) {
      logger.info(
        { stationId },
        'New station detected. Starting full POR ingestion.',
      );
      await ingestStation(stationId);
      fromCache = false;
    } else {
      const station = stations[0];
      const lastUpdated = new Date(station.last_full_ingestion + 'Z');
      const now = new Date();
      const ageHours =
        (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);

      if (ageHours > CACHE_EXPIRATION_HOURS) {
        logger.info(
          { stationId, ageHours },
          'Updating recent data for station.',
        );
        await updateRecentData(stationId);
        await run(
          'UPDATE stations SET last_full_ingestion = CURRENT_TIMESTAMP WHERE station_id = ?',
          [stationId],
        );
        fromCache = false;
      }
    }

    const rows = await query<SnowDataRow>(
      'SELECT * FROM snow_data WHERE station_id = ? ORDER BY season ASC, period_id ASC',
      [stationId],
    );

    const seasonalData: SeasonalPlotlyData = {};
    rows.forEach((row) => {
      const seasonLabel = row.season.toString();
      if (!seasonalData[seasonLabel]) {
        seasonalData[seasonLabel] = {
          dates: [],
          originalDates: [],
          depths: [],
          swes: [],
          temps: [],
        };
        for (let i = 0; i <= 121; i++) {
          // Normalized date for Plotly (Year 2000-2001)
          seasonalData[seasonLabel].dates.push(periodIdToDate(i));

          // ACTUAL date for the hover popup (based on the specific season year)
          // Season 2024 starts in 2023.
          seasonalData[seasonLabel].originalDates.push(
            periodIdToDate(i, row.season - 1),
          );

          seasonalData[seasonLabel].depths.push(null);
          seasonalData[seasonLabel].swes.push(null);
          seasonalData[seasonLabel].temps.push(null);
        }
      }

      seasonalData[seasonLabel].depths[row.period_id] = row.mean_depth;
      seasonalData[seasonLabel].swes[row.period_id] = row.mean_swe;
      seasonalData[seasonLabel].temps[row.period_id] = row.mean_temp;
    });

    const averagedData = calculateAverages(seasonalData);
    const finalData = { ...seasonalData, ...averagedData };

    const stationMeta = await query<StationRow>(
      'SELECT * FROM stations WHERE station_id = ?',
      [stationId],
    );

    return {
      data: finalData,
      fromCache,
      stale: false,
      meta: stationMeta[0]
        ? {
            minSnowYear: stationMeta[0].min_snow_year,
            maxSnowYear: stationMeta[0].max_snow_year,
            minTempYear: stationMeta[0].min_temp_year,
            maxTempYear: stationMeta[0].max_temp_year,
          }
        : undefined,
    };
  } catch (error) {
    logger.error({ stationId, error }, 'Error in getSnowData');
    throw error;
  }
};
