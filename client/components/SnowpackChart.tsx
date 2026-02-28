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

  // New states for controls
  const [showYearly, setShowYearly] = useState(true);
  const [showAverage, setShowAverage] = useState(true);
  const [minYear, setMinYear] = useState<number>(0);
  const [maxYear, setMaxYear] = useState<number>(0);
  const [committedMinYear, setCommittedMinYear] = useState<number>(0);
  const [committedMaxYear, setCommittedMaxYear] = useState<number>(0);

  const yearRange = useMemo(() => {
    const keys = Object.keys(data || {});
    const yearlyYears = keys
      .filter((k) => !k.includes('Average'))
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);

    if (yearlyYears.length === 0) return { min: 0, max: 0, fullMin: 0 };

    const max = yearlyYears[yearlyYears.length - 1];
    const min = yearlyYears[0];
    const fullMin = max - 40; // Full range is 40 years back from the most recent

    return { min, max, fullMin };
  }, [data]);

  // Set initial year range once data loads
  useEffect(() => {
    if (yearRange.max > 0) {
      setMinYear(yearRange.min);
      setMaxYear(yearRange.max);
      setCommittedMinYear(yearRange.min);
      setCommittedMaxYear(yearRange.max);
    }
  }, [yearRange]);

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
      `-${committedMinYear}-${committedMaxYear}-${showYearly}-${showAverage}`,
    [data, committedMinYear, committedMaxYear, showYearly, showAverage],
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
      .filter(
        (year) =>
          !isNaN(year) && year >= committedMinYear && year <= committedMaxYear,
      )
      .sort((a, b) => a - b)
      .map(String);

    const averages = keys
      .filter((k) => k.includes('Average'))
      .filter((k) => {
        // Average labels are like "1991-1995 Average".
        // Let's filter if any part of the average range overlaps the slider range
        const match = k.match(/(\d{4})-(\d{4})/);
        if (match) {
          const start = parseInt(match[1]);
          const end = parseInt(match[2]);
          return start >= committedMinYear && end <= committedMaxYear;
        }
        return true;
      })
      .sort((a, b) => a.localeCompare(b));

    const finalSeasons = [];
    if (showAverage) finalSeasons.push(...averages);
    if (showYearly) finalSeasons.push(...yearly);

    return finalSeasons;
  }, [data, committedMinYear, committedMaxYear, showYearly, showAverage]);

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
                  setMaxYear(val);
                }}
                onMouseUp={() => {
                  startTransition(() => {
                    setCommittedMaxYear(maxYear);
                  });
                }}
                onKeyUp={() => {
                  startTransition(() => {
                    setCommittedMaxYear(maxYear);
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
                  setMinYear(val);
                }}
                onMouseUp={() => {
                  startTransition(() => {
                    setCommittedMinYear(minYear);
                  });
                }}
                onKeyUp={() => {
                  startTransition(() => {
                    setCommittedMinYear(minYear);
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
