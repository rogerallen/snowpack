import express from 'express';
import { getSnowData } from '../services/snowService.js';

const router = express.Router();

// How long the browser is allowed to cache the response from our API.
// Defaults to 10 minutes if not set in environment.
const BROWSER_CACHE_DURATION_SECONDS = parseInt(
  process.env.BROWSER_CACHE_DURATION_SECONDS || '600',
  10,
);

/**
 * Our API proxy endpoint with robust caching
 */
router.get('/snow', async (req, res) => {
  const station = req.query.station || '651:OR:SNTL';
  const days = parseInt(req.query.days || 365 * 41, 10);

  try {
    const responsePayload = await getSnowData(station, days);

    res.setHeader(
      'Cache-Control',
      `public, max-age=${BROWSER_CACHE_DURATION_SECONDS}`,
    );

    console.log(
      `[API ${responsePayload.fromCache ? (responsePayload.stale ? 'STALE' : 'CACHE HIT') : 'CACHE MISS'}] Sending ${responsePayload.data.length} records. First record:`,
      responsePayload.data[0] ?? 'N/A',
    );

    return res.status(200).json({
      station_information: responsePayload.station_information,
      data: responsePayload.data
    });
  } catch (error) {
    console.error('Error in /api/snow route:', error.message);
    return res
      .status(502)
      .json({ message: 'Error fetching data from upstream API.' });
  }
});

export default router;
