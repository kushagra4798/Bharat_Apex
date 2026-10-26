import React from 'react';
import { FleetLogisticsMap } from '../components/Maps';

export interface FleetMapViewProps {
  onExpediteTruck?: (truckId: string, oemName: string, partDesc: string) => void;
}

export const FleetMapView: React.FC<FleetMapViewProps> = ({
  onExpediteTruck,
}) => {
  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-200">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-lowest dark:bg-[#0B0F19] border border-outline-variant/30 dark:border-[#243352] p-5 rounded-xl shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary dark:bg-indigo-500/20 dark:text-indigo-400 border border-primary/20 dark:border-indigo-500/30 text-[11px] font-mono uppercase tracking-wider font-semibold">
              Live Fleet Telematics
            </span>
            <span className="text-secondary text-xs">·</span>
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              GPS & FASTag Synced (2s Cycle)
            </span>
          </div>
          <h1 className="text-lg md:text-xl font-bold text-on-surface dark:text-white mt-1">
            Fleet Logistics & Highway Corridors
          </h1>
          <p className="text-xs text-secondary dark:text-[#94a3b8]">
            Real-time convoy tracking along NH-48 corridors, FASTag toll plazas, and automated green passes
          </p>
        </div>
      </div>

      {/* Interactive Map Component */}
      <FleetLogisticsMap onExpediteTruck={onExpediteTruck} />
    </div>
  );
};
