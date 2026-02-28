import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DATA_CONFIG, NRCS_CSV_URL_TEMPLATE } from '../lib/constants.ts';
import logger from '../lib/logger.ts';
import db, { run } from '../lib/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RAW_DATA_DIR = path.join(__dirname, '..', 'data', 'raw');

// Simple in-memory lock to prevent concurrent ingestion of the same station
const ingestionLocks = new Set<string>();

export interface DailyData {
  date: string;
  swe: number | null;
  depth: number | null;
  temp: number | null;
}

/**
 * Fetches historical POR data from NRCS and saves it locally.
 */
export async function fetchHistoricalData(stationId: string): Promise<string> {
  const url = NRCS_CSV_URL_TEMPLATE.replace('${stationId}', stationId);
  const filePath = path.join(
    RAW_DATA_DIR,
    `${stationId.replace(/:/g, '_')}.csv`,
  );

  logger.info({ stationId, url }, 'Fetching historical CSV from NRCS');

  const response = await axios.get(url);
  const csvData = response.data;

  // Ensure directory exists
  if (!fs.existsSync(RAW_DATA_DIR)) {
    fs.mkdirSync(RAW_DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(filePath, csvData);
  logger.info({ filePath }, 'Saved raw NRCS CSV');

  return csvData;
}

/**
 * Parses NRCS CSV data and applies zero-detection and downsampling.
 */
export function parseNrcsCsv(csvContent: string): DailyData[] {
  const lines = csvContent.split('\n');
  const dailyData: DailyData[] = [];

  let dataStarted = false;

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(',');
    if (parts[0] === 'Date') {
      dataStarted = true;
      continue;
    }

    if (dataStarted && parts.length >= 2) {
      const date = parts[0];
      const swe = parts[1] ? parseFloat(parts[1]) : null;
      const depth = parts[2] ? parseFloat(parts[2]) : null;
      const temp = parts[3] ? parseFloat(parts[3]) : null;

      dailyData.push({
        date,
        swe: isNaN(swe as number) ? null : swe,
        depth: isNaN(depth as number) ? null : depth,
        temp: isNaN(temp as number) ? null : temp,
      });
    }
  }

  return dailyData;
}

/**
 * Applies the 14-day zero-detection logic to snow depth.
 */
export function applyZeroDetection(data: DailyData[]): DailyData[] {
  let zeroCount = 0;
  const processed = [...data];

  for (let i = 0; i < processed.length; i++) {
    const point = processed[i];
    const date = new Date(point.date + 'T00:00:00Z');
    const month = date.getUTCMonth() + 1;

    const isProtected = month >= 10 || month <= 5;

    if (isProtected && point.depth === 0) {
      zeroCount++;
    } else {
      if (zeroCount >= DATA_CONFIG.ZERO_DETECTION_THRESHOLD_DAYS) {
        for (let j = i - zeroCount; j < i; j++) {
          processed[j].depth = null;
          processed[j].swe = null;
        }
      }
      zeroCount = 0;
    }
  }

  if (zeroCount >= DATA_CONFIG.ZERO_DETECTION_THRESHOLD_DAYS) {
    for (let j = processed.length - zeroCount; j < processed.length; j++) {
      processed[j].depth = null;
      processed[j].swe = null;
    }
  }

  return processed;
}

/**
 * Downsamples daily data into 3-day intervals.
 */
export function downsampleToPeriods(data: DailyData[]): {
  [season: number]: { [period: number]: DailyData[] };
} {
  const seasons: { [season: number]: { [period: number]: DailyData[] } } = {};

  for (const point of data) {
    const date = new Date(point.date + 'T00:00:00Z');
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();

    const season = month >= 8 ? year + 1 : year;
    const seasonStart = new Date(Date.UTC(season - 1, 8, 1));

    const diffDays = Math.floor(
      (date.getTime() - seasonStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays < 0 || diffDays >= 366) continue;

    const periodId = Math.floor(diffDays / DATA_CONFIG.SAMPLING_INTERVAL_DAYS);
    if (periodId > 121) continue;

    if (!seasons[season]) seasons[season] = {};
    if (!seasons[season][periodId]) seasons[season][periodId] = [];

    seasons[season][periodId].push(point);
  }

  return seasons;
}

/**
 * Calculates means for each period and saves to DB using a transaction.
 */
export async function saveDownsampledData(
  stationId: string,
  seasons: { [season: number]: { [period: number]: DailyData[] } },
): Promise<void> {
  logger.info({ stationId }, 'Saving downsampled data to DB (Transaction)');

  let minSnowYear = Infinity;
  let maxSnowYear = -Infinity;
  let minTempYear = Infinity;
  let maxTempYear = -Infinity;

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO snow_data 
        (station_id, season, period_id, mean_depth, mean_swe, mean_temp) 
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const seasonStr in seasons) {
        const season = parseInt(seasonStr);
        const periods = seasons[season];

        for (const periodIdStr in periods) {
          const periodId = parseInt(periodIdStr);
          const points = periods[periodId];

          const validSwe = points
            .filter((p) => p.swe !== null)
            .map((p) => p.swe!);
          const validDepth = points
            .filter((p) => p.depth !== null)
            .map((p) => p.depth!);
          const validTemp = points
            .filter((p) => p.temp !== null)
            .map((p) => p.temp!);

          const meanSwe =
            validSwe.length > 0
              ? validSwe.reduce((a, b) => a + b, 0) / validSwe.length
              : null;
          const meanDepth =
            validDepth.length > 0
              ? validDepth.reduce((a, b) => a + b, 0) / validDepth.length
              : null;
          const meanTemp =
            validTemp.length > 0
              ? validTemp.reduce((a, b) => a + b, 0) / validTemp.length
              : null;

          if (meanDepth !== null || meanSwe !== null) {
            minSnowYear = Math.min(minSnowYear, season);
            maxSnowYear = Math.max(maxSnowYear, season);
          }
          if (meanTemp !== null) {
            minTempYear = Math.min(minTempYear, season);
            maxTempYear = Math.max(maxTempYear, season);
          }

          stmt.run([stationId, season, periodId, meanDepth, meanSwe, meanTemp]);
        }
      }

      stmt.finalize();

      db.run('COMMIT', (err) => {
        if (err) {
          logger.error({ err, stationId }, 'Transaction commit failed');
          reject(err);
        } else {
          // Update station metadata after transaction
          const finalMinSnowYear =
            minSnowYear === Infinity ? null : minSnowYear;
          const finalMaxSnowYear =
            maxSnowYear === -Infinity ? null : maxSnowYear;

          if (
            finalMinSnowYear &&
            finalMinSnowYear < DATA_CONFIG.MIN_SNOTEL_YEAR
          ) {
            logger.error(
              {
                stationId,
                minSnowYear: finalMinSnowYear,
                baseYear: DATA_CONFIG.MIN_SNOTEL_YEAR,
              },
              `Station data starts EARLIER than expected SNOTEL base year (${DATA_CONFIG.MIN_SNOTEL_YEAR}).`,
            );
          }

          run(
            `INSERT OR REPLACE INTO stations 
             (station_id, min_snow_year, max_snow_year, min_temp_year, max_temp_year, last_full_ingestion) 
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
              stationId,
              finalMinSnowYear,
              finalMaxSnowYear,
              minTempYear === Infinity ? null : minTempYear,
              maxTempYear === -Infinity ? null : maxTempYear,
            ],
          )
            .then(() => resolve())
            .catch(reject);
        }
      });
    });
  });
}

/**
 * Orchestrates the full ingestion of a station's historical data.
 */
export async function ingestStation(stationId: string): Promise<void> {
  if (ingestionLocks.has(stationId)) {
    logger.info({ stationId }, 'Ingestion already in progress, skipping');
    return;
  }

  ingestionLocks.add(stationId);
  try {
    const csvContent = await fetchHistoricalData(stationId);
    const dailyData = parseNrcsCsv(csvContent);
    const cleanedData = applyZeroDetection(dailyData);
    const downsampled = downsampleToPeriods(cleanedData);
    await saveDownsampledData(stationId, downsampled);
    logger.info({ stationId }, 'Ingestion complete');
  } catch (error) {
    logger.error({ stationId, error }, 'Failed to ingest station');
    throw error;
  } finally {
    ingestionLocks.delete(stationId);
  }
}
