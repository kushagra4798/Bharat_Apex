import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { CorridorPolyline } from './CorridorPolyline';
import { useBharatApex } from '../../context';
import { CORRIDORS } from '../../data/mockData';
import { OEM_PLANTS } from './FleetLogisticsMap';

export interface OverviewMiniMapProps {
  onOpenFullMap: () => void;
}

// Hook to detect dark mode
function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

const MiniMapResizeHandler: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
};

// Mini divIcon for trucks
const miniTruckIcon = (isExpedited: boolean) =>
  L.divIcon({
    html: `
      <div style="transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center;">
        <span style="position: absolute; width: 12px; height: 12px; border-radius: 9999px; opacity: 0.75;" class="${
          isExpedited ? 'bg-red-500 animate-ping' : 'bg-indigo-400'
        }"></span>
        <span style="width: 8px; height: 8px; border-radius: 9999px; border: 1.5px solid white;" class="${
          isExpedited ? 'bg-red-600' : 'bg-indigo-600'
        }"></span>
      </div>
    `,
    className: 'mini-truck-icon',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

// Mini divIcon for plants
const miniPlantIcon = (isHub: boolean) =>
  L.divIcon({
    html: `
      <div style="transform: translate(-50%, -50%); width: 6px; height: 6px; border-radius: 2px; border: 1px solid white;" class="${
        isHub ? 'bg-indigo-500' : 'bg-slate-400'
      }"></div>
    `,
    className: 'mini-plant-icon',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

export const OverviewMiniMap: React.FC<OverviewMiniMapProps> = ({ onOpenFullMap }) => {
  const isDark = useIsDarkMode();
  const { state } = useBharatApex();
  const { trucks } = state;

  const inTransitCount = trucks.length;
  const expeditedCount = trucks.filter((t) => t.isExpedited).length;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Map Canvas Box */}
      <div
        onClick={onOpenFullMap}
        className="relative w-full h-48 bg-surface-container-low dark:bg-[#070b14] rounded-lg border border-outline-variant/30 dark:border-[#222e4a] overflow-hidden cursor-pointer group"
        title="Click to open Full Logistics Telematics Map"
      >
        <MapContainer
          center={[19.8, 74.8]}
          zoom={5}
          zoomControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          style={{ width: '100%', height: '100%', background: isDark ? '#070b14' : '#f1f5f9' }}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />

          <MiniMapResizeHandler />

          {/* Corridor Polylines */}
          {CORRIDORS.map((c) => (
            <CorridorPolyline
              key={c.id}
              path={c.waypoints}
              color={c.id.includes('sanand') ? '#ef4444' : '#6366f1'}
              weight={2.5}
              opacity={0.8}
              isDashed={c.id.includes('chennai')}
            />
          ))}

          {/* Geofence Circles */}
          {OEM_PLANTS.map((p) => (
            <Circle
              key={`mini-geofence-${p.id}`}
              center={[p.lat, p.lng]}
              radius={(p.radiusKm ?? 1.5) * 1000}
              pathOptions={{
                color: p.isHub ? '#6366f1' : '#3b82f6',
                fillColor: p.isHub ? '#6366f1' : '#3b82f6',
                fillOpacity: 0.15,
                weight: 1,
              }}
            />
          ))}

          {/* Plant mini markers */}
          {OEM_PLANTS.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={miniPlantIcon(p.isHub)} />
          ))}

          {/* Truck mini markers */}
          {trucks.map((t) => (
            <Marker
              key={t.id}
              position={[t.currentLat, t.currentLng]}
              icon={miniTruckIcon(t.isExpedited)}
            />
          ))}
        </MapContainer>

        {/* Floating status tag */}
        <div className="absolute bottom-2 left-2 z-[400] bg-surface-container-lowest/90 dark:bg-[#0b111e]/90 backdrop-blur-xs px-2 py-0.5 rounded text-[10px] font-mono text-secondary dark:text-[#94a3b8] border border-outline-variant/20 flex items-center gap-1.5 pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Live Highway Corridors (NH-48)</span>
        </div>

        {/* Hover pill */}
        <div className="absolute top-2 right-2 z-[400] opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded shadow flex items-center gap-1">
          <span>Expand Map</span>
          <span className="material-symbols-outlined text-[12px]">open_in_new</span>
        </div>
      </div>

      {/* Fleet telemetry stats */}
      <div className="grid grid-cols-3 gap-2 text-center bg-surface-container-low dark:bg-[#0d1726] p-2 rounded-lg text-xs">
        <div>
          <div className="font-mono text-base font-bold text-on-surface dark:text-white">
            {inTransitCount}
          </div>
          <div className="text-[10px] text-secondary uppercase font-semibold">In Transit</div>
        </div>
        <div>
          <div className="font-mono text-base font-bold text-error dark:text-red-400">
            {expeditedCount}
          </div>
          <div className="text-[10px] text-secondary uppercase font-semibold">FastTrack Pass</div>
        </div>
        <div>
          <div className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
            98.2%
          </div>
          <div className="text-[10px] text-secondary uppercase font-semibold">Toll On-Time</div>
        </div>
      </div>
    </div>
  );
};
