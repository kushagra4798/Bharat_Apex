import React, { useState } from 'react';
import { Card, DataTable } from '../components/ui';
import { useBharatApex } from '../context';
import { convertCurrency, formatCurrencyValue } from '../services/currencyService';
import { rollUpBomLandedCost } from '../services/calculations';
import { BomItem } from '../types';

export interface BomInventoryViewProps {
  onOpenEmergencyPoModal?: (item: BomItem) => void;
  onToast?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const BomInventoryView: React.FC<BomInventoryViewProps> = ({
  onOpenEmergencyPoModal,
  onToast,
}) => {
  const { state } = useBharatApex();
  const { bomItems, baseCurrency, currencyRates, fxShocks } = state;
  const [searchQuery, setSearchQuery] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Export BOM table to PDF (dynamically imported)
  const handleExportBomPdf = async () => {
    try {
      setIsExportingPdf(true);
      const { exportBomPdf } = await import('../services/pdfExportService');

      await exportBomPdf({
        plantName: 'Bharat Apex Automotive - Chakan Manufacturing Hub',
        bomItems,
        baseCurrency,
        currencyRates,
        fxShocks,
      });

      if (onToast) {
        onToast('BOM valuation PDF exported successfully.', 'success');
      }
    } catch (err) {
      console.error('Failed to export BOM PDF:', err);
      if (onToast) {
        onToast('Failed to export BOM PDF.', 'error');
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Flatten items for table view
  const flattenBom = (items: BomItem[], depth = 1): (BomItem & { depth: number })[] => {
    let result: (BomItem & { depth: number })[] = [];
    items.forEach((item) => {
      result.push({ ...item, depth });
      if (item.children && item.children.length > 0) {
        result = result.concat(flattenBom(item.children, depth + 1));
      }
    });
    return result;
  };

  const flattened = flattenBom(bomItems);
  const filtered = flattened.filter(
    (item) =>
      item.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const bomColumns = [
    {
      key: 'partNumber',
      header: 'Part Number',
      render: (item: BomItem & { depth: number }) => (
        <div style={{ paddingLeft: `${(item.depth - 1) * 16}px` }} className="flex items-center gap-2">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
              item.level === 1
                ? 'bg-primary/10 text-primary dark:bg-indigo-950/80 dark:text-indigo-400'
                : item.level === 2
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                : 'bg-surface-container dark:bg-[#162035] text-secondary dark:text-[#94a3b8]'
            }`}
          >
            L{item.level}
          </span>
          <span className="font-mono font-bold text-xs text-on-surface dark:text-white">
            {item.partNumber}
          </span>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Part Description',
      render: (item: BomItem) => (
        <div>
          <span className="text-xs font-medium text-on-surface dark:text-white block">
            {item.description}
          </span>
          <span className="text-[11px] text-secondary dark:text-[#94a3b8]">{item.category}</span>
        </div>
      ),
    },
    {
      key: 'qtyPerAssembly',
      header: 'Qty / Assembly',
      align: 'right' as const,
      render: (item: BomItem) => (
        <span className="font-mono text-xs font-semibold text-on-surface dark:text-white">
          {item.qtyPerAssembly}
        </span>
      ),
    },
    {
      key: 'unitCost',
      header: 'Quoted Unit Cost',
      align: 'right' as const,
      render: (item: BomItem) => (
        <span className="font-mono text-xs">
          {formatCurrencyValue(item.unitCost, item.currency, {
            useIndianSystem: false,
            decimals: item.currency === 'JPY' ? 0 : 2,
          })}
        </span>
      ),
    },
    {
      key: 'landedCost',
      header: `Landed Cost (${baseCurrency})`,
      align: 'right' as const,
      render: (item: BomItem) => {
        const cost = rollUpBomLandedCost(item, currencyRates, fxShocks, baseCurrency);
        return (
          <span className="font-mono font-bold text-xs text-primary dark:text-indigo-400">
            {formatCurrencyValue(cost, baseCurrency)}
          </span>
        );
      },
    },
    {
      key: 'stock',
      header: 'Current Stock',
      align: 'right' as const,
      render: (item: BomItem) => {
        const isLow = item.currentStock < item.safetyStock;
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span
              className={`font-mono font-bold text-xs ${
                isLow ? 'text-error dark:text-red-400' : 'text-on-surface dark:text-white'
              }`}
            >
              {item.currentStock.toLocaleString('en-IN')} pcs
            </span>
            <span className="text-[10px] text-secondary dark:text-[#94a3b8]">
              Safety: {item.safetyStock.toLocaleString('en-IN')}
            </span>
            {isLow && (
              <span className="mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-300 dark:border-red-800">
                Below safety
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'action',
      header: 'Action',
      align: 'center' as const,
      render: (item: BomItem) => {
        const isLow = item.currentStock < item.safetyStock;
        return (
          <button
            type="button"
            onClick={() => onOpenEmergencyPoModal && onOpenEmergencyPoModal(item)}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
              isLow
                ? 'bg-primary hover:bg-primary-container text-white shadow-xs'
                : 'bg-surface-container dark:bg-[#162035] border border-outline-variant/30 dark:border-[#243352] text-secondary dark:text-[#94a3b8] hover:bg-surface-container-high'
            }`}
          >
            Emergency PO
          </button>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-lowest dark:bg-[#0B0F19] border border-outline-variant/30 dark:border-[#243352] p-5 rounded-xl shadow-sm">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-on-surface dark:text-white">
            BOM & Inventory Cost Tracker
          </h1>
          <p className="text-xs text-secondary dark:text-[#94a3b8]">
            3-Level Bill of Materials rolled up into {baseCurrency} with landed tariffs and FX shocks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search part or category..."
            className="h-9 px-3 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a] text-xs text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary w-52"
          />
          <button
            type="button"
            onClick={handleExportBomPdf}
            disabled={isExportingPdf}
            className="h-9 px-3.5 bg-surface-container dark:bg-[#162035] border border-outline-variant/30 dark:border-[#222e4a] text-on-surface dark:text-white rounded-lg text-xs font-semibold hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[17px] text-secondary">picture_as_pdf</span>
            <span>{isExportingPdf ? 'Generating PDF...' : 'Export BOM'}</span>
          </button>
        </div>
      </div>

      <Card variant="default" padding="none">
        <DataTable columns={bomColumns} data={filtered} keyExtractor={(item) => item.id} />
      </Card>
    </div>
  );
};
