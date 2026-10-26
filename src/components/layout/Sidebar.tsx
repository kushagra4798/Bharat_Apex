import React from 'react';
import { useBharatApex } from '../../context';

export type ViewPath =
  | 'overview'
  | 'aps-scheduler'
  | 'bom-inventory'
  | 'supplier-edi-hub'
  | 'fx-risk-hub'
  | 'fleet-map';

export interface NavItem {
  id: ViewPath;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'aps-scheduler', label: 'APS Scheduler', icon: 'calendar_month' },
  { id: 'bom-inventory', label: 'BOM & Inventory', icon: 'inventory_2' },
  { id: 'supplier-edi-hub', label: 'Supplier & EDI Hub', icon: 'hub' },
  { id: 'fx-risk-hub', label: 'FX Risk Hub', icon: 'trending_up' },
  { id: 'fleet-map', label: 'Fleet Map', icon: 'fmd_good' },
];

export interface SidebarProps {
  activeView: ViewPath;
  onSelectView: (view: ViewPath) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onSelectView }) => {
  const { state } = useBharatApex();
  const { customerBuffers } = state;

  const minRunOut =
    customerBuffers.length > 0
      ? Math.min(...customerBuffers.map((b) => b.runOutHours))
      : 999;

  const lineStatus: 'CRITICAL' | 'WARNING' | 'NORMAL' =
    minRunOut < 3 ? 'CRITICAL' : minRunOut < 6 ? 'WARNING' : 'NORMAL';

  const statusColorConfig = {
    CRITICAL: {
      text: 'text-error dark:text-red-400',
      dot: 'bg-error dark:bg-red-500',
      ping: 'bg-error dark:bg-red-400',
      shadow: 'shadow-[0_0_8px_#ef4444]',
    },
    WARNING: {
      text: 'text-amber-500 dark:text-amber-400',
      dot: 'bg-amber-500 dark:bg-amber-400',
      ping: 'bg-amber-400',
      shadow: 'shadow-[0_0_8px_#f59e0b]',
    },
    NORMAL: {
      text: 'text-tertiary dark:text-emerald-400',
      dot: 'bg-tertiary dark:bg-emerald-400',
      ping: 'bg-tertiary dark:bg-emerald-400',
      shadow: 'shadow-[0_0_8px_#34d399]',
    },
  }[lineStatus];

  return (
    <aside className="fixed left-0 top-0 h-full w-72 bg-inverse-surface dark:bg-[#0f172a] border-r border-outline-variant/30 dark:border-[#222e4a] z-50 flex-col justify-between hidden lg:flex select-none">
      <div className="flex flex-col">
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center gap-3 bg-inverse-surface dark:bg-[#0e1526] border-b border-outline-variant/20 dark:border-[#222e4a]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-indigo-400 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 ring-1 ring-white/20">
            <span className="material-symbols-outlined text-[18px]">precision_manufacturing</span>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base text-inverse-on-surface dark:text-white leading-tight tracking-tight">
              BHARAT APEX
            </span>
            <span className="text-[10px] tracking-wider text-outline dark:text-[#94a3b8] uppercase font-semibold">
              Chakan MIDC · Tier-1 Auto
            </span>
          </div>
        </div>

        {/* Section Header */}
        <div className="px-5 py-3">
          <span className="text-[11px] font-semibold text-outline dark:text-[#64748b] uppercase px-2 tracking-wider">
            Mission Control
          </span>
        </div>

        {/* Navigation Items matching Stitch exact classes */}
        <nav className="flex flex-col gap-1 px-4">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all text-left ${
                  isActive
                    ? 'bg-primary text-white shadow-md shadow-indigo-600/30 font-bold'
                    : 'text-inverse-on-surface dark:text-[#94a3b8] hover:bg-surface-variant/30 dark:hover:bg-[#1e293b] hover:text-white'
                }`}
              >
                <span className={`material-symbols-outlined text-[20px] ${isActive ? 'text-white' : 'text-outline dark:text-[#64748b]'}`}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Telemetry Status Widget at Bottom */}
      <div className="p-4">
        <div className="bg-surface-variant/20 dark:bg-[#131c31] border border-outline-variant/20 dark:border-[#222e4a] rounded-xl p-3.5 flex flex-col gap-1.5 shadow-inner">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusColorConfig.ping}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${statusColorConfig.dot} ${statusColorConfig.shadow}`} />
            </span>
            <span className={`text-[11px] uppercase tracking-wider font-bold ${statusColorConfig.text}`}>
              Line Status: {lineStatus}
            </span>
          </div>
          <span className="text-[11px] text-outline dark:text-[#94a3b8]">
            Chakan Unit-4 · Telemetry Active
          </span>
        </div>
      </div>
    </aside>
  );
};
