import React from 'react';
import Plot from 'react-plotly.js';
import { useSnowData } from '../hooks/useSnowData';

const SnowpackChart = () => {
  const { data, loading, error } = useSnowData(365 * 40); // Fetch 40 years of data

  if (loading) {
    return <div>Loading chart data...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  const seasons = Object.keys(data).sort((a, b) => Number(b) - Number(a)); // Sort descending
  const latestSeason = seasons[0];

  const traces = seasons.map((season) => {
    const seasonData = data[season];
    const isLatest = season === latestSeason;

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
      line: {
        color: isLatest ? '#1f77b4' : '#aec7e8',
        width: isLatest ? 2.5 : 1.5,
      },
      opacity: isLatest ? 1 : 0.7,
    };
  });

  return (
    <Plot
      data={traces}
      layout={{
        title: 'Seasonal Snow Depth at Mt. Hood',
        xaxis: {
          title: 'Date',
          tickformat: '%b', // Format ticks as abbreviated month names (e.g., Aug, Sep)
          // Set the range to be from Aug 1 to Jul 31
          range: ['2000-08-01', '2001-07-31'],
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
