import React, { useState, useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  Circle,
} from 'react-leaflet';
import L from 'leaflet';
import { CorridorPolyline } from './CorridorPolyline';
import { useBharatApex } from '../../context';
import { useTruckSimulation } from '../../hooks';
import { CORRIDORS } from '../../data/mockData';
import { Truck, CustomerBuffer } from '../../types';
import { OEM_PLANTS, OemPlantLocation } from './oemPlants';

export * from './oemPlants';

export interface FleetLogisticsMapProps {
  onExpediteTruck?: (truckId: string, oemName: string, partDesc: string) => void;
}

// Hook to detect dark mode changes via DOM class
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

// Map Controller to handle corridor auto-fit bounds and truck fly-to
const MapController: React.FC<{
  corridorFilter: string;
  flyToTarget: [number, number] | null;
  allPoints: [number, number][];
}> = ({ corridorFilter, flyToTarget, allPoints }) => {
  const map = useMap();

  useEffect(() => {
    if (flyToTarget) {
      map.flyTo(flyToTarget, 11, { duration: 1.2 });
    }
  }, [flyToTarget, map]);

  useEffect(() => {
    if (corridorFilter === 'ALL') {
      if (allPoints.length > 0) {
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
      }
    } else {
      const selected = CORRIDORS.find((c) => c.id === corridorFilter);
      if (selected && selected.waypoints.length > 0) {
        const pts: [number, number][] = selected.waypoints.map((wp) => [wp.lat, wp.lng]);
        const bounds = L.latLngBounds(pts);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 9 });
      }
    }
  }, [corridorFilter, allPoints, map]);

  return null;
};

// Map Container Resize Handler
const MapResizeHandler: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    const container = map.getContainer();
    if (!container) return;

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [map]);
  return null;
};

export const FleetLogisticsMap: React.FC<FleetLogisticsMapProps> = ({ onExpediteTruck }) => {
  const isDark = useIsDarkMode();
  const { state, expediteTransit } = useBharatApex();
  const { trucks, customerBuffers } = state;
  const { isSimulating, toggleSimulation } = useTruckSimulation();

  const [activeCorridorFilter, setActiveCorridorFilter] = useState<string>('ALL');
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<[number, number] | null>(null);

  const filteredTrucks = trucks.filter((t) => {
    if (activeCorridorFilter === 'ALL') return true;
    return t.corridorId === activeCorridorFilter;
  });

  // Collect all coordinates for auto-fit bounds
  const allFitPoints = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = OEM_PLANTS.map((p) => [p.lat, p.lng]);
    CORRIDORS.forEach((c) => {
      c.waypoints.forEach((wp) => pts.push([wp.lat, wp.lng]));
    });
    return pts;
  }, []);

  // Custom Leaflet DivIcon for OEM Plants (Labels visible on hover or when selected)
  const createPlantIcon = (plant: (typeof OEM_PLANTS)[0], buffer?: CustomerBuffer) => {
    const isHub = plant.isHub;
    const isSelected = selectedPlantId === plant.id;
    const status = buffer?.status ?? 'HEALTHY';
    const bgClass = isHub
      ? 'bg-primary text-white border-2 border-white dark:border-[#222e4a]'
      : status === 'CRITICAL'
      ? 'bg-red-600 text-white border-2 border-red-300'
      : status === 'WARNING'
      ? 'bg-amber-600 text-white border-2 border-amber-300'
      : 'bg-surface-container-lowest dark:bg-[#0b111e] text-on-surface dark:text-white border border-outline-variant/60';

    const iconName = isHub ? 'hub' : 'factory';

    const html = `
      <div style="display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%); cursor: pointer;">
        <div class="marker-label px-2 py-1 rounded-md text-[10px] font-mono font-bold shadow-md flex items-center gap-1 ${bgClass}" style="white-space: nowrap; margin-bottom: 2px;">
          <span class="material-symbols-outlined" style="font-size: 13px;">${iconName}</span>
          <span>${plant.name}</span>
        </div>
        <div style="width: 10px; height: 10px; border-radius: 9999px; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5);" class="${isHub ? 'bg-primary' : status === 'CRITICAL' ? 'bg-red-600' : status === 'WARNING' ? 'bg-amber-600' : 'bg-slate-500'}"></div>
      </div>
    `;

    return L.divIcon({
      html,
      className: `custom-plant-div-icon ${isSelected ? 'is-selected' : ''}`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  };

  // Custom Leaflet DivIcon for Moving Trucks (Labels visible on hover or when selected)
  const createTruckIcon = (truck: Truck) => {
    const isExp = truck.isExpedited;
    const isArrived = truck.status === 'ARRIVED';
    const isSelected = selectedTruckId === truck.id;
    const bgClass = isArrived
      ? 'bg-blue-600 text-white border-blue-400'
      : isExp
      ? 'bg-red-600 text-white border-red-400 animate-pulse'
      : 'bg-[#131c31] text-cyan-300 border-[#222e4a]';

    const pingColor = isArrived ? 'bg-blue-500' : isExp ? 'bg-red-500' : 'bg-cyan-400';

    const html = `
      <div style="display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%); cursor: pointer;">
        <div class="marker-label px-2 py-0.5 rounded-lg shadow-lg flex items-center gap-1 font-mono text-[10px] font-bold border ${bgClass}" style="white-space: nowrap; margin-bottom: 2px;">
          <span class="material-symbols-outlined" style="font-size: 13px;">local_shipping</span>
          <span>${truck.registrationNumber}</span>
        </div>
        <div style="position: relative; width: 10px; height: 10px;">
          <span class="animate-ping" style="position: absolute; display: inline-flex; height: 100%; width: 100%; border-radius: 9999px; opacity: 0.75;" class="${pingColor}"></span>
          <span style="position: relative; display: inline-flex; border-radius: 9999px; height: 10px; width: 10px; border: 1.5px solid white;" class="${pingColor}"></span>
        </div>
      </div>
    `;

    return L.divIcon({
      html,
      className: `custom-truck-div-icon ${isSelected ? 'is-selected' : ''}`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  };

  return (
    <div className="w-full flex flex-col lg:flex-row gap-4 h-[750px] animate-in fade-in duration-200">
      {/* Map View Container */}
      <div className="flex-1 rounded-xl overflow-hidden border border-outline-variant/30 dark:border-[#222e4a] relative shadow-md bg-surface-container-low dark:bg-[#070b14]">
        {/* Simulation Control Overlay Bar */}
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 bg-surface-container-lowest/95 dark:bg-[#0b111e]/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-outline-variant/30 dark:border-[#243352] shadow-md text-xs">
          <button
            type="button"
            onClick={toggleSimulation}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
              isSimulating ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isSimulating ? 'pause' : 'play_arrow'}
            </span>
            <span>{isSimulating ? 'Live Telematics (2s)' : 'Simulation Paused'}</span>
          </button>

          <span className="text-secondary dark:text-[#94a3b8] text-[11px] font-mono hidden sm:inline">
            Active Convoys: {trucks.length}
          </span>
        </div>

        {/* Leaflet Map Container */}
        <MapContainer
          center={[19.8, 74.8]}
          zoom={6}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%', background: isDark ? '#0b111e' : '#f8fafc' }}
        >
          {/* OpenStreetMap Basemap Tiles (Inverted for dark mode via CSS on .leaflet-tile-pane) */}
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />

          <MapController
            corridorFilter={activeCorridorFilter}
            flyToTarget={flyToTarget}
            allPoints={allFitPoints}
          />
          <MapResizeHandler />

          {/* Corridor Polylines with dashed style support */}
          {CORRIDORS.map((corridor) => {
            const isFiltered =
              activeCorridorFilter !== 'ALL' && activeCorridorFilter !== corridor.id;
            return (
              <CorridorPolyline
                key={corridor.id}
                path={corridor.waypoints}
                color={corridor.id.includes('sanand') ? '#ef4444' : '#6366f1'}
                weight={isFiltered ? 2 : 4}
                opacity={isFiltered ? 0.3 : 0.85}
                isDashed={corridor.id.includes('chennai')}
              />
            );
          })}

          {/* Geofence Circles around OEM Plants (Default radius 1.5 km = 1500 m) */}
          {OEM_PLANTS.map((plant) => {
            const radiusMeters = (plant.radiusKm ?? 1.5) * 1000;
            return (
              <Circle
                key={`geofence-${plant.id}`}
                center={[plant.lat, plant.lng]}
                radius={radiusMeters}
                pathOptions={{
                  color: plant.isHub ? '#6366f1' : '#3b82f6',
                  fillColor: plant.isHub ? '#6366f1' : '#3b82f6',
                  fillOpacity: 0.12,
                  weight: 1.5,
                  dashArray: '5, 5',
                }}
              />
            );
          })}

          {/* OEM Plants & Chakan Hub Markers */}
          {OEM_PLANTS.map((plant) => {
            const targetBuffer = customerBuffers.find((b) =>
              b.oemName.toLowerCase().includes(plant.name.toLowerCase())
            );
            return (
              <Marker
                key={plant.id}
                position={[plant.lat, plant.lng]}
                icon={createPlantIcon(plant, targetBuffer)}
                eventHandlers={{
                  click: () => {
                    setSelectedPlantId(plant.id);
                    setFlyToTarget([plant.lat, plant.lng]);
                  },
                }}
              >
                <Popup className="scada-leaflet-popup">
                  <div className="p-1 text-xs font-sans max-w-xs text-slate-900 dark:text-white">
                    <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-700 pb-1.5 mb-1.5">
                      <span className="material-symbols-outlined text-[16px] text-indigo-600 dark:text-indigo-400">
                        {plant.isHub ? 'hub' : 'factory'}
                      </span>
                      <h4 className="font-bold text-sm text-indigo-700 dark:text-indigo-400">
                        {plant.name}
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">{plant.location}</p>
                    <div className="mt-2 pt-1 border-t border-slate-200 dark:border-slate-700 text-[11px] space-y-1">
                      <div>
                        <strong className="text-slate-700 dark:text-slate-300">Assigned Part: </strong>
                        <span>{plant.part}</span>
                      </div>
                      {targetBuffer && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-slate-600 dark:text-slate-400">Buffer Run-Out:</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              targetBuffer.status === 'CRITICAL'
                                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                : targetBuffer.status === 'WARNING'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}
                          >
                            {targetBuffer.runOutHours}h ({targetBuffer.status})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Moving Truck Markers */}
          {filteredTrucks.map((truck) => {
            const targetBuffer = customerBuffers.find((b) =>
              b.oemName.toLowerCase().includes(truck.destinationOem.toLowerCase())
            );

            return (
              <Marker
                key={truck.id}
                position={[truck.currentLat, truck.currentLng]}
                icon={createTruckIcon(truck)}
                eventHandlers={{
                  click: () => {
                    setSelectedTruckId(truck.id);
                    setFlyToTarget([truck.currentLat, truck.currentLng]);
                  },
                }}
              >
                <Popup className="scada-leaflet-popup">
                  <div className="p-1 text-xs font-sans max-w-xs text-slate-900 dark:text-white">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5 mb-2">
                      <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400 text-xs">
                        {truck.registrationNumber}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase font-mono ${
                          truck.status === 'ARRIVED'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : truck.isExpedited
                            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        {truck.status === 'ARRIVED'
                          ? 'ARRIVED AT GATE'
                          : truck.isExpedited
                          ? 'FASTTRACK EXPEDITED'
                          : 'STANDARD TRANSIT'}
                      </span>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      <div>
                        <strong className="block text-slate-700 dark:text-slate-300">Destination:</strong>
                        <span>
                          {truck.destination} ({truck.destinationOem})
                        </span>
                      </div>
                      <div>
                        <strong className="block text-slate-700 dark:text-slate-300">Cargo:</strong>
                        <span>{truck.cargoDescription}</span>
                      </div>
                      {targetBuffer && (
                        <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono flex items-center justify-between">
                          <span>Target Buffer:</span>
                          <span
                            className={
                              targetBuffer.status === 'CRITICAL'
                                ? 'text-red-600 dark:text-red-400 font-bold'
                                : 'text-emerald-600 dark:text-emerald-400 font-bold'
                            }
                          >
                            {targetBuffer.runOutHours}h remaining
                          </span>
                        </div>
                      )}
                      <div>
                        <strong className="block text-slate-700 dark:text-slate-300">FASTag Toll Status:</strong>
                        <span className="text-amber-700 dark:text-amber-400 font-medium">
                          {truck.fastagTollStatus}
                        </span>
                      </div>
                      <div className="flex justify-between font-mono pt-1 text-[10px]">
                        <span>Speed: {truck.speedKmph} km/h</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          ETA: {(truck.etaMinutes / 60).toFixed(1)}h ({truck.etaMinutes}m)
                        </span>
                      </div>
                    </div>

                    {!truck.isExpedited && (
                      <button
                        type="button"
                        onClick={() => {
                          expediteTransit(truck.id, 50);
                          if (onExpediteTruck) {
                            onExpediteTruck(
                              truck.id,
                              truck.destinationOem,
                              truck.cargoDescription
                            );
                          }
                        }}
                        className="mt-2.5 w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">bolt</span>
                        <span>FastTrack Expedite (+50 units)</span>
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Side Panel: Active Truck Convoys & Toll Status (Right Column) */}
      <div className="w-full lg:w-96 flex flex-col gap-3 overflow-y-auto max-h-full">
        {/* Corridor Filter Tabs */}
        <div className="p-3 bg-surface-container-lowest dark:bg-[#0b111e] border border-outline-variant/30 dark:border-[#222e4a] rounded-xl flex items-center justify-between text-xs">
          <span className="font-semibold text-secondary dark:text-[#94a3b8]">Corridor:</span>
          <select
            value={activeCorridorFilter}
            onChange={(e) => setActiveCorridorFilter(e.target.value)}
            className="h-8 px-2 bg-surface-container dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#243352] text-xs font-semibold rounded text-on-surface dark:text-white"
          >
            <option value="ALL">All Highway Corridors</option>
            <option value="corridor-chakan-sanand">Chakan &rarr; Sanand (NH-48)</option>
            <option value="corridor-chakan-manesar">Chakan &rarr; Manesar (NH-48)</option>
            <option value="corridor-chakan-chennai">Chakan &rarr; Chennai (NH-48)</option>
            <option value="corridor-chakan-waluj">Chakan &rarr; Waluj (MH-SH-27)</option>
          </select>
        </div>

        {/* Truck Telematics Cards */}
        <div className="flex flex-col gap-2.5">
          {filteredTrucks.map((truck) => {
            const isExp = truck.isExpedited;
            const targetBuffer = customerBuffers.find((b) =>
              b.oemName.toLowerCase().includes(truck.destinationOem.toLowerCase())
            );

            return (
              <div
                key={truck.id}
                onClick={() => {
                  setSelectedTruckId(truck.id);
                  setFlyToTarget([truck.currentLat, truck.currentLng]);
                }}
                className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2 shadow-xs cursor-pointer ${
                  selectedTruckId === truck.id
                    ? 'border-primary ring-1 ring-primary bg-primary/5 dark:bg-indigo-950/30'
                    : 'border-outline-variant/30 dark:border-[#222e4a] bg-surface-container-lowest dark:bg-[#0b111e] hover:border-primary/50'
                }`}
              >
                {/* Truck Top Info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-secondary dark:text-[#94a3b8] text-[16px]">
                      local_shipping
                    </span>
                    <span className="font-mono font-bold text-xs text-on-surface dark:text-white">
                      {truck.registrationNumber}
                    </span>
                  </div>

                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                      truck.status === 'ARRIVED'
                        ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/40'
                        : isExp
                        ? 'bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/40 animate-pulse'
                        : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {truck.status === 'ARRIVED'
                      ? 'ARRIVED AT GATE'
                      : isExp
                      ? 'FASTTRACK ACTIVE'
                      : 'NOMINAL TRANSIT'}
                  </span>
                </div>

                {/* Destination & Cargo */}
                <div className="text-[11px] text-secondary dark:text-[#94a3b8] flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-on-surface dark:text-white font-medium">
                    <span>{truck.destinationOem}</span>
                    <span className="text-[10px] font-mono text-secondary">
                      {truck.unitsLoaded} Units
                    </span>
                  </div>
                  <span className="truncate">{truck.cargoDescription}</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-surface-container dark:bg-[#131c31] rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isExp ? 'bg-red-500' : 'bg-primary'
                    }`}
                    style={{ width: `${truck.progressPct}%` }}
                  />
                </div>

                {/* Route Metrics */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-outline-variant/20 dark:border-[#1f2c47] text-[10px] font-mono">
                  <div>
                    <span className="text-secondary dark:text-[#94a3b8] block">ETA to Plant</span>
                    <span className="font-bold text-on-surface dark:text-white">
                      {(truck.etaMinutes / 60).toFixed(1)} hrs ({truck.etaMinutes}m)
                    </span>
                  </div>
                  <div>
                    <span className="text-secondary dark:text-[#94a3b8] block">Buffer Status</span>
                    <span
                      className={`font-bold ${
                        targetBuffer && targetBuffer.runOutHours < 3.0
                          ? 'text-error'
                          : 'text-emerald-500'
                      }`}
                    >
                      {targetBuffer ? `${targetBuffer.runOutHours}h Stock` : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* FASTag Toll Notice */}
                <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-950/30 px-2 py-1 rounded flex items-center gap-1 border border-amber-500/20">
                  <span className="material-symbols-outlined text-[13px]">toll</span>
                  <span className="truncate">{truck.fastagTollStatus}</span>
                </div>

                {/* Expedite Action Button */}
                {!isExp && (
                  <button
                    type="button"
                    onClick={() => {
                      expediteTransit(truck.id, 50);
                      if (onExpediteTruck) {
                        onExpediteTruck(
                          truck.id,
                          truck.destinationOem,
                          truck.cargoDescription
                        );
                      }
                    }}
                    className="mt-1 w-full py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest dark:bg-[#162035] dark:hover:bg-[#1e2d4a] border border-outline-variant/30 text-[11px] font-semibold text-primary dark:text-indigo-400 hover:text-white hover:bg-primary transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">bolt</span>
                    <span>Issue FASTag Green Pass (+50 units)</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
