import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import stationsData from '../data/snotel-stations.json';
import { useEffect, useState } from 'react';

// Leaflet's default icon doesn't work well with bundlers, so we need to fix the URL
import L from 'leaflet';
// @ts-expect-error: Leaflet's default icon URLs are not compatible with modern bundlers. This is a common workaround.
delete L.Icon.Default.prototype._getIconUrl;

const defaultIcon = L.icon({
  iconUrl: '/assets/leaflet/marker-icon-2x-blue.png',
  shadowUrl: '/assets/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const selectedIcon = L.icon({
  iconUrl: '/assets/leaflet/marker-icon-2x-orange.png',
  shadowUrl: '/assets/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  state: string;
}

const stations: Station[] = stationsData;

interface StationMapProps {
  selectedStation: string;
  setSelectedStation: (stationId: string) => void;
}

interface RecenterAutomaticallyProps {
  station: Station | undefined;
}

const StationMap = ({
  selectedStation,
  setSelectedStation,
}: StationMapProps) => {
  const [temporaryStation, setTemporaryStation] = useState<Station | null>(
    null,
  );

  // Calculate the center of the map
  const center: [number, number] = [45.5231, -122.6765]; // Default to Portland, OR

  const RecenterAutomatically = ({ station }: RecenterAutomaticallyProps) => {
    const map = useMap();
    useEffect(() => {
      if (station) {
        const { lat, lon } = station;
        map.setView([lat, lon]);
      }
    }, [station]);
    return null;
  };

  return (
    <MapContainer
      center={center}
      zoom={6}
      style={{ height: '400px', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <MarkerClusterGroup chunkedLoading>
        {stations.map((station) => (
          <Marker
            key={station.id}
            position={[station.lat, station.lon]}
            icon={selectedStation === station.id ? selectedIcon : defaultIcon}
            eventHandlers={{
              click: () => {
                setTemporaryStation(station);
              },
            }}
          >
            <Popup>
              <div>
                <h3>{station.name}</h3>
                <p>State: {station.state}</p>
                {temporaryStation && temporaryStation.id === station.id && (
                  <button
                    onClick={() => {
                      setSelectedStation(station.id);
                      setTemporaryStation(null);
                    }}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded"
                  >
                    Confirm Selection
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
      <RecenterAutomatically station={temporaryStation} />
    </MapContainer>
  );
};

export default StationMap;
