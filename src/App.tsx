import SnowpackChart from './components/SnowpackChart';
import { MountainSnow } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-2">
          <MountainSnow className="text-oregon-blue w-6 h-6" />
          <h1 className="text-xl font-bold text-gray-900">Oregon Snowpack Tracker</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 gap-6">
          <SnowpackChart />
          
          {/* Placeholder for future Map component */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-64 flex items-center justify-center text-gray-400">
            Map Component Coming Soon
          </div>
        </div>
      </main>
    </div>
  );
}

export default App
