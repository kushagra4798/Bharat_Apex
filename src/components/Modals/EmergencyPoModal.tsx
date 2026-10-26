import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { useBharatApex } from '../../context';
import { BomItem } from '../../types';
import { INITIAL_SUPPLIERS } from '../../data/mockData';
import { convertCurrency, formatCurrencyValue } from '../../services/currencyService';

export interface EmergencyPoModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: BomItem | null;
  onToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const EmergencyPoModal: React.FC<EmergencyPoModalProps> = ({
  isOpen,
  onClose,
  item,
  onToast,
}) => {
  const { state, replenishBomStock, addFeedEntry } = useBharatApex();
  const { baseCurrency, currencyRates, fxShocks } = state;

  const [poNumber, setPoNumber] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [supplierId, setSupplierId] = useState('');

  // Re-initialize state when item opens
  useEffect(() => {
    if (item && isOpen) {
      const randomId = Math.floor(10000 + Math.random() * 90000);
      setPoNumber(`PO-EMG-${randomId}`);

      const deficit = Math.max(50, item.safetyStock - item.currentStock + 50);
      setQuantity(deficit);

      const defaultSup =
        INITIAL_SUPPLIERS.find((s) => s.id === item.supplierId) || INITIAL_SUPPLIERS[0];
      setSupplierId(defaultSup?.id || INITIAL_SUPPLIERS[0].id);
    }
  }, [item, isOpen]);

  const selectedSupplier = useMemo(() => {
    return INITIAL_SUPPLIERS.find((s) => s.id === supplierId) || INITIAL_SUPPLIERS[0];
  }, [supplierId]);

  if (!item) return null;

  // Cost conversions into base reporting currency
  const totalQuoted = item.unitCost * quantity;
  const totalLandedInBase = convertCurrency(
    totalQuoted,
    item.currency,
    baseCurrency,
    currencyRates,
    fxShocks
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) return;

    replenishBomStock(item.id, quantity);

    addFeedEntry(
      `Emergency PO #${poNumber} Dispatched`,
      `Procurement order dispatched to ${selectedSupplier.name} for ${quantity} pcs of #${item.partNumber}. Landed cost: ${formatCurrencyValue(totalLandedInBase, baseCurrency)}.`,
      'TELEMETRY',
      'NORMAL'
    );

    if (onToast) {
      onToast(
        `Emergency PO #${poNumber} authorized: +${quantity} pcs scheduled for #${item.partNumber}`,
        'success'
      );
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Issue Emergency Purchase Order"
      subtitle="Fast-track procurement to replenish critically depleted BOM inventory"
      icon={
        <span className="material-symbols-outlined text-[20px] text-error dark:text-red-400">
          shopping_cart_checkout
        </span>
      }
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-left font-mono">
            <span className="text-[10px] text-secondary dark:text-[#94a3b8] uppercase block">
              Total PO Landed Cost ({baseCurrency})
            </span>
            <span className="text-sm md:text-base font-bold text-primary dark:text-indigo-400">
              {formatCurrencyValue(totalLandedInBase, baseCurrency)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant/30 dark:border-[#243352] text-xs font-semibold hover:bg-surface-container transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">verified</span>
              <span>Authorize & Issue PO</span>
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
        {/* Part & Current Deficit Snapshot Card */}
        <div className="p-3.5 rounded-xl bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/30 dark:border-[#222e4a] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-primary/10 text-primary dark:bg-indigo-950/80 dark:text-indigo-400 border border-primary/20 dark:border-indigo-800">
                #{item.partNumber}
              </span>
              <span className="font-semibold text-on-surface dark:text-white">
                {item.description}
              </span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-surface-container dark:bg-[#172238] text-secondary dark:text-[#94a3b8]">
              Level {item.level}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-outline-variant/20 dark:border-[#1a253d] font-mono text-[11px]">
            <div>
              <span className="text-secondary dark:text-[#94a3b8] block">Current Stock</span>
              <span
                className={`font-bold ${
                  item.currentStock < item.safetyStock
                    ? 'text-error dark:text-red-400'
                    : 'text-on-surface dark:text-white'
                }`}
              >
                {item.currentStock} pcs
              </span>
            </div>
            <div>
              <span className="text-secondary dark:text-[#94a3b8] block">Safety Threshold</span>
              <span className="font-bold text-on-surface dark:text-white">
                {item.safetyStock} pcs
              </span>
            </div>
            <div>
              <span className="text-secondary dark:text-[#94a3b8] block">Deficit</span>
              <span className="font-bold text-error dark:text-red-400">
                {Math.max(0, item.safetyStock - item.currentStock)} pcs
              </span>
            </div>
          </div>
        </div>

        {/* Form Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* PO Number Field */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-secondary dark:text-[#94a3b8]">
              Emergency PO Tracking Number
            </label>
            <input
              type="text"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              required
              className="h-9 px-3 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/40 dark:border-[#222e4a] text-xs font-mono font-bold text-primary dark:text-indigo-400 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Replenishment Quantity */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-secondary dark:text-[#94a3b8]">
              Replenishment Quantity (Units)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 0))}
                required
                className="h-9 px-3 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/40 dark:border-[#222e4a] text-xs font-mono font-bold text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary flex-1"
              />
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 50)}
                className="h-9 px-2.5 rounded-lg bg-surface-container dark:bg-[#162035] border border-outline-variant/30 dark:border-[#243352] text-[11px] font-mono font-bold text-secondary dark:text-[#94a3b8] hover:text-on-surface dark:hover:text-white"
              >
                +50
              </button>
            </div>
          </div>
        </div>

        {/* Supplier Selection */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-secondary dark:text-[#94a3b8]">
            Authorized Tier-2 Supplier
          </label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="h-9 px-3 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/40 dark:border-[#222e4a] text-xs font-medium text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            {INITIAL_SUPPLIERS.map((sup) => (
              <option key={sup.id} value={sup.id}>
                {sup.name} ({sup.location}) · OTD: {sup.onTimeDeliveryScore}% · {sup.paymentTerms}
              </option>
            ))}
          </select>
        </div>

        {/* Landed Cost & Currency Translation Summary */}
        <div className="p-3.5 rounded-xl bg-surface-container-low dark:bg-[#0e1627] border border-outline-variant/30 dark:border-[#1e2a44] flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-secondary dark:text-[#94a3b8]">Quoted Unit Cost</span>
            <span className="font-mono text-on-surface dark:text-white">
              {formatCurrencyValue(item.unitCost, item.currency, { useIndianSystem: false })} / pc
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-secondary dark:text-[#94a3b8]">Subtotal in Original Currency</span>
            <span className="font-mono text-on-surface dark:text-white">
              {formatCurrencyValue(totalQuoted, item.currency, { useIndianSystem: false })}
            </span>
          </div>

          <div className="pt-2 border-t border-outline-variant/20 dark:border-[#1f2c47] flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-on-surface dark:text-white block">
                Total Landed Cost in {baseCurrency}
              </span>
              <span className="text-[10px] text-secondary dark:text-[#94a3b8]">
                Converted at live rates with landed tariff factors
              </span>
            </div>
            <span className="font-mono text-base font-bold text-primary dark:text-indigo-400">
              {formatCurrencyValue(totalLandedInBase, baseCurrency)}
            </span>
          </div>
        </div>
      </form>
    </Modal>
  );
};
