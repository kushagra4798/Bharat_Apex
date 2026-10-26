import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Card, DataTable } from '../components/ui';
import { useBharatApex } from '../context';
import { CurrencyCode } from '../types';

export const FxRiskHubView: React.FC = () => {
  const { state, setFxShocks } = useBharatApex();
  const { currencyRates, fxShocks, baseCurrency, bomItems, isLiveRates } = state;

  const [localShocks, setLocalShocks] = useState(fxShocks);
  const [hedgingPercent, setHedgingPercent] = useState<number>(75);
  const [syncTimestamp] = useState<string>(() => {
    const now = new Date();
    return `Today ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} IST`;
  });

  const handleSliderChange = (curr: CurrencyCode, val: number) => {
    const updated = { ...localShocks, [curr]: val };
    setLocalShocks(updated);
    setFxShocks(updated);
  };

  // Currencies list excluding base INR
  const foreignCurrencies: { code: CurrencyCode; label: string; baseRate: number; source: string }[] = [
    { code: 'USD', label: 'US Dollar (USD)', baseRate: currencyRates.USD, source: isLiveRates ? 'Frankfurter / ECB Live' : 'Offline Baseline' },
    { code: 'EUR', label: 'Euro (EUR)', baseRate: currencyRates.EUR, source: isLiveRates ? 'Frankfurter / ECB Live' : 'Offline Baseline' },
    { code: 'JPY', label: 'Japanese Yen (JPY)', baseRate: currencyRates.JPY, source: isLiveRates ? 'Frankfurter / ECB Live' : 'Offline Baseline' },
    { code: 'CNY', label: 'Chinese Yuan (CNY)', baseRate: currencyRates.CNY, source: isLiveRates ? 'Frankfurter / ECB Live' : 'Offline Baseline' },
    { code: 'GBP', label: 'British Pound (GBP)', baseRate: currencyRates.GBP, source: isLiveRates ? 'Frankfurter / ECB Live' : 'Offline Baseline' },
  ];

  // Calculate simulated shift variance impact in Lakh INR
  const totalVarianceLakh = Object.entries(localShocks).reduce((sum, [curr, shockVal]) => {
    const factor = curr === 'USD' ? 2.2 : curr === 'EUR' ? 1.4 : curr === 'JPY' ? 0.8 : 0.5;
    return sum + (shockVal || 0) * factor;
  }, 0);

  const netVarianceLakh = totalVarianceLakh * (1 - hedgingPercent / 100);

  // Landed Cost Data by Currency (Baseline vs Shocked in INR)
  const landedCostChartData = useMemo(() => {
    return foreignCurrencies.map(({ code, baseRate }) => {
      const parts = bomItems.filter((b) => b.currency === code);
      const totalQuoted = parts.reduce((sum, b) => sum + b.unitCost * (b.qtyPerAssembly || 1), 0) || (code === 'USD' ? 380 : code === 'EUR' ? 420 : code === 'JPY' ? 35000 : 750);
      const shock = localShocks[code] ?? 0;
      const baselineCost = Math.round(totalQuoted * baseRate);
      const shockedCost = Math.round(totalQuoted * (baseRate * (1 + shock / 100)));
      return {
        currency: code,
        Baseline: baselineCost,
        Shocked: shockedCost,
        delta: shockedCost - baselineCost,
      };
    });
  }, [bomItems, localShocks, foreignCurrencies]);

  // Rates table columns
  const rateColumns = [
    {
      key: 'code',
      header: 'Currency',
      render: (item: (typeof foreignCurrencies)[0]) => (
        <div>
          <span className="font-bold text-xs text-on-surface dark:text-white block font-mono">
            {item.code}
          </span>
          <span className="text-[11px] text-secondary dark:text-[#94a3b8]">{item.label}</span>
        </div>
      ),
    },
    {
      key: 'baseRate',
      header: 'Baseline Rate',
      align: 'right' as const,
      render: (item: (typeof foreignCurrencies)[0]) => (
        <span className="font-mono font-semibold text-xs text-on-surface dark:text-white">
          ₹ {item.baseRate.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'shock',
      header: 'Active Shock',
      align: 'right' as const,
      render: (item: (typeof foreignCurrencies)[0]) => {
        const shock = localShocks[item.code] ?? 0;
        return (
          <span
            className={`font-mono font-bold text-xs ${
              shock > 0
                ? 'text-error dark:text-red-400'
                : shock < 0
                ? 'text-tertiary dark:text-emerald-400'
                : 'text-secondary dark:text-[#94a3b8]'
            }`}
          >
            {shock > 0 ? `+${shock}%` : `${shock}%`}
          </span>
        );
      },
    },
    {
      key: 'effectiveRate',
      header: 'Effective Shocked Rate',
      align: 'right' as const,
      render: (item: (typeof foreignCurrencies)[0]) => {
        const shock = localShocks[item.code] ?? 0;
        const effective = (item.baseRate * (1 + shock / 100)).toFixed(2);
        return (
          <span className="font-mono font-bold text-xs text-primary dark:text-indigo-400">
            ₹ {effective}
          </span>
        );
      },
    },
    {
      key: 'source',
      header: 'Feed Source',
      render: (item: (typeof foreignCurrencies)[0]) => (
        <span className="text-xs text-secondary dark:text-[#94a3b8] font-mono">
          {item.source}
        </span>
      ),
    },
    {
      key: 'timestamp',
      header: 'Last Sync Timestamp',
      align: 'right' as const,
      render: () => (
        <span className="text-xs font-mono text-secondary dark:text-[#94a3b8]">
          {syncTimestamp}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-200">
      {/* Top Header without duplicate currency dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-lowest dark:bg-[#0B0F19] border border-outline-variant/30 dark:border-[#243352] p-5 rounded-xl shadow-sm">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-on-surface dark:text-white">
            FX Risk & Currency Exposure Hub
          </h1>
          <p className="text-xs text-secondary dark:text-[#94a3b8]">
            Cross-currency rate shock simulator for imported Tier-2 components & BOM margins
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold px-3 py-1.5 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a] text-secondary dark:text-[#94a3b8]">
            Global Reporting Base: <strong className="text-on-surface dark:text-white font-bold">{baseCurrency}</strong>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Shock Sliders (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <Card
            variant="default"
            padding="md"
            header={
              <div className="flex items-center justify-between w-full">
                <div>
                  <h3 className="text-sm font-bold text-on-surface dark:text-white">
                    Exchange Rate Shock Modeler
                  </h3>
                  <p className="text-[11px] text-secondary dark:text-[#94a3b8]">
                    Adjust stress test sliders to model forex volatility on landed parts
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const reset = { USD: 0, EUR: 0, JPY: 0, CNY: 0, GBP: 0 };
                    setLocalShocks(reset);
                    setFxShocks(reset);
                  }}
                  className="text-xs text-primary dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                >
                  Reset Shocks
                </button>
              </div>
            }
          >
            <div className="space-y-5 py-2">
              {foreignCurrencies.map(({ code, label, baseRate }) => {
                const currentShock = localShocks[code] ?? 0;
                const effectiveRate = (baseRate * (1 + currentShock / 100)).toFixed(2);

                return (
                  <div key={code} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-on-surface dark:text-white">{label}</span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-secondary dark:text-[#94a3b8]">Base: ₹{baseRate}</span>
                        <span
                          className={`font-bold ${
                            currentShock > 0
                              ? 'text-error dark:text-red-400'
                              : currentShock < 0
                              ? 'text-tertiary dark:text-emerald-400'
                              : 'text-secondary dark:text-[#94a3b8]'
                          }`}
                        >
                          {currentShock >= 0 ? `+${currentShock}%` : `${currentShock}%`} (₹{effectiveRate})
                        </span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="-15"
                      max="15"
                      step="0.5"
                      value={currentShock}
                      onChange={(e) => handleSliderChange(code, parseFloat(e.target.value))}
                      className="w-full h-2 bg-surface-container dark:bg-[#1a253d] rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-outline dark:text-[#64748b] font-mono">
                      <span>-15%</span>
                      <span>0% (Neutral)</span>
                      <span>+15%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Column: Projected Impact Summary & Editable Hedging Input (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <Card
            variant="default"
            padding="md"
            header={
              <div>
                <h3 className="text-sm font-bold text-on-surface dark:text-white">
                  Projected Shift Cost Exposure
                </h3>
                <p className="text-[11px] text-secondary dark:text-[#94a3b8]">
                  Computed exposure across active shift production runs
                </p>
              </div>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-xl bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/30 dark:border-[#222e4a] flex flex-col gap-1">
                <span className="text-[11px] uppercase font-semibold text-secondary dark:text-[#94a3b8]">
                  Gross Simulated BOM Delta (Morning Shift)
                </span>
                <span
                  className={`font-mono text-2xl font-bold ${
                    totalVarianceLakh >= 0 ? 'text-error dark:text-red-400' : 'text-tertiary dark:text-emerald-400'
                  }`}
                >
                  {totalVarianceLakh >= 0 ? '▲ +' : '▼ -'}₹ {Math.abs(totalVarianceLakh).toFixed(2)} Lakh / shift
                </span>
                <p className="text-[11px] text-secondary dark:text-[#94a3b8] mt-1">
                  Affects imported bearings (EUR), brake pad linings (USD), and Hall sensors (CNY).
                </p>
              </div>

              {/* Editable Sample Parameter: Hedging Percentage Input */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a]">
                <div>
                  <span className="text-xs font-semibold text-on-surface dark:text-white block">
                    Hedging Reserve Coverage
                  </span>
                  <span className="text-[10px] text-outline dark:text-[#64748b]">
                    Editable Sample Parameter
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={hedgingPercent}
                    onChange={(e) =>
                      setHedgingPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                    }
                    className="w-16 h-7 px-2 font-mono text-xs font-bold text-right rounded bg-surface-container-high dark:bg-[#1a253d] border border-outline-variant/40 dark:border-[#243352] text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="font-mono text-xs font-bold text-secondary dark:text-[#94a3b8]">%</span>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low dark:bg-[#0e1627] border border-outline-variant/20 dark:border-[#1e2a44]">
                  <span className="text-secondary dark:text-[#94a3b8]">Net Post-Hedge Exposure</span>
                  <span className="font-mono font-bold text-primary dark:text-indigo-400">
                    {netVarianceLakh >= 0 ? '+' : '-'}₹ {Math.abs(netVarianceLakh).toFixed(2)} Lakh
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low dark:bg-[#0e1627] border border-outline-variant/20 dark:border-[#1e2a44]">
                  <span className="text-secondary dark:text-[#94a3b8]">Exchange Rate Provider</span>
                  <span className="font-mono text-secondary dark:text-[#94a3b8]">
                    {isLiveRates ? 'Frankfurter / ECB Live' : 'Offline Baseline'}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Baseline vs Shocked Landed-Cost Chart by Currency */}
      <Card
        variant="default"
        padding="md"
        header={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-2">
            <div>
              <h3 className="text-sm font-bold text-on-surface dark:text-white">
                Baseline vs. Shocked Landed Cost by Currency (₹ INR)
              </h3>
              <p className="text-[11px] text-secondary dark:text-[#94a3b8]">
                Comparison of nominal landed costs against current shock model
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
                <span className="text-secondary dark:text-[#94a3b8]">Baseline</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                <span className="text-secondary dark:text-[#94a3b8]">Shocked</span>
              </span>
            </div>
          </div>
        }
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={landedCostChartData}
              margin={{ top: 15, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.2)" />
              <XAxis
                dataKey="currency"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                unit="₹"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-surface-container-lowest dark:bg-[#0b111e] border border-outline-variant/40 dark:border-[#222e4a] p-3 rounded-xl shadow-xl text-xs font-mono">
                        <div className="font-bold text-on-surface dark:text-white mb-1.5">
                          {data.currency} Landed Cost
                        </div>
                        <div className="text-indigo-600 dark:text-indigo-400">
                          Baseline: ₹ {data.Baseline.toLocaleString('en-IN')}
                        </div>
                        <div className="text-amber-500">
                          Shocked: ₹ {data.Shocked.toLocaleString('en-IN')}
                        </div>
                        <div className="text-secondary dark:text-[#94a3b8] pt-1 border-t border-outline-variant/20 dark:border-[#1f2c47]">
                          Variance: {data.delta >= 0 ? '+' : ''}₹ {data.delta.toLocaleString('en-IN')}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="Baseline" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Shocked" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Exchange Rates Table with Source & Timestamp */}
      <Card
        variant="default"
        padding="none"
        header={
          <div className="flex items-center justify-between w-full">
            <div>
              <h3 className="text-sm font-bold text-on-surface dark:text-white">
                Live Exchange Rates Ledger & Feed Audit
              </h3>
              <p className="text-[11px] text-secondary dark:text-[#94a3b8]">
                Foreign currency exchange rates relative to INR with feed source and sync timestamp
              </p>
            </div>
            <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-surface-container dark:bg-[#162035] text-secondary dark:text-[#94a3b8]">
              {foreignCurrencies.length} Active Feeds
            </span>
          </div>
        }
      >
        <DataTable
          columns={rateColumns}
          data={foreignCurrencies}
          keyExtractor={(item) => item.code}
        />
      </Card>
    </div>
  );
};
