import React, { useState, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { SystemAlert } from '../../types';
import { formatCountdown } from '../../services/calculations';

export interface AlertsPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: SystemAlert[];
  onAcknowledge: (alertId: string) => void;
  onSnooze: (alertId: string, durationMinutes?: number) => void;
}

type FilterTab = 'ALL' | 'ACTIVE' | 'CRITICAL' | 'WARNING' | 'BUFFER' | 'LOGISTICS' | 'RESOLVED';

export const AlertsPanelModal: React.FC<AlertsPanelModalProps> = ({
  isOpen,
  onClose,
  alerts,
  onAcknowledge,
  onSnooze,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const counts = useMemo(() => {
    return {
      all: alerts.length,
      active: alerts.filter((a) => a.status === 'ACTIVE').length,
      critical: alerts.filter((a) => a.severity === 'CRITICAL').length,
      warning: alerts.filter((a) => a.severity === 'WARNING').length,
      buffer: alerts.filter((a) => a.category === 'BUFFER').length,
      logistics: alerts.filter((a) => a.category === 'LOGISTICS').length,
      resolved: alerts.filter((a) => a.status === 'ACKNOWLEDGED' || a.status === 'SNOOZED').length,
    };
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      // Tab filter
      if (activeTab === 'ACTIVE' && alert.status !== 'ACTIVE') return false;
      if (activeTab === 'CRITICAL' && alert.severity !== 'CRITICAL') return false;
      if (activeTab === 'WARNING' && alert.severity !== 'WARNING') return false;
      if (activeTab === 'BUFFER' && alert.category !== 'BUFFER') return false;
      if (activeTab === 'LOGISTICS' && alert.category !== 'LOGISTICS') return false;
      if (activeTab === 'RESOLVED' && alert.status === 'ACTIVE') return false;

      // Text search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = alert.title.toLowerCase().includes(query);
        const matchesDesc = alert.description.toLowerCase().includes(query);
        const matchesTarget = alert.targetName.toLowerCase().includes(query);
        return matchesTitle || matchesDesc || matchesTarget;
      }

      return true;
    });
  }, [alerts, activeTab, searchQuery]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[24px]">
            crisis_alert
          </span>
          <span className="text-base font-bold text-on-surface dark:text-white">
            SCADA Alerts & Line-Stop Risk Center
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-error text-white">
            {counts.active} Active
          </span>
        </div>
      }
      subtitle="Real-time telemetry alerts generated from JIT customer buffers, warehouse BOM safety stock, shop floor machinery, and highway logistics."
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-secondary dark:text-[#94a3b8] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-error animate-ping" />
            <span>
              {counts.critical} critical line-stop risks · {counts.warning} warning thresholds
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-surface-container dark:bg-[#162035] hover:bg-surface-container-high text-on-surface dark:text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Controls: Search Bar & Filter Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-2 border-b border-outline-variant/20 dark:border-[#222e4a]">
          {/* Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'ALL'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface-container dark:bg-[#131c31] text-secondary hover:text-on-surface dark:hover:text-white'
              }`}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ACTIVE')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'ACTIVE'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface-container dark:bg-[#131c31] text-secondary hover:text-on-surface dark:hover:text-white'
              }`}
            >
              Active ({counts.active})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('CRITICAL')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'CRITICAL'
                  ? 'bg-error text-white shadow-xs'
                  : 'bg-surface-container dark:bg-[#131c31] text-error dark:text-red-400 hover:bg-error/10'
              }`}
            >
              Critical ({counts.critical})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('WARNING')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'WARNING'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-surface-container dark:bg-[#131c31] text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              Warning ({counts.warning})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('BUFFER')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'BUFFER'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface-container dark:bg-[#131c31] text-secondary hover:text-on-surface dark:hover:text-white'
              }`}
            >
              Buffers ({counts.buffer})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('RESOLVED')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'RESOLVED'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface-container dark:bg-[#131c31] text-secondary hover:text-on-surface dark:hover:text-white'
              }`}
            >
              Muted / Ack ({counts.resolved})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px]">
            <span className="material-symbols-outlined text-[16px] text-secondary absolute left-2.5 top-1/2 -translate-y-1/2">
              search
            </span>
            <input
              type="text"
              placeholder="Filter alerts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 bg-surface-container dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a] rounded-lg text-xs text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Alerts Grid / Cards */}
        <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
          {filteredAlerts.length === 0 ? (
            <div className="py-12 text-center text-secondary dark:text-[#94a3b8]">
              <span className="material-symbols-outlined text-[40px] text-emerald-500 mb-1">
                check_circle
              </span>
              <p className="font-bold text-sm text-on-surface dark:text-white">
                No alerts found
              </p>
              <p className="text-xs mt-0.5">
                {searchQuery ? 'Try clearing your search query.' : 'All system indicators are within normal operating parameters.'}
              </p>
            </div>
          ) : (
            filteredAlerts.map((alert) => {
              const isCritical = alert.severity === 'CRITICAL';
              const isAcknowledged = alert.status === 'ACKNOWLEDGED';
              const isSnoozed = alert.status === 'SNOOZED';

              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isCritical
                      ? 'bg-error/5 dark:bg-red-950/20 border-error/30 dark:border-red-900/50'
                      : 'bg-surface-container-low dark:bg-[#131c31] border-outline-variant/30 dark:border-[#222e4a]'
                  } ${isAcknowledged || isSnoozed ? 'opacity-65' : ''}`}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    {/* Title & Category */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isCritical
                            ? 'bg-error text-white shadow-xs'
                            : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {alert.category === 'BUFFER'
                            ? 'hourglass_top'
                            : alert.category === 'MACHINE'
                            ? 'precision_manufacturing'
                            : alert.category === 'BOM'
                            ? 'inventory_2'
                            : 'local_shipping'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-on-surface dark:text-white">
                            {alert.title}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                              isCritical
                                ? 'bg-error/20 text-error dark:text-red-300 border border-error/30'
                                : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {alert.severity}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-surface-container dark:bg-[#1e293b] text-secondary">
                            {alert.category}
                          </span>
                        </div>
                        <span className="text-[11px] text-secondary dark:text-[#94a3b8]">
                          Target: {alert.targetName} · Source: {alert.createdAt}
                        </span>
                      </div>
                    </div>

                    {/* Live Countdown Badge for Buffers */}
                    {alert.runOutHours !== undefined && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container dark:bg-[#1a253d] border border-outline-variant/30 dark:border-[#2a395c] shrink-0 font-mono text-xs font-bold text-error dark:text-red-400 whitespace-nowrap">
                        <span className="material-symbols-outlined text-[15px] animate-pulse shrink-0">timer</span>
                        <span className="whitespace-nowrap">{formatCountdown(alert.runOutHours)} to line stop</span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-on-surface-variant dark:text-[#cbd5e1] mt-2.5 leading-relaxed">
                    {alert.description}
                  </p>

                  {/* Action Bar */}
                  <div className="mt-3 pt-2.5 border-t border-outline-variant/15 dark:border-[#222e4a]/60 flex items-center justify-between gap-3">
                    <div className="text-[11px] text-secondary dark:text-[#94a3b8] flex items-center gap-1.5">
                      {isAcknowledged ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">check_circle</span>
                          Acknowledged at {alert.acknowledgedAt || 'earlier'}
                        </span>
                      ) : isSnoozed ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">snooze</span>
                          Snoozed for 15 minutes
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-error dark:text-red-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-error animate-ping" />
                          Action Required
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSnooze(alert.id, 15)}
                        disabled={isSnoozed}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                          isSnoozed
                            ? 'bg-surface-container text-secondary/40 cursor-not-allowed'
                            : 'bg-surface-container dark:bg-[#1e293b] text-secondary dark:text-[#94a3b8] hover:text-on-surface dark:hover:text-white hover:bg-surface-container-high'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">snooze</span>
                        <span>Snooze 15m</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onAcknowledge(alert.id)}
                        disabled={isAcknowledged}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                          isAcknowledged
                            ? 'bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 cursor-not-allowed'
                            : 'bg-primary text-white hover:bg-primary-container shadow-xs'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">done</span>
                        <span>{isAcknowledged ? 'Acknowledged' : 'Acknowledge'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
