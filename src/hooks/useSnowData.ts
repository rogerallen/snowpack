import { useState, useEffect } from 'react';
import axios from 'axios';

// The clean shape sent from our server API
interface ServerDataPoint {
  date: string;
  depth: number | null;
  snow_water_equivalent: number | null;
  temperature: number | null;
}

interface SeasonTraceData {
  dates: string[];
  originalDates: string[];
  depths: number[];
  swes: number[];
  temps: number[];
}

export type SeasonalPlotlyData = Record<string, SeasonTraceData>;

export const useSnowData = (stationId: string, days = 365) => {
  const [data, setData] = useState<SeasonalPlotlyData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!stationId) return;
      setLoading(true);
      setError(null);
      try {
        // Use environment variables to point to the correct API endpoint.
        // In development, it points to our Node server. In production, it's a relative path.
        const apiBaseUrl = import.meta.env.DEV ? 'http://localhost:3001' : '';
        const url = `${apiBaseUrl}/api/snow?station=${stationId}&days=${days}`;

        const response = await axios.get(url);
        const serverData: ServerDataPoint[] = response.data.data;

        // Group data by "snow year" (Sep 1 - Aug 31)
        const seasonalData: SeasonalPlotlyData = {};
        for (const item of serverData) {
          if (!item.date) continue;

          const date = new Date(item.date);
          // getUTCMonth is 0-indexed. September is 8.
          const seasonYear =
            date.getUTCMonth() >= 8
              ? date.getUTCFullYear() + 1
              : date.getUTCFullYear();

          if (!seasonalData[seasonYear]) {
            seasonalData[seasonYear] = {
              dates: [],
              originalDates: [],
              depths: [],
              swes: [],
              temps: [],
            };
          }

          // Normalize date for plotting on a common seasonal axis.
          // A season runs from Sep 1 to Aug 31. We can represent this
          // by mapping dates to a common year range, e.g., 2000-2001.
          const plotYear = date.getUTCMonth() >= 8 ? 2000 : 2001;
          const normalizedDate = `${plotYear}-${(date.getUTCMonth() + 1)
            .toString()
            .padStart(
              2,
              '0',
            )}-${date.getUTCDate().toString().padStart(2, '0')}`;

          seasonalData[seasonYear].dates.push(normalizedDate);
          seasonalData[seasonYear].originalDates.push(item.date);
          seasonalData[seasonYear].depths.push(item.depth ?? 0);
          seasonalData[seasonYear].swes.push(item.snow_water_equivalent ?? 0);
          seasonalData[seasonYear].temps.push(item.temperature ?? 0);
        }

        // Sort and clean up each season's data
        for (const year in seasonalData) {
          const season = seasonalData[year];
          // The data was pushed in descending order from the API, so reverse to get ascending.
          season.dates.reverse();
          season.originalDates.reverse();
          season.depths.reverse();
          season.swes.reverse();
          season.temps.reverse();

          // Clean up data dropouts using a forward-fill approach.
          for (let i = 1; i < season.depths.length; i++) {
            if (season.depths[i] === 0 && season.depths[i - 1] > 0) {
              season.depths[i] = season.depths[i - 1];
              season.swes[i] = season.swes[i - 1];
            }
          }
        }

        setData(seasonalData);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch snow data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [stationId, days]);

  return { data, loading, error };
};

