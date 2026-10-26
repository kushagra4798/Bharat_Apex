import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useBharatApex } from '../../context';

export interface FxSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const FxSimulatorModal: React.FC<FxSimulatorModalProps> = ({
  isOpen,
  onClose,
  onToast,
}) => {
  const { state, setFxShocks } = useBharatApex();
  const { currencyRates, fxShocks } = state;

  const [usdShock, setUsdShock] = useState(fxShocks.USD ?? 1.5);
  const [eurShock, setEurShock] = useState(fxShocks.EUR ?? 0.4);
  const [jpyShock, setJpyShock] = useState(fxShocks.JPY ?? -0.8);

  const newUsdRate = (currencyRates.USD * (1 + usdShock / 100)).toFixed(2);
  const deltaLakh = (Math.abs(usdShock) * 2.28 + Math.abs(eurShock) * 1.15).toFixed(2);

  const handleSave = () => {
    setFxShocks({
      ...fxShocks,
      USD: usdShock,
      EUR: eurShock,
      JPY: jpyShock,
    });
    onToast('Hedge adjustments & FX shock applied to procurement forecast.', 'success');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="FX Shock Simulator"
      subtitle="Simulate cross-currency exchange rate shocks on imported alloy child parts"
      icon={<span className="material-symbols-outlined text-[20px] text-primary">currency_exchange</span>}
      maxWidth="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-outline-variant/30 dark:border-[#243352] text-xs font-semibold hover:bg-surface-container transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-container transition-colors shadow-sm"
          >
            Lock Hedging Strategy
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-xs">
        <p className="text-secondary dark:text-[#94a3b8] leading-relaxed">
          Adjust exchange shocks to model landed margin exposure for Tier-2 child components.
        </p>

        {/* Sliders */}
        <div className="space-y-4">
          <div>
            <div className="flex justify-between font-mono mb-1">
              <span className="font-semibold text-on-surface dark:text-white">
                USD/INR Base: {currencyRates.USD}
              </span>
              <span className="font-bold text-primary dark:text-indigo-400">
                {usdShock >= 0 ? `+${usdShock}%` : `${usdShock}%`} (₹{newUsdRate})
              </span>
            </div>
            <input
              type="range"
              min="-5"
              max="5"
              step="0.1"
              value={usdShock}
              onChange={(e) => setUsdShock(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-surface-container dark:bg-[#1a253d] rounded-lg accent-primary cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between font-mono mb-1">
              <span className="font-semibold text-on-surface dark:text-white">
                EUR/INR Base: {currencyRates.EUR}
              </span>
              <span className="font-bold text-primary dark:text-indigo-400">
                {eurShock >= 0 ? `+${eurShock}%` : `${eurShock}%`}
              </span>
            </div>
            <input
              type="range"
              min="-5"
              max="5"
              step="0.1"
              value={eurShock}
              onChange={(e) => setEurShock(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-surface-container dark:bg-[#1a253d] rounded-lg accent-primary cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between font-mono mb-1">
              <span className="font-semibold text-on-surface dark:text-white">
                JPY/INR Base: {currencyRates.JPY}
              </span>
              <span className="font-bold text-primary dark:text-indigo-400">
                {jpyShock >= 0 ? `+${jpyShock}%` : `${jpyShock}%`}
              </span>
            </div>
            <input
              type="range"
              min="-5"
              max="5"
              step="0.1"
              value={jpyShock}
              onChange={(e) => setJpyShock(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-surface-container dark:bg-[#1a253d] rounded-lg accent-primary cursor-pointer"
            />
          </div>
        </div>

        {/* Projected Impact Callout */}
        <div className="p-3 bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/30 dark:border-[#222e4a] rounded-xl flex flex-col gap-1">
          <span className="text-[10px] uppercase font-semibold text-secondary dark:text-[#94a3b8]">
            Projected BOM Delta Impact
          </span>
          <span className="font-mono text-base font-bold text-error dark:text-red-400">
            ▲ +₹ {deltaLakh} Lakh / shift
          </span>
        </div>
      </div>
    </Modal>
  );
};
