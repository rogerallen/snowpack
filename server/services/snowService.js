import axios from 'axios';
import { format, subDays } from 'date-fns';
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
  const startDate = subDays(new Date(), days);
  const startDateString = format(startDate, 'yyyy-MM-dd');

  // Check current cache status
  const metadata = getStationMetadataStmt.get(station);
  let cachedData = getSnowDataStmt.all(station, startDateString);

  const isCacheStale =
    !metadata ||
    Date.now() - metadata.last_fetch_timestamp >
      SERVER_CACHE_STALE_SECONDS * 1000;

  let isCacheInsufficient = false;
  if (!isCacheStale) {
    // If we have significantly fewer records than days requested, cache is insufficient.
    // (Allowing a 10% margin for days with no data from the source)
    if (cachedData.length < days * 0.9) {
      isCacheInsufficient = true;
    }
  }

  if (isCacheStale || isCacheInsufficient) {
    if (isCacheStale) console.log(`[Cache STALE] for station: ${station}`);
    if (isCacheInsufficient)
      console.log(
        `[Cache INSUFFICIENT] for station: ${station}. Found ${cachedData.length}, need ~${days}`,
      );

    try {
      // 2. Fetch from external API
      const externalApiUrl = `${UPSTREAM_API_URL}/${station}?days=${days}`;
      console.log(`Fetching from external API: ${externalApiUrl}`);
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
        upsertMetadataStmt.run(
          station,
          Date.now(),
          JSON.stringify(stationInfo),
        );
        db.exec('COMMIT');
        console.log(
          `[Cache UPDATED] for station: ${station} with ${freshData.length} records.`,
        );
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }

      return {
        station_information: stationInfo,
        data: freshData,
        fromCache: false
      };
    } catch (error) {
      console.error(
        'Error fetching from external API or updating cache:',
        error.message,
      );
      // If fetch fails, try to serve from cache anyway if we have something
      if (cachedData.length > 0) {
        console.log(
          `[API Fetch FAILED] Serving stale/partial data for station: ${station}`,
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
  console.log(`[Cache HIT] for station: ${station}, days: ${days}`);
  const stationInfo = metadata.information
    ? JSON.parse(metadata.information)
    : null;
  return {
    station_information: stationInfo,
    data: cachedData,
    fromCache: true
  };
};
