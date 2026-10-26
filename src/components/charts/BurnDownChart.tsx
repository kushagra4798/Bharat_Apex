import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
  CartesianGrid,
} from 'recharts';
import { CustomerBuffer } from '../../types';

export interface BurnDownChartProps {
  buffers: CustomerBuffer[];
  criticalThresholdHours?: number;
  isDark?: boolean;
}

export const BurnDownChart: React.FC<BurnDownChartProps> = ({
  buffers,
  criticalThresholdHours = 3.0,
  isDark = true,
}) => {
  // Map buffers to chart format
  const chartData = buffers.map((b) => ({
    name: b.oemName.replace('Motor India', '').replace('& Mahindra', '').trim(),
    fullName: `${b.oemName} (${b.plantLocation.split(',')[0]})`,
    hours: b.runOutHours,
    units: b.currentStockUnits,
    consumption: b.consumptionPerHour,
    penalty: b.penaltyPerHourINR,
    part: b.partDescription,
    status: b.runOutHours < 3.0 ? 'CRITICAL' : b.runOutHours < 6.0 ? 'WARNING' : 'SAFE',
  }));

  const getBarColor = (hours: number) => {
    if (hours < 3.0) return isDark ? '#f87171' : '#ba1a1a';
    if (hours < 6.0) return isDark ? '#fbbf24' : '#d97706';
    return isDark ? '#6366f1' : '#4f46e5';
  };

  const axisTextColor = isDark ? '#94a3b8' : '#565e74';
  const gridColor = isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(203, 219, 245, 0.4)';

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="h-64 sm:h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 24, right: 30, left: 10, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
            <XAxis
              type="number"
              domain={[0, 10]}
              ticks={[0, 2, 3, 4, 6, 8, 10]}
              tick={{ fill: axisTextColor, fontSize: 11, fontFamily: 'JetBrains Mono' }}
              unit="h"
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fill: axisTextColor, fontSize: 11, fontWeight: 600 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-surface-container-lowest dark:bg-[#0b111e] border border-outline-variant/40 dark:border-[#222e4a] p-3 rounded-xl shadow-xl text-xs font-sans max-w-xs">
                      <div className="font-bold text-on-surface dark:text-white mb-1">
                        {data.fullName}
                      </div>
                      <div className="text-[11px] text-secondary dark:text-[#94a3b8] mb-2 truncate">
                        {data.part}
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-secondary dark:text-[#94a3b8]">Run-Out Buffer:</span>
                          <span
                            className={`font-bold ${
                              data.hours < 3.0
                                ? 'text-error dark:text-red-400'
                                : data.hours < 6.0
                                ? 'text-amber-500'
                                : 'text-emerald-500'
                            }`}
                          >
                            {data.hours} hours
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-secondary dark:text-[#94a3b8]">Dock Inventory:</span>
                          <span className="text-on-surface dark:text-white">{data.units} units</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-secondary dark:text-[#94a3b8]">Consumption:</span>
                          <span className="text-on-surface dark:text-white">
                            {data.consumption} units/hr
                          </span>
                        </div>
                        {data.hours < 3.0 && (
                          <div className="flex justify-between text-error dark:text-red-400 font-bold pt-1 border-t border-error/20">
                            <span>Penalty Exposure:</span>
                            <span>₹{(data.penalty / 100000).toFixed(0)}L/hr</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            {/* 3.0h Stop Threshold Vertical Reference Line */}
            <ReferenceLine
              x={criticalThresholdHours}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{
                value: '3.0h Line-Stop Threshold',
                position: 'top',
                fill: '#ef4444',
                fontSize: 10,
                fontWeight: 'bold',
              }}
            />
            <Bar dataKey="hours" radius={[0, 6, 6, 0]} barSize={18}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.hours)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Axis Scale Legend */}
      <div className="flex justify-between items-center text-[10px] font-mono text-secondary dark:text-[#94a3b8] px-2 pt-1 border-t border-outline-variant/20 dark:border-[#1f2c47]">
        <span>0.0h Depleted</span>
        <span className="text-error dark:text-red-400 font-bold">&lt; 3.0h Stop Threshold</span>
        <span>5.0h Buffer</span>
        <span className="text-primary dark:text-indigo-400 font-semibold">&gt; 6.0h Nominal JIT Buffer</span>
      </div>
    </div>
  );
};
