import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import stationsData from '../data/snotel-stations.json';
import { useEffect } from 'react';

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

  const selectedStationData = stations.find((s) => s.id === selectedStation);

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
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={50} // Smaller radius = more clusters and more individual points
        disableClusteringAtZoom={13} // Show individual markers at zoom 13 and above
      >
        {stations.map((station) => (
          <Marker
            key={station.id}
            position={[station.lat, station.lon]}
            icon={selectedStation === station.id ? selectedIcon : defaultIcon}
            eventHandlers={{
              click: () => {
                setSelectedStation(station.id);
              },
              mouseover: (e) => {
                e.target.openPopup();
              },
              mouseout: (e) => {
                e.target.closePopup();
              },
            }}
          >
            <Popup
              closeButton={false}
              autoPan={false}
              className="compact-popup"
            >
              <div className="flex flex-col p-0 m-0 leading-tight">
                <div className="font-bold text-sm m-0 p-0">{station.name}</div>
                <div className="text-xs text-gray-600 m-0 p-0">
                  State: {station.state}
                </div>
                <div className="text-[10px] text-blue-500 italic mt-1 p-0">
                  Click to select
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
      <RecenterAutomatically station={selectedStationData} />
    </MapContainer>
  );
};

export default StationMap;
