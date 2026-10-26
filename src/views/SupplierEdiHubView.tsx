import React, { useState, useEffect } from 'react';
import { Card, DataTable, StatusBadge } from '../components/ui';
import { INITIAL_SUPPLIERS, INITIAL_EWAY_BILLS } from '../data/mockData';
import { Supplier, EWayBillRecord } from '../types';
import { useBharatApex } from '../context';
import { calculateEwayBillValidity } from '../services/calculations';

export interface SupplierEdiHubViewProps {
  onOpenEdiAsnModal?: (record?: EWayBillRecord) => void;
}

export const SupplierEdiHubView: React.FC<SupplierEdiHubViewProps> = ({
  onOpenEdiAsnModal,
}) => {
  const { state } = useBharatApex();
  const ewayBills = state.ewayBills || INITIAL_EWAY_BILLS;

  // Live tick state to keep the countdown badge reactive
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 10000); // refresh countdown every 10s
    return () => clearInterval(timer);
  }, []);

  const supplierColumns = [
    {
      key: 'name',
      header: 'Supplier Name',
      render: (s: Supplier) => (
        <div>
          <span className="font-bold text-xs text-on-surface dark:text-white block">{s.name}</span>
          <span className="text-[11px] text-secondary dark:text-[#94a3b8]">{s.location}</span>
        </div>
      ),
    },
    {
      key: 'partsSupplied',
      header: 'Supplied Categories',
      render: (s: Supplier) => (
        <span className="text-xs text-secondary dark:text-[#94a3b8]">
          {s.partsSupplied.join(', ')}
        </span>
      ),
    },
    {
      key: 'onTimeDeliveryScore',
      header: 'OTD Score',
      align: 'right' as const,
      render: (s: Supplier) => (
        <span
          className={`font-mono font-bold text-xs ${
            s.onTimeDeliveryScore >= 95
              ? 'text-tertiary dark:text-emerald-400'
              : s.onTimeDeliveryScore >= 85
              ? 'text-amber-500'
              : 'text-error dark:text-red-400'
          }`}
        >
          {s.onTimeDeliveryScore}%
        </span>
      ),
    },
    {
      key: 'qualityPpmScore',
      header: 'Quality (PPM)',
      align: 'right' as const,
      render: (s: Supplier) => (
        <span className="font-mono text-xs">{s.qualityPpmScore} PPM</span>
      ),
    },
    {
      key: 'riskLevel',
      header: 'Risk Level',
      align: 'center' as const,
      render: (s: Supplier) => <StatusBadge status={s.riskLevel} label={`${s.riskLevel} RISK`} />,
    },
    {
      key: 'paymentTerms',
      header: 'Commercial Terms',
      render: (s: Supplier) => (
        <span className="text-xs font-mono text-secondary dark:text-[#94a3b8]">
          {s.paymentTerms}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-lowest dark:bg-[#0B0F19] border border-outline-variant/30 dark:border-[#243352] p-5 rounded-xl shadow-sm">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-on-surface dark:text-white">
            Supplier & EDI Logistics Hub
          </h1>
          <p className="text-xs text-secondary dark:text-[#94a3b8]">
            Tier-2 supplier performance scorecards and GST E-Way Bill (EWB-01) dispatch ledger
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenEdiAsnModal && onOpenEdiAsnModal()}
          className="flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-primary hover:bg-primary-container text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[17px]">send</span>
          <span>Transmit New ASN</span>
        </button>
      </div>

      {/* Supplier Scorecards */}
      <Card
        variant="default"
        padding="none"
        header={
          <div>
            <h3 className="text-sm font-bold text-on-surface dark:text-white">
              Tier-2 Supplier Scorecards (Chakan MIDC Ecosystem)
            </h3>
            <p className="text-[11px] text-secondary dark:text-[#94a3b8]">
              Evaluated on OTD %, Quality PPM, and ISO/TS 16949 audit compliance
            </p>
          </div>
        }
      >
        <DataTable columns={supplierColumns} data={INITIAL_SUPPLIERS} keyExtractor={(s) => s.id} />
      </Card>

      {/* E-Way Bill Dispatches with Live Validity Countdown */}
      <Card
        variant="default"
        padding="md"
        header={
          <div className="flex items-center justify-between w-full">
            <div>
              <h3 className="text-sm font-bold text-on-surface dark:text-white flex items-center gap-2">
                <span>Active E-Way Bills (EWB-01)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary dark:text-indigo-400 border border-primary/20">
                  Illustrative: 1 day per 200 km
                </span>
              </h3>
              <p className="text-[11px] text-secondary dark:text-[#94a3b8]">
                Inter-state (IGST 18%) & Intra-state (CGST 9% + SGST 9%) Dispatches with live validity countdown
              </p>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-container dark:bg-[#162035] border border-outline-variant/30 dark:border-[#243352] text-secondary dark:text-[#94a3b8] font-semibold">
              Live EWB Ledger
            </span>
          </div>
        }
      >
        <div className="space-y-3">
          {ewayBills.map((ewb) => {
            const distance = ewb.distanceKm || (ewb.isInterState ? 660 : 75);
            const validity = calculateEwayBillValidity(distance, ewb.generatedAt);

            // Badge styling: green above 12h, amber below 12h, red when expired
            const badgeClasses =
              validity.badgeColor === 'green'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : validity.badgeColor === 'amber'
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 animate-pulse'
                : 'bg-error/10 text-error dark:text-red-400 border-error/30';

            const badgeIcon =
              validity.badgeColor === 'green'
                ? 'timer'
                : validity.badgeColor === 'amber'
                ? 'hourglass_top'
                : 'error';

            return (
              <div
                key={ewb.id}
                className="p-4 rounded-xl bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/30 dark:border-[#222e4a] flex flex-col md:flex-row items-start md:items-center justify-between gap-3.5 hover:border-primary/40 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-primary dark:text-indigo-400 text-xs">
                      EWB #{ewb.ewayBillNo}
                    </span>
                    <span className="text-secondary text-xs">·</span>
                    <span className="font-mono text-xs text-secondary dark:text-[#94a3b8]">
                      ASN #{ewb.asnNo}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary dark:bg-indigo-950/80 dark:text-indigo-400 font-semibold">
                      {ewb.isInterState ? 'Inter-State (IGST 18%)' : 'Intra-State (CGST+SGST 18%)'}
                    </span>

                    {/* Live E-Way Bill Validity Countdown Badge */}
                    <div
                      title={`Validity: ${validity.validDays}d (${validity.validHours}h) based on ${distance} km transit · illustrative constant EWB_KM_PER_DAY = 200`}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border whitespace-nowrap shrink-0 ${badgeClasses}`}
                    >
                      <span className="material-symbols-outlined text-[13px] shrink-0">{badgeIcon}</span>
                      <span className="whitespace-nowrap">{validity.formattedCountdown}</span>
                      <span className="text-[10px] opacity-75 hidden sm:inline whitespace-nowrap">(illustrative)</span>
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-on-surface dark:text-white mt-1.5">
                    {ewb.oemCustomer} · {ewb.quantity} pcs of {ewb.partDescription}
                  </h4>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-secondary dark:text-[#94a3b8] mt-1 font-mono">
                    <span>Vehicle: {ewb.vehicleNo}</span>
                    <span>·</span>
                    <span>Transit: {distance} km ({validity.validDays}d validity)</span>
                    <span>·</span>
                    <span>Valid Until: {new Date(validity.validUntil).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end md:self-center shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] text-secondary dark:text-[#94a3b8] block uppercase">
                      Total Invoice (with GST)
                    </span>
                    <span className="font-mono text-sm md:text-base font-bold text-on-surface dark:text-white">
                      ₹ {ewb.totalInvoiceAmount.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {onOpenEdiAsnModal && (
                    <button
                      type="button"
                      onClick={() => onOpenEdiAsnModal(ewb)}
                      title="Inspect E-Way Bill Details & Validity Countdown"
                      className="p-1.5 rounded-lg border border-outline-variant/30 dark:border-[#222e4a] text-secondary hover:text-primary dark:hover:text-indigo-400 hover:bg-surface-container transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">visibility</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
