import express, { Request, Response } from 'express';
import { getSnowData } from '../services/snowService.ts';

const router = express.Router();

/**
 * @route   GET /api/snow
 * @desc    Fetch and transform SNOTEL snow data
 */
router.get('/snow', async (req: Request, res: Response): Promise<void> => {
  const { station, days } = req.query;

  if (!station) {
    res.status(400).json({ error: 'Station ID is required' });
    return;
  }

  const daysNum = parseInt(days as string) || 365;

  try {
    const result = await getSnowData(station as string, daysNum);
    res.json({
      station,
      days: daysNum,
      fromCache: result.fromCache,
      stale: result.stale,
      data: result.data,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch snow data',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
