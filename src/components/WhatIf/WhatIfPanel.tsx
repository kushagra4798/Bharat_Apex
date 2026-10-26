import React, { useState, useMemo } from 'react';
import { Card } from '../ui/Card';
import { useBharatApex } from '../../context';
import { CORRIDORS, INITIAL_SUPPLIERS } from '../../data/mockData';
import { simulateDelay } from '../../services/calculations';
import { convertCurrency, formatCurrencyValue } from '../../services/currencyService';

export const WhatIfPanel: React.FC = () => {
  const { state, applyWhatIfScenario } = useBharatApex();
  const { baseCurrency, currencyRates, fxShocks } = state;

  const [targetType, setTargetType] = useState<'CORRIDOR' | 'SUPPLIER'>('CORRIDOR');
  const [selectedCorridorId, setSelectedCorridorId] = useState<string>(CORRIDORS[0]?.id || 'corridor-chakan-sanand');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(INITIAL_SUPPLIERS[1]?.id || 'sup-kalyani');
  const [delayHours, setDelayHours] = useState<number>(3.0);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  const selectedTargetId = targetType === 'CORRIDOR' ? selectedCorridorId : selectedSupplierId;

  // Pure function computation - does NOT mutate state
  const simulationResult = useMemo(() => {
    return simulateDelay(state, { type: targetType, id: selectedTargetId }, delayHours);
  }, [state, targetType, selectedTargetId, delayHours]);

  const convertedPenaltyBefore = convertCurrency(
    simulationResult.totalPenaltyBeforeINR,
    'INR',
    baseCurrency,
    currencyRates,
    fxShocks
  );

  const convertedPenaltyAfter = convertCurrency(
    simulationResult.totalPenaltyAfterINR,
    'INR',
    baseCurrency,
    currencyRates,
    fxShocks
  );

  const convertedPenaltyDelta = convertCurrency(
    simulationResult.totalPenaltyDeltaINR,
    'INR',
    baseCurrency,
    currencyRates,
    fxShocks
  );

  const handleApplyScenario = () => {
    if (delayHours <= 0) return;

    applyWhatIfScenario({
      targetType,
      targetId: selectedTargetId,
      targetName: simulationResult.targetName,
      delayHours,
      affectedTruckIds: simulationResult.affectedTrucks.map((t) => t.id),
      affectedOems: simulationResult.affectedOEMs,
      totalHoursOfLineStop: simulationResult.totalHoursOfLineStop,
      totalPenaltyDeltaINR: simulationResult.totalPenaltyDeltaINR,
    });

    setAppliedNotice(
      `Scenario Applied: +${delayHours}h delay added to ${simulationResult.affectedTrucks.length} convoys (${simulationResult.affectedOEMs.join(', ')}). Telemetry feed updated.`
    );

    setTimeout(() => {
      setAppliedNotice(null);
    }, 5000);
  };

  const isScenarioAlreadyActive =
    state.activeScenario?.type === 'WHAT_IF' &&
    state.activeScenario.name.includes(`${delayHours}h`);

  return (
    <Card
      variant="default"
      padding="md"
      header={
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-indigo-950/40 border border-primary/20 text-primary dark:text-indigo-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[19px]">analytics</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface dark:text-white flex items-center gap-2">
                <span>What-If Disruption Scenario Simulator</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-container dark:bg-[#162035] text-secondary border border-outline-variant/30 dark:border-[#222e4a]">
                  simulateDelay Pure Engine
                </span>
              </h3>
              <p className="text-[11px] text-secondary dark:text-[#94a3b8]">
                Select a corridor or supplier (0–24h) · Predict OEM line-stop hours & penalty exposure before/after
              </p>
            </div>
          </div>

          {/* Quick Delay Presets */}
          <div className="flex items-center gap-1 self-end sm:self-auto">
            <span className="text-[10px] text-secondary uppercase font-semibold mr-1 hidden md:inline">
              Presets:
            </span>
            {[0, 1, 2, 4, 8, 12, 24].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDelayHours(preset)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                  delayHours === preset
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface-container dark:bg-[#162035] text-secondary hover:text-on-surface dark:hover:text-white'
                }`}
              >
                {preset === 0 ? '0h' : `+${preset}h`}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Applied Notification Banner */}
        {appliedNotice && (
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-emerald-500">check_circle</span>
              <span>{appliedNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setAppliedNotice(null)}
              className="text-xs hover:text-on-surface dark:hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Input Parameters Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 p-3.5 rounded-xl bg-surface-container-low dark:bg-[#10192d] border border-outline-variant/30 dark:border-[#222e4a]">
          {/* Target Type Selector */}
          <div className="md:col-span-3 flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-secondary dark:text-[#94a3b8] uppercase tracking-wider">
              Disruption Target
            </label>
            <div className="grid grid-cols-2 p-0.5 bg-surface-container dark:bg-[#162035] rounded-lg border border-outline-variant/30 dark:border-[#222e4a] text-xs">
              <button
                type="button"
                onClick={() => setTargetType('CORRIDOR')}
                className={`py-1.5 rounded-md font-semibold transition-colors flex items-center justify-center gap-1 ${
                  targetType === 'CORRIDOR'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-secondary hover:text-on-surface dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">route</span>
                <span>Corridor</span>
              </button>
              <button
                type="button"
                onClick={() => setTargetType('SUPPLIER')}
                className={`py-1.5 rounded-md font-semibold transition-colors flex items-center justify-center gap-1 ${
                  targetType === 'SUPPLIER'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-secondary hover:text-on-surface dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">factory</span>
                <span>Supplier</span>
              </button>
            </div>
          </div>

          {/* Specific Corridor / Supplier Selection */}
          <div className="md:col-span-5 flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-secondary dark:text-[#94a3b8] uppercase tracking-wider">
              {targetType === 'CORRIDOR' ? 'Select Highway Corridor' : 'Select Tier-2 Supplier'}
            </label>
            {targetType === 'CORRIDOR' ? (
              <select
                aria-label="Select Highway Corridor"
                value={selectedCorridorId}
                onChange={(e) => setSelectedCorridorId(e.target.value)}
                className="h-[36px] px-3 bg-surface-container dark:bg-[#162035] border border-outline-variant/40 dark:border-[#222e4a] rounded-lg text-xs font-semibold text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary shadow-xs cursor-pointer"
              >
                {CORRIDORS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.totalDistanceKm} km · {c.standardDurationHours}h standard)
                  </option>
                ))}
              </select>
            ) : (
              <select
                aria-label="Select Tier-2 Supplier"
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="h-[36px] px-3 bg-surface-container dark:bg-[#162035] border border-outline-variant/40 dark:border-[#222e4a] rounded-lg text-xs font-semibold text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary shadow-xs cursor-pointer"
              >
                {INITIAL_SUPPLIERS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.location}) — {s.partsSupplied.join(', ')}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Delay Slider: 0 to 24 Hours */}
          <div className="md:col-span-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-secondary dark:text-[#94a3b8] uppercase tracking-wider">
                Transit Delay (0 to 24h)
              </label>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded whitespace-nowrap inline-flex items-center ${
                delayHours > 0
                  ? 'text-error dark:text-red-400 bg-error/10 dark:bg-red-950/40'
                  : 'text-secondary bg-surface-container dark:bg-[#162035]'
              }`}>
                {delayHours === 0 ? '0.0 hrs (Nominal)' : `+${delayHours.toFixed(1)} hrs`}
              </span>
            </div>
            <div className="flex items-center gap-2 h-[36px]">
              <input
                type="range"
                min="0.0"
                max="24.0"
                step="0.5"
                aria-label="Transit Delay"
                value={delayHours}
                onChange={(e) => setDelayHours(parseFloat(e.target.value))}
                className="w-full accent-primary h-2 bg-surface-container dark:bg-[#1a253d] rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Impact Summary KPI Cards & Apply Button */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Affected OEMs */}
          <div className="p-3.5 rounded-xl bg-surface-container dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a] flex flex-col justify-between">
            <span className="text-[11px] font-bold text-secondary uppercase tracking-wider">
              Affected OEMs ({simulationResult.affectedOEMs.length})
            </span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {simulationResult.affectedOEMs.length === 0 ? (
                <span className="text-xs text-secondary italic">None exposed</span>
              ) : (
                simulationResult.affectedOEMs.map((oem) => (
                  <span
                    key={oem}
                    className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary dark:text-indigo-400 border border-primary/20 whitespace-nowrap inline-flex items-center"
                  >
                    {oem}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Hours of Line Stop */}
          <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
            simulationResult.totalHoursOfLineStop > 0
              ? 'bg-error/10 dark:bg-red-950/30 border-error/40'
              : 'bg-surface-container dark:bg-[#131c31] border-outline-variant/30 dark:border-[#222e4a]'
          }`}>
            <span className="text-[11px] font-bold text-secondary uppercase tracking-wider">
              Total Line-Stop Duration
            </span>
            <div className="mt-1">
              <span className={`text-xl font-mono font-bold whitespace-nowrap inline-block ${
                simulationResult.totalHoursOfLineStop > 0 ? 'text-error dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {simulationResult.totalHoursOfLineStop.toFixed(1)} hrs
              </span>
              <span className="text-[11px] text-secondary block mt-0.5">
                {simulationResult.totalHoursOfLineStop > 0
                  ? 'Plant lines halted due to stockout'
                  : 'Zero line starvation projected'}
              </span>
            </div>
          </div>

          {/* Penalty Exposure Before & After */}
          <div className="p-3.5 rounded-xl bg-surface-container dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a] flex flex-col justify-between">
            <span className="text-[11px] font-bold text-secondary uppercase tracking-wider">
              Penalty Exposure (INR)
            </span>
            <div className="mt-1">
              <div className="flex items-baseline gap-1.5 font-mono flex-wrap">
                <span className="text-sm line-through text-secondary whitespace-nowrap">
                  {formatCurrencyValue(convertedPenaltyBefore, baseCurrency)}
                </span>
                <span className="text-xs text-error font-bold whitespace-nowrap">→</span>
                <span className="text-lg font-bold text-error dark:text-red-400 whitespace-nowrap">
                  {formatCurrencyValue(convertedPenaltyAfter, baseCurrency)}
                </span>
              </div>
              <span className="text-[11px] font-mono text-error font-bold block mt-0.5 whitespace-nowrap">
                +{formatCurrencyValue(convertedPenaltyDelta, baseCurrency)} Delta
              </span>
            </div>
          </div>

          {/* Apply As Scenario CTA */}
          <div className="p-3.5 rounded-xl bg-surface-container dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a] flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-secondary uppercase tracking-wider block">
                Scenario Dispatch
              </span>
              <span className="text-[11px] text-secondary mt-1 block">
                Injects delay into active convoy telematics & logs feed.
              </span>
            </div>
            <button
              type="button"
              onClick={handleApplyScenario}
              disabled={delayHours <= 0 || simulationResult.affectedTrucks.length === 0}
              className={`mt-2 w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                delayHours > 0 && simulationResult.affectedTrucks.length > 0
                  ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer active:scale-[0.98]'
                  : 'bg-surface-container-high dark:bg-[#1a253d] text-secondary cursor-not-allowed opacity-60'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {isScenarioAlreadyActive ? 'check_circle' : 'bolt'}
              </span>
              <span>{isScenarioAlreadyActive ? 'Scenario Active' : 'Apply as scenario'}</span>
            </button>
          </div>
        </div>

        {/* Downstream Affected Buffers Comparison Table */}
        <div className="overflow-x-auto rounded-xl border border-outline-variant/30 dark:border-[#222e4a]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-container-high dark:bg-[#162035] text-[11px] uppercase tracking-wider text-secondary dark:text-[#94a3b8] border-b border-outline-variant/30 dark:border-[#222e4a]">
                <th className="py-2.5 px-3.5 font-bold whitespace-nowrap">OEM Customer & Assembly</th>
                <th className="py-2.5 px-3 text-center font-bold whitespace-nowrap">Run-Out Before</th>
                <th className="py-2.5 px-3 text-center font-bold whitespace-nowrap">Run-Out After</th>
                <th className="py-2.5 px-3 text-center font-bold whitespace-nowrap">Line Stop</th>
                <th className="py-2.5 px-3.5 text-right font-bold whitespace-nowrap">Penalty Before</th>
                <th className="py-2.5 px-3.5 text-right font-bold whitespace-nowrap">Penalty After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 dark:divide-[#222e4a]/60">
              {simulationResult.affectedBuffers.map((item) => {
                const isAffected = item.isAffected && delayHours > 0;
                const isCritical = item.statusAfter === 'CRITICAL';
                const isWarning = item.statusAfter === 'WARNING';

                const statusBg = isCritical
                  ? 'bg-error/15 text-error dark:text-red-300 border-error/30'
                  : isWarning
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30';

                const convertedPenBefore = convertCurrency(
                  item.penaltyExposureBeforeINR,
                  'INR',
                  baseCurrency,
                  currencyRates,
                  fxShocks
                );

                const convertedPenAfter = convertCurrency(
                  item.penaltyExposureAfterINR,
                  'INR',
                  baseCurrency,
                  currencyRates,
                  fxShocks
                );

                return (
                  <tr
                    key={item.bufferId}
                    className={`transition-colors ${
                      isAffected
                        ? 'bg-surface-container-lowest dark:bg-[#11192e] hover:bg-surface-container dark:hover:bg-[#16213b]'
                        : 'bg-surface-container-lowest/50 dark:bg-[#0c1220] opacity-75'
                    }`}
                  >
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <div className="font-bold text-on-surface dark:text-white flex items-center gap-1.5 whitespace-nowrap">
                        <span>{item.oemName}</span>
                        {isAffected && <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />}
                      </div>
                      <div className="text-[11px] text-secondary dark:text-[#94a3b8] truncate max-w-xs">
                        {item.partDescription} ({item.plantLocation})
                      </div>
                    </td>

                    {/* Run-Out Hours Before */}
                    <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-surface-container dark:bg-[#1a253d] text-secondary font-semibold whitespace-nowrap inline-flex items-center justify-center shrink-0">
                        {item.runOutHoursBefore.toFixed(1)}h
                      </span>
                    </td>

                    {/* Run-Out Hours After */}
                    <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                      {isAffected ? (
                        <div className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <span className="text-secondary line-through text-[11px] whitespace-nowrap">
                            {item.runOutHoursBefore.toFixed(1)}h
                          </span>
                          <span className="text-error font-bold whitespace-nowrap">→</span>
                          <span className={`px-2 py-0.5 rounded font-bold border whitespace-nowrap inline-flex items-center justify-center shrink-0 ${statusBg}`}>
                            {item.runOutHoursAfter.toFixed(1)}h
                          </span>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-surface-container dark:bg-[#1a253d] text-secondary whitespace-nowrap inline-flex items-center justify-center shrink-0">
                          {item.runOutHoursBefore.toFixed(1)}h
                        </span>
                      )}
                    </td>

                    {/* Hours of Line Stop */}
                    <td className="py-2.5 px-3 text-center font-mono font-bold whitespace-nowrap">
                      {item.hoursOfLineStop > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-error/15 text-error dark:text-red-300 border border-error/30 whitespace-nowrap inline-flex items-center justify-center shrink-0">
                          {item.hoursOfLineStop.toFixed(1)}h Stop
                        </span>
                      ) : (
                        <span className="text-secondary dark:text-[#94a3b8] font-normal whitespace-nowrap">
                          0.0h
                        </span>
                      )}
                    </td>

                    {/* Penalty Exposure Before */}
                    <td className="py-2.5 px-3.5 text-right font-mono text-secondary whitespace-nowrap">
                      {item.penaltyExposureBeforeINR > 0 ? (
                        <span className="whitespace-nowrap">{formatCurrencyValue(convertedPenBefore, baseCurrency)}</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 text-xs whitespace-nowrap">₹0.00</span>
                      )}
                    </td>

                    {/* Penalty Exposure After */}
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold whitespace-nowrap">
                      {item.penaltyExposureAfterINR > 0 ? (
                        <div className="text-error dark:text-red-400 whitespace-nowrap">
                          <span className="whitespace-nowrap">{formatCurrencyValue(convertedPenAfter, baseCurrency)}</span>
                          {item.penaltyDeltaINR > 0 && (
                            <span className="text-[10px] block text-error/80 whitespace-nowrap">
                              (+{formatCurrencyValue(convertCurrency(item.penaltyDeltaINR, 'INR', baseCurrency, currencyRates, fxShocks), baseCurrency)})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold whitespace-nowrap">
                          ₹0.00 (Safe)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Narrative Summary Callout */}
        <div className="p-3.5 rounded-xl bg-primary/5 dark:bg-indigo-950/20 border border-primary/20 flex items-start gap-3">
          <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[20px] shrink-0 mt-0.5">
            info
          </span>
          <div className="text-xs text-on-surface dark:text-[#cbd5e1] leading-relaxed">
            <span className="font-bold text-primary dark:text-indigo-300">
              Downstream Telemetry Impact Analysis:{' '}
            </span>
            <span>{simulationResult.summary}</span>
          </div>
        </div>
      </div>
    </Card>
  );
};
