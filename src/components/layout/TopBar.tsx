import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CurrencyCode, ScenarioType, SimulationSpeed } from '../../types';
import { useBharatApex } from '../../context';
import { useSimulation } from '../../hooks';
import { generateSystemAlerts } from '../../services/calculations';
import { AlertsDropdown, AlertsPanelModal } from '../Alerts';
import { AskPlantSlideOver } from '../AskPlant';

export interface TopBarProps {
  baseCurrency: CurrencyCode;
  onCurrencyChange: (currency: CurrencyCode) => void;
  usdInrRate: number;
  isLiveRates: boolean;
  fetchTime?: string;
  onOpenFxSimulator: () => void;
  onResetDemoData: () => void;
  isDark: boolean;
  onToggleDarkMode: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  baseCurrency,
  onCurrencyChange,
  usdInrRate,
  isLiveRates,
  fetchTime,
  onOpenFxSimulator,
  onResetDemoData,
  isDark,
  onToggleDarkMode,
}) => {
  const {
    state,
    activateScenario,
    clearScenario,
    acknowledgeAlert,
    snoozeAlert,
  } = useBharatApex();

  const {
    isSimulating,
    simulationSpeed,
    toggleSimulation,
    setSimulationSpeed,
  } = useSimulation();

  const [isScenarioMenuOpen, setIsScenarioMenuOpen] = useState(false);
  const scenarioMenuRef = useRef<HTMLDivElement>(null);

  const [isAlertsDropdownOpen, setIsAlertsDropdownOpen] = useState(false);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
  const alertsMenuRef = useRef<HTMLDivElement>(null);

  const [isAskPlantOpen, setIsAskPlantOpen] = useState(false);

  // Generate live dynamic system alerts from state
  const generatedAlerts = useMemo(() => {
    return generateSystemAlerts(state);
  }, [state]);

  const activeAlerts = useMemo(() => {
    return generatedAlerts.filter((a) => a.status === 'ACTIVE');
  }, [generatedAlerts]);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        scenarioMenuRef.current &&
        !scenarioMenuRef.current.contains(event.target as Node)
      ) {
        setIsScenarioMenuOpen(false);
      }
      if (
        alertsMenuRef.current &&
        !alertsMenuRef.current.contains(event.target as Node)
      ) {
        setIsAlertsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const speeds: SimulationSpeed[] = [1, 5, 20];

  const handleScenarioSelect = (type: ScenarioType) => {
    if (type === 'NONE') {
      clearScenario();
    } else {
      activateScenario(type);
    }
    setIsScenarioMenuOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 lg:left-72 right-0 h-16 bg-surface-container-lowest dark:bg-[#0e1526] border-b border-outline-variant/30 dark:border-[#222e4a] z-40 shadow-[0_1px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
      <div className="h-16 w-full px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3">
        {/* Plant Cockpit Title */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[16px]">precision_manufacturing</span>
            </div>
            <span className="font-bold text-sm text-on-surface dark:text-white">BHARAT APEX</span>
          </div>

          <div className="hidden sm:flex flex-col">
            <span className="text-sm font-bold text-on-surface dark:text-white leading-tight">
              Chakan Assembly Complex
            </span>
            <span className="text-[11px] text-secondary dark:text-cyan-400 font-medium">
              Plant Cockpit · Live JIT Telemetry
            </span>
          </div>
        </div>

        {/* Center / Right: Simulation Engine Controls & Scenario Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Simulation Engine Controls (Pause/Play + Speed Selector) */}
          <div className="flex items-center bg-surface-container dark:bg-[#131c31] border border-outline-variant/40 dark:border-[#222e4a] rounded-lg p-0.5 sm:p-1 gap-1">
            {/* Play/Pause Button */}
            <button
              type="button"
              onClick={toggleSimulation}
              title={isSimulating ? 'Pause Simulation Engine' : 'Resume Simulation Engine'}
              className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-md transition-colors ${
                isSimulating
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  : 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isSimulating ? 'pause' : 'play_arrow'}
              </span>
            </button>

            {/* Speed Pills: 1x / 5x / 20x */}
            <div className="flex items-center gap-0.5">
              {speeds.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSimulationSpeed(s)}
                  title={`Set Simulation Speed to ${s}x`}
                  className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[11px] font-mono font-bold transition-colors ${
                    simulationSpeed === s
                      ? 'bg-primary dark:bg-indigo-600 text-white shadow-xs'
                      : 'text-secondary dark:text-[#94a3b8] hover:text-on-surface dark:hover:text-white hover:bg-surface-container-high'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Scenario Menu Dropdown */}
          <div className="relative" ref={scenarioMenuRef}>
            <button
              type="button"
              onClick={() => setIsScenarioMenuOpen((prev) => !prev)}
              aria-label="Simulation Scenarios Menu"
              aria-expanded={isScenarioMenuOpen}
              className={`flex items-center gap-1.5 h-[34px] sm:h-[36px] px-2 sm:px-3 rounded-lg border text-xs font-semibold transition-all shadow-xs ${
                state.activeScenario
                  ? 'bg-amber-500/10 dark:bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30'
                  : 'bg-surface-container dark:bg-[#162035] border-outline-variant/30 dark:border-[#222e4a] text-on-surface dark:text-white hover:bg-surface-container-high dark:hover:bg-[#1f2c47]'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[17px] ${
                  state.activeScenario ? 'text-amber-500 animate-bounce' : 'text-primary dark:text-indigo-400'
                }`}
              >
                {state.activeScenario ? 'warning' : 'crisis_alert'}
              </span>
              <span className="hidden md:inline">
                {state.activeScenario ? state.activeScenario.badge : 'Scenarios'}
              </span>
              <span className="md:hidden">
                {state.activeScenario ? state.activeScenario.badge : 'Scenarios'}
              </span>
              <span className="material-symbols-outlined text-[15px] opacity-70">
                {isScenarioMenuOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {/* Dropdown Menu */}
            {isScenarioMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-72 sm:w-80 bg-surface-container-lowest dark:bg-[#0f172a] border border-outline-variant/40 dark:border-[#222e4a] rounded-xl shadow-2xl py-2 z-50 text-xs">
                <div className="px-3 py-1.5 border-b border-outline-variant/20 dark:border-[#222e4a] flex items-center justify-between">
                  <span className="font-bold text-on-surface dark:text-white uppercase tracking-wider text-[10px]">
                    Disruption Scenarios
                  </span>
                  {state.activeScenario && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                      ACTIVE
                    </span>
                  )}
                </div>

                <div className="py-1">
                  {/* Scenario 1: NH-48 Monsoon */}
                  <button
                    type="button"
                    onClick={() => handleScenarioSelect('MONSOON')}
                    className={`w-full px-3 py-2 text-left flex items-start gap-2.5 hover:bg-surface-container-high dark:hover:bg-[#1e293b] transition-colors ${
                      state.activeScenario?.type === 'MONSOON'
                        ? 'bg-primary/10 dark:bg-indigo-950/40 text-primary dark:text-indigo-300'
                        : 'text-on-surface dark:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-cyan-500 text-[18px] shrink-0 mt-0.5">
                      rainy
                    </span>
                    <div>
                      <div className="font-semibold flex items-center gap-1.5">
                        <span>NH-48 Monsoon Slowdown</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-500/20 text-cyan-600 dark:text-cyan-400">
                          +90 min
                        </span>
                      </div>
                      <div className="text-[11px] text-secondary dark:text-[#94a3b8] mt-0.5 leading-snug">
                        Highway waterlogging delays outbound & inbound truck convoys by +90 min.
                      </div>
                    </div>
                  </button>

                  {/* Scenario 2: Supplier Strike */}
                  <button
                    type="button"
                    onClick={() => handleScenarioSelect('SUPPLIER_STRIKE')}
                    className={`w-full px-3 py-2 text-left flex items-start gap-2.5 hover:bg-surface-container-high dark:hover:bg-[#1e293b] transition-colors ${
                      state.activeScenario?.type === 'SUPPLIER_STRIKE'
                        ? 'bg-primary/10 dark:bg-indigo-950/40 text-primary dark:text-indigo-300'
                        : 'text-on-surface dark:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-rose-500 text-[18px] shrink-0 mt-0.5">
                      front_hand
                    </span>
                    <div>
                      <div className="font-semibold flex items-center gap-1.5">
                        <span>Tier-2 Supplier Strike</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-rose-500/20 text-rose-600 dark:text-rose-400">
                          Kalyani Steels
                        </span>
                      </div>
                      <div className="text-[11px] text-secondary dark:text-[#94a3b8] mt-0.5 leading-snug">
                        Foundry strike halts raw castings. Stock critically depleted below safety buffer.
                      </div>
                    </div>
                  </button>

                  {/* Scenario 3: Machine Breakdown */}
                  <button
                    type="button"
                    onClick={() => handleScenarioSelect('MACHINE_BREAKDOWN')}
                    className={`w-full px-3 py-2 text-left flex items-start gap-2.5 hover:bg-surface-container-high dark:hover:bg-[#1e293b] transition-colors ${
                      state.activeScenario?.type === 'MACHINE_BREAKDOWN'
                        ? 'bg-primary/10 dark:bg-indigo-950/40 text-primary dark:text-indigo-300'
                        : 'text-on-surface dark:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0 mt-0.5">
                      build_circle
                    </span>
                    <div>
                      <div className="font-semibold flex items-center gap-1.5">
                        <span>Machine Breakdown</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/20 text-amber-600 dark:text-amber-400">
                          CNC-01 Offline
                        </span>
                      </div>
                      <div className="text-[11px] text-secondary dark:text-[#94a3b8] mt-0.5 leading-snug">
                        5-Axis VMC bearing seizure. Machine transferred to emergency maintenance (0% OEE).
                      </div>
                    </div>
                  </button>

                  {/* Scenario 4: FX Spike */}
                  <button
                    type="button"
                    onClick={() => handleScenarioSelect('FX_SPIKE')}
                    className={`w-full px-3 py-2 text-left flex items-start gap-2.5 hover:bg-surface-container-high dark:hover:bg-[#1e293b] transition-colors ${
                      state.activeScenario?.type === 'FX_SPIKE'
                        ? 'bg-primary/10 dark:bg-indigo-950/40 text-primary dark:text-indigo-300'
                        : 'text-on-surface dark:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-indigo-500 text-[18px] shrink-0 mt-0.5">
                      trending_up
                    </span>
                    <div>
                      <div className="font-semibold flex items-center gap-1.5">
                        <span>USD/INR FX Spike</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                          +5.0% USD
                        </span>
                      </div>
                      <div className="text-[11px] text-secondary dark:text-[#94a3b8] mt-0.5 leading-snug">
                        Sudden +5% USD surge elevates landed costs across imported bearings and alloy parts.
                      </div>
                    </div>
                  </button>
                </div>

                {/* Clear Scenario Action */}
                <div className="pt-1.5 mt-1 border-t border-outline-variant/20 dark:border-[#222e4a] px-2">
                  <button
                    type="button"
                    disabled={!state.activeScenario}
                    onClick={() => handleScenarioSelect('NONE')}
                    className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${
                      state.activeScenario
                        ? 'bg-surface-container dark:bg-[#1e293b] text-error dark:text-red-400 hover:bg-error/10 dark:hover:bg-red-500/20'
                        : 'text-secondary/40 dark:text-[#64748b]/40 cursor-not-allowed'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                    <span>Clear Active Scenario</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Currency Selector */}
          <div className="hidden lg:flex items-center gap-1.5">
            <select
              aria-label="Base Currency"
              value={baseCurrency}
              onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode)}
              className="h-[34px] sm:h-[36px] px-2.5 bg-surface-container-low dark:bg-[#131c31] border border-outline-variant/40 dark:border-[#222e4a] text-on-surface dark:text-white rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary shadow-xs cursor-pointer"
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="CNY">CNY (¥)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>

          {/* Live Rate Pill */}
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1 bg-surface-container dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a] rounded-full text-xs">
            <span className="font-mono font-bold text-on-surface dark:text-white">
              USD/INR {usdInrRate.toFixed(2)}
            </span>
            <span
              className={`text-[11px] font-semibold ${
                isLiveRates
                  ? 'text-tertiary dark:text-emerald-400'
                  : 'text-secondary dark:text-[#94a3b8]'
              }`}
            >
              {isLiveRates
                ? `Live${fetchTime ? ` (${fetchTime})` : ''}`
                : `Offline rates${fetchTime ? ` (${fetchTime})` : ''}`}
            </span>
          </div>

          {/* FX Simulator Button */}
          <button
            type="button"
            onClick={onOpenFxSimulator}
            className="hidden sm:flex items-center gap-1.5 h-[34px] sm:h-[36px] px-2.5 sm:px-3 rounded-lg bg-surface-container dark:bg-[#162035] border border-outline-variant/30 dark:border-[#222e4a] text-xs font-semibold text-on-surface dark:text-white hover:bg-surface-container-high dark:hover:bg-[#1f2c47] hover:border-primary/40 transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px] text-primary dark:text-indigo-400">
              currency_exchange
            </span>
            <span className="hidden md:inline">FX Simulator</span>
          </button>

          {/* Ask the Plant AI Chat Button */}
          <button
            type="button"
            onClick={() => setIsAskPlantOpen(true)}
            title="Ask the Plant AI Assistant (Gemini Function Calling)"
            className="flex items-center gap-1.5 h-[34px] sm:h-[36px] px-2.5 sm:px-3 rounded-lg bg-gradient-to-r from-primary/10 to-indigo-500/10 dark:from-primary/20 dark:to-indigo-500/20 border border-primary/30 dark:border-indigo-500/40 text-xs font-bold text-primary dark:text-indigo-300 hover:bg-primary/20 dark:hover:bg-primary/30 transition-all shadow-xs"
          >
            <span className="material-symbols-outlined text-[17px] text-primary dark:text-indigo-400 animate-pulse">
              smart_toy
            </span>
            <span className="hidden md:inline">Ask the Plant</span>
          </button>

          {/* Reset Demo Data Button */}
          <button
            type="button"
            onClick={onResetDemoData}
            title="Reset All Domain State to Initial Seed Baseline"
            className="flex items-center gap-1.5 h-[34px] sm:h-[36px] px-2 sm:px-2.5 rounded-lg bg-surface-container dark:bg-[#162035] border border-outline-variant/30 dark:border-[#222e4a] text-xs font-semibold text-secondary dark:text-[#94a3b8] hover:text-on-surface dark:hover:text-white hover:bg-surface-container-high transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
            <span className="hidden xl:inline">Reset</span>
          </button>

          {/* Dark Mode Toggle */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label="Dark Mode Toggle"
            title={isDark ? 'Dark Mode Active (Click for Light Mode)' : 'Light Mode Active (Click for Dark Mode)'}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/40 dark:border-[#222e4a] text-amber-500 hover:text-amber-400 shadow-xs flex items-center justify-center transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-[18px] sm:text-[19px]">
              {isDark ? 'dark_mode' : 'light_mode'}
            </span>
          </button>

          {/* Alerts Center Bell Dropdown Trigger */}
          <div className="relative" ref={alertsMenuRef}>
            <button
              type="button"
              onClick={() => setIsAlertsDropdownOpen((prev) => !prev)}
              aria-label="Alerts Center"
              aria-expanded={isAlertsDropdownOpen}
              title={`Alerts Center (${activeAlerts.length} active alerts)`}
              className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg border flex items-center justify-center transition-colors shrink-0 shadow-xs ${
                activeAlerts.length > 0
                  ? 'bg-surface-container dark:bg-[#131c31] border-error/40 text-error dark:text-red-400 hover:bg-error/10'
                  : 'bg-surface-container dark:bg-[#131c31] border-outline-variant/40 dark:border-[#222e4a] text-secondary hover:text-on-surface dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[19px]">notifications</span>
              {activeAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
                  <span className="relative inline-flex items-center justify-center rounded-full h-4 w-4 bg-error text-white text-[9px] font-mono font-bold shadow-xs">
                    {activeAlerts.length > 9 ? '9+' : activeAlerts.length}
                  </span>
                </span>
              )}
            </button>

            {/* Bell Dropdown */}
            {isAlertsDropdownOpen && (
              <AlertsDropdown
                alerts={generatedAlerts}
                onAcknowledge={acknowledgeAlert}
                onSnooze={snoozeAlert}
                onOpenFullPanel={() => {
                  setIsAlertsDropdownOpen(false);
                  setIsAlertsModalOpen(true);
                }}
                onClose={() => setIsAlertsDropdownOpen(false)}
              />
            )}
          </div>

          {/* User Profile Avatar */}
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 ring-2 ring-outline-variant/20 dark:ring-[#222e4a] shrink-0">
            <span className="material-symbols-outlined text-[15px] sm:text-[17px]">person</span>
          </div>
        </div>
      </div>

      {/* Full Alerts Center Panel Modal */}
      <AlertsPanelModal
        isOpen={isAlertsModalOpen}
        onClose={() => setIsAlertsModalOpen(false)}
        alerts={generatedAlerts}
        onAcknowledge={acknowledgeAlert}
        onSnooze={snoozeAlert}
      />

      {/* Ask the Plant Slide-Over Chat Panel */}
      <AskPlantSlideOver
        isOpen={isAskPlantOpen}
        onClose={() => setIsAskPlantOpen(false)}
      />
    </header>
  );
};
