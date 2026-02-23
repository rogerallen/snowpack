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
      try {
        setLoading(true);
        // Using the working URL you found
        const url = `https://powderlines.kellysoftware.org/api/station/${STATION_ID}?days=${
          days
        }`;

        const response = await axios.get(url);
        const rawData: ApiDataPoint[] = response.data.data;

        // Transform the data
        const formattedData = rawData.map((item) => ({
          date: item['Date'],
          swe: parseFloat(item['Snow Water Equivalent (in)']) || 0,
          depth: parseFloat(item['Snow Depth (in)']) || 0,
          temp:
            parseFloat(item['Observed Air Temperature (degrees farenheit)']) || 0,
        }));

        setData(formattedData);
        setError(null);
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