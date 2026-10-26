import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { MACHINES } from '../../data/mockData';
import { useBharatApex } from '../../context';
import { WorkOrder } from '../../types';

export interface NewWorkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const NewWorkOrderModal: React.FC<NewWorkOrderModalProps> = ({
  isOpen,
  onClose,
  onToast,
}) => {
  const { addWorkOrder } = useBharatApex();

  const [customer, setCustomer] = useState('Tata Motors');
  const [partName, setPartName] = useState('');
  const [partCode, setPartCode] = useState('');
  const [quantity, setQuantity] = useState(500);
  const [machineId, setMachineId] = useState(MACHINES[0].id);
  const [dueShift, setDueShift] = useState('Today Shift B (15:30)');
  const [priority, setPriority] = useState<'Standard' | 'Rush' | 'Buffer'>('Standard');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partName.trim() || !partCode.trim()) {
      onToast('Please fill all required work order fields.', 'warning');
      return;
    }

    const newWoId = `WO-${Math.floor(9835 + Math.random() * 100)}`;
    const newWorkOrder: WorkOrder = {
      id: newWoId,
      oemName: customer,
      partDescription: partName,
      partNumber: partCode,
      quantity,
      stage: 'RAW_PREP',
      progress: 5,
      machineId,
      dueShift,
      dueTime: dueShift.includes('15:30') ? '15:30' : '07:30',
      scrapCount: 0,
      scrapRate: '0 pcs (0.0%)',
      status: priority === 'Rush' ? 'RUSH' : 'IN_PROGRESS',
      priority,
    };

    addWorkOrder(newWorkOrder);
    onToast(`Work Order #${newWoId} scheduled on ${machineId}.`, 'success');
    onClose();

    // Reset form
    setPartName('');
    setPartCode('');
    setQuantity(500);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Schedule New Work Order"
      subtitle="Assign production capacity in APS planner"
      icon={<span className="material-symbols-outlined text-[20px]">add_task</span>}
      maxWidth="xl"
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
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-container transition-colors shadow-sm"
          >
            Commit Work Order
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
        <div>
          <label htmlFor="new-wo-customer" className="font-semibold text-secondary dark:text-[#94a3b8] uppercase text-[10px] block mb-1">
            OEM Customer *
          </label>
          <select
            id="new-wo-customer"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="w-full h-9 px-3 rounded-lg bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/40 dark:border-[#243352] text-on-surface dark:text-white text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="Tata Motors">Tata Motors (Sanand / Pune)</option>
            <option value="Mahindra">Mahindra & Mahindra (Chakan Line 1)</option>
            <option value="Maruti Suzuki">Maruti Suzuki India (Manesar)</option>
            <option value="Hyundai India">Hyundai Motor India (Sriperumbudur)</option>
            <option value="Bajaj Auto">Bajaj Auto Ltd (Waluj / Chakan)</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="new-wo-part-desc" className="font-semibold text-secondary dark:text-[#94a3b8] uppercase text-[10px] block mb-1">
              Part Description *
            </label>
            <input
              id="new-wo-part-desc"
              type="text"
              required
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              placeholder="e.g. Front Axle Beam"
              className="w-full h-9 px-3 rounded-lg bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/40 dark:border-[#243352] text-on-surface dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="new-wo-part-code" className="font-semibold text-secondary dark:text-[#94a3b8] uppercase text-[10px] block mb-1">
              Part / Drawing Code *
            </label>
            <input
              id="new-wo-part-code"
              type="text"
              required
              value={partCode}
              onChange={(e) => setPartCode(e.target.value)}
              placeholder="e.g. BA-TATA-401"
              className="w-full h-9 px-3 rounded-lg bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/40 dark:border-[#243352] text-on-surface dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="new-wo-batch-size" className="font-semibold text-secondary dark:text-[#94a3b8] uppercase text-[10px] block mb-1">
              Batch Size (Pcs) *
            </label>
            <input
              id="new-wo-batch-size"
              type="number"
              min="50"
              max="10000"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
              className="w-full h-9 px-3 rounded-lg bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/40 dark:border-[#243352] text-on-surface dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Machine dropdown built strictly from MACHINES */}
          <div>
            <label htmlFor="new-wo-machine-select" className="font-semibold text-secondary dark:text-[#94a3b8] uppercase text-[10px] block mb-1">
              Assigned Cell (from MACHINES master) *
            </label>
            <select
              id="new-wo-machine-select"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/40 dark:border-[#243352] text-on-surface dark:text-white text-xs font-mono font-medium focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {MACHINES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.model} ({m.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="new-wo-due-shift" className="font-semibold text-secondary dark:text-[#94a3b8] uppercase text-[10px] block mb-1">
              Target Due Shift
            </label>
            <select
              id="new-wo-due-shift"
              value={dueShift}
              onChange={(e) => setDueShift(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/40 dark:border-[#243352] text-on-surface dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="Today Shift B (15:30)">Today Shift B (15:30)</option>
              <option value="Today Shift C (23:30)">Today Shift C (23:30)</option>
              <option value="Tomorrow Shift A (07:30)">Tomorrow Shift A (07:30)</option>
            </select>
          </div>
          <div>
            <label htmlFor="new-wo-priority" className="font-semibold text-secondary dark:text-[#94a3b8] uppercase text-[10px] block mb-1">
              Priority Class
            </label>
            <select
              id="new-wo-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'Standard' | 'Rush' | 'Buffer')}
              className="w-full h-9 px-3 rounded-lg bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/40 dark:border-[#243352] text-on-surface dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="Standard">Standard JIT Sequence</option>
              <option value="Rush">Rush Line Priority (Hot Sequence)</option>
              <option value="Buffer">Buffer Staging Stock</option>
            </select>
          </div>
        </div>
      </form>
    </Modal>
  );
};
