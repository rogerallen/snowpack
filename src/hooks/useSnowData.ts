import { useState, useEffect } from 'react';
import axios from 'axios';
import { transformToSeasonalData, type SeasonalPlotlyData } from '../lib/seasonUtils';

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
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
        const url = `${apiBaseUrl}/api/snow?station=${stationId}&days=${days}`;

        const response = await axios.get(url);
        const seasonalData = transformToSeasonalData(response.data.data);

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

