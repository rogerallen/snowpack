import { useState } from 'react';
import SnowpackChart from './components/SnowpackChart';
import StationMap from './components/StationMap';
import { MountainSnow } from 'lucide-react';
import stations from './data/snotel-stations.json';

function App() {
  const [selectedStation, setSelectedStation] = useState('651:OR:SNTL');

  const getStationName = (stationId: string) => {
    const station = stations.find(s => s.id === stationId);
    return station ? station.name : 'Unknown Station';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-2">
          <MountainSnow className="text-oregon-blue w-6 h-6" />
          <h1 className="text-xl font-bold text-gray-900">Snowpack Tracker</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="text-xl font-bold text-gray-900">{getStationName(selectedStation)} Data:</h2>
        <div className="grid grid-cols-1 gap-6">
          <SnowpackChart selectedStation={selectedStation} />

          {/* Map component */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <StationMap
              selectedStation={selectedStation}
              setSelectedStation={setSelectedStation}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
