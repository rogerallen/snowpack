import React, { useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import type { PlotHoverEvent } from 'plotly.js';
import { useSnowData } from '../hooks/useSnowData';

const SnowpackChart = ({ selectedStation }: { selectedStation: string }) => {
  const { data, loading, error } = useSnowData(selectedStation, 365 * 40); // Fetch 40 years of data
  const [hoveredSeason, setHoveredSeason] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  // This effect will increment the revision whenever the hover state or data changes.
  // The `datarevision` property in the layout tells Plotly to do a full redraw
  // when this value changes, ensuring our hover styles are applied.
  useEffect(() => {
    setRevision((r) => r + 1);
  }, [hoveredSeason, data]);
  const seasons = useMemo(
    () => Object.keys(data).sort((a, b) => Number(b) - Number(a)), // Sort descending
    [data],
  );
  const latestSeason = seasons[0];

  // Memoize the expensive part of trace generation (data processing and hover text)
  const traceData = useMemo(
    () =>
      seasons.map((season) => {
        const seasonData = data[season];

        const hoverTexts = seasonData.originalDates.map((originalDate, i) => {
          const date = new Date(originalDate);
          const dateString = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          });
          return `${dateString} ${seasonData.depths[i]} inches`;
        });

        return {
          x: seasonData.dates,
          y: seasonData.depths,
          type: 'scatter',
          mode: 'lines',
          name: season,
          // Provide custom text for the hover template
          text: hoverTexts,
          // Use the 'text' property for the hover and hide the default trace info
          hovertemplate: '%{text}<extra></extra>',
        };
      }),
    [data, seasons],
  );

  // This memo only applies styling and is much faster. It runs on hover.
  const traces = useMemo(
    () =>
      traceData.map((trace) => {
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
      }),
    [traceData, latestSeason, hoveredSeason],
  );

  const handleHover = (event: PlotHoverEvent) => {
    if (event.points.length > 0) {
      const point = event.points[0];
      // The name of the trace is available in the fullData object
      setHoveredSeason((point.fullData as { name: string }).name);
    }
  };

  const handleUnhover = () => {
    setHoveredSeason(null);
  };

  if (loading) {
    return <div>Loading chart data...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <Plot
      data={traces}
      onHover={handleHover}
      onUnhover={handleUnhover}
      layout={{
        hoverlabel: {
          bgcolor: '#aec7e8', // Light blue from the historical traces
          font: { color: 'black' },
          bordercolor: '#aec7e8',
        },
        datarevision: revision,
        title: 'Seasonal Snow Depth',
        xaxis: {
          title: 'Date',
          tickformat: '%b', // Format ticks as abbreviated month names (e.g., Aug, Sep)
          // Set the range to be from Sep 1 to Aug 31
          range: ['2000-09-01', '2001-08-31'],
        },
        yaxis: { title: 'Snow Depth (inches)' },
        legend: {
          traceorder: 'reversed',
        },
      }}
      style={{ width: '100%', height: '500px' }}
      useResizeHandler={true}
    />
  );
};

export default SnowpackChart;
