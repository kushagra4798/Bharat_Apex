import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'rectangular' | 'rounded' | 'circular';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rounded',
  width,
  height,
}) => {
  const variantStyles = {
    rectangular: 'rounded-none',
    rounded: 'rounded-lg',
    circular: 'rounded-full',
  }[variant];

  return (
    <div
      style={{ width, height }}
      className={`animate-pulse bg-surface-container-high/80 dark:bg-[#1a253d] ${variantStyles} ${className}`}
    />
  );
};

export const SkeletonCard: React.FC = () => {
  return (
    <div className="bg-surface-container-lowest dark:bg-[#0b111e] border border-outline-variant/30 dark:border-[#222e4a] rounded-xl p-5 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <Skeleton width="40%" height={16} />
        <Skeleton width="20%" height={18} variant="circular" />
      </div>
      <Skeleton width="60%" height={32} />
      <Skeleton width="80%" height={14} />
    </div>
  );
};

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="w-full flex flex-col gap-2">
      <Skeleton width="100%" height={40} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width="100%" height={48} />
      ))}
    </div>
  );
};
