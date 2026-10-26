import { CustomerBuffer, WorkOrder, BomItem, PlantFeedEntry } from '../types';

export interface AdvisorRisk {
  oem: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  recommendedAction: string;
}

export interface AdvisorResult {
  isConfigured: boolean;
  message?: string;
  risks: AdvisorRisk[];
  summary: string;
  error?: string;
}

export interface HandoverIncidentItem {
  timestamp: string;
  type: string;
  description: string;
}

export interface HandoverResult {
  isConfigured: boolean;
  message?: string;
  shiftName: string;
  outgoingLead: string;
  summary: string;
  keyIncidents: HandoverIncidentItem[];
  pendingActions: string[];
  equipmentStatusOverview?: string;
  error?: string;
}

/**
 * Fetch AI line-stop risk analysis from server-side /api/advisor endpoint
 */
export async function analyzeLineStopRisks(
  buffers: CustomerBuffer[],
  workOrders: WorkOrder[],
  bomItems: BomItem[]
): Promise<AdvisorResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 16000);

  try {
    const res = await fetch('/api/advisor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        buffers,
        workOrders,
        bomItems,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return {
        isConfigured: false,
        message: errJson.message || 'Server error occurred while calling AI Advisor.',
        risks: [],
        summary: 'AI Advisor is temporarily unreachable. Check server logs.',
        error: errJson.error || `HTTP ${res.status}`,
      };
    }

    const data: AdvisorResult = await res.json();
    return data;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        isConfigured: false,
        message: 'AI Advisor request timed out after 15 seconds.',
        risks: [],
        summary: 'Request timed out. Please check network latency or Gemini API availability.',
        error: 'TIMEOUT',
      };
    }

    return {
      isConfigured: false,
      message: 'Add GEMINI_API_KEY to .env to enable the AI advisor',
      risks: [],
      summary: 'Add GEMINI_API_KEY to .env to enable the AI advisor.',
      error: err.message || 'NETWORK_ERROR',
    };
  }
}

/**
 * Fetch AI shift handover report from server-side /api/handover endpoint
 */
export async function fetchShiftHandover(
  plantFeed: PlantFeedEntry[],
  metrics: {
    penaltyAtRiskINR?: number;
    criticalBuffersCount?: number;
    averageOee?: string;
    activeWorkstations?: string;
  },
  outgoingLead: string = 'R. Deshmukh (Lead Controller)',
  shiftName: string = 'Shift A (06:00 - 14:00 IST)'
): Promise<HandoverResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 16000);

  try {
    const res = await fetch('/api/handover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plantFeed,
        metrics,
        outgoingLead,
        shiftName,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return {
        isConfigured: false,
        shiftName,
        outgoingLead,
        message: errJson.message || 'AI handover summarizer is unavailable.',
        summary: 'Manual shift telemetry audit compiled from SCADA records.',
        keyIncidents: plantFeed.slice(0, 5).map((f) => ({
          timestamp: f.timeDisplay,
          type: f.category,
          description: `${f.title}: ${f.description}`,
        })),
        pendingActions: ['Verify critical buffer replenishments', 'Review machine maintenance logs'],
      };
    }

    const data: HandoverResult = await res.json();
    return data;
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      isConfigured: false,
      shiftName,
      outgoingLead,
      message: 'Add GEMINI_API_KEY to .env to enable AI shift handover summarization',
      summary: 'Standard SCADA shift logs compiled without AI synthesis.',
      keyIncidents: plantFeed.slice(0, 5).map((f) => ({
        timestamp: f.timeDisplay,
        type: f.category,
        description: `${f.title}: ${f.description}`,
      })),
      pendingActions: [
        'Inspect critical buffer levels at customer OEM gates',
        'Check CNC tool condition offsets',
      ],
      error: err.message,
    };
  }
}
