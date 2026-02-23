import express from 'express';
import axios from 'axios';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// A simple file-based cache using SQLite. This provides persistence
// across server restarts without the complexity of a separate Redis server.
const db = new DatabaseSync('api_cache.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS api_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  )
`);
const CACHE_DURATION_SECONDS = 10 * 60; // 10 minutes

const getCacheStmt = db.prepare(
  'SELECT value, timestamp FROM api_cache WHERE key = ?',
);
const setCacheStmt = db.prepare(`
  INSERT INTO api_cache (key, value, timestamp) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value, timestamp=excluded.timestamp
`);

// Enable CORS for all routes. This is useful for development when the
// client (Vite dev server) and this server are on different ports.
app.use(cors());

// Our API proxy endpoint
app.get('/api/snow', async (req, res) => {
  const station = req.query.station || '651:OR:SNTL';
  const days = req.query.days || 365 * 41;
  const cacheKey = `snowdata-${station}-${days}`;

  // 1. Check cache
  const cachedEntry = getCacheStmt.get(cacheKey);
  if (cachedEntry) {
    if (Date.now() - cachedEntry.timestamp < CACHE_DURATION_SECONDS * 1000) {
      console.log(`[Cache HIT] for key: ${cacheKey}`);
      res.setHeader(
        'Cache-Control',
        `public, max-age=${CACHE_DURATION_SECONDS}`,
      );
      return res.status(200).json(JSON.parse(cachedEntry.value));
    }
  }
  console.log(`[Cache MISS] for key: ${cacheKey}`);

  try {
    // 2. Fetch from external API if cache miss or stale
    const externalApiUrl = `https://powderlines.kellysoftware.org/api/station/${station}?days=${days}`;
    const apiResponse = await axios.get(externalApiUrl);

    // 3. Store in cache and return
    const responseData = apiResponse.data;
    setCacheStmt.run(cacheKey, JSON.stringify(responseData), Date.now());

    res.setHeader('Cache-Control', `public, max-age=${CACHE_DURATION_SECONDS}`);
    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching from external API:', error.message);
    return res
      .status(502)
      .json({ message: 'Error fetching data from upstream API.' });
  }
});

// In production, serve the static files from the 'dist' folder
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));

  // The "catchall" handler: for any request that doesn't match one above,
  // send back React's index.html file.
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
