import { describe, it, expect, vi, beforeEach } from 'vitest';
import askHandler, {
  executeGetBufferStatus,
  executeSimulateTruckDelay,
  executeGetLowStockItems,
  executeGetMachineStatus,
} from './ask';
import { CustomerBuffer, Truck, BomItem, Machine, Corridor } from '../src/types';

describe('/api/ask Endpoint & Pure Tool Implementations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Pure Tool Execution Handlers', () => {
    const mockBuffers: CustomerBuffer[] = [
      {
        id: 'buf-1',
        oemName: 'Tata Motors',
        plantLocation: 'Sanand',
        partDescription: 'Front Axle Module',
        partNumber: 'BA-TATA-401',
        currentStockUnits: 180,
        consumptionPerHour: 100,
        runOutHours: 1.8,
        penaltyPerHourINR: 2500000,
        status: 'CRITICAL',
        assignedTruckId: 'MH-14-GH-4091',
        highwayCorridor: 'corridor-chakan-sanand',
      },
      {
        id: 'buf-2',
        oemName: 'Mahindra & Mahindra',
        plantLocation: 'Chakan',
        partDescription: 'Knuckle Castings',
        partNumber: 'BA-MM-880',
        currentStockUnits: 500,
        consumptionPerHour: 100,
        runOutHours: 5.0,
        penaltyPerHourINR: 1800000,
        status: 'WARNING',
        assignedTruckId: 'MH-12-PQ-9912',
        highwayCorridor: 'Talegaon Bypass',
      },
    ];

    it('executeGetBufferStatus returns filtered buffer status and penalty exposure', () => {
      // Query specific OEM
      const tata = executeGetBufferStatus(mockBuffers, 'Tata Motors');
      expect(tata.length).toBe(1);
      expect(tata[0].oemName).toBe('Tata Motors');
      expect(tata[0].runOutHours).toBe(1.8);
      expect(tata[0].status).toBe('CRITICAL');
      expect(tata[0].penaltyExposureINR).toBe(3000000); // (3.0 - 1.8) * 2.5M

      // Query without filter returns all
      const all = executeGetBufferStatus(mockBuffers);
      expect(all.length).toBe(2);
    });

    it('executeSimulateTruckDelay calculates updated ETA and downstream buffer impact', () => {
      const mockTrucks: Truck[] = [
        {
          id: 'trk-1',
          registrationNumber: 'MH-14-GH-4091',
          corridorId: 'cor-1',
          origin: 'Chakan',
          destination: 'Sanand',
          destinationOem: 'Tata Motors',
          cargoDescription: '150 Front Axles',
          unitsLoaded: 150,
          currentLat: 18.7,
          currentLng: 73.8,
          targetLat: 18.9,
          targetLng: 73.9,
          progressPct: 50,
          speedKmph: 50,
          fastagTollStatus: 'Nominal',
          etaMinutes: 120,
          isExpedited: false,
          lastPingTime: 'Now',
        },
      ];

      const mockCorridors: Corridor[] = [
        {
          id: 'cor-1',
          name: 'Chakan - Sanand Corridor',
          originCity: 'Chakan',
          destinationCity: 'Sanand',
          totalDistanceKm: 650,
          standardDurationHours: 12,
          waypoints: [],
          activeTollPlazas: [],
        },
      ];

      const result = executeSimulateTruckDelay(
        mockTrucks,
        mockBuffers,
        mockCorridors,
        'MH-14-GH-4091',
        2.0 // 2 hours delay
      );

      expect(result.truckId).toBe('trk-1');
      expect(result.standardEtaMinutes).toBe(120);
      expect(result.simulatedEtaMinutes).toBe(240); // 120 + 2h * 60
      expect(result.downstreamBufferImpact).toBeDefined();
      expect(result.downstreamBufferImpact.currentRunOutHours).toBe(1.8);
      // Depletes buffer by 2h: Math.max(0, 1.8 - 2.0) = 0.0h
      expect(result.downstreamBufferImpact.simulatedRunOutHours).toBe(0.0);
      expect(result.downstreamBufferImpact.simulatedStatus).toBe('CRITICAL');
      expect(result.downstreamBufferImpact.additionalPenaltyINR).toBe(4500000);
    });

    it('executeGetLowStockItems collects BOM items with deficits', () => {
      const mockBom: BomItem[] = [
        {
          id: 'bom-1',
          partNumber: 'BA-RAW-101',
          description: 'SG-Iron Casting',
          level: 2,
          qtyPerAssembly: 1,
          unitCost: 1500,
          currency: 'INR',
          currentStock: 120, // Deficit! safetyStock is 600
          safetyStock: 600,
          leadTimeDays: 5,
          supplierId: 'sup-kalyani',
          category: 'Casting',
        },
      ];

      const lowItems = executeGetLowStockItems(mockBom);
      expect(lowItems.length).toBe(1);
      expect(lowItems[0].partNumber).toBe('BA-RAW-101');
      expect(lowItems[0].deficitUnits).toBe(480);
      expect(lowItems[0].isCriticalDeficit).toBe(true);
    });

    it('executeGetMachineStatus maps machines and operational health', () => {
      const mockMachines: Machine[] = [
        {
          id: 'CNC-01',
          name: 'CNC-01',
          model: 'Doosan 5-Axis',
          operation: 'Crankshaft Machining',
          status: 'RUNNING',
          oee: 91.2,
          availability: 94,
          performance: 98,
          quality: 99,
          operator: 'S. Patil',
        },
        {
          id: 'VMC-01',
          name: 'VMC-01',
          model: 'Haas VF-4',
          operation: 'Brake Milling',
          status: 'MAINTENANCE',
          oee: 0.0,
          availability: 0,
          performance: 0,
          quality: 0,
          operator: 'Crew',
          statusReason: 'Spindle Bearing Seizure',
        },
      ];

      const machines = executeGetMachineStatus(mockMachines);
      expect(machines.length).toBe(2);
      expect(machines[0].status).toBe('RUNNING');
      expect(machines[1].status).toBe('MAINTENANCE');
      expect(machines[1].statusReason).toBe('Spindle Bearing Seizure');
    });
  });

  describe('Serverless Request Validation', () => {
    it('rejects non-POST requests with 405', async () => {
      let statusCode = 0;
      let jsonBody: any = null;

      const req: any = { method: 'GET' };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonBody = data;
          return res;
        },
      };

      await askHandler(req, res);
      expect(statusCode).toBe(405);
      expect(jsonBody?.error).toBe('METHOD_NOT_ALLOWED');
    });

    it('rejects payloads exceeding 100 kB with 413', async () => {
      let statusCode = 0;
      let jsonBody: any = null;

      const hugeString = 'x'.repeat(105000);
      const req: any = {
        method: 'POST',
        body: { message: hugeString },
      };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonBody = data;
          return res;
        },
      };

      await askHandler(req, res);
      expect(statusCode).toBe(413);
      expect(jsonBody?.error).toBe('PAYLOAD_TOO_LARGE');
    });

    it('validates missing or empty message with 400', async () => {
      let statusCode = 0;
      let jsonBody: any = null;

      const req: any = {
        method: 'POST',
        body: { message: '   ' },
      };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonBody = data;
          return res;
        },
      };

      await askHandler(req, res);
      expect(statusCode).toBe(400);
      expect(jsonBody?.error).toBe('INVALID_INPUT');
    });

    it('returns friendly message without crashing when GEMINI_API_KEY is missing', async () => {
      const origKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      let statusCode = 0;
      let jsonBody: any = null;

      const req: any = {
        method: 'POST',
        headers: { 'x-forwarded-for': '127.0.0.1' },
        body: { message: 'What is Tata Motors buffer status?' },
      };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonBody = data;
          return res;
        },
      };

      await askHandler(req, res);
      expect(statusCode).toBe(200);
      expect(jsonBody?.isConfigured).toBe(false);
      expect(jsonBody?.answer).toContain('Add GEMINI_API_KEY to .env to enable the \'Ask the Plant\' AI assistant');

      process.env.GEMINI_API_KEY = origKey;
    });
  });
});
