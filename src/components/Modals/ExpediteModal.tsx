import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useBharatApex } from '../../context';

export interface ExpediteModalProps {
  isOpen: boolean;
  onClose: () => void;
  truckId: string;
  oemName: string;
  partDescription: string;
  onToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const ExpediteModal: React.FC<ExpediteModalProps> = ({
  isOpen,
  onClose,
  truckId,
  oemName,
  partDescription,
  onToast,
}) => {
  const { expediteTransit } = useBharatApex();
  const [protocol, setProtocol] = useState<'green_corridor' | 'hot_swap'>('green_corridor');

  const handleConfirm = () => {
    expediteTransit(truckId, 50);
    onToast(
      `FASTag Green Pass priority broadcast issued for convoy ${truckId} to ${oemName}.`,
      'success'
    );
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Expedite Dispatch & Highway Bypass"
      subtitle="Issue FASTag Green Corridor broadcast to NHAI toll plazas"
      icon={<span className="material-symbols-outlined text-[20px] text-error">local_shipping</span>}
      maxWidth="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-outline-variant/30 dark:border-[#243352] text-xs font-semibold hover:bg-surface-container transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-container transition-colors shadow-sm"
          >
            Issue FastTrack Order
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-xs">
        {/* Consignment info */}
        <div className="p-3 rounded-lg bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/30 dark:border-[#222e4a] flex flex-col gap-1">
          <span className="text-[10px] uppercase font-semibold text-secondary dark:text-[#94a3b8]">
            Target Consignment
          </span>
          <div className="flex justify-between items-center">
            <span className="font-mono font-bold text-sm text-on-surface dark:text-white">
              {truckId}
            </span>
            <span className="font-semibold text-primary dark:text-indigo-400">{oemName}</span>
          </div>
          <span className="text-secondary dark:text-[#94a3b8]">{partDescription}</span>
        </div>

        {/* Priority options */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase font-semibold text-secondary dark:text-[#94a3b8]">
            Priority Protocol
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                protocol === 'green_corridor'
                  ? 'bg-primary/5 border-primary/50 dark:bg-indigo-950/40 dark:border-indigo-500/50'
                  : 'bg-surface-container dark:bg-[#131c31] border-outline-variant/30 dark:border-[#243352]'
              }`}
            >
              <input
                type="radio"
                name="priority_opt"
                checked={protocol === 'green_corridor'}
                onChange={() => setProtocol('green_corridor')}
                className="mt-0.5 text-primary"
              />
              <div>
                <span className="font-semibold text-on-surface dark:text-white block">
                  Green Corridor
                </span>
                <span className="text-[10px] text-secondary dark:text-[#94a3b8]">
                  FASTag priority gate alert at Talegaon & Manor
                </span>
              </div>
            </label>

            <label
              className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                protocol === 'hot_swap'
                  ? 'bg-primary/5 border-primary/50 dark:bg-indigo-950/40 dark:border-indigo-500/50'
                  : 'bg-surface-container dark:bg-[#131c31] border-outline-variant/30 dark:border-[#243352]'
              }`}
            >
              <input
                type="radio"
                name="priority_opt"
                checked={protocol === 'hot_swap'}
                onChange={() => setProtocol('hot_swap')}
                className="mt-0.5 text-primary"
              />
              <div>
                <span className="font-semibold text-on-surface dark:text-white block">
                  Dual Driver Hot-Swap
                </span>
                <span className="text-[10px] text-secondary dark:text-[#94a3b8]">
                  Relief crew staged at Vapi border checkpoint
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Calculated gain */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container dark:bg-[#162035] border border-outline-variant/30 dark:border-[#222e4a]">
          <span className="text-secondary dark:text-[#94a3b8]">Calculated ETA Gain:</span>
          <span className="font-mono font-bold text-sm text-primary dark:text-emerald-400">
            48 Minutes Earlier (+50 units buffer boost)
          </span>
        </div>
      </div>
    </Modal>
  );
};
