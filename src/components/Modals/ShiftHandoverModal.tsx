import React, { useState, useEffect } from 'react';
import { Modal, Skeleton } from '../ui';
import { PlantFeedEntry } from '../../types';
import { HandoverResult, fetchShiftHandover } from '../../services/advisorService';

export interface ShiftHandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  plantFeed: PlantFeedEntry[];
  metrics: {
    penaltyAtRiskINR?: number;
    criticalBuffersCount?: number;
    averageOee?: string;
    activeWorkstations?: string;
  };
  onToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const ShiftHandoverModal: React.FC<ShiftHandoverModalProps> = ({
  isOpen,
  onClose,
  plantFeed,
  metrics,
  onToast,
}) => {
  const [loading, setLoading] = useState(false);
  const [handoverData, setHandoverData] = useState<HandoverResult | null>(null);
  const [checkedActions, setCheckedActions] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      loadHandover();
    }
  }, [isOpen]);

  const loadHandover = async () => {
    setLoading(true);
    try {
      const data = await fetchShiftHandover(plantFeed, metrics);
      setHandoverData(data);
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('bharat_apex_latest_handover', JSON.stringify(data));
      }
    } catch {
      // Error is caught gracefully by fetchShiftHandover
    } finally {
      setLoading(false);
    }
  };

  const toggleAction = (idx: number) => {
    setCheckedActions((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleExportJson = () => {
    if (!handoverData) return;
    const blob = new Blob([JSON.stringify(handoverData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BharatApex_ShiftHandover_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (onToast) {
      onToast('Shift Handover Briefing exported as JSON.', 'success');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title="Shift Handover Telemetry Briefing"
      subtitle="ISO/TS 16949 Supervisor Handover · Chakan Complex Line 4"
      icon={<span className="material-symbols-outlined text-primary text-[20px]">assignment_turned_in</span>}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {handoverData && (
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  handoverData.isConfigured
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                }`}
              >
                {handoverData.isConfigured ? 'GenAI Synthesis Active' : 'SCADA Telemetry Fallback'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportJson}
              disabled={!handoverData || loading}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-container-high hover:bg-surface-container-highest dark:bg-[#1a2640] dark:hover:bg-[#223354] border border-outline-variant/30 text-on-surface dark:text-white transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[15px]">download</span>
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-hover text-white transition-all cursor-pointer"
            >
              Close Briefing
            </button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-4 py-3">
          <div className="p-3 bg-surface-container dark:bg-[#131c31] rounded-xl flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <div className="p-3 bg-surface-container dark:bg-[#131c31] rounded-xl flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ) : handoverData ? (
        <div className="flex flex-col gap-4 text-xs">
          {/* Header Metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-surface-container dark:bg-[#131c31] rounded-xl border border-outline-variant/30 text-[11px]">
            <div>
              <span className="text-secondary dark:text-[#94a3b8] block">Shift Name</span>
              <span className="font-bold text-on-surface dark:text-white">{handoverData.shiftName}</span>
            </div>
            <div>
              <span className="text-secondary dark:text-[#94a3b8] block">Outgoing Lead</span>
              <span className="font-bold text-on-surface dark:text-white">{handoverData.outgoingLead}</span>
            </div>
            <div>
              <span className="text-secondary dark:text-[#94a3b8] block">Plant OEE</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {metrics.averageOee || '88.4%'}
              </span>
            </div>
            <div>
              <span className="text-secondary dark:text-[#94a3b8] block">Critical Buffers</span>
              <span className="font-bold text-error font-mono">
                {metrics.criticalBuffersCount || 0} Lines At Risk
              </span>
            </div>
          </div>

          {/* Missing Key Warning if unconfigured */}
          {!handoverData.isConfigured && (
            <div className="p-3 bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 rounded-xl text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400">info</span>
              <span>
                {handoverData.message || 'Add GEMINI_API_KEY to .env to enable AI shift handover summarization.'}
              </span>
            </div>
          )}

          {/* Executive Summary */}
          <div className="p-3.5 bg-surface-container dark:bg-[#131c31] rounded-xl border border-outline-variant/30">
            <div className="flex items-center gap-1.5 font-bold text-on-surface dark:text-white mb-1.5">
              <span className="material-symbols-outlined text-primary text-[16px]">summarize</span>
              <span>Operational Summary</span>
            </div>
            <p className="text-secondary dark:text-[#cbd5e1] leading-relaxed">
              {handoverData.summary}
            </p>
          </div>

          {/* Key Incidents Timeline */}
          {handoverData.keyIncidents && handoverData.keyIncidents.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="font-bold text-on-surface dark:text-white">
                Shift Events & Telemetry Incidents ({handoverData.keyIncidents.length})
              </span>
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                {handoverData.keyIncidents.map((incident, i) => (
                  <div
                    key={i}
                    className="p-2.5 bg-surface-container-low dark:bg-[#0d1726] rounded-lg border border-outline-variant/20 flex items-start gap-2.5"
                  >
                    <span className="font-mono text-[11px] font-semibold text-secondary dark:text-[#94a3b8] shrink-0 pt-0.5">
                      {incident.timestamp}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-bold shrink-0 ${
                        incident.type === 'DISRUPTION'
                          ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                          : incident.type === 'MAINTENANCE'
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                          : incident.type === 'EXPEDITE'
                          ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                          : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {incident.type}
                    </span>
                    <span className="text-secondary dark:text-[#e2e8f0] flex-1 leading-snug">
                      {incident.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Actions Checklist */}
          {handoverData.pendingActions && handoverData.pendingActions.length > 0 && (
            <div className="p-3.5 bg-surface-container dark:bg-[#131c31] rounded-xl border border-outline-variant/30 flex flex-col gap-2">
              <span className="font-bold text-on-surface dark:text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-[16px]">checklist</span>
                <span>Incoming Supervisor Checklist</span>
              </span>
              <div className="flex flex-col gap-1.5">
                {handoverData.pendingActions.map((action, idx) => (
                  <label
                    key={idx}
                    className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${
                      checkedActions[idx]
                        ? 'bg-emerald-500/10 dark:bg-emerald-950/30 line-through text-secondary dark:text-[#94a3b8]'
                        : 'bg-surface-container-low dark:bg-[#0d1726] text-on-surface dark:text-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!checkedActions[idx]}
                      onChange={() => toggleAction(idx)}
                      className="rounded border-outline-variant text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                    />
                    <span className="leading-snug">{action}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
};
