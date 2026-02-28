import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.ts';

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

// Initialize the cache table
db.serialize(() => {
  // Create meta table to track DB version
  db.run(`
    CREATE TABLE IF NOT EXISTS db_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Check for version and upgrade if necessary
  db.get(
    "SELECT value FROM db_meta WHERE key = 'version'",
    (err, row: { value: string } | undefined) => {
      if (err) {
        logger.error({ err }, 'Error checking database version');
        return;
      }

      const version = row ? parseInt(row.value) : 1;
      if (version < 3) {
        logger.info(
          { oldVersion: version, newVersion: 3 },
          'Old database version detected. Clearing cache for version 3 upgrade.',
        );

        db.serialize(() => {
          // Clear the cache for the breaking change (storing averages in DB)
          db.run('DROP TABLE IF EXISTS snow_cache');
          db.run(`
            CREATE TABLE IF NOT EXISTS snow_cache (
              station_id TEXT,
              days INTEGER,
              data TEXT,
              last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (station_id, days)
            )
          `);
          db.run(
            "INSERT OR REPLACE INTO db_meta (key, value) VALUES ('version', '3')",
          );
        });
      } else {
        // Version is already correct, just ensure snow_cache exists
        db.run(`
          CREATE TABLE IF NOT EXISTS snow_cache (
            station_id TEXT,
            days INTEGER,
            data TEXT,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (station_id, days)
          )
        `);
      }
    },
  );
});

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
