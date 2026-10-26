import { useState, useCallback, useEffect } from 'react';
import { ToastItem } from '../components/ui/Toast';

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastItem = {
      id,
      message,
      type,
      timestamp: Date.now(),
    };

    setToasts((prev) => [...prev, newToast]);

    // Requirements specify auto-dismiss after 4.5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Listen to global custom toast events
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ message: string; type?: ToastItem['type'] }>;
      if (ce.detail?.message) {
        addToast(ce.detail.message, ce.detail.type || 'info');
      }
    };
    window.addEventListener('app-toast', handler);
    return () => window.removeEventListener('app-toast', handler);
  }, [addToast]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    addToast,
    removeToast,
    clearToasts,
  };
}
