import React from 'react';
import { SystemAlert } from '../../types';
import { formatCountdown } from '../../services/calculations';

export interface AlertsDropdownProps {
  alerts: SystemAlert[];
  onAcknowledge: (alertId: string) => void;
  onSnooze: (alertId: string, durationMinutes?: number) => void;
  onOpenFullPanel: () => void;
  onClose: () => void;
}

export const AlertsDropdown: React.FC<AlertsDropdownProps> = ({
  alerts,
  onAcknowledge,
  onSnooze,
  onOpenFullPanel,
  onClose,
}) => {
  const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE');
  const criticalCount = activeAlerts.filter((a) => a.severity === 'CRITICAL').length;
  const warningCount = activeAlerts.filter((a) => a.severity === 'WARNING').length;

  return (
    <div
      role="region"
      aria-label="Alerts Dropdown"
      className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface-container-lowest dark:bg-[#0f172a] border border-outline-variant/40 dark:border-[#222e4a] rounded-xl shadow-2xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-outline-variant/20 dark:border-[#222e4a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[18px]">
            notifications_active
          </span>
          <span className="font-bold text-sm text-on-surface dark:text-white">
            Alerts Center
          </span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-error text-white">
            {activeAlerts.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          {criticalCount > 0 && (
            <span className="text-error dark:text-red-400 font-bold">
              {criticalCount} Crit
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-amber-500 font-bold">
              {warningCount} Warn
            </span>
          )}
        </div>
      </div>

      {/* Alerts List */}
      <div className="max-h-80 overflow-y-auto divide-y divide-outline-variant/10 dark:divide-[#222e4a]/60">
        {activeAlerts.length === 0 ? (
          <div className="p-6 text-center text-secondary dark:text-[#94a3b8]">
            <span className="material-symbols-outlined text-[32px] text-emerald-500 mb-1">
              verified
            </span>
            <p className="font-semibold text-xs text-on-surface dark:text-white">
              All Clear
            </p>
            <p className="text-[11px] mt-0.5">
              No active line-stop, BOM deficit, or logistics alerts.
            </p>
          </div>
        ) : (
          activeAlerts.slice(0, 5).map((alert) => (
            <div
              key={alert.id}
              className={`p-3 transition-colors ${
                alert.severity === 'CRITICAL'
                  ? 'bg-error/5 hover:bg-error/10 dark:bg-red-950/20 dark:hover:bg-red-950/30'
                  : 'hover:bg-surface-container dark:hover:bg-[#1e293b]/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`material-symbols-outlined text-[16px] shrink-0 ${
                      alert.severity === 'CRITICAL'
                        ? 'text-error dark:text-red-400 animate-pulse'
                        : 'text-amber-500'
                    }`}
                  >
                    {alert.category === 'BUFFER'
                      ? 'hourglass_top'
                      : alert.category === 'MACHINE'
                      ? 'precision_manufacturing'
                      : alert.category === 'BOM'
                      ? 'inventory_2'
                      : 'local_shipping'}
                  </span>
                  <span className="font-bold text-xs text-on-surface dark:text-white truncate">
                    {alert.title}
                  </span>
                </div>
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold shrink-0 ${
                    alert.severity === 'CRITICAL'
                      ? 'bg-error/20 text-error dark:text-red-300'
                      : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {alert.severity}
                </span>
              </div>

              <p className="text-[11px] text-secondary dark:text-[#94a3b8] mt-1 leading-snug line-clamp-2">
                {alert.description}
              </p>

              {/* Live Countdown & Actions */}
              <div className="mt-2 flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/10 dark:border-[#222e4a]/40">
                {alert.runOutHours !== undefined ? (
                  <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-error dark:text-red-400">
                    <span className="material-symbols-outlined text-[13px]">timer</span>
                    <span>{formatCountdown(alert.runOutHours)} to line stop</span>
                  </div>
                ) : (
                  <span className="text-[10px] text-secondary dark:text-[#64748b]">
                    {alert.createdAt}
                  </span>
                )}

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSnooze(alert.id, 15)}
                    title="Snooze this alert for 15 minutes"
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-container dark:bg-[#1e293b] text-secondary dark:text-[#94a3b8] hover:text-on-surface dark:hover:text-white hover:bg-surface-container-high transition-colors"
                  >
                    Snooze 15m
                  </button>
                  <button
                    type="button"
                    onClick={() => onAcknowledge(alert.id)}
                    title="Acknowledge alert"
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-primary text-white hover:bg-primary-container transition-colors shadow-xs"
                  >
                    Acknowledge
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 pt-2 pb-1 border-t border-outline-variant/20 dark:border-[#222e4a] flex items-center justify-between">
        <span className="text-[10px] text-secondary dark:text-[#64748b]">
          Total Alerts: {alerts.length}
        </span>
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenFullPanel();
          }}
          className="text-xs font-bold text-primary dark:text-indigo-400 hover:underline flex items-center gap-1"
        >
          <span>View Alerts Panel</span>
          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
};
