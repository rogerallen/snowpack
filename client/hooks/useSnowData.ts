import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

/**
 * Data structured for Plotly traces, grouped by season.
 * This structure is now received directly from the server.
 */
export interface SeasonTraceData {
  dates: string[];
  originalDates: string[];
  depths: (number | null)[];
  swes: (number | null)[];
  temps: (number | null)[];
}

export type SeasonalPlotlyData = Record<string, SeasonTraceData>;

export interface SnowDataMeta {
  minSnowYear: number | null;
  maxSnowYear: number | null;
  minTempYear: number | null;
  maxTempYear: number | null;
}

export interface SnowDataResponse {
  data: SeasonalPlotlyData;
  meta: SnowDataMeta;
  fromCache: boolean;
  stale: boolean;
}

const fetchSnowData = async (
  stationId: string,
  days: number,
): Promise<SnowDataResponse> => {
  if (!stationId) {
    return {
      data: {},
      meta: {
        minSnowYear: null,
        maxSnowYear: null,
        minTempYear: null,
        maxTempYear: null,
      },
      fromCache: false,
      stale: false,
    };
  }
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const url = `${apiBaseUrl}/api/snow?station=${stationId}&days=${days}`;
  const response = await axios.get(url);
  return response.data;
};

const EMPTY_DATA: SeasonalPlotlyData = {};
const EMPTY_META: SnowDataMeta = {
  minSnowYear: null,
  maxSnowYear: null,
  minTempYear: null,
  maxTempYear: null,
};

export const useSnowData = (stationId: string, days = 365) => {
  const {
    data,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ['snow-data', stationId, days],
    queryFn: () => fetchSnowData(stationId, days),
    enabled: !!stationId,
  });

  return {
    data: data?.data || EMPTY_DATA,
    meta: data?.meta || EMPTY_META,
    loading,
    error:
      error instanceof Error ? error.message : error ? String(error) : null,
  };
};
