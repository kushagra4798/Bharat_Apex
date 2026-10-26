import React from 'react';

export type StatusType =
  | 'RUNNING'
  | 'SETUP'
  | 'MAINTENANCE'
  | 'IDLE'
  | 'CRITICAL'
  | 'WARNING'
  | 'HEALTHY'
  | 'SAFE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'RUSH'
  | 'NORMAL';

export interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  showDot?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  showDot = true,
  className = '',
}) => {
  const norm = String(status).toUpperCase().replace(/[\s-]/g, '_');

  let badgeColor =
    'bg-surface-container text-on-surface border border-outline-variant/40 dark:bg-[#1a253d] dark:text-[#94a3b8] dark:border-[#243352]';
  let dotColor = 'bg-secondary';
  let shouldPulse = false;

  switch (norm) {
    case 'RUNNING':
    case 'HEALTHY':
    case 'SAFE':
    case 'NORMAL':
    case 'COMPLETED':
    case 'LOW':
      badgeColor =
        'bg-emerald-100/90 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800/80';
      dotColor = 'bg-emerald-500';
      shouldPulse = norm === 'RUNNING';
      break;

    case 'SETUP':
    case 'WARNING':
    case 'MEDIUM':
      badgeColor =
        'bg-amber-100/90 text-amber-800 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800/80';
      dotColor = 'bg-amber-500';
      shouldPulse = norm === 'SETUP' || norm === 'WARNING';
      break;

    case 'MAINTENANCE':
    case 'CRITICAL':
    case 'RUSH':
    case 'HIGH':
      badgeColor =
        'bg-error-container text-on-error-container border border-error/40 dark:bg-red-950/80 dark:text-red-300 dark:border-red-800/80';
      dotColor = 'bg-red-500';
      shouldPulse = true;
      break;

    case 'IN_PROGRESS':
      badgeColor =
        'bg-primary-container/20 text-primary border border-primary/30 dark:bg-indigo-950/80 dark:text-indigo-300 dark:border-indigo-800/80';
      dotColor = 'bg-primary';
      shouldPulse = true;
      break;

    case 'IDLE':
    case 'ON_HOLD':
    default:
      badgeColor =
        'bg-surface-container text-secondary border border-outline-variant/30 dark:bg-[#1a253d] dark:text-[#94a3b8] dark:border-[#243352]';
      dotColor = 'bg-secondary';
      shouldPulse = false;
      break;
  }

  const displayText = label ?? String(status).replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase font-mono ${badgeColor} ${className}`}
    >
      {showDot && (
        <span className="relative flex h-2 w-2">
          {shouldPulse && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`}
            />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
        </span>
      )}
      <span>{displayText}</span>
    </span>
  );
};
