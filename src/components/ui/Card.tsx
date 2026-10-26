import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'glass' | 'alert';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  variant = 'default',
  padding = 'md',
  header,
  footer,
  ...props
}) => {
  const paddingStyles = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4 md:p-5',
    lg: 'p-5 md:p-6',
  }[padding];

  const variantStyles = {
    default:
      'bg-surface-container-lowest border border-outline-variant/30 dark:border-[#222e4a] text-on-surface shadow-sm',
    elevated:
      'bg-surface-container-lowest border border-outline-variant/40 dark:border-[#243352] text-on-surface shadow-md dark:shadow-black/40',
    glass:
      'bg-surface-container-lowest/90 backdrop-blur-md border border-outline-variant/30 dark:border-[#222e4a] text-on-surface shadow-sm',
    alert:
      'bg-surface-container-lowest border border-error/40 dark:border-red-500/40 text-on-surface shadow-[0_0_15px_rgba(239,68,68,0.08)]',
  }[variant];

  return (
    <div
      className={`rounded-xl transition-all duration-200 ${variantStyles} ${className}`}
      {...props}
    >
      {header && (
        <div className="px-4 py-3 border-b border-outline-variant/20 dark:border-[#222e4a] flex items-center justify-between">
          {header}
        </div>
      )}
      <div className={paddingStyles}>{children}</div>
      {footer && (
        <div className="px-4 py-3 bg-surface-container-low/50 dark:bg-[#0d1726]/50 border-t border-outline-variant/20 dark:border-[#222e4a] rounded-b-xl flex items-center justify-between">
          {footer}
        </div>
      )}
    </div>
  );
};
