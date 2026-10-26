import React, { useState } from 'react';
import { Card, KpiCard, DataTable } from '../components/ui';
import { BurnDownChart } from '../components/charts';
import { OverviewMiniMap } from '../components/Maps';
import { AiAdvisorPanel } from '../components/AiAdvisor';
import { WhatIfPanel } from '../components/WhatIf';
import { ShiftHandoverModal } from '../components/Modals';
import { useBharatApex } from '../context';
import { convertCurrency, formatCurrencyValue } from '../services/currencyService';
import { CustomerBuffer } from '../types';

export interface OverviewViewProps {
  onOpenExpediteModal?: (truckId: string, oemName: string, partDesc: string) => void;
  onOpenRoute?: () => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  onOpenExpediteModal,
  onOpenRoute,
  onToast,
}) => {
  const { state, dispatch, expediteTransit, addFeedEntry } = useBharatApex();
  const { customerBuffers, workOrders, machines, plantFeed, baseCurrency, currencyRates, fxShocks, bomItems, trucks } = state;

  const [isAlertDismissed, setIsAlertDismissed] = useState(false);
  const isDisrupted = state.isDisruptionActive;
  const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false);
  const [autoAnalyzeTrigger, setAutoAnalyzeTrigger] = useState(0);

  // Compute dynamic KPI values strictly from state
  const criticalBuffersCount = customerBuffers.filter((b) => b.runOutHours < 3.0).length;

  const totalPenaltyExposureINR = customerBuffers.reduce((sum, b) => {
    if (b.runOutHours < 3.0) {
      const hoursAtRisk = 3.0 - b.runOutHours;
      return sum + hoursAtRisk * b.penaltyPerHourINR;
    }
    return sum;
  }, 0);

  const convertedPenalty = convertCurrency(totalPenaltyExposureINR, 'INR', baseCurrency, currencyRates, fxShocks);

  const activeMachines = machines.filter((m) => m.status === 'RUNNING');
  const avgOee =
    machines.length > 0
      ? (machines.reduce((sum, m) => sum + m.oee, 0) / machines.length).toFixed(1)
      : '0.0';

  // Requirements: "risk list sorted by hours-to-line-stop"
  const sortedBuffers = [...customerBuffers].sort((a, b) => a.runOutHours - b.runOutHours);

  // Dynamic KPI subtitles and badges computed from state
  const criticalBuffers = sortedBuffers.filter((b) => b.runOutHours < 3.0);
  const criticalBuffersSubtitle =
    criticalBuffers.length > 0
      ? criticalBuffers.map((b) => `${b.oemName.split(' ')[0]} (${b.runOutHours}h)`).join(', ')
      : 'All buffers nominal (> 3h)';

  const numericOee = parseFloat(avgOee);
  const oeeDiff = numericOee - 85.0;
  const oeeBadgeText = `${oeeDiff >= 0 ? '▲ +' : '▼ '}${oeeDiff.toFixed(1)}% vs 85.0%`;
  const oeeStatus: 'success' | 'error' = numericOee >= 85.0 ? 'success' : 'error';

  const stageCounts = workOrders.reduce((acc, wo) => {
    acc[wo.stage] = (acc[wo.stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalScheduledQty = workOrders.reduce((sum, wo) => sum + wo.quantity, 0);
  const machiningWos = stageCounts['MACHINING'] || 0;
  const otherWos = workOrders.length - machiningWos;
  const woBadgeText = `${machiningWos} Mach. · ${otherWos} Other`;
  const woSubtitle = `${totalScheduledQty.toLocaleString('en-IN')} parts scheduled in shop`;

  const penaltySubtitle =
    criticalBuffers.length > 0
      ? criticalBuffers.map((b) => b.oemName).join(' & ') + ' assembly lines'
      : 'No lines currently exposed';

  // Action: Simulate Disruption (state managed in reducer, no hardcoded buffer ID or -70)
  const handleTriggerDisruption = () => {
    const willBeDisrupted = !state.isDisruptionActive;
    dispatch({ type: 'TOGGLE_DISRUPTION' });

    if (willBeDisrupted) {
      setAutoAnalyzeTrigger((prev) => prev + 1);
      onToast(
        'SIMULATION ACTIVE: Corridor disruption engaged. Buffer reduced to 1.1h! AI Advisor evaluating...',
        'error'
      );
    } else {
      onToast('Disruption cleared. Telemetry returned to nominal production baseline.', 'success');
    }
  };

  // Action: Expedite transit directly from AI Advisor recommendation (no trucks[0] fallback)
  const handleExpediteFromAdvisor = (oemName: string) => {
    const matchedTruck = trucks.find(
      (t) =>
        t.destinationOem.toLowerCase().includes(oemName.toLowerCase()) ||
        oemName.toLowerCase().includes(t.destinationOem.toLowerCase())
    );

    if (!matchedTruck) {
      onToast(`No active transit convoy found bound for ${oemName}. Telematics alert logged.`, 'warning');
      return;
    }

    if (matchedTruck.isExpedited) {
      onToast(`Convoy #${matchedTruck.registrationNumber} for ${oemName} is already on FASTag Green Corridor.`, 'info');
      return;
    }

    expediteTransit(matchedTruck.id, 50);
    onToast(`Expedited Convoy #${matchedTruck.registrationNumber} (+50 units) for ${oemName}. Stock will be added upon arrival.`, 'success');
  };

  // Action: Export Daily Shift Report
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Export Daily Shift Report PDF (dynamically imported to avoid bundle bloat)
  const handleExportShiftReport = async () => {
    try {
      setIsExportingPdf(true);
      const { exportDailyShiftReportPdf } = await import('../services/pdfExportService');

      await exportDailyShiftReportPdf({
        plantName: 'Bharat Apex Chakan Hub - Unit 4',
        shiftName: 'Morning Shift (06:00 - 14:00 IST)',
        leadInCharge: 'R. Deshmukh (Lead Controller) · Chakan Complex Line 4',
        customerBuffers,
        workOrders,
        machines,
        plantFeed,
        trucks,
        baseCurrency,
        currencyRates,
        fxShocks,
      });

      addFeedEntry(
        'Daily Shift Telemetry Report Exported',
        'PDF audit report generated for morning shift with KPI summary, buffer status, and open work orders.',
        'SYSTEM',
        'NORMAL'
      );
      onToast('Daily Shift Report PDF exported successfully.', 'success');
    } catch (err) {
      console.error('Failed to export shift report PDF:', err);
      onToast('Failed to export Shift Report PDF.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Columns for the Line-Stop Risk Matrix (Sorted by hours-to-line-stop)
  const riskColumns = [
    {
      key: 'oemName',
      header: 'OEM Customer',
      render: (b: CustomerBuffer) => (
        <div>
          <span className="font-bold text-on-surface dark:text-white block">{b.oemName}</span>
          <span className="text-xs text-secondary dark:text-[#94a3b8]">{b.plantLocation}</span>
        </div>
      ),
    },
    {
      key: 'runOutHours',
      header: 'Buffer',
      align: 'center' as const,
      className: 'whitespace-nowrap',
      headerClassName: 'whitespace-nowrap',
      width: '120px',
      render: (b: CustomerBuffer) => (
        <span
          className={`inline-flex items-center justify-center font-mono font-bold text-xs px-2.5 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
            b.runOutHours < 3.0
              ? 'bg-error-container text-on-error-container dark:bg-red-950/80 dark:text-red-300 border border-error/40'
              : b.runOutHours < 6.0
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300'
          }`}
        >
          {b.runOutHours} hrs
        </span>
      ),
    },
    {
      key: 'partDescription',
      header: 'Assembly Part',
      render: (b: CustomerBuffer) => (
        <div>
          <span className="text-on-surface dark:text-[#f8fafc] text-xs font-medium block">
            {b.partDescription}
          </span>
          <span className="font-mono text-[11px] text-secondary dark:text-[#94a3b8]">#{b.partNumber}</span>
        </div>
      ),
    },
    {
      key: 'penalty',
      header: 'Penalty Exposure',
      align: 'right' as const,
      className: 'whitespace-nowrap',
      headerClassName: 'whitespace-nowrap',
      render: (b: CustomerBuffer) => {
        const exposure = b.runOutHours < 3.0 ? (3.0 - b.runOutHours) * b.penaltyPerHourINR : 0;
        const conv = convertCurrency(exposure, 'INR', baseCurrency, currencyRates, fxShocks);
        return (
          <span
            className={`font-mono font-bold text-xs whitespace-nowrap ${
              exposure > 0 ? 'text-error dark:text-[#f87171]' : 'text-secondary dark:text-[#94a3b8]'
            }`}
          >
            {exposure > 0 ? formatCurrencyValue(conv, baseCurrency) : 'Nil Safe'}
          </span>
        );
      },
    },
    {
      key: 'truck',
      header: 'Active FASTag Convoy',
      render: (b: CustomerBuffer) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-semibold text-on-surface dark:text-cyan-300">
            {b.assignedTruckId || 'Pending Dock'}
          </span>
          <span className="text-[11px] text-secondary dark:text-[#94a3b8] truncate max-w-[160px]">
            {b.highwayCorridor}
          </span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      align: 'center' as const,
      render: (b: CustomerBuffer) => (
        <button
          onClick={() => {
            if (onOpenExpediteModal) {
              onOpenExpediteModal(
                b.assignedTruckId || 'MH-14-GH-4091',
                b.oemName,
                b.partDescription
              );
            } else if (b.assignedTruckId) {
              expediteTransit(b.assignedTruckId, 50);
              onToast(`Expedited convoy ${b.assignedTruckId} dispatched for ${b.oemName}`, 'success');
            }
          }}
          className="px-3 py-1 bg-primary text-white rounded text-xs font-semibold hover:bg-primary-container transition-colors shadow-xs"
        >
          Expedite
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-200">
      {/* Top Alert Ticker Banner */}
      {!isAlertDismissed && (
        <div className="w-full bg-surface-container-high dark:bg-[#162035] border border-error/40 dark:border-red-500/40 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm dark:shadow-[0_0_20px_rgba(239,68,68,0.1)] transition-all">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-3.5 w-3.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error dark:bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-error dark:bg-red-500 shadow-[0_0_10px_#ef4444]" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-error dark:text-red-300 bg-error-container dark:bg-red-950/80 dark:border dark:border-red-800 px-2.5 py-0.5 rounded-full shrink-0">
              Critical Alert
            </span>
            <p className="text-xs md:text-sm text-on-surface dark:text-[#f8fafc] truncate">
              <strong className="font-semibold text-on-surface dark:text-white">Tata Motors Sanand Corridor</strong>{' '}
              buffer depleted to <span className="text-error dark:text-red-400 font-bold whitespace-nowrap">{customerBuffers[0]?.runOutHours ?? 1.8} hrs</span>. Expedited convoy{' '}
              <span className="bg-surface-container-lowest dark:bg-[#0b111e] dark:border dark:border-[#222e4a] px-1.5 py-0.5 rounded font-mono font-bold text-primary dark:text-cyan-300">
                MH-14-GH-4091
              </span>{' '}
              en route via NH-48.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
            <button
              type="button"
              onClick={onOpenRoute}
              className="px-3.5 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary-container transition-colors flex items-center gap-1 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">navigation</span>
              <span>View Route</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAlertDismissed(true)}
              title="Dismiss Alert"
              className="p-1.5 text-secondary hover:text-on-surface hover:bg-surface-container dark:hover:bg-[#1f2c47] rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Scenario Banner */}
      {state.activeScenario && (
        <div className="w-full bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-amber-500 text-[24px] animate-pulse">
              crisis_alert
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-on-surface dark:text-white">
                  Active Scenario: {state.activeScenario.name}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500 text-black">
                  {state.activeScenario.badge}
                </span>
              </div>
              <p className="text-xs text-secondary dark:text-amber-200/80 mt-0.5">
                {state.activeScenario.description} · Auto-evaluated by AI Advisor
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'CLEAR_SCENARIO' })}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shrink-0 shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
            <span>Clear Scenario</span>
          </button>
        </div>
      )}

      {/* Operational Action Bar */}
      <div className="w-full bg-surface-container-lowest dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a] rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          <div className="flex flex-col">
            <span className="text-xs md:text-sm font-bold text-on-surface dark:text-white">
              Shift: Morning (06:00 - 14:00 IST)
            </span>
            <span className="text-[11px] text-secondary dark:text-[#94a3b8]">
              In-charge: R. Deshmukh (Lead Controller) · Chakan Complex Line 4
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleTriggerDisruption}
            className={`flex-1 sm:flex-initial h-9 px-4 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm ${
              isDisrupted
                ? 'bg-tertiary text-white hover:opacity-90'
                : 'bg-error dark:bg-red-600 text-white hover:opacity-90'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">bolt</span>
            <span>{isDisrupted ? 'Reset Baseline State' : 'Simulate Disruption'}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsHandoverModalOpen(true)}
            className="flex-1 sm:flex-initial h-9 px-3.5 bg-primary/10 hover:bg-primary/20 text-primary dark:text-indigo-400 border border-primary/30 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[17px]">assignment_turned_in</span>
            <span>AI Shift Handover</span>
          </button>
          <button
            type="button"
            onClick={handleExportShiftReport}
            disabled={isExportingPdf}
            className="flex-1 sm:flex-initial h-9 px-3.5 bg-surface-container dark:bg-[#162035] border border-outline-variant/30 dark:border-[#222e4a] text-on-surface dark:text-white rounded-lg text-xs font-semibold hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[17px] text-secondary">picture_as_pdf</span>
            <span>{isExportingPdf ? 'Generating PDF...' : 'Export Daily Shift Report'}</span>
          </button>
        </div>
      </div>

      {/* 4 SCADA KPI Cards dynamically bound to state */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Line-Stop Penalty at Risk"
          value={formatCurrencyValue(convertedPenalty, baseCurrency)}
          badgeText={`${criticalBuffersCount} Line${criticalBuffersCount !== 1 ? 's' : ''} Exposed`}
          badgeVariant={criticalBuffersCount > 0 ? 'error' : 'neutral'}
          valueColor={criticalBuffersCount > 0 ? 'error' : 'default'}
          icon={<span className="material-symbols-outlined text-error text-[16px]">warning</span>}
          subtitle={penaltySubtitle}
        />
        <KpiCard
          label="Critical Buffers"
          value={`${criticalBuffersCount} OEM Lines`}
          badgeText={`${criticalBuffersCount} Critical`}
          badgeVariant={criticalBuffersCount > 0 ? 'error' : 'success'}
          icon={<span className="material-symbols-outlined text-amber-500 text-[16px]">schedule</span>}
          subtitle={criticalBuffersSubtitle}
        />
        <KpiCard
          label="Plant OEE"
          value={`${avgOee}%`}
          badgeText={oeeBadgeText}
          badgeVariant={oeeStatus}
          valueColor={oeeStatus}
          icon={<span className="material-symbols-outlined text-emerald-500 text-[16px]">precision_manufacturing</span>}
          subtitle={`${activeMachines.length} active of ${machines.length} workstations`}
        />
        <KpiCard
          label="Open Work Orders"
          value={`${workOrders.length} Orders`}
          badgeText={woBadgeText}
          badgeVariant="info"
          icon={<span className="material-symbols-outlined text-secondary text-[16px]">inventory</span>}
          subtitle={woSubtitle}
        />
      </div>

      {/* Main Grid: Left Column (Table & Recharts Burn-down) + Right Column (Mini-map & Activity Feed) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 Columns) */}
        <div className="lg:col-span-8 flex flex-col gap-6 min-w-0">
          {/* Recharts JIT Buffer Burn-Down Monitor Card */}
          <Card
            variant="default"
            padding="md"
            header={
              <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-2">
                <div>
                  <h3 className="text-sm font-bold text-on-surface dark:text-white">
                    JIT Buffer Burn-Down Monitor
                  </h3>
                  <p className="text-[11px] text-secondary dark:text-[#94a3b8]">
                    Real-time depletion model tracking plant dock consumption speeds
                  </p>
                </div>
                {/* Legend */}
                <div className="flex items-center gap-2 bg-surface-container-low dark:bg-[#0d1726] px-2.5 py-1 rounded-lg text-[10px] font-mono shrink-0">
                  <span className="flex items-center gap-1 text-error dark:text-red-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-error dark:bg-red-500" /> &lt;3.0h Crit
                  </span>
                  <span className="text-outline">|</span>
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> 3-6h Warn
                  </span>
                  <span className="text-outline">|</span>
                  <span className="flex items-center gap-1 text-primary dark:text-indigo-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-primary" /> &gt;6h Safe
                  </span>
                </div>
              </div>
            }
          >
            <BurnDownChart buffers={sortedBuffers} criticalThresholdHours={3.0} />
          </Card>

          {/* Gemini JIT Line-Stop AI Advisor Panel */}
          <AiAdvisorPanel
            buffers={customerBuffers}
            workOrders={workOrders}
            bomItems={bomItems}
            onExpediteOem={handleExpediteFromAdvisor}
            onToast={onToast}
            autoAnalyzeTrigger={autoAnalyzeTrigger + (state.scenarioTriggerCount || 0)}
          />

          {/* Pure Function What-If Disruption Scenario Simulator Panel */}
          <WhatIfPanel />

          {/* Line-Stop Risk Matrix Table: Sorted by hours-to-line-stop */}
          <Card
            variant="default"
            padding="none"
            header={
              <div className="flex items-center justify-between w-full">
                <div>
                  <h3 className="text-sm font-bold text-on-surface dark:text-white">
                    Line-Stop Risk Matrix (Sorted by Urgency)
                  </h3>
                  <p className="text-[11px] text-secondary dark:text-[#94a3b8]">
                    Active telemetry from GPS transponders & OEM gate sensors · Sorted by hours-to-line-stop
                  </p>
                </div>
                <span className="text-[11px] font-mono text-secondary dark:text-[#94a3b8] bg-surface-container dark:bg-[#162035] px-2.5 py-1 rounded-full">
                  {sortedBuffers.length} Critical Feeds
                </span>
              </div>
            }
          >
            <DataTable
              columns={riskColumns}
              data={sortedBuffers}
              keyExtractor={(b) => b.id}
            />
          </Card>
        </div>

        {/* Right Column (4 Columns) */}
        <div className="lg:col-span-4 flex flex-col gap-6 min-w-0">
          {/* Corridor Logistics Mini Map Preview */}
          <Card
            variant="default"
            padding="md"
            header={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[19px]">near_me</span>
                  <h3 className="text-sm font-bold text-on-surface dark:text-white">
                    Corridor Logistics
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onOpenRoute}
                  className="text-[11px] font-semibold text-primary dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                >
                  <span>Full Map</span>
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </button>
              </div>
            }
          >
            <OverviewMiniMap onOpenFullMap={onOpenRoute ?? (() => {})} />
          </Card>

          {/* Plant Activity Live Feed */}
          <Card
            variant="default"
            padding="sm"
            header={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary text-[18px]">rss_feed</span>
                  <h3 className="text-sm font-bold text-on-surface dark:text-white">
                    Plant Activity Feed
                  </h3>
                </div>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
              </div>
            }
          >
            <div className="flex flex-col gap-2 p-2 max-h-[380px] overflow-y-auto">
              {plantFeed.slice(0, 8).map((feed) => (
                <div
                  key={feed.id}
                  className="flex items-start gap-2.5 pb-2 border-b border-outline-variant/20 dark:border-[#1f2c47] last:border-none"
                >
                  <span className="font-mono text-xs font-semibold text-secondary dark:text-[#94a3b8] shrink-0 pt-0.5">
                    {feed.timeDisplay}
                  </span>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-xs font-semibold text-on-surface dark:text-white leading-tight truncate">
                      {feed.title}
                    </span>
                    <span className="text-[11px] text-secondary dark:text-[#94a3b8] mt-0.5 leading-snug">
                      {feed.description}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Shift Handover Telemetry Briefing Modal */}
      <ShiftHandoverModal
        isOpen={isHandoverModalOpen}
        onClose={() => setIsHandoverModalOpen(false)}
        plantFeed={plantFeed}
        metrics={{
          penaltyAtRiskINR: totalPenaltyExposureINR,
          criticalBuffersCount,
          averageOee: `${avgOee}%`,
          activeWorkstations: `${activeMachines.length} of ${machines.length}`,
        }}
        onToast={onToast}
      />
    </div>
  );
};
