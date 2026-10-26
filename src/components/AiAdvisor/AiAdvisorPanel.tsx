import React, { useState } from 'react';
import { Card, Skeleton } from '../ui';
import { AdvisorRisk, AdvisorResult, analyzeLineStopRisks } from '../../services/advisorService';
import { CustomerBuffer, WorkOrder, BomItem } from '../../types';

export interface AiAdvisorPanelProps {
  buffers: CustomerBuffer[];
  workOrders: WorkOrder[];
  bomItems: BomItem[];
  onExpediteOem?: (oemName: string) => void;
  onToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  autoAnalyzeTrigger?: number; // increments when disruption simulation is clicked
}

export const AiAdvisorPanel: React.FC<AiAdvisorPanelProps> = ({
  buffers,
  workOrders,
  bomItems,
  onExpediteOem,
  onToast,
  autoAnalyzeTrigger,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);

  // Auto-run analysis when autoAnalyzeTrigger changes (e.g. Disruption simulated)
  React.useEffect(() => {
    if (autoAnalyzeTrigger && autoAnalyzeTrigger > 0) {
      handleAnalyzeRisks(true);
    }
  }, [autoAnalyzeTrigger]);

  const handleAnalyzeRisks = async (isAuto = false) => {
    setLoading(true);
    try {
      const data = await analyzeLineStopRisks(buffers, workOrders, bomItems);
      setResult(data);
      setLastAnalyzedAt(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      if (data.isConfigured) {
        if (onToast) {
          onToast(
            `Gemini AI Advisor: Analysis complete. Found ${data.risks.length} JIT line-stop risk factors.`,
            'info'
          );
        }
      } else {
        if (onToast && !isAuto) {
          onToast(
            data.message || 'Add GEMINI_API_KEY to .env to enable the AI advisor',
            'warning'
          );
        }
      }
    } catch {
      setResult({
        isConfigured: false,
        message: 'Add GEMINI_API_KEY to .env to enable the AI advisor',
        risks: [],
        summary: 'Add GEMINI_API_KEY to .env to enable the AI advisor.',
      });
    } finally {
      setLoading(false);
    }
  };

  const getSeverityStyle = (severity: 'LOW' | 'MEDIUM' | 'HIGH') => {
    switch (severity) {
      case 'HIGH':
        return {
          container:
            'bg-red-500/10 dark:bg-red-950/40 border-red-500/40 dark:border-red-500/50 text-red-700 dark:text-red-300',
          badge:
            'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40',
          icon: 'warning',
          label: 'CRITICAL LINE-STOP RISK',
        };
      case 'MEDIUM':
        return {
          container:
            'bg-amber-500/10 dark:bg-amber-950/40 border-amber-500/40 dark:border-amber-500/50 text-amber-700 dark:text-amber-300',
          badge:
            'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40',
          icon: 'schedule',
          label: 'ELEVATED BUFFER RISK',
        };
      case 'LOW':
      default:
        return {
          container:
            'bg-emerald-500/10 dark:bg-emerald-950/40 border-emerald-500/40 dark:border-emerald-500/50 text-emerald-700 dark:text-emerald-300',
          badge:
            'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
          icon: 'check_circle',
          label: 'NOMINAL MONITORING',
        };
    }
  };

  return (
    <Card
      variant="default"
      padding="md"
      className="border-primary/30 dark:border-indigo-500/30 shadow-md relative overflow-hidden"
      header={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/30 flex items-center justify-center text-primary dark:text-indigo-400 border border-primary/30">
              <span className="material-symbols-outlined text-[20px]">psychology</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-on-surface dark:text-white">
                  Gemini JIT Line-Stop Advisor
                </h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-primary/10 text-primary dark:bg-indigo-950/60 dark:text-indigo-300 border border-primary/20">
                  GenAI Telematics
                </span>
              </div>
              <p className="text-[11px] text-secondary dark:text-[#94a3b8]">
                Real-time reasoning over live buffer burn-down hours, transit corridors, and plant work orders
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {lastAnalyzedAt && (
              <span className="text-[10px] font-mono text-secondary dark:text-[#94a3b8] hidden md:inline">
                Analyzed at {lastAnalyzedAt}
              </span>
            )}
            <button
              type="button"
              onClick={() => handleAnalyzeRisks(false)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-hover text-white transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
                {loading ? 'refresh' : 'neurology'}
              </span>
              <span>{loading ? 'Analyzing Telemetry...' : 'Analyze Line-Stop Risk'}</span>
            </button>
          </div>
        </div>
      }
    >
      {/* 1. Loading Skeleton */}
      {loading && (
        <div className="flex flex-col gap-4 py-2">
          <div className="p-3 bg-surface-container dark:bg-[#131c31] rounded-xl border border-outline-variant/30 flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 bg-surface-container dark:bg-[#131c31] rounded-xl border border-outline-variant/30 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-7 w-28 mt-2" />
            </div>
            <div className="p-3 bg-surface-container dark:bg-[#131c31] rounded-xl border border-outline-variant/30 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-7 w-28 mt-2" />
            </div>
          </div>
        </div>
      )}

      {/* 2. Unconfigured / Missing API Key Friendly Banner */}
      {!loading && result && !result.isConfigured && (
        <div className="p-4 rounded-xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 text-on-surface dark:text-white flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px]">key</span>
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300">
                AI Advisor Credentials Notice
              </h4>
              <p className="text-xs text-amber-900/90 dark:text-amber-200/90 mt-0.5 leading-relaxed">
                {result.message || 'Add GEMINI_API_KEY to .env to enable the AI advisor'}
              </p>
            </div>
          </div>

          <div className="bg-surface-container-lowest dark:bg-[#070b14] p-3 rounded-lg border border-outline-variant/20 dark:border-[#222e4a] text-[11px] font-mono text-secondary dark:text-[#94a3b8]">
            <p className="text-on-surface dark:text-slate-300 font-semibold mb-1">
              Setup instructions (app/.env):
            </p>
            <div className="space-y-0.5 select-all">
              <p className="text-emerald-600 dark:text-emerald-400">GEMINI_API_KEY=your_gemini_api_key_here</p>
              <p className="text-indigo-600 dark:text-indigo-400">GEMINI_MODEL=gemini-2.5-flash</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Successful GenAI Analysis Results */}
      {!loading && result && result.isConfigured && (
        <div className="flex flex-col gap-4">
          {/* Executive Summary */}
          {result.summary && (
            <div className="p-3.5 bg-surface-container dark:bg-[#131c31] rounded-xl border border-primary/20 dark:border-indigo-500/20 text-xs">
              <div className="flex items-center gap-1.5 text-primary dark:text-indigo-400 font-bold mb-1">
                <span className="material-symbols-outlined text-[16px]">summarize</span>
                <span>Executive Situation Report:</span>
              </div>
              <p className="text-on-surface dark:text-[#e2e8f0] leading-relaxed">
                {result.summary}
              </p>
            </div>
          )}

          {/* Risk Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {result.risks.map((risk, idx) => {
              const style = getSeverityStyle(risk.severity);
              return (
                <div
                  key={`${risk.oem}-${idx}`}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 ${style.container}`}
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs uppercase tracking-wide text-on-surface dark:text-white">
                        {risk.oem}
                      </span>
                      <span
                        className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${style.badge}`}
                      >
                        <span className="material-symbols-outlined text-[11px]">{style.icon}</span>
                        {style.label}
                      </span>
                    </div>

                    <div className="text-[11px] leading-relaxed text-secondary dark:text-slate-300">
                      <span className="font-semibold text-on-surface dark:text-white">Reason: </span>
                      {risk.reason}
                    </div>

                    <div className="p-2 rounded bg-surface-container-lowest/80 dark:bg-[#070b14]/70 border border-outline-variant/20 dark:border-[#222e4a] text-[11px] text-on-surface dark:text-slate-200">
                      <span className="font-bold text-primary dark:text-indigo-400">Recommendation: </span>
                      {risk.recommendedAction}
                    </div>
                  </div>

                  {/* Expedite Transit Action */}
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 dark:border-[#243352]">
                    <span className="text-[10px] font-mono text-secondary dark:text-slate-400">
                      Chakan JIT Dispatch
                    </span>
                    <button
                      type="button"
                      onClick={() => onExpediteOem && onExpediteOem(risk.oem)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-primary hover:bg-primary-hover text-white shadow-sm transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[13px]">local_shipping</span>
                      <span>Expedite Transit (+50 Units)</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Initial Idle State before first analysis */}
      {!loading && !result && (
        <div className="py-6 px-4 rounded-xl border border-dashed border-outline-variant/40 dark:border-[#222e4a] flex flex-col items-center justify-center text-center gap-2.5 bg-surface-container-lowest/40 dark:bg-[#0b111e]/40">
          <div className="w-10 h-10 rounded-full bg-primary/10 dark:bg-indigo-950/50 flex items-center justify-center text-primary dark:text-indigo-400">
            <span className="material-symbols-outlined text-[24px]">smart_toy</span>
          </div>
          <div className="max-w-md">
            <h4 className="text-xs font-bold text-on-surface dark:text-white">
              AI Line-Stop Risk Analysis Standby
            </h4>
            <p className="text-[11px] text-secondary dark:text-[#94a3b8] mt-0.5">
              Click &quot;Analyze Line-Stop Risk&quot; or simulate a supply disruption to evaluate buffer run-out hours, transit bottlenecks, and automated replenishment recommendations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleAnalyzeRisks(false)}
            className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-container hover:bg-surface-container-high dark:bg-[#131c31] dark:hover:bg-[#1a2640] border border-outline-variant/40 dark:border-[#2b3a58] text-on-surface dark:text-white transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px] text-primary dark:text-indigo-400">
              bolt
            </span>
            <span>Run Initial Diagnostics</span>
          </button>
        </div>
      )}
    </Card>
  );
};
