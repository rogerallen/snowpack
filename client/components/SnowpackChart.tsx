import React, { useMemo, useState, useEffect, Suspense, lazy } from 'react';
import type { PlotHoverEvent } from 'plotly.js-basic-dist';
import { useSnowData } from '../hooks/useSnowData';
import { useUrlState } from '../hooks/useUrlState';
import { Loader2, AlertCircle } from 'lucide-react';

// Lazy load the Plotly component to enable code-splitting
const Plot = lazy(() => import('./PlotlyBasic'));

const SnowpackChart = ({ selectedStation }: { selectedStation: string }) => {
  const { data, loading, error } = useSnowData(selectedStation, 365 * 40); // Fetch 40 years of data
  const [hoveredSeason, setHoveredSeason] = useUrlState('season', '');
  const [revision, setRevision] = useState(0);

  // This effect will increment the revision whenever the hover state or data changes.
  useEffect(() => {
    setRevision((r) => r + 1);
  }, [hoveredSeason, data]);

  // Reset hover state when changing stations to avoid stale hover references
  useEffect(() => {
    setHoveredSeason('');
  }, [selectedStation, setHoveredSeason]);

  const seasons = useMemo(
    () => Object.keys(data || {}).sort((a, b) => Number(b) - Number(a)), // Sort descending
    [data],
  );
  const latestSeason = seasons[0];

  // Memoize the expensive part of trace generation
  const traceData = useMemo(
    () =>
      seasons
        .map((season) => {
          const seasonData = data[season];
          if (!seasonData) return null;

          const hoverTexts = (seasonData.originalDates || []).map(
            (originalDate, i) => {
              const date = new Date(originalDate);
              const dateString = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              });
              return `${dateString} ${seasonData.depths[i]} inches`;
            },
          );

          return {
            x: seasonData.dates,
            y: seasonData.depths,
            type: 'scatter',
            mode: 'lines',
            name: season,
            text: hoverTexts,
            hovertemplate: '%{text}<extra></extra>',
          };
        })
        .filter(Boolean),
    [data, seasons],
  );

  const traces = useMemo(
    () =>
      (traceData || [])
        .map((trace) => {
          if (!trace) return null;
          const isLatest = trace.name === latestSeason;
          const isHovered = trace.name === hoveredSeason;

          let color = isLatest ? '#1f77b4' : '#aec7e8';
          let width = isLatest ? 2.5 : 1.5;
          let opacity = isLatest ? 1 : 0.7;

          if (isHovered && !isLatest) {
            color = 'black';
            width = 2.5;
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
    <div className="relative w-full h-[500px] bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm transition-opacity">
          <Loader2 className="w-10 h-10 text-oregon-blue animate-spin mb-3" />
          <p className="text-sm font-medium text-gray-600">
            Loading seasonal data...
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
                  title: 'Seasonal Snow Depth',
                  xaxis: {
                    title: 'Date',
                    tickformat: '%b',
                    range: ['2000-09-01', '2001-08-31'],
                  },
                  yaxis: { title: 'Snow Depth (inches)' },
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
  );
};

export default SnowpackChart;
