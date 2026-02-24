import axios from 'axios';
import { format, subDays, differenceInDays, parseISO, isValid } from 'date-fns';
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
 * Fetches snow data for a station, using cache if available and not stale.
 * Falls back to cache if upstream API fails.
 */
export const getSnowData = async (station, days) => {
  const now = new Date();
  const startDate = subDays(now, days);
  const startDateString = format(startDate, 'yyyy-MM-dd');

  // 1. Check current cache status
  const metadata = getStationMetadataStmt.get(station);
  let cachedData = getSnowDataStmt.all(station, startDateString);

  // We need to fetch if:
  // a) The cache is stale (older than STALE_SECONDS)
  // b) We are missing older history that we haven't tried to fetch before
  
  const isCacheStale =
    !metadata ||
    now.getTime() - metadata.last_fetch_timestamp >
      SERVER_CACHE_STALE_SECONDS * 1000;

  // Check if we need more history. 
  // We only fetch history if the requested startDate is earlier than what we've previously requested.
  const isMissingHistory = !metadata || !metadata.min_requested_date || startDateString < metadata.min_requested_date;

  if (isCacheStale || isMissingHistory) {
    let daysToFetch = days;
    let fetchingFullHistory = true;

    // Optimization: If we already have some history and just need an update (not new history),
    // only fetch the days since the last cached record.
    if (!isMissingHistory && cachedData.length > 0) {
      const latestDateInCache = parseISO(cachedData[0].date);
      if (isValid(latestDateInCache)) {
        // Fetch the gap + 2 days overlap for safety
        daysToFetch = Math.max(1, differenceInDays(now, latestDateInCache) + 2);
        fetchingFullHistory = false;
        logger.info(
          { station, daysToFetch, latestInCache: cachedData[0].date },
          'Optimizing fetch: only requesting recent missing days'
        );
      }
    }

    if (isCacheStale && fetchingFullHistory) {
      logger.info({ station }, 'Cache STALE: Requesting full history');
    }
    if (isMissingHistory) {
      logger.info(
        { station, requestedStart: startDateString, prevMin: metadata?.min_requested_date },
        'Missing history: Requesting full range'
      );
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

      // Transform to a consistent format with JS-friendly keys.
      const freshData = rawApiData.map((record) => ({
        date: record.Date,
        depth: record['Snow Depth (in)'],
        snow_water_equivalent: record['Snow Water Equivalent (in)'],
        change_in_depth: record['Change In Snow Depth (in)'],
        change_in_swe: record['Change In Snow Water Equivalent (in)'],
        temperature: record['Observed Air Temperature (degrees farenheit)'],
      }));

      // 3. Update cache with fresh data in a transaction
      db.exec('BEGIN');
      try {
        for (const record of freshData) {
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
        
        // Update metadata with the new fetch timestamp and the minimum date we've successfully requested.
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
        logger.info(
          { station, count: freshData.length, minDate: newMinRequestedDate },
          'Cache UPDATED'
        );
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }

      // Re-fetch from DB to ensure we return the full requested range to the user
      cachedData = getSnowDataStmt.all(station, startDateString);
      return {
        station_information: stationInfo,
        data: cachedData,
        fromCache: false
      };
    } catch (error) {
      logger.error(
        { station, error: error.message },
        'Error fetching from external API or updating cache'
      );
      // If fetch fails, try to serve from cache anyway if we have something
      if (cachedData.length > 0) {
        logger.info(
          { station },
          'API Fetch FAILED: Serving stale/partial data'
        );
        const stationInfo = metadata?.information
          ? JSON.parse(metadata.information)
          : null;
        return {
          station_information: stationInfo,
          data: cachedData,
          fromCache: true,
          stale: true
        };
      }
      throw error;
    }
  }

  // 4. Serve from cache (HIT)
  logger.info({ station, days }, 'Cache HIT');
  const stationInfo = metadata.information
    ? JSON.parse(metadata.information)
    : null;
  return {
    station_information: stationInfo,
    data: cachedData,
    fromCache: true
  };
};
