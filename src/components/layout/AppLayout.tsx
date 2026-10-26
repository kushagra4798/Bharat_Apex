import React, { ReactNode } from 'react';
import { Sidebar, ViewPath } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNav } from './MobileNav';
import { ToastContainer } from '../ui/Toast';
import { useBharatApex } from '../../context';
import { useToast } from '../../hooks';

export interface AppLayoutProps {
  children: ReactNode;
  activeView: ViewPath;
  onSelectView: (view: ViewPath) => void;
  isDark: boolean;
  onToggleDarkMode: () => void;
  onOpenFxSimulator: () => void;
  toastControls: ReturnType<typeof useToast>;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  activeView,
  onSelectView,
  isDark,
  onToggleDarkMode,
  onOpenFxSimulator,
  toastControls,
}) => {
  const { state, setBaseCurrency, resetDemoData } = useBharatApex();

  const handleResetData = () => {
    resetDemoData();
    toastControls.addToast('All domain state reset to initial seed baseline.', 'success');
  };

  const handleCurrencyChange = (curr: typeof state.baseCurrency) => {
    setBaseCurrency(curr);
    toastControls.addToast(`Base currency switched to ${curr}`, 'info');
  };

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col transition-colors duration-200">
      {/* Desktop Sidebar Navigation */}
      <Sidebar activeView={activeView} onSelectView={onSelectView} />

      {/* Main Content Area */}
      <div className="lg:pl-72 flex flex-col min-h-screen">
        {/* Fixed Top Bar */}
        <TopBar
          baseCurrency={state.baseCurrency}
          onCurrencyChange={handleCurrencyChange}
          usdInrRate={state.currencyRates.USD}
          isLiveRates={state.isLiveRates}
          fetchTime={state.lastRatesFetchTime}
          onOpenFxSimulator={onOpenFxSimulator}
          onResetDemoData={handleResetData}
          isDark={isDark}
          onToggleDarkMode={onToggleDarkMode}
        />

        {/* Dynamic View Viewport */}
        <main className="w-full pt-20 pb-20 lg:pb-8 flex-1 px-4 sm:px-6 py-4 max-w-7xl mx-auto flex flex-col gap-6">
          {children}
        </main>

        {/* Global Plant Footer */}
        <footer className="w-full bg-surface-container-lowest dark:bg-[#0e1526] border-t border-outline-variant/30 dark:border-[#222e4a] py-4 shadow-xs mt-auto">
          <div className="w-full px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left text-xs text-secondary dark:text-[#94a3b8]">
            <p>Demo data: E-Way Bill output is illustrative and not validated against the NIC portal.</p>
            <p className="text-outline dark:text-[#64748b]">
              Bharat Apex Chakan Operations Engine v4.2.0
            </p>
          </div>
        </footer>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileNav activeView={activeView} onSelectView={onSelectView} />

      {/* Persistent Toast Notifications Container */}
      <ToastContainer toasts={toastControls.toasts} onDismiss={toastControls.removeToast} />
    </div>
  );
};
