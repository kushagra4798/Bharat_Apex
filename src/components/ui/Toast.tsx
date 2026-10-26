import React from 'react';

export interface ToastItem {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  timestamp?: number;
}

export interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const iconName = {
    info: 'info',
    success: 'check_circle',
    warning: 'warning',
    error: 'error',
  }[toast.type ?? 'info'];

  const iconColor = {
    info: 'text-primary dark:text-indigo-400',
    success: 'text-tertiary dark:text-emerald-400',
    warning: 'text-amber-500',
    error: 'text-error dark:text-red-400',
  }[toast.type ?? 'info'];

  return (
    <div
      role="alert"
      className="bg-inverse-surface text-inverse-on-surface dark:bg-[#131c31] dark:text-white dark:border dark:border-[#222e4a] px-4 py-3 rounded-xl shadow-xl text-xs md:text-sm font-sans flex items-center gap-3 pointer-events-auto transition-all animate-in slide-in-from-bottom-2 duration-200"
    >
      <span className={`material-symbols-outlined text-[20px] ${iconColor}`}>{iconName}</span>
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-outline hover:text-inverse-on-surface dark:text-[#94a3b8] dark:hover:text-white p-1 rounded-md transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<{
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
