import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { StatusBadge } from '../ui/StatusBadge';
import { WorkOrder } from '../../types';
import { useBharatApex } from '../../context';

export interface WorkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrder | null;
  onToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const WorkOrderModal: React.FC<WorkOrderModalProps> = ({
  isOpen,
  onClose,
  workOrder,
  onToast,
}) => {
  const { advanceWorkOrder, logScrapDisruption } = useBharatApex();
  const [scrapInput, setScrapInput] = useState('');
  const [scrapReason, setScrapReason] = useState('Tool Chatter Mark');

  if (!workOrder) return null;

  const handleAdvance = () => {
    advanceWorkOrder(workOrder.id);
    onToast(`WO #${workOrder.id} stage progression confirmed.`, 'success');
    onClose();
  };

  const handleLogScrap = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(scrapInput, 10);
    if (!count || count <= 0) {
      onToast('Please enter a valid scrap quantity.', 'warning');
      return;
    }
    logScrapDisruption(workOrder.id, count, scrapReason);
    onToast(`Logged ${count} scrap pcs on WO #${workOrder.id}.`, 'info');
    setScrapInput('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Work Order #${workOrder.id}`}
      subtitle={`${workOrder.oemName} · ${workOrder.partDescription}`}
      icon={<span className="material-symbols-outlined text-[20px]">assignment</span>}
      maxWidth="xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-outline-variant/30 dark:border-[#243352] text-xs font-semibold hover:bg-surface-container transition-colors"
          >
            Close (Esc)
          </button>
          <button
            type="button"
            onClick={handleAdvance}
            className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-container transition-colors shadow-sm flex items-center gap-1.5"
          >
            <span>Advance Next Stage</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Header telemetry summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-lg bg-surface-container-low dark:bg-[#0d1726]">
            <span className="text-[10px] text-secondary dark:text-[#94a3b8] uppercase font-semibold block">
              Quantity
            </span>
            <span className="font-mono text-sm font-bold text-on-surface dark:text-white">
              {workOrder.quantity} pcs
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-surface-container-low dark:bg-[#0d1726]">
            <span className="text-[10px] text-secondary dark:text-[#94a3b8] uppercase font-semibold block">
              Stage
            </span>
            <span className="font-mono text-xs font-bold text-primary dark:text-indigo-400">
              {workOrder.stage}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-surface-container-low dark:bg-[#0d1726]">
            <span className="text-[10px] text-secondary dark:text-[#94a3b8] uppercase font-semibold block">
              Cell
            </span>
            <span className="font-mono text-xs font-semibold text-on-surface dark:text-white truncate block">
              {workOrder.machineId}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-surface-container-low dark:bg-[#0d1726]">
            <span className="text-[10px] text-secondary dark:text-[#94a3b8] uppercase font-semibold block">
              Status
            </span>
            <StatusBadge status={workOrder.status} />
          </div>
        </div>

        {/* Progress bar */}
        <div className="p-3 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a]">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-on-surface dark:text-white">Production Progress</span>
            <span className="font-mono font-bold text-primary dark:text-indigo-400">
              {workOrder.progress}% Complete
            </span>
          </div>
          <div className="w-full bg-surface-container-highest dark:bg-[#1f2c47] h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${workOrder.progress}%` }}
            />
          </div>
        </div>

        {/* Log Scrap Sub-form */}
        <form onSubmit={handleLogScrap} className="p-3 rounded-lg bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/30 dark:border-[#222e4a] flex flex-col gap-2">
          <span className="text-xs font-bold text-on-surface dark:text-white">
            Log Quality Non-Conformance / Scrap
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="scrap-quantity" className="text-[10px] uppercase font-semibold text-secondary dark:text-[#94a3b8] block mb-1">
                Scrap Count (Pcs)
              </label>
              <input
                id="scrap-quantity"
                type="number"
                min="1"
                max={workOrder.quantity}
                value={scrapInput}
                onChange={(e) => setScrapInput(e.target.value)}
                placeholder="e.g. 5"
                className="w-full h-8 px-2.5 rounded bg-surface-container dark:bg-[#162035] border border-outline-variant/40 dark:border-[#243352] text-xs text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="defect-reason" className="text-[10px] uppercase font-semibold text-secondary dark:text-[#94a3b8] block mb-1">
                Defect Reason
              </label>
              <select
                id="defect-reason"
                value={scrapReason}
                onChange={(e) => setScrapReason(e.target.value)}
                className="w-full h-8 px-2.5 rounded bg-surface-container dark:bg-[#162035] border border-outline-variant/40 dark:border-[#243352] text-xs text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="Tool Chatter Mark">Tool Chatter Mark</option>
                <option value="Dimensional Drift (&gt;15um)">Dimensional Drift (&gt;15um)</option>
                <option value="Hydraulic Clamp Distortion">Hydraulic Clamp Distortion</option>
                <option value="Raw Material Void in Casting">Raw Material Void in Casting</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="self-end mt-1 px-3 py-1 bg-surface-container dark:bg-[#1f2c47] text-error dark:text-red-400 hover:bg-error-container hover:text-on-error-container rounded text-xs font-semibold border border-error/30 transition-colors"
          >
            + Log Scrap Entry
          </button>
        </form>
      </div>
    </Modal>
  );
};
