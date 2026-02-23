import { useState, useEffect } from 'react';
import axios from 'axios';

// The shape of the raw JSON from the API
interface ApiDataPoint {
  Date: string;
  'Snow Water Equivalent (in)': string;
  'Snow Depth (in)': string;
  'Observed Air Temperature (degrees farenheit)': string;
}

// The clean shape we want to use in our app
export interface SnowDataPoint {
  date: string;
  swe: number; // Snow Water Equivalent
  depth: number; // Snow Depth
  temp: number; // Temperature
}

// 651:OR:SNTL is Mt. Hood Test Site
const STATION_ID = '651:OR:SNTL';

export const useSnowData = (days = 365) => {
  const [data, setData] = useState<SnowDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Use environment variables to point to the correct API endpoint.
        // In development, it points to our Node server. In production, it's a relative path.
        const apiBaseUrl = import.meta.env.DEV ? 'http://localhost:3001' : '';
        const url = `${apiBaseUrl}/api/snow?station=${STATION_ID}&days=${days}`;

        const response = await axios.get(url);
        const rawData: ApiDataPoint[] = response.data.data;

        // Transform and sort the data by date ascending
        const formattedData = rawData
          .map((item) => ({
            date: item['Date'],
            swe: parseFloat(item['Snow Water Equivalent (in)']) || 0,
            depth: parseFloat(item['Snow Depth (in)']) || 0,
            temp:
              parseFloat(
                item['Observed Air Temperature (degrees farenheit)'],
              ) || 0,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        // Clean up data dropouts using a forward-fill approach.
        for (let i = 1; i < formattedData.length; i++) {
          // If current depth is 0 but previous was > 0, it's likely a sensor dropout.
          // Carry forward the previous day's value for a more realistic graph.
          if (formattedData[i].depth === 0 && formattedData[i - 1].depth > 0) {
            formattedData[i].depth = formattedData[i - 1].depth;
            formattedData[i].swe = formattedData[i - 1].swe;
          }
        }

        setData(formattedData);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch snow data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [days]);

  return { data, loading, error };
};
