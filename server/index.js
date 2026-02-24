import express from 'express';
import axios from 'axios';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { format, subDays } from 'date-fns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// A more robust, persistent cache using SQLite.
// Data is stored per-day for each station to ensure consistency.
// We'll keep the database file in the project root for consistency.
const dbPath = process.env.DB_PATH || 'snow_cache.db';
const db = new DatabaseSync(path.join(__dirname, '..', dbPath));
db.exec(`
  CREATE TABLE IF NOT EXISTS snow_data (
    station_id TEXT NOT NULL,
    date TEXT NOT NULL,
    depth INTEGER,
    snow_water_equivalent REAL,
    change_in_depth INTEGER,
    temperature REAL,
    change_in_swe REAL,
    PRIMARY KEY (station_id, date)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS station_metadata (
    station_id TEXT PRIMARY KEY,
    last_fetch_timestamp INTEGER NOT NULL,
    information TEXT
  )
`);

// Simple migration: Add the 'information' column if it doesn't exist.
// This handles the case where the DB was created with an older schema.
const columns = db.prepare('PRAGMA table_info(station_metadata)').all();
if (!columns.some((col) => col.name === 'information')) {
  console.log(
    '[DB Migration] Adding "information" column to station_metadata table.',
  );
  db.exec('ALTER TABLE station_metadata ADD COLUMN information TEXT');
}
// Simple migration: Add the 'temperature' column if it doesn't exist.
const snowDataColumns = db.prepare('PRAGMA table_info(snow_data)').all();
if (!snowDataColumns.some((col) => col.name === 'temperature')) {
  console.log('[DB Migration] Adding "temperature" column to snow_data table.');
  db.exec('ALTER TABLE snow_data ADD COLUMN temperature REAL');
}

// How long before the server considers its own cache stale and re-fetches from the upstream API.
// Defaults to 30 days if not set in environment.
const SERVER_CACHE_STALE_SECONDS = parseInt(
  process.env.SERVER_CACHE_STALE_SECONDS || '2592000',
  10,
);

// How long the browser is allowed to cache the response from our API.
// Defaults to 10 minutes if not set in environment.
const BROWSER_CACHE_DURATION_SECONDS = parseInt(
  process.env.BROWSER_CACHE_DURATION_SECONDS || '600',
  10,
);

const UPSTREAM_API_URL =
  process.env.UPSTREAM_API_URL ||
  'https://powderlines.kellysoftware.org/api/station';

const getStationMetadataStmt = db.prepare(
  'SELECT last_fetch_timestamp, information FROM station_metadata WHERE station_id = ?',
);
const getSnowDataStmt = db.prepare(
  'SELECT date, depth, snow_water_equivalent, change_in_depth, change_in_swe, temperature FROM snow_data WHERE station_id = ? AND date >= ? ORDER BY date DESC',
);
const upsertSnowDataStmt = db.prepare(`
  INSERT INTO snow_data (station_id, date, depth, snow_water_equivalent, change_in_depth, change_in_swe, temperature)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(station_id, date) DO UPDATE SET
    depth=excluded.depth,
    snow_water_equivalent=excluded.snow_water_equivalent,
    change_in_depth=excluded.change_in_depth,
    change_in_swe=excluded.change_in_swe,
    temperature=excluded.temperature
`);
const upsertMetadataStmt = db.prepare(`
  INSERT INTO station_metadata (station_id, last_fetch_timestamp, information) VALUES (?, ?, ?)
  ON CONFLICT(station_id) DO UPDATE SET
    last_fetch_timestamp=excluded.last_fetch_timestamp,
    information=excluded.information
`);

// Enable CORS for all routes. This is useful for development when the
// client (Vite dev server) and this server are on different ports.
app.use(cors());

// Our API proxy endpoint with robust caching
app.get('/api/snow', async (req, res) => {
  const station = req.query.station || '651:OR:SNTL';
  const days = parseInt(req.query.days || 365 * 41, 10);

  const startDate = subDays(new Date(), days);
  const startDateString = format(startDate, 'yyyy-MM-dd');

  // 1. Check if cache is stale or insufficient for the request.
  const metadata = getStationMetadataStmt.get(station);
  const isCacheStale =
    !metadata ||
    Date.now() - metadata.last_fetch_timestamp >
      SERVER_CACHE_STALE_SECONDS * 1000;

  let cachedData = [];
  let isCacheInsufficient = false;
  if (!isCacheStale) {
    cachedData = getSnowDataStmt.all(station, startDateString);
    // If we have fewer records than days requested, cache is insufficient.
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
      // The API returns an object with a `data` property containing the array of records.
      const rawApiData = apiResponse.data.data;
      if (!Array.isArray(rawApiData)) {
        // This handles cases where the API response format is unexpected.
        throw new Error('Upstream API response did not contain a data array.');
      }

      // Transform to a consistent format with JS-friendly keys.
      // The external API uses keys with spaces and mixed case like "Snow Depth (in)".
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
        throw e; // re-throw to be caught by outer catch
      }

      const responsePayload = {
        station_information: stationInfo,
        data: freshData,
      };

      console.log(
        `[API CACHE MISS] Sending ${responsePayload.data.length} fresh records. First record:`,
        responsePayload.data[0] ?? 'N/A',
      );
      res.setHeader(
        'Cache-Control',
        `public, max-age=${BROWSER_CACHE_DURATION_SECONDS}`,
      );
      // Return the data we just fetched and cached
      return res.status(200).json(responsePayload);
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
        const stationInfo = metadata.information
          ? JSON.parse(metadata.information)
          : null;
        const responsePayload = {
          station_information: stationInfo,
          data: cachedData,
        };
        console.log(
          `[API FETCH FAILED] Sending ${responsePayload.data.length} stale records. First record:`,
          responsePayload.data[0] ?? 'N/A',
        );
        return res.status(200).json(responsePayload);
      }
      return res
        .status(502)
        .json({ message: 'Error fetching data from upstream API.' });
    }
  }

  // 4. Serve from cache
  console.log(`[Cache HIT] for station: ${station}, days: ${days}`);
  res.setHeader(
    'Cache-Control',
    `public, max-age=${BROWSER_CACHE_DURATION_SECONDS}`,
  );
  const stationInfo = metadata.information
    ? JSON.parse(metadata.information)
    : null;
  const responsePayload = {
    station_information: stationInfo,
    data: cachedData,
  };
  console.log(
    `[API CACHE HIT] Sending ${responsePayload.data.length} cached records. First record:`,
    responsePayload.data[0] ?? 'N/A',
  );
  return res.status(200).json(responsePayload);
});

// In production, serve the static files from the 'dist' folder
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));

  // The "catchall" handler: for any request that doesn't match one above,
  // send back React's index.html file.
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

export default app;
