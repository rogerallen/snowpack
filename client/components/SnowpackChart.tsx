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

// Perceptually uniform Viridis color scale (Dark Purple to Yellow)
const VIRIDIS_SCALE = [
  '#440154',
  '#482878',
  '#3e4989',
  '#31688e',
  '#26828e',
  '#1f9e89',
  '#35b779',
  '#6ece58',
  '#b5de2b',
  '#fde725',
];

/**
 * Interpolates between Viridis hex colors based on a value from 0 to 1.
 */
function getViridisColor(t: number): string {
  if (isNaN(t)) return VIRIDIS_SCALE[0];
  // Clamp t to [0, 1] to prevent out-of-bounds array access
  const clampedT = Math.max(0, Math.min(1, t));
  const n = VIRIDIS_SCALE.length - 1;
  const i = Math.min(Math.floor(clampedT * n), n - 1);
  const start = VIRIDIS_SCALE[i];
  const end = VIRIDIS_SCALE[i + 1];

  // Simple linear interpolation for hex colors
  const r1 = parseInt(start.slice(1, 3), 16);
  const g1 = parseInt(start.slice(3, 5), 16);
  const b1 = parseInt(start.slice(5, 7), 16);

  const r2 = parseInt(end.slice(1, 3), 16);
  const g2 = parseInt(end.slice(3, 5), 16);
  const b2 = parseInt(end.slice(5, 7), 16);

  const localT = (t * n) % 1;
  const r = Math.round(r1 + (r2 - r1) * localT);
  const g = Math.round(g1 + (g2 - g1) * localT);
  const b = Math.round(b1 + (b2 - b1) * localT);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const SnowpackChart = ({ selectedStation }: { selectedStation: string }) => {
  const { data, meta, loading, error } = useSnowData(selectedStation, 365 * 40); // Fetch POR via backend
  const [hoveredSeason, setHoveredSeason] = useUrlState('season', '');
  const [metric, setMetric] = useState<'depths' | 'swes' | 'temps'>('depths');
  const [isPending, startTransition] = useTransition();
  const [revision, setRevision] = useState(0);

  // New states for controls
  const [showYearly, setShowYearly] = useState(true);
  const [showAverage, setShowAverage] = useState(true);
  const [minYear, setMinYear] = useState<number>(0);
  const [maxYear, setMaxYear] = useState<number>(0);
  const [debouncedMinYear, setDebouncedMinYear] = useState<number>(0);
  const [debouncedMaxYear, setDebouncedMaxYear] = useState<number>(0);

  const yearRange = useMemo(() => {
    const isSnow = metric === 'depths' || metric === 'swes';
    const min = isSnow ? meta.minSnowYear : meta.minTempYear;
    const max = isSnow ? meta.maxSnowYear : meta.maxTempYear;

    if (!min || !max) {
      // Fallback if meta is empty
      const keys = Object.keys(data || {});
      const yearlyYears = keys
        .filter((k) => !k.includes('Average'))
        .map(Number)
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b);

      if (yearlyYears.length === 0) return { min: 0, max: 0, fullMin: 0 };

      const fallbackMax = yearlyYears[yearlyYears.length - 1];
      const fallbackMin = yearlyYears[0];
      return { min: fallbackMin, max: fallbackMax, fullMin: 1980 };
    }

    return { min, max, fullMin: 1980 };
  }, [data, meta, metric]);

  // Set initial year range once data loads or station changes
  useEffect(() => {
    if (yearRange.max > 0) {
      setMinYear(yearRange.min);
      setMaxYear(yearRange.max);
      setDebouncedMinYear(yearRange.min);
      setDebouncedMaxYear(yearRange.max);
    }
  }, [yearRange, selectedStation]);

  // Debounce effect for the year sliders
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMinYear(minYear);
      setDebouncedMaxYear(maxYear);
    }, 50); // 50ms debounce for smoother sliding
    return () => clearTimeout(timer);
  }, [minYear, maxYear]);

  const handleMetricChange = (newMetric: 'depths' | 'swes' | 'temps') => {
    startTransition(() => {
      setMetric(newMetric);
    });
  };

  // This effect will increment the revision whenever the hover state or data changes.
  // We use dataKeys as a stable way to know if the underlying data structure changed.
  const dataKeys = useMemo(
    () =>
      Object.keys(data || {}).join(',') +
      `-${debouncedMinYear}-${debouncedMaxYear}-${showYearly}-${showAverage}`,
    [data, debouncedMinYear, debouncedMaxYear, showYearly, showAverage],
  );
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
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b)
      .map(String);

    const averages = keys
      .filter((k) => k.includes('Average'))
      .sort((a, b) => a.localeCompare(b));

    const finalSeasons = [...averages, ...yearly];

    return finalSeasons;
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
                ? 'inches'
                : '°F';

          const hoverTexts = (seasonData.originalDates || []).map(
            (originalDate, i) => {
              const val = values[i];
              const formattedVal =
                typeof val === 'number' ? Math.round(val * 10) / 10 : val;

              if (isAverage) {
                return `${season}: ${formattedVal} ${unit}`;
              }
              const date = new Date(originalDate);
              const dateString = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              });
              return `${dateString} ${formattedVal} ${unit}`;
            },
          );

          return {
            x: seasonData.dates,
            y: values,
            type: 'scatter',
            mode: 'lines',
            name: season,
            text: hoverTexts,
            hovertemplate: '%{text}<extra></extra>',
            showlegend: false, // Ensure legend is hidden
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

          // Check if this trace should be visible based on slider and toggle state
          let isVisible = true;
          if (isAverage) {
            if (!showAverage) {
              isVisible = false;
            } else {
              const match = trace.name.match(/(\d{4})-(\d{4})/);
              if (match) {
                const start = parseInt(match[1]);
                const end = parseInt(match[2]);
                isVisible =
                  start >= debouncedMinYear && end <= debouncedMaxYear;
              }
            }
          } else {
            const year = Number(trace.name);
            isVisible =
              showYearly &&
              year >= debouncedMinYear &&
              year <= debouncedMaxYear;
          }

          let color = '#aec7e8'; // Fallback
          let width = isLatest ? 3.0 : 1.5;
          let opacity = isLatest ? 1 : 0.7;

          if (isAverage) {
            // Apply Viridis color for averages based on the last year of the bucket
            const match = trace.name.match(/-(\d{4})/);
            if (match && yearRange.max > yearRange.min) {
              const lastYear = parseInt(match[1]);
              const t =
                (lastYear - yearRange.min) / (yearRange.max - yearRange.min);
              color = getViridisColor(t);
            } else {
              color = '#003366'; // Fallback
            }
            width = 3.0; // Heavier line
            opacity = 0.9;
          } else {
            // Apply Viridis color for yearly traces based on full temporal range
            const year = Number(trace.name);
            if (!isNaN(year) && yearRange.max > yearRange.min) {
              const t =
                (year - yearRange.min) / (yearRange.max - yearRange.min);
              color = getViridisColor(t);
            }
          }

          if (isHovered) {
            color = 'black';
            width = 3.5;
            opacity = 1;
            isVisible = true; // Always show hovered trace if it exists
          }

          return {
            ...trace,
            visible: isVisible,
            line: {
              color,
              width,
            },
            opacity,
          };
        })
        .filter(Boolean),
    [
      traceData,
      latestSeason,
      hoveredSeason,
      yearRange,
      debouncedMinYear,
      debouncedMaxYear,
      showYearly,
      showAverage,
    ],
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
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-gray-700">Seasonal Data</h3>
          {(loading || isPending) && (
            <div className="flex items-center gap-2 px-2 py-0.5 bg-oregon-blue/10 rounded-full">
              <Loader2 className="w-3 h-3 text-oregon-blue animate-spin" />
              <span className="text-[10px] font-semibold text-oregon-blue uppercase tracking-wider">
                {isPending ? 'Processing' : 'Fetching'}
              </span>
            </div>
          )}
        </div>
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

      <div className="relative flex-1 flex flex-row">
        {/* Sidebar Controls */}
        <div className="w-24 border-r border-gray-100 p-3 flex flex-col items-center bg-gray-50/30 gap-6">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col items-center gap-1 cursor-pointer">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Yearly
              </span>
              <input
                type="checkbox"
                checked={showYearly}
                onChange={(e) => {
                  const val = e.target.checked;
                  startTransition(() => {
                    setShowYearly(val);
                  });
                }}
                className="w-4 h-4 text-oregon-blue rounded focus:ring-oregon-blue"
              />
            </label>
            <label className="flex flex-col items-center gap-1 cursor-pointer">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Average
              </span>
              <input
                type="checkbox"
                checked={showAverage}
                onChange={(e) => {
                  const val = e.target.checked;
                  startTransition(() => {
                    setShowAverage(val);
                  });
                }}
                className="w-4 h-4 text-oregon-blue rounded focus:ring-oregon-blue"
              />
            </label>
          </div>

          <div className="flex-1 flex flex-col items-center w-full gap-1 py-1">
            <span className="text-[9px] font-medium text-gray-400 uppercase">
              {yearRange.max}
            </span>
            <div className="relative flex-1 w-8 flex flex-col items-center group">
              {/* Track Background */}
              <div className="absolute h-full w-1 bg-gray-200 rounded-lg" />

              {/* Selection Highlight */}
              <div
                className="absolute w-1 bg-oregon-blue/40 rounded-lg"
                style={{
                  top: `${
                    ((yearRange.max - maxYear) /
                      (yearRange.max - yearRange.fullMin)) *
                    100
                  }%`,
                  bottom: `${
                    ((minYear - yearRange.fullMin) /
                      (yearRange.max - yearRange.fullMin)) *
                    100
                  }%`,
                }}
              />

              {/* Min/Max Year Labels next to sliders */}
              <div
                className="absolute left-6 text-[10px] font-bold text-oregon-blue whitespace-nowrap pointer-events-none transition-all"
                style={{
                  top: `${
                    ((yearRange.max - maxYear) /
                      (yearRange.max - yearRange.fullMin)) *
                    100
                  }%`,
                  transform: 'translateY(-50%)',
                }}
              >
                {maxYear}
              </div>
              <div
                className="absolute left-6 text-[10px] font-bold text-oregon-blue whitespace-nowrap pointer-events-none transition-all"
                style={{
                  bottom: `${
                    ((minYear - yearRange.fullMin) /
                      (yearRange.max - yearRange.fullMin)) *
                    100
                  }%`,
                  transform: 'translateY(50%)',
                }}
              >
                {minYear}
              </div>

              {/* Vertical Slider implementation using two inputs */}
              <input
                type="range"
                min={yearRange.fullMin}
                max={yearRange.max}
                value={maxYear}
                onChange={(e) => {
                  const val = Math.max(Number(e.target.value), minYear);
                  startTransition(() => {
                    setMaxYear(val);
                  });
                }}
                className="absolute appearance-none h-full w-1 bg-transparent cursor-pointer accent-oregon-blue pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto z-20"
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                }}
              />
              <input
                type="range"
                min={yearRange.fullMin}
                max={yearRange.max}
                value={minYear}
                onChange={(e) => {
                  const val = Math.min(Number(e.target.value), maxYear);
                  startTransition(() => {
                    setMinYear(val);
                  });
                }}
                className="absolute appearance-none h-full w-1 bg-transparent cursor-pointer accent-oregon-blue pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto z-20"
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                }}
              />
            </div>
            <span className="text-[9px] font-medium text-gray-400 uppercase">
              {yearRange.fullMin}
            </span>
            <span className="text-[8px] text-gray-400 uppercase mt-1">
              Range
            </span>
          </div>
        </div>

        <div className="flex-1 relative">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900">
                Unable to load chart
              </h3>
              <p className="mt-1 text-sm text-gray-500">{error}</p>
            </div>
          ) : (
            <div
              className={`w-full h-full transition-opacity duration-300 ${
                isPending ? 'opacity-60' : 'opacity-100'
              }`}
            >
              {/* Only render Plot if we have some data, or if it's already rendered (to keep state) */}
              {(seasons.length > 0 || !loading) && (
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="w-8 h-8 text-oregon-blue animate-spin mr-2" />
                      <span className="text-gray-500">
                        Initializing chart...
                      </span>
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
                      showlegend: false, // Ensure legend is removed
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
                        type: 'date',
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
    </div>
  );
};

export default SnowpackChart;
