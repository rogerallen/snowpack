import axios from 'axios';
import { format, subDays, differenceInDays, parseISO, isValid, getMonth, getYear } from 'date-fns';
import logger from '../lib/logger.js';
import db, {
  getStationMetadataStmt,
  getSnowDataStmt,
  upsertSnowDataStmt,
  upsertMetadataStmt
} from '../lib/db.js';

// How long before the server considers its own cache stale and re-fetches from the upstream API.
// Defaults to 30 days if not set in environment.
const SERVER_CACHE_STALE_SECONDS = parseInt(
  process.env.SERVER_CACHE_STALE_SECONDS || '2592000',
  10,
);

const UPSTREAM_API_URL =
  process.env.UPSTREAM_API_URL ||
  'https://powderlines.kellysoftware.org/api/station';

/**
 * A season runs from September 1 of year X-1 to August 31 of year X.
 */
const getSeasonYear = (date) => {
  const month = getMonth(date);
  const year = getYear(date);
  return month >= 8 ? year + 1 : year;
};

/**
 * Normalizes a date to a common seasonal axis (Sep 1 to Aug 31).
 */
const getNormalizedDate = (date) => {
  const month = getMonth(date);
  const plotYear = month >= 8 ? 2000 : 2001;
  const normalizedMonth = (month + 1).toString().padStart(2, '0');
  const normalizedDay = date.getDate().toString().padStart(2, '0');
  return `${plotYear}-${normalizedMonth}-${normalizedDay}`;
};

/**
 * Transforms flat records into seasonal groupings for the frontend.
 */
const transformToSeasonalData = (records) => {
  const seasonalData = {};

  for (const record of records) {
    const date = parseISO(record.date);
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

    seasonalData[seasonString].dates.push(getNormalizedDate(date));
    seasonalData[seasonString].originalDates.push(record.date);
    seasonalData[seasonString].depths.push(record.depth ?? 0);
    seasonalData[seasonString].swes.push(record.snow_water_equivalent ?? 0);
    seasonalData[seasonString].temps.push(record.temperature ?? 0);
  }

  // Reverse each season to get ascending order for plotting
  for (const year in seasonalData) {
    const season = seasonalData[year];
    season.dates.reverse();
    season.originalDates.reverse();
    season.depths.reverse();
    season.swes.reverse();
    season.temps.reverse();
  }

  return seasonalData;
};

/**
 * Fetches snow data for a station, using cache if available and not stale.
 * Falls back to cache if upstream API fails.
 */
export const getSnowData = async (station, days) => {
  const now = new Date();
  const startDate = subDays(now, days);
  const startDateString = format(startDate, 'yyyy-MM-dd');

  // 1. Check current cache status
  const metadata = getStationMetadataStmt.get(station);
  let cachedRecords = getSnowDataStmt.all(station, startDateString);

  const isCacheStale =
    !metadata ||
    now.getTime() - metadata.last_fetch_timestamp >
      SERVER_CACHE_STALE_SECONDS * 1000;

  const isMissingHistory = !metadata || !metadata.min_requested_date || startDateString < metadata.min_requested_date;

  if (isCacheStale || isMissingHistory) {
    let daysToFetch = days;
    let fetchingFullHistory = true;

    if (!isMissingHistory && cachedRecords.length > 0) {
      const latestDateInCache = parseISO(cachedRecords[0].date);
      if (isValid(latestDateInCache)) {
        daysToFetch = Math.max(1, differenceInDays(now, latestDateInCache) + 2);
        fetchingFullHistory = false;
        logger.info(
          { station, daysToFetch, latestInCache: cachedRecords[0].date },
          'Optimizing fetch: only requesting recent missing days'
        );
      }
    }

    try {
      // 2. Fetch from external API
      const externalApiUrl = `${UPSTREAM_API_URL}/${station}?days=${daysToFetch}`;
      logger.info({ url: externalApiUrl }, 'Fetching from external API');
      const apiResponse = await axios.get(externalApiUrl);
      const stationInfo = apiResponse.data.station_information;
      const rawApiData = apiResponse.data.data;

      if (!Array.isArray(rawApiData)) {
        throw new Error('Upstream API response did not contain a data array.');
      }

      const freshRecords = rawApiData.map((record) => ({
        date: record.Date,
        depth: record['Snow Depth (in)'],
        snow_water_equivalent: record['Snow Water Equivalent (in)'],
        change_in_depth: record['Change In Snow Depth (in)'],
        change_in_swe: record['Change In Snow Water Equivalent (in)'],
        temperature: record['Observed Air Temperature (degrees farenheit)'],
      }));

      // 3. Update cache
      db.exec('BEGIN');
      try {
        for (const record of freshRecords) {
          upsertSnowDataStmt.run(
            station,
            record.date,
            record.depth,
            record.snow_water_equivalent,
            record.change_in_depth,
            record.change_in_swe,
            record.temperature,
          );
        }
        
        const newMinRequestedDate = metadata?.min_requested_date 
          ? (startDateString < metadata.min_requested_date ? startDateString : metadata.min_requested_date)
          : startDateString;

        upsertMetadataStmt.run(
          station,
          now.getTime(),
          newMinRequestedDate,
          JSON.stringify(stationInfo),
        );
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }

      cachedRecords = getSnowDataStmt.all(station, startDateString);
      return {
        station_information: stationInfo,
        data: transformToSeasonalData(cachedRecords),
        fromCache: false
      };
    } catch (error) {
      logger.error({ station, error: error.message }, 'Error updating cache');
      if (cachedRecords.length > 0) {
        const stationInfo = metadata?.information ? JSON.parse(metadata.information) : null;
        return {
          station_information: stationInfo,
          data: transformToSeasonalData(cachedRecords),
          fromCache: true,
          stale: true
        };
      }
      throw error;
    }
  }

  // 4. Serve from cache
  logger.info({ station, days }, 'Cache HIT');
  const stationInfo = metadata.information ? JSON.parse(metadata.information) : null;
  return {
    station_information: stationInfo,
    data: transformToSeasonalData(cachedRecords),
    fromCache: true
  };
};
