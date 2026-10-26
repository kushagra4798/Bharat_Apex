import React from 'react';

export interface KpiCardProps {
  label: string;
  value: string | number;
  badgeText?: string;
  badgeVariant?: 'error' | 'warning' | 'success' | 'info' | 'neutral';
  icon?: React.ReactNode;
  subtitle?: string;
  valueColor?: 'default' | 'error' | 'success' | 'primary' | 'warning';
  className?: string;
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  badgeText,
  badgeVariant = 'neutral',
  icon,
  subtitle,
  valueColor = 'default',
  className = '',
  onClick,
}) => {
  const badgeStyles = {
    error:
      'bg-error-container text-on-error-container border border-error/30 dark:bg-red-950/80 dark:text-red-300 dark:border-red-800/80',
    warning:
      'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800/80',
    success:
      'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800/80',
    info:
      'bg-primary-container/20 text-primary border border-primary/30 dark:bg-indigo-950/80 dark:text-indigo-300 dark:border-indigo-800/80',
    neutral:
      'bg-surface-container-highest text-on-surface dark:bg-[#1a253d] dark:text-[#94a3b8] dark:border-[#243352]',
  }[badgeVariant];

  const valueStyles = {
    default: 'text-on-surface dark:text-white',
    error: 'text-error dark:text-[#f87171] drop-shadow-[0_0_10px_rgba(248,113,113,0.15)]',
    success: 'text-tertiary dark:text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.15)]',
    primary: 'text-primary dark:text-indigo-400',
    warning: 'text-amber-600 dark:text-amber-400',
  }[valueColor];

  // Render numeric characters in monospace font, and symbols / text in standard font
  const renderFormattedValue = (val: string | number) => {
    if (typeof val === 'number') {
      return <span className="font-mono">{val}</span>;
    }
    const parts = val.split(/([0-9]+(?:[.,][0-9]+)*)/g);
    return parts.map((part, idx) => {
      if (/^[0-9]+(?:[.,][0-9]+)*$/.test(part)) {
        return (
          <span key={idx} className="font-mono">
            {part}
          </span>
        );
      }
      return (
        <span key={idx} className="font-sans font-medium">
          {part}
        </span>
      );
    });
  };

  return (
    <div
      onClick={onClick}
      className={`bg-surface-container-lowest border border-outline-variant/30 dark:border-[#222e4a] rounded-xl p-4 md:p-5 flex flex-col justify-between shadow-sm hover:shadow-md dark:hover:border-primary/40 transition-all ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-secondary dark:text-[#94a3b8] truncate">
          {label}
        </span>
        {badgeText && (
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap inline-flex items-center justify-center shrink-0 ${badgeStyles}`}>
            {badgeText}
          </span>
        )}
      </div>

      <div className="my-1.5 overflow-hidden">
        <span className={`text-2xl md:text-3xl font-bold tracking-tight whitespace-nowrap inline-block ${valueStyles}`}>
          {renderFormattedValue(value)}
        </span>
      </div>

      {(icon || subtitle) && (
        <div className="flex items-center gap-1.5 pt-1.5 text-[12px] text-secondary dark:text-[#94a3b8]">
          {icon && <span className="shrink-0 flex items-center justify-center">{icon}</span>}
          {subtitle && <span className="truncate">{subtitle}</span>}
        </div>
      )}
    </div>
  );
};
