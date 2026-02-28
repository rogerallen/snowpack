import React, {
  useMemo,
  useState,
  useEffect,
  Suspense,
  lazy,
  useTransition,
} from 'react';
import type { PlotHoverEvent } from 'plotly.js-basic-dist';
import { useSnowData } from '../hooks/useSnowData';
import { useUrlState } from '../hooks/useUrlState';
import { Loader2, AlertCircle } from 'lucide-react';

// Lazy load the Plotly component to enable code-splitting
const Plot = lazy(() => import('./PlotlyBasic'));

const SnowpackChart = ({ selectedStation }: { selectedStation: string }) => {
  const { data, loading, error } = useSnowData(selectedStation, 365 * 40); // Fetch 40 years of data
  const [hoveredSeason, setHoveredSeason] = useUrlState('season', '');
  const [metric, setMetric] = useState<'depths' | 'swes' | 'temps'>('depths');
  const [isPending, startTransition] = useTransition();
  const [revision, setRevision] = useState(0);

  const handleMetricChange = (newMetric: 'depths' | 'swes' | 'temps') => {
    startTransition(() => {
      setMetric(newMetric);
    });
  };

  // This effect will increment the revision whenever the hover state or data changes.
  // We use dataKeys as a stable way to know if the underlying data structure changed.
  const dataKeys = useMemo(() => Object.keys(data || {}).join(','), [data]);
  useEffect(() => {
    setRevision((r) => r + 1);
  }, [hoveredSeason, dataKeys, metric]);

  // Reset hover state when changing stations to avoid stale hover references
  useEffect(() => {
    setHoveredSeason('');
  }, [selectedStation, setHoveredSeason]);

  const seasons = useMemo(() => {
    const keys = Object.keys(data || {});
    const yearly = keys
      .filter((k) => !k.includes('Average'))
      .sort((a, b) => Number(a) - Number(b)); // Sort ascending for trace ordering
    const averages = keys
      .filter((k) => k.includes('Average'))
      .sort((a, b) => a.localeCompare(b));
    // Averages first, then yearly. This means yearly lines are drawn LAST (on top).
    return [...averages, ...yearly];
  }, [data]);
  const latestSeason = useMemo(() => {
    const keys = Object.keys(data || {});
    return keys
      .filter((k) => !k.includes('Average'))
      .sort((a, b) => Number(b) - Number(a))[0];
  }, [data]);

  // Memoize the expensive part of trace generation
  const traceData = useMemo(
    () =>
      seasons
        .map((season) => {
          const seasonData = data[season];
          if (!seasonData) return null;

          const isAverage = season.includes('Average');
          const values = seasonData[metric] || [];
          const unit =
            metric === 'depths'
              ? 'inches'
              : metric === 'swes'
                ? 'in SWE'
                : '°F';

          const hoverTexts = (seasonData.originalDates || []).map(
            (originalDate, i) => {
              if (isAverage) {
                return `${season}: ${values[i]} ${unit}`;
              }
              const date = new Date(originalDate);
              const dateString = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              });
              return `${dateString} ${values[i]} ${unit}`;
            },
          );

          return {
            x: seasonData.dates,
            y: values,
            type: 'scatter',
            mode: 'lines',
            name: season,
            text: hoverTexts,
            //rallen connectgaps: !isAverage, // Connect gaps for yearly data to ensure lines are visible
            hovertemplate: '%{text}<extra></extra>',
          };
        })
        .filter(Boolean),
    [data, seasons, metric],
  );

  const traces = useMemo(
    () =>
      (traceData || [])
        .map((trace) => {
          if (!trace) return null;
          const isLatest = trace.name === latestSeason;
          const isHovered = trace.name === hoveredSeason;
          const isAverage = trace.name.includes('Average');

          let color = isLatest ? '#1f77b4' : '#aec7e8';
          let width = isLatest ? 2.5 : 1.5;
          let opacity = isLatest ? 1 : 0.7;

          if (isAverage) {
            color = '#003366'; // Darker blue
            width = 3.0; // Heavier line
            opacity = 0.9;
          }

          if (isHovered && !isLatest && !isAverage) {
            color = 'black';
            width = 2.5;
            opacity = 1;
          } else if (isHovered && isAverage) {
            width = 2.5; // Even heavier on hover
            opacity = 1;
          }

          return {
            ...trace,
            line: {
              color,
              width,
            },
            opacity,
          };
        })
        .filter(Boolean),
    [traceData, latestSeason, hoveredSeason],
  );

  const handleHover = (event: PlotHoverEvent) => {
    if (event.points.length > 0) {
      const point = event.points[0];
      setHoveredSeason((point.fullData as { name: string }).name);
    }
  };

  const handleUnhover = () => {
    setHoveredSeason('');
  };

  return (
    <div className="relative w-full h-[550px] bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <h3 className="font-bold text-gray-700">Seasonal Data</h3>
        <div className="flex bg-gray-200 p-1 rounded-lg">
          <button
            onClick={() => handleMetricChange('depths')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              metric === 'depths'
                ? 'bg-white text-oregon-blue shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Snow Depth
          </button>
          <button
            onClick={() => handleMetricChange('swes')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              metric === 'swes'
                ? 'bg-white text-oregon-blue shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            SWE
          </button>
          <button
            onClick={() => handleMetricChange('temps')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              metric === 'temps'
                ? 'bg-white text-oregon-blue shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Temp
          </button>
        </div>
      </div>

      <div className="relative flex-1">
        {(loading || isPending) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm transition-opacity">
            <Loader2 className="w-10 h-10 text-oregon-blue animate-spin mb-3" />
            <p className="text-sm font-medium text-gray-600">
              {isPending ? 'Processing chart data...' : 'Loading seasonal data...'}
            </p>
          </div>
        )}

        {error ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">
              Unable to load chart
            </h3>
            <p className="mt-1 text-sm text-gray-500">{error}</p>
          </div>
        ) : (
          <div className="w-full h-full">
            {/* Only render Plot if we have some data, or if it's already rendered (to keep state) */}
            {(seasons.length > 0 || !loading) && (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="w-8 h-8 text-oregon-blue animate-spin mr-2" />
                    <span className="text-gray-500">Initializing chart...</span>
                  </div>
                }
              >
                <Plot
                  data={traces}
                  onHover={handleHover}
                  onUnhover={handleUnhover}
                  layout={{
                    autosize: true,
                    margin: { t: 40, r: 30, l: 50, b: 40 },
                    hoverlabel: {
                      bgcolor: '#aec7e8',
                      font: { color: 'black' },
                      bordercolor: '#aec7e8',
                    },
                    datarevision: revision,
                    title: `Seasonal ${
                      metric === 'depths'
                        ? 'Snow Depth'
                        : metric === 'swes'
                          ? 'Snow Water Equivalent'
                          : 'Air Temperature'
                    }`,
                    xaxis: {
                      title: 'Date',
                      tickformat: '%b',
                      range: ['2000-09-01', '2001-08-31'],
                    },
                    yaxis: {
                      title:
                        metric === 'depths'
                          ? 'Snow Depth (inches)'
                          : metric === 'swes'
                            ? 'SWE (inches)'
                            : 'Temperature (°F)',
                    },
                    legend: {
                      traceorder: 'reversed',
                    },
                  }}
                  style={{ width: '100%', height: '100%' }}
                  useResizeHandler={true}
                  config={{ responsive: true, displayModeBar: false }}
                />
              </Suspense>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SnowpackChart;
