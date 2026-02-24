import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || 'snow_cache.db';
// Adjust path to root: server/lib/db.js -> server/lib -> server -> root
const fullDbPath = path.isAbsolute(dbPath) ? dbPath : path.join(__dirname, '..', '..', dbPath);
const db = new DatabaseSync(fullDbPath);

// Initialize schema
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
    min_requested_date TEXT,
    information TEXT
  )
`);

export const getStationMetadataStmt = db.prepare(
  'SELECT last_fetch_timestamp, min_requested_date, information FROM station_metadata WHERE station_id = ?',
);
export const getSnowDataStmt = db.prepare(
  'SELECT date, depth, snow_water_equivalent, change_in_depth, change_in_swe, temperature FROM snow_data WHERE station_id = ? AND date >= ? ORDER BY date DESC',
);
export const upsertSnowDataStmt = db.prepare(`
  INSERT INTO snow_data (station_id, date, depth, snow_water_equivalent, change_in_depth, change_in_swe, temperature)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(station_id, date) DO UPDATE SET
    depth=excluded.depth,
    snow_water_equivalent=excluded.snow_water_equivalent,
    change_in_depth=excluded.change_in_depth,
    change_in_swe=excluded.change_in_swe,
    temperature=excluded.temperature
`);
export const upsertMetadataStmt = db.prepare(`
  INSERT INTO station_metadata (station_id, last_fetch_timestamp, min_requested_date, information) VALUES (?, ?, ?, ?)
  ON CONFLICT(station_id) DO UPDATE SET
    last_fetch_timestamp=excluded.last_fetch_timestamp,
    min_requested_date=excluded.min_requested_date,
    information=excluded.information
`);

export default db;
