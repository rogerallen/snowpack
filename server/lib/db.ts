import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.ts';
import { DATA_CONFIG } from './constants.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database setup: use a file for caching
const dbPath =
  process.env.NODE_ENV === 'test'
    ? ':memory:'
    : path.join(__dirname, '..', '..', 'snow_cache.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error({ err }, 'Could not connect to database');
  } else {
    logger.info({ dbPath }, 'Connected to the SQLite database');
  }
});

/**
 * Initializes the database schema.
 */
export async function initDb(): Promise<void> {
  return new Promise((resolve) => {
    db.serialize(() => {
      // Create meta table
      db.run(`
        CREATE TABLE IF NOT EXISTS db_meta (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);

      // Check version and upgrade if necessary
      db.get(
        "SELECT value FROM db_meta WHERE key = 'version'",
        async (err, row: { value: string } | undefined) => {
          const currentVersion = row ? parseInt(row.value) : 0;

          if (currentVersion < DATA_CONFIG.DB_VERSION) {
            logger.info(
              {
                oldVersion: currentVersion,
                newVersion: DATA_CONFIG.DB_VERSION,
              },
              'Upgrading database schema...',
            );

            // Version 4 is a breaking change (Structured data instead of JSON)
            db.serialize(() => {
              db.run('DROP TABLE IF EXISTS snow_cache');
              db.run('DROP TABLE IF EXISTS snow_data');
              db.run('DROP TABLE IF EXISTS stations');

              // Create new tables
              db.run(`
                CREATE TABLE stations (
                  station_id TEXT PRIMARY KEY,
                  name TEXT,
                  state TEXT,
                  lat REAL,
                  lon REAL,
                  min_snow_year INTEGER,
                  max_snow_year INTEGER,
                  min_temp_year INTEGER,
                  max_temp_year INTEGER,
                  last_full_ingestion DATETIME
                )
              `);

              db.run(`
                CREATE TABLE snow_data (
                  station_id TEXT,
                  season INTEGER,
                  period_id INTEGER,
                  mean_depth REAL,
                  mean_swe REAL,
                  mean_temp REAL,
                  PRIMARY KEY (station_id, season, period_id)
                )
              `);

              // Update metadata
              db.run(
                "INSERT OR REPLACE INTO db_meta (key, value) VALUES ('version', ?)",
                [DATA_CONFIG.DB_VERSION.toString()],
              );
              db.run(
                "INSERT OR REPLACE INTO db_meta (key, value) VALUES ('sampling_interval', ?)",
                [DATA_CONFIG.SAMPLING_INTERVAL_DAYS.toString()],
              );
              db.run(
                "INSERT OR REPLACE INTO db_meta (key, value) VALUES ('zero_threshold', ?)",
                [DATA_CONFIG.ZERO_DETECTION_THRESHOLD_DAYS.toString()],
              );

              logger.info('Database schema upgraded to Version 4');
              resolve();
            });
          } else {
            // Ensure tables exist even if version is correct
            db.serialize(() => {
              db.run(`
                CREATE TABLE IF NOT EXISTS stations (
                  station_id TEXT PRIMARY KEY,
                  name TEXT,
                  state TEXT,
                  lat REAL,
                  lon REAL,
                  min_snow_year INTEGER,
                  max_snow_year INTEGER,
                  min_temp_year INTEGER,
                  max_temp_year INTEGER,
                  last_full_ingestion DATETIME
                )
              `);

              db.run(`
                CREATE TABLE IF NOT EXISTS snow_data (
                  station_id TEXT,
                  season INTEGER,
                  period_id INTEGER,
                  mean_depth REAL,
                  mean_swe REAL,
                  mean_temp REAL,
                  PRIMARY KEY (station_id, season, period_id)
                )
              `);
              resolve();
            });
          }
        },
      );
    });
  });
}

/**
 * Executes a SQL query and returns the results as a promise.
 */
export function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows: T[]) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Executes a SQL run command (INSERT, UPDATE, DELETE) and returns a promise.
 */
export function run(sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export default db;
