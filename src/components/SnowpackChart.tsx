import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSnowData } from '../hooks/useSnowData';
import { format, parseISO } from 'date-fns';

const SnowpackChart: React.FC = () => {
  // Fetch last 180 days
  const { data, loading, error } = useSnowData(180);

  if (loading)
    return (
      <div className="flex h-96 items-center justify-center text-gray-500">
        Loading Snow Data...
      </div>
    );
  if (error)
    return (
      <div className="flex h-96 items-center justify-center text-red-500">
        {error}
      </div>
    );

  // Calculate current value for the header
  const currentSWE = data.length > 0 ? data[data.length - 1].swe : 0;

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6 border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-bold text-gray-800">Mt. Hood Snowpack</h2>
        <div className="flex items-baseline gap-2 mt-1">
          {/* Using the custom color defined in index.css */}
          <span className="text-4xl font-bold text-oregon-blue">
            {currentSWE.toFixed(1)}"
          </span>
          <span className="text-gray-500 font-medium">
            Snow Water Equivalent
          </span>
        </div>
      </div>

      <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorSwe" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#005696" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#005696" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#e5e7eb"
            />
            <XAxis
              dataKey="date"
              tickFormatter={(str) => format(parseISO(str), 'MMM d')}
              minTickGap={40}
              tick={{ fill: '#6b7280', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              label={{
                value: 'Inches',
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fill: '#9ca3af' },
              }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              labelFormatter={(label) =>
                format(parseISO(label), 'MMMM d, yyyy')
              }
              formatter={(value) =>
                typeof value === 'number'
                  ? [`${value.toFixed(1)} inches`, 'Water Equivalent']
                  : null
              }
            />
            <Legend verticalAlign="top" height={36} />
            <Area
              type="monotone"
              dataKey="swe"
              name="Snow Water Equivalent"
              stroke="#005696"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorSwe)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SnowpackChart;
