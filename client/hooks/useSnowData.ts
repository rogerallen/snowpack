import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

/**
 * Data structured for Plotly traces, grouped by season.
 * This structure is now received directly from the server.
 */
export interface SeasonTraceData {
  dates: string[];
  originalDates: string[];
  depths: number[];
  swes: number[];
  temps: number[];
}

export type SeasonalPlotlyData = Record<string, SeasonTraceData>;

const fetchSnowData = async (
  stationId: string,
  days: number,
): Promise<SeasonalPlotlyData> => {
  if (!stationId) return {};
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const url = `${apiBaseUrl}/api/snow?station=${stationId}&days=${days}`;
  const response = await axios.get(url);
  return response.data.data;
};

export const useSnowData = (stationId: string, days = 365) => {
  const {
    data = {},
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ['snow-data', stationId, days],
    queryFn: () => fetchSnowData(stationId, days),
    enabled: !!stationId,
  });

  return {
    data,
    loading,
    error:
      error instanceof Error ? error.message : error ? String(error) : null,
  };
};
