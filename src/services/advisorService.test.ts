import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeLineStopRisks, fetchShiftHandover } from './advisorService';
import { CustomerBuffer, WorkOrder, BomItem, PlantFeedEntry } from '../types';

describe('advisorService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockBuffers: CustomerBuffer[] = [
    {
      id: 'buf-tata-sanand',
      oemName: 'Tata Motors Passenger Vehicles',
      plantLocation: 'Sanand Plant, Gujarat',
      partNumber: 'BA-TX-401',
      partDescription: 'Automated Transmission Differential Unit',
      currentStockUnits: 180,
      consumptionPerHour: 100,
      runOutHours: 1.8,
      status: 'CRITICAL',
      penaltyPerHourINR: 2400000,
      highwayCorridor: 'NH-48 Western Express',
    },
  ];

  const mockWorkOrders: WorkOrder[] = [
    {
      id: 'WO-8821',
      oemName: 'Tata Motors',
      partNumber: 'BA-TX-401',
      partDescription: 'Differential Casing',
      quantity: 250,
      stage: 'MACHINING',
      machineId: 'CNC-01',
      priority: 'Rush',
      progress: 60,
      status: 'IN_PROGRESS',
      dueShift: 'Morning Shift',
      dueTime: '18:00',
      scrapCount: 0,
      scrapRate: '0 pcs (0.0%)',
    },
  ];

  const mockBom: BomItem[] = [
    {
      id: 'bom-1',
      partNumber: 'BA-TX-401',
      description: 'Differential Casing',
      level: 1,
      currentStock: 180,
      safetyStock: 300,
      unitCost: 14500,
      currency: 'INR',
      leadTimeDays: 3,
      supplierId: 'sup-1',
      category: 'Forging',
      qtyPerAssembly: 1,
    },
  ];

  it('handles missing GEMINI_API_KEY gracefully without throwing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        isConfigured: false,
        message: 'Add GEMINI_API_KEY to .env to enable the AI advisor',
        risks: [],
        summary: 'AI Advisor is standing by. Add GEMINI_API_KEY to .env.',
      }),
    } as any);

    const result = await analyzeLineStopRisks(mockBuffers, mockWorkOrders, mockBom);

    expect(result.isConfigured).toBe(false);
    expect(result.message).toContain('Add GEMINI_API_KEY to .env to enable the AI advisor');
    expect(result.risks).toEqual([]);
    expect(result.summary).toBeDefined();
  });

  it('returns structured risk items when configured', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        isConfigured: true,
        risks: [
          {
            oem: 'Tata Motors Passenger Vehicles',
            severity: 'HIGH',
            reason: 'Buffer at 1.8h with 100/hr burn rate.',
            recommendedAction: 'Expedite Convoy #TRK-MH12-9844.',
          },
        ],
        summary: 'Critical bottleneck on Sanand corridor.',
      }),
    } as any);

    const result = await analyzeLineStopRisks(mockBuffers, mockWorkOrders, mockBom);

    expect(result.isConfigured).toBe(true);
    expect(result.risks).toHaveLength(1);
    expect(result.risks[0].severity).toBe('HIGH');
    expect(result.risks[0].oem).toBe('Tata Motors Passenger Vehicles');
  });

  it('handles network failure or fetch error gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const result = await analyzeLineStopRisks(mockBuffers, mockWorkOrders, mockBom);

    expect(result.isConfigured).toBe(false);
    expect(result.message).toContain('Add GEMINI_API_KEY to .env');
  });

  it('fetches shift handover summary and falls back safely if unconfigured', async () => {
    const mockFeed: PlantFeedEntry[] = [
      {
        id: 'f-1',
        timestamp: '2026-10-26T10:00:00Z',
        timeDisplay: '10:00',
        category: 'DISRUPTION',
        title: 'Bottleneck',
        description: 'Rain on NH-48',
        severity: 'CRITICAL',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        isConfigured: false,
        message: 'Add GEMINI_API_KEY to .env to enable AI shift handover summarization',
        shiftName: 'Shift A',
        outgoingLead: 'R. Deshmukh',
        summary: 'Standard SCADA log summary.',
        keyIncidents: [
          { timestamp: '10:00', type: 'DISRUPTION', description: 'Bottleneck: Rain on NH-48' },
        ],
        pendingActions: ['Check buffer'],
      }),
    } as any);

    const handover = await fetchShiftHandover(mockFeed, { averageOee: '88.4%' });

    expect(handover.isConfigured).toBe(false);
    expect(handover.shiftName).toBe('Shift A');
    expect(handover.keyIncidents).toHaveLength(1);
  });
});
