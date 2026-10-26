import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center bg-surface-container-low/30 dark:bg-[#0d1726]/40 rounded-xl border border-dashed border-outline-variant/50 dark:border-[#243352] ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-surface-container dark:bg-[#162035] text-secondary dark:text-[#94a3b8] flex items-center justify-center mb-3">
        {icon ?? <span className="material-symbols-outlined text-[28px]">inbox</span>}
      </div>
      <h4 className="text-sm font-bold text-on-surface dark:text-white mb-1">{title}</h4>
      {description && (
        <p className="text-xs text-secondary dark:text-[#94a3b8] max-w-sm mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-semibold hover:bg-primary-container transition-colors shadow-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
