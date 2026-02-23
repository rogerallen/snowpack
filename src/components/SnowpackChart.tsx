import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type {
  ValueType,
  NameType,
} from 'recharts/types/component/DefaultTooltipContent';
import { useSnowData } from '../hooks/useSnowData';
import { groupDataBySeason } from '../lib/seasonUtils';
import { format } from 'date-fns';

const CustomTooltip = ({
  active,
  payload,
  label,
}: TooltipProps<ValueType, NameType>) => {
  if (active && payload && payload.length) {
    const displayDate = format(new Date(label as number), 'MMM d');
    return (
      <div className="rounded border border-gray-300 bg-white p-2 shadow-lg">
        <p className="mb-2 font-bold">{`Date: ${displayDate}`}</p>
        {payload.map((pld) => (
          <div key={pld.name} className="mb-1">
            <p style={{ color: pld.color }}>{`${pld.name}: ${pld.value}"`}</p>
            <p className="text-xs text-gray-500">
              {`Actual: ${pld.payload.date}`}
            </p>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const SEASON_COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#22c55e', // green-500
  '#f97316', // orange-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
];

const SnowpackChart = () => {
  // Fetch data back to 2020 for now
  const days = Math.ceil(
    (new Date().getTime() - new Date('2020-01-01').getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const { data, loading, error } = useSnowData(days);

  if (loading) return <div className="text-center">Loading snow data...</div>;
  if (error)
    return <div className="text-center text-red-500">Error: {error}</div>;
  if (!data || data.length === 0) {
    return <div className="text-center">No data available.</div>;
  }

  const seasonalData = groupDataBySeason(data);
  const seasons = Object.keys(seasonalData).sort(
    (a, b) => Number(b) - Number(a),
  );

  // Define the ticks for each month of the season to ensure one tick per month.
  // The years (2000, 2001) match the normalization in `seasonUtils.ts`.
  const seasonTicks = [
    new Date(2000, 7, 1).getTime(), // Aug
    new Date(2000, 8, 1).getTime(), // Sep
    new Date(2000, 9, 1).getTime(), // Oct
    new Date(2000, 10, 1).getTime(), // Nov
    new Date(2000, 11, 1).getTime(), // Dec
    new Date(2001, 0, 1).getTime(), // Jan
    new Date(2001, 1, 1).getTime(), // Feb
    new Date(2001, 2, 1).getTime(), // Mar
    new Date(2001, 3, 1).getTime(), // Apr
    new Date(2001, 4, 1).getTime(), // May
    new Date(2001, 5, 1).getTime(), // Jun
    new Date(2001, 6, 1).getTime(), // Jul
  ];

  return (
    <div>
      <h2 className="mb-4 text-center text-2xl font-bold">
        Seasonal Snow Depth Comparison
      </h2>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="seasonDate"
            type="number"
            scale="time"
            domain={['auto', 'auto']}
            tickFormatter={(time) => format(new Date(time), 'MMM')}
            padding={{ left: 20, right: 20 }}
            ticks={seasonTicks}
          />
          <YAxis
            label={{
              value: 'Snow Depth (in)',
              angle: -90,
              position: 'insideLeft',
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {seasons.map((season, index) => (
            <Line
              key={season}
              data={seasonalData[season]}
              type="monotone"
              dataKey="depth"
              name={season}
              stroke={SEASON_COLORS[index % SEASON_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SnowpackChart;
