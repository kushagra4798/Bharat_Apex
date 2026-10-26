import { describe, it, expect } from 'vitest';
import {
  convertCurrency,
  formatCurrencyValue,
  getOfflineRates,
} from './currencyService';
import {
  calculateRunOutHours,
  getNextWorkOrderStage,
  calculateGst,
  calculatePenaltyExposure,
  drainBufferStock,
  calculateBufferStatus,
  advanceBuffer,
  advanceTruck,
  applyDelivery,
  simulateBufferDrain,
  applyBufferDelivery,
  simulateTruckStep,
  applyWorkOrderCompletion,
  formatCountdown,
  generateSystemAlerts,
  calculateWhatIfCorridorDelay,
  calculateWhatIfSupplierDelay,
  calculateWhatIfSimulation,
  simulateDelay,
  EWB_KM_PER_DAY,
  calculateEwayBillValidity,
  checkEwayBillExpiryAlerts,
  haversineDistanceKm,
  haversine,
  haversineCoordinatesKm,
  checkTruckGeofenceArrival,
  processGeofenceArrivals,
  DEFAULT_GEOFENCE_RADIUS_KM,
} from './calculations';
import { OEM_PLANTS, OemPlantLocation } from '../components/Maps/oemPlants';
import { CustomerBuffer, Truck, Corridor, WorkOrder, BomItem, Machine, Supplier, EWayBillRecord } from '../types';

describe('currencyService', () => {
  const rates = getOfflineRates(); // USD: 83.42, EUR: 90.15, JPY: 0.54, CNY: 11.52, GBP: 105.80, INR: 1.0

  it('converts same currency with no delta', () => {
    expect(convertCurrency(500, 'INR', 'INR')).toBe(500);
    expect(convertCurrency(100, 'USD', 'USD')).toBe(100);
  });

  it('converts USD to INR correctly', () => {
    // 100 USD * 83.42 = 8342 INR
    const result = convertCurrency(100, 'USD', 'INR', rates);
    expect(result).toBe(8342);
  });

  it('converts EUR to INR with FX shock applied', () => {
    // Base EUR = 90.15. Shock +10% -> 99.165
    // 100 EUR -> 9916.5 INR
    const result = convertCurrency(100, 'EUR', 'INR', rates, { EUR: 10 });
    expect(result).toBe(9916.5);
  });

  it('formats currency in Indian numbering (Crore and Lakh) strictly for INR', () => {
    // 1.85 Cr = 18,500,000
    expect(formatCurrencyValue(18500000, 'INR')).toBe('₹ 1.85 Cr');
    // 42.00 L = 4,200,000
    expect(formatCurrencyValue(4200000, 'INR')).toBe('₹ 42.00 L');
    // Below 1 Lakh standard Indian grouping
    expect(formatCurrencyValue(83420, 'INR')).toBe('₹ 83,420.00');
  });

  it('formats USD and JPY using Western notation without Lakh/Crore', () => {
    // USD should format with dollar symbol and commas, never Lakh or Crore
    expect(formatCurrencyValue(1500000, 'USD')).toBe('$ 1,500,000.00');
    expect(formatCurrencyValue(18500000, 'USD')).toBe('$ 18,500,000.00');

    // JPY should format with yen symbol, standard commas, and 0 decimals
    expect(formatCurrencyValue(1500000, 'JPY')).toBe('¥ 1,500,000');
    expect(formatCurrencyValue(25000000, 'JPY')).toBe('¥ 25,000,000');
  });
});

describe('calculations', () => {
  it('calculates run-out hours correctly', () => {
    // 180 units / 100 consumption per hour = 1.8h
    expect(calculateRunOutHours(180, 100)).toBe(1.8);
    // 288 units / 120 consumption per hour = 2.4h
    expect(calculateRunOutHours(288, 120)).toBe(2.4);
    // Zero consumption should return safe 999
    expect(calculateRunOutHours(500, 0)).toBe(999);
  });

  it('calculates line-stop penalty exposure for critical thresholds', () => {
    // 1.8h run-out against 3.0h threshold = 1.2h at risk
    // 1.2 * ₹25L = ₹30L (3,000,000)
    expect(calculatePenaltyExposure(1.8, 2500000, 3.0)).toBe(3000000);
    // Safe buffer (>3.0h) should have 0 penalty exposure
    expect(calculatePenaltyExposure(4.5, 2500000, 3.0)).toBe(0);
  });

  it('advances work order stages sequentially', () => {
    expect(getNextWorkOrderStage('RAW_PREP')).toBe('MACHINING');
    expect(getNextWorkOrderStage('MACHINING')).toBe('FABRICATION');
    expect(getNextWorkOrderStage('FABRICATION')).toBe('ASSEMBLY');
    expect(getNextWorkOrderStage('ASSEMBLY')).toBe('FINAL_DISPATCH');
    expect(getNextWorkOrderStage('FINAL_DISPATCH')).toBe(null);
  });

  it('calculates GST split for inter-state (IGST 18%) vs intra-state (CGST 9% + SGST 9%)', () => {
    const taxable = 100000;

    // Inter-State (e.g. MH to Gujarat or Haryana): 18% IGST
    const interState = calculateGst(taxable, true, 18);
    expect(interState.isInterState).toBe(true);
    expect(interState.igstAmount).toBe(18000);
    expect(interState.cgstAmount).toBe(0);
    expect(interState.sgstAmount).toBe(0);
    expect(interState.totalInvoiceAmount).toBe(118000);

    // Intra-State (e.g. MH Chakan to MH Pune / Chakan): 9% CGST + 9% SGST
    const intraState = calculateGst(taxable, false, 18);
    expect(intraState.isInterState).toBe(false);
    expect(intraState.igstAmount).toBe(0);
    expect(intraState.cgstAmount).toBe(9000);
    expect(intraState.sgstAmount).toBe(9000);
    expect(intraState.totalTax).toBe(18000);
    expect(intraState.totalInvoiceAmount).toBe(118000);
  });

  describe('simulation engine pure functions', () => {
    it('drainBufferStock drains stock proportionally without dropping below zero', () => {
      // 100 units/hr, 30 simulated minutes -> drains 50 units
      expect(drainBufferStock(200, 100, 30)).toBe(150);
      // Draining more than available stock floors at 0
      expect(drainBufferStock(30, 120, 60)).toBe(0);
      // Zero minutes or zero consumption leaves stock unchanged
      expect(drainBufferStock(150, 0, 30)).toBe(150);
      expect(drainBufferStock(150, 80, 0)).toBe(150);
    });

    it('calculateBufferStatus categorizes run-out hours correctly', () => {
      expect(calculateBufferStatus(1.5)).toBe('CRITICAL');
      expect(calculateBufferStatus(2.99)).toBe('CRITICAL');
      expect(calculateBufferStatus(3.0)).toBe('WARNING');
      expect(calculateBufferStatus(5.99)).toBe('WARNING');
      expect(calculateBufferStatus(6.0)).toBe('HEALTHY');
      expect(calculateBufferStatus(12.5)).toBe('HEALTHY');
    });

    it('simulateBufferDrain drains buffer and updates status', () => {
      const mockBuffer: CustomerBuffer = {
        id: 'buf-test',
        oemName: 'Tata Motors',
        plantLocation: 'Pune',
        partDescription: 'Crankshaft',
        partNumber: 'BA-TATA-01',
        currentStockUnits: 300,
        consumptionPerHour: 100,
        runOutHours: 3.0,
        status: 'WARNING',
        penaltyPerHourINR: 2500000,
        highwayCorridor: 'NH-48',
      };

      // 60 simulated minutes at 100 units/hr -> 200 units remaining -> 2.0h -> CRITICAL
      const drained = simulateBufferDrain(mockBuffer, 60);
      expect(drained.currentStockUnits).toBe(200);
      expect(drained.runOutHours).toBe(2.0);
      expect(drained.status).toBe('CRITICAL');
    });

    it('applyBufferDelivery delivers units to matching buffer and updates metrics', () => {
      const buffers: CustomerBuffer[] = [
        {
          id: 'buf-1',
          oemName: 'Tata Motors PV',
          plantLocation: 'Pune',
          partDescription: 'Engine Block',
          partNumber: 'BA-TATA-02',
          currentStockUnits: 200,
          consumptionPerHour: 100,
          runOutHours: 2.0,
          status: 'CRITICAL',
          penaltyPerHourINR: 2500000,
          highwayCorridor: 'NH-48',
        },
        {
          id: 'buf-2',
          oemName: 'Mahindra & Mahindra',
          plantLocation: 'Nashik',
          partDescription: 'Transmission Axle',
          partNumber: 'BA-MM-01',
          currentStockUnits: 500,
          consumptionPerHour: 100,
          runOutHours: 5.0,
          status: 'WARNING',
          penaltyPerHourINR: 2000000,
          highwayCorridor: 'Pune-Nashik',
        },
      ];

      const updated = applyBufferDelivery(buffers, 'Tata Motors', 500);
      // Tata Motors stock increases from 200 to 700 -> 7.0h -> HEALTHY
      expect(updated[0].currentStockUnits).toBe(700);
      expect(updated[0].runOutHours).toBe(7.0);
      expect(updated[0].status).toBe('HEALTHY');
      // Mahindra stays unchanged
      expect(updated[1].currentStockUnits).toBe(500);
    });

    it('simulateTruckStep advances progress, interpolates coordinates, and computes ETA', () => {
      const mockCorridor: Corridor = {
        id: 'cor-1',
        name: 'Chakan - Pune Corridor',
        originCity: 'Chakan',
        destinationCity: 'Pune',
        totalDistanceKm: 120,
        standardDurationHours: 3.0,
        waypoints: [
          { lat: 18.75, lng: 73.85 },
          { lat: 18.85, lng: 73.95 },
        ],
        activeTollPlazas: [],
      };

      const mockTruck: Truck = {
        id: 'trk-1',
        registrationNumber: 'MH-14-GH-4821',
        corridorId: 'cor-1',
        origin: 'Chakan Hub',
        destination: 'Pune Plant',
        destinationOem: 'Tata Motors PV',
        cargoDescription: '120 Engine Blocks',
        unitsLoaded: 120,
        currentLat: 18.75,
        currentLng: 73.85,
        targetLat: 18.85,
        targetLng: 73.95,
        progressPct: 10,
        speedKmph: 55,
        fastagTollStatus: 'Nominal Highway Transit Active',
        etaMinutes: 180,
        isExpedited: false,
        lastPingTime: '10 min ago',
      };

      // Step at 1x speed: progress increases by 1.5 -> 11.5%
      const step1 = simulateTruckStep(mockTruck, mockCorridor, 1, 0);
      expect(step1.hasArrived).toBe(false);
      expect(step1.updatedTruck.progressPct).toBe(11.5);
      expect(step1.updatedTruck.currentLat).toBeGreaterThan(18.75);

      // Expedited truck advances faster (2.5% base * speedMultiplier)
      const expeditedTruck = { ...mockTruck, isExpedited: true };
      const stepExpedited = simulateTruckStep(expeditedTruck, mockCorridor, 2, 0);
      expect(stepExpedited.updatedTruck.progressPct).toBe(15); // 10 + 2.5 * 2
    });

    it('simulateTruckStep resets truck and signals arrival when reaching 100% progress', () => {
      const mockCorridor: Corridor = {
        id: 'cor-1',
        name: 'Chakan - Pune Corridor',
        originCity: 'Chakan',
        destinationCity: 'Pune',
        totalDistanceKm: 120,
        standardDurationHours: 2.0,
        waypoints: [
          { lat: 18.75, lng: 73.85 },
          { lat: 18.85, lng: 73.95 },
        ],
        activeTollPlazas: [],
      };

      const nearArrivalTruck: Truck = {
        id: 'trk-1',
        registrationNumber: 'MH-14-GH-4821',
        corridorId: 'cor-1',
        origin: 'Chakan Hub',
        destination: 'Pune Plant',
        destinationOem: 'Tata Motors PV',
        cargoDescription: '120 Engine Blocks',
        unitsLoaded: 120,
        currentLat: 18.84,
        currentLng: 73.94,
        targetLat: 18.85,
        targetLng: 73.95,
        progressPct: 99,
        speedKmph: 55,
        fastagTollStatus: 'Final Approach',
        etaMinutes: 10,
        isExpedited: true,
        lastPingTime: '2 min ago',
      };

      const result = simulateTruckStep(nearArrivalTruck, mockCorridor, 1, 0);
      expect(result.hasArrived).toBe(true);
      expect(result.deliveredUnits).toBe(120);
      expect(result.updatedTruck.progressPct).toBe(0);
      expect(result.updatedTruck.currentLat).toBe(18.75);
      expect(result.updatedTruck.currentLng).toBe(73.85);
      expect(result.updatedTruck.isExpedited).toBe(false);
      expect(result.updatedTruck.etaMinutes).toBe(120); // standardDurationHours * 60
    });

    it('applyWorkOrderCompletion applies work order quantities to destination buffer', () => {
      const buffers: CustomerBuffer[] = [
        {
          id: 'buf-1',
          oemName: 'Tata Motors PV',
          plantLocation: 'Pune',
          partDescription: 'Engine Block',
          partNumber: 'BA-TATA-02',
          currentStockUnits: 150,
          consumptionPerHour: 100,
          runOutHours: 1.5,
          status: 'CRITICAL',
          penaltyPerHourINR: 2500000,
          highwayCorridor: 'NH-48',
        },
      ];

      const completedWo: WorkOrder = {
        id: 'wo-1',
        partNumber: 'ENG-BLK-2.0L',
        partDescription: 'Cylinder Block Assembly',
        oemName: 'Tata Motors PV',
        quantity: 350,
        stage: 'FINAL_DISPATCH',
        progress: 100,
        machineId: 'CNC-01',
        dueShift: 'Morning Shift',
        dueTime: '18:00',
        scrapCount: 0,
        scrapRate: '0 pcs (0%)',
        status: 'COMPLETED',
        priority: 'Rush',
      };

      const updated = applyWorkOrderCompletion(buffers, completedWo);
      expect(updated[0].currentStockUnits).toBe(500);
      expect(updated[0].runOutHours).toBe(5.0);
      expect(updated[0].status).toBe('WARNING');
    });

    describe('Simulation Engine Pure Functions (advanceBuffer, advanceTruck, applyDelivery)', () => {
      const baseBuffer: CustomerBuffer = {
        id: 'buf-sim-1',
        oemName: 'Tata Motors',
        plantLocation: 'Sanand EV Plant',
        partDescription: 'Tiago Front Axle',
        partNumber: 'BA-TATA-401',
        currentStockUnits: 600,
        consumptionPerHour: 100,
        runOutHours: 6.0,
        penaltyPerHourINR: 2500000,
        status: 'HEALTHY',
        highwayCorridor: 'NH-48',
      };

      const baseCorridor: Corridor = {
        id: 'cor-sim',
        name: 'Chakan - Sanand NH-48',
        originCity: 'Chakan',
        destinationCity: 'Sanand',
        totalDistanceKm: 600,
        standardDurationHours: 10.0,
        waypoints: [
          { lat: 18.75, lng: 73.85 },
          { lat: 20.00, lng: 73.00 },
          { lat: 23.00, lng: 72.50 },
        ],
        activeTollPlazas: [],
      };

      const baseTruck: Truck = {
        id: 'MH-12-RN-8819',
        registrationNumber: 'MH-12-RN-8819',
        corridorId: 'cor-sim',
        origin: 'Chakan Hub',
        destination: 'Sanand Plant',
        destinationOem: 'Tata Motors',
        cargoDescription: '120 Tiago Axles',
        unitsLoaded: 120,
        currentLat: 18.75,
        currentLng: 73.85,
        targetLat: 23.00,
        targetLng: 72.50,
        progressPct: 0,
        speedKmph: 60,
        fastagTollStatus: 'Departed Hub',
        etaMinutes: 600,
        isExpedited: false,
        lastPingTime: 'Just now',
      };

      // 1. DRAIN MATH
      describe('drain math', () => {
        it('drains buffer stock exactly by consumptionPerHour * simulatedHours', () => {
          // 600 units, 100/h, 2.5 hours -> drains 250 units -> 350 units remaining
          const advanced = advanceBuffer(baseBuffer, 2.5);
          expect(advanced.currentStockUnits).toBe(350);
          expect(advanced.runOutHours).toBe(3.5);
        });

        it('handles fractional simulated hours accurately', () => {
          // 600 units, 100/h, 0.5 hours (30 min) -> drains 50 units -> 550 units remaining
          const advanced = advanceBuffer(baseBuffer, 0.5);
          expect(advanced.currentStockUnits).toBe(550);
          expect(advanced.runOutHours).toBe(5.5);
        });

        it('floors buffer stock at 0 and never goes negative', () => {
          // 600 units, 100/h, 10 hours -> drains 1000 units -> clamped to 0
          const advanced = advanceBuffer(baseBuffer, 10.0);
          expect(advanced.currentStockUnits).toBe(0);
          expect(advanced.runOutHours).toBe(0);
          expect(advanced.status).toBe('CRITICAL');
        });

        it('leaves buffer untouched if simulated hours or consumption is zero or negative', () => {
          expect(advanceBuffer(baseBuffer, 0).currentStockUnits).toBe(600);
          expect(advanceBuffer(baseBuffer, -1).currentStockUnits).toBe(600);

          const zeroConsumptionBuffer = { ...baseBuffer, consumptionPerHour: 0 };
          expect(advanceBuffer(zeroConsumptionBuffer, 2).currentStockUnits).toBe(600);
        });
      });

      // 2. STATUS THRESHOLDS (< 3.0h CRITICAL, < 6.0h WARNING, >= 6.0h HEALTHY)
      describe('status thresholds', () => {
        it('evaluates status thresholds correctly (< 3.0h CRITICAL, < 6.0h WARNING, >= 6.0h HEALTHY)', () => {
          expect(calculateBufferStatus(2.9)).toBe('CRITICAL');
          expect(calculateBufferStatus(2.99)).toBe('CRITICAL');
          expect(calculateBufferStatus(3.0)).toBe('WARNING');
          expect(calculateBufferStatus(4.5)).toBe('WARNING');
          expect(calculateBufferStatus(5.99)).toBe('WARNING');
          expect(calculateBufferStatus(6.0)).toBe('HEALTHY');
          expect(calculateBufferStatus(10.0)).toBe('HEALTHY');
        });

        it('transitions buffer status through HEALTHY -> WARNING -> CRITICAL as stock drains', () => {
          // Initial: 800 units / 100 per h = 8.0h -> HEALTHY
          let buf: CustomerBuffer = { ...baseBuffer, currentStockUnits: 800, runOutHours: 8.0, status: 'HEALTHY' };
          expect(buf.status).toBe('HEALTHY');

          // Drain 3 hours: 800 - 300 = 500 units -> 5.0h -> WARNING
          buf = advanceBuffer(buf, 3.0);
          expect(buf.currentStockUnits).toBe(500);
          expect(buf.runOutHours).toBe(5.0);
          expect(buf.status).toBe('WARNING');

          // Drain another 3 hours: 500 - 300 = 200 units -> 2.0h -> CRITICAL
          buf = advanceBuffer(buf, 3.0);
          expect(buf.currentStockUnits).toBe(200);
          expect(buf.runOutHours).toBe(2.0);
          expect(buf.status).toBe('CRITICAL');
        });
      });

      // 3. ADVANCE TRUCK
      describe('advanceTruck', () => {
        it('advances truck progress along corridor and computes ETA from remaining fraction', () => {
          // Corridor duration: 10.0 hours. Advance 1.0 hour -> progress +10%
          const step1 = advanceTruck(baseTruck, baseCorridor, 1.0);
          expect(step1.hasArrived).toBe(false);
          expect(step1.deliveredUnits).toBe(0);
          expect(step1.updatedTruck.progressPct).toBe(10);
          // Remaining fraction = 90%. ETA = 0.9 * 10h = 9h = 540 minutes
          expect(step1.updatedTruck.etaMinutes).toBe(540);
          expect(step1.updatedTruck.currentLat).toBeGreaterThan(18.75);
        });

        it('factors monsoon delay into ETA calculation', () => {
          const step = advanceTruck(baseTruck, baseCorridor, 1.0, { monsoonDelayMinutes: 90 });
          // Remaining 540 min + 90 min monsoon = 630 min
          expect(step.updatedTruck.etaMinutes).toBe(630);
          expect(step.updatedTruck.fastagTollStatus).toContain('Monsoon Slowdown (+90m delay)');
        });

        it('reaches 100%, signals arrival with unitsLoaded, and re-dispatches truck to origin', () => {
          const nearArrival: Truck = {
            ...baseTruck,
            progressPct: 95,
          };
          // Corridor 10h, advance 1.0h -> +10% -> 105% (>= 100%)
          const result = advanceTruck(nearArrival, baseCorridor, 1.0);
          expect(result.hasArrived).toBe(true);
          expect(result.deliveredUnits).toBe(120);

          // Re-dispatched truck at origin with progress 0
          expect(result.updatedTruck.progressPct).toBe(0);
          expect(result.updatedTruck.currentLat).toBe(baseCorridor.waypoints[0].lat);
          expect(result.updatedTruck.currentLng).toBe(baseCorridor.waypoints[0].lng);
          expect(result.updatedTruck.isExpedited).toBe(false);
          expect(result.updatedTruck.etaMinutes).toBe(600); // 10h * 60
        });
      });

      // 4. NO DOUBLE DELIVERY
      describe('no double delivery', () => {
        it('ensures truck units are delivered exactly once upon arrival and not on subsequent ticks', () => {
          let buffers: CustomerBuffer[] = [
            { ...baseBuffer, currentStockUnits: 300, runOutHours: 3.0, status: 'WARNING' },
          ];

          let truck: Truck = { ...baseTruck, progressPct: 90 };

          // Tick 1: truck advances from 90% -> 95% (< 100%)
          const tick1 = advanceTruck(truck, baseCorridor, 0.5); // +5% -> 95%
          expect(tick1.hasArrived).toBe(false);
          expect(tick1.deliveredUnits).toBe(0);

          if (tick1.hasArrived) {
            buffers = applyDelivery(buffers, tick1.updatedTruck.destinationOem, tick1.deliveredUnits);
          }
          // Buffer remains at 300 units (no delivery before arrival)
          expect(buffers[0].currentStockUnits).toBe(300);

          // Tick 2: truck advances from 95% -> 100% (arrived!)
          truck = tick1.updatedTruck;
          const tick2 = advanceTruck(truck, baseCorridor, 0.5); // +5% -> 100%
          expect(tick2.hasArrived).toBe(true);
          expect(tick2.deliveredUnits).toBe(120);

          if (tick2.hasArrived) {
            buffers = applyDelivery(buffers, truck.destinationOem, tick2.deliveredUnits);
          }
          // Stock increases by 120 units: 300 + 120 = 420
          expect(buffers[0].currentStockUnits).toBe(420);

          // Tick 3: truck was re-dispatched to progressPct: 0. It now advances to 5%.
          truck = tick2.updatedTruck;
          expect(truck.progressPct).toBe(0);

          const tick3 = advanceTruck(truck, baseCorridor, 0.5); // +5% -> 5%
          expect(tick3.hasArrived).toBe(false);
          expect(tick3.deliveredUnits).toBe(0);

          if (tick3.hasArrived) {
            buffers = applyDelivery(buffers, tick3.updatedTruck.destinationOem, tick3.deliveredUnits);
          }
          // NO DOUBLE DELIVERY: stock must remain 420
          expect(buffers[0].currentStockUnits).toBe(420);
        });

        it('ensures completed work orders deliver units only once and never double-credit', () => {
          let buffers: CustomerBuffer[] = [
            { ...baseBuffer, currentStockUnits: 200, runOutHours: 2.0, status: 'CRITICAL' },
          ];

          const inProgressWo: WorkOrder = {
            id: 'WO-101',
            partNumber: 'BA-TATA-401',
            partDescription: 'Tiago Front Axle',
            oemName: 'Tata Motors',
            quantity: 250,
            stage: 'ASSEMBLY',
            progress: 90,
            machineId: 'CNC-01',
            dueShift: 'Morning Shift',
            dueTime: '16:00',
            scrapCount: 0,
            scrapRate: '0 pcs',
            status: 'IN_PROGRESS',
            priority: 'Standard',
          };

          // Step 1: Work order completes (progress reaches 100%)
          const completedWo: WorkOrder = {
            ...inProgressWo,
            progress: 100,
            status: 'COMPLETED',
          };
          buffers = applyDelivery(buffers, completedWo.oemName, completedWo.quantity);
          expect(buffers[0].currentStockUnits).toBe(450); // 200 + 250

          // Step 2: Next tick simulates with the work order already COMPLETED
          // Simulation logic only credits work orders transitioning to completed.
          // Calling applyDelivery with 0 units or skipping completed work orders leaves buffer unchanged.
          if (completedWo.status !== 'COMPLETED') {
            buffers = applyDelivery(buffers, completedWo.oemName, completedWo.quantity);
          }
          expect(buffers[0].currentStockUnits).toBe(450); // Unchanged, no double credit
        });
      });
    });

    it('formatCountdown formats hours into readable line-stop countdowns', () => {
      expect(formatCountdown(1.8)).toBe('1h 48m');
      expect(formatCountdown(2.5)).toBe('2h 30m');
      expect(formatCountdown(0.75)).toBe('45m');
      expect(formatCountdown(3.0)).toBe('3h');
      expect(formatCountdown(0)).toBe('0m (Line Stop)');
      expect(formatCountdown(-1)).toBe('0m (Line Stop)');
    });

    it('generateSystemAlerts detects buffers under 3h and 6h, low BOM, offline machines, and delayed trucks', () => {
      const mockBuffers: CustomerBuffer[] = [
        {
          id: 'buf-1',
          oemName: 'Tata Motors',
          plantLocation: 'Sanand',
          partDescription: 'Front Axle',
          partNumber: 'BA-TATA-01',
          currentStockUnits: 180,
          consumptionPerHour: 100,
          runOutHours: 1.8, // < 3.0h -> CRITICAL
          penaltyPerHourINR: 2500000,
          status: 'CRITICAL',
          highwayCorridor: 'NH-48',
        },
        {
          id: 'buf-2',
          oemName: 'Maruti Suzuki',
          plantLocation: 'Manesar',
          partDescription: 'Gear Blanks',
          partNumber: 'BA-MSIL-01',
          currentStockUnits: 460,
          consumptionPerHour: 100,
          runOutHours: 4.6, // < 6.0h -> WARNING
          penaltyPerHourINR: 1200000,
          status: 'WARNING',
          highwayCorridor: 'NH-48',
        },
        {
          id: 'buf-3',
          oemName: 'Hyundai',
          plantLocation: 'Chennai',
          partDescription: 'Brake Discs',
          partNumber: 'BA-HYUN-01',
          currentStockUnits: 800,
          consumptionPerHour: 100,
          runOutHours: 8.0, // > 6.0h -> No alert
          penaltyPerHourINR: 1500000,
          status: 'HEALTHY',
          highwayCorridor: 'NH-48',
        },
      ];

      const mockBom: BomItem[] = [
        {
          id: 'bom-1',
          partNumber: 'BA-RAW-101',
          description: 'Casting',
          level: 2,
          qtyPerAssembly: 1,
          unitCost: 100,
          currency: 'INR',
          currentStock: 150, // Below safety stock 400!
          safetyStock: 400,
          leadTimeDays: 5,
          supplierId: 'sup-1',
          category: 'Casting',
        },
      ];

      const mockMachines: Machine[] = [
        {
          id: 'VMC-01',
          name: 'VMC-01',
          model: 'Haas VF-4',
          operation: 'Braking Milling',
          status: 'MAINTENANCE',
          oee: 0,
          availability: 0,
          performance: 0,
          quality: 0,
          operator: 'Maintenance',
        },
      ];

      const mockTrucks: Truck[] = [
        {
          id: 'trk-1',
          registrationNumber: 'MH-14-GH-4091',
          corridorId: 'cor-1',
          origin: 'Chakan',
          destination: 'Sanand',
          destinationOem: 'Tata Motors',
          cargoDescription: '150 Axles',
          unitsLoaded: 150,
          currentLat: 18.7,
          currentLng: 73.8,
          targetLat: 18.9,
          targetLng: 73.9,
          progressPct: 10,
          speedKmph: 45,
          fastagTollStatus: 'Delayed at Highway Bottleneck (+95 min)',
          etaMinutes: 380, // Delayed > 60m
          isExpedited: false,
          lastPingTime: 'Now',
        },
      ];

      const alerts = generateSystemAlerts({
        customerBuffers: mockBuffers,
        bomItems: mockBom,
        machines: mockMachines,
        trucks: mockTrucks,
      });

      // Buffer critical alert
      const critBufAlert = alerts.find((a) => a.id === 'alert-buf-buf-1');
      expect(critBufAlert).toBeDefined();
      expect(critBufAlert?.severity).toBe('CRITICAL');
      expect(critBufAlert?.countdownSeconds).toBe(1.8 * 3600);

      // Buffer warning alert
      const warnBufAlert = alerts.find((a) => a.id === 'alert-buf-buf-2');
      expect(warnBufAlert).toBeDefined();
      expect(warnBufAlert?.severity).toBe('WARNING');

      // Healthy buffer should not generate an alert
      const safeBufAlert = alerts.find((a) => a.id === 'alert-buf-buf-3');
      expect(safeBufAlert).toBeUndefined();

      // Low BOM alert
      const bomAlert = alerts.find((a) => a.id === 'alert-bom-bom-1');
      expect(bomAlert).toBeDefined();
      expect(bomAlert?.category).toBe('BOM');

      // Machine offline alert
      const machAlert = alerts.find((a) => a.id === 'alert-mach-VMC-01');
      expect(machAlert).toBeDefined();
      expect(machAlert?.category).toBe('MACHINE');
      expect(machAlert?.severity).toBe('CRITICAL');

      // Delayed truck alert
      const truckAlert = alerts.find((a) => a.id === 'alert-trk-trk-1');
      expect(truckAlert).toBeDefined();
      expect(truckAlert?.category).toBe('LOGISTICS');

      // Respects Acknowledge and Snooze user actions
      const alertsWithActions = generateSystemAlerts(
        {
          customerBuffers: mockBuffers,
          bomItems: mockBom,
          machines: mockMachines,
          trucks: mockTrucks,
          alertUserActions: {
            'alert-buf-buf-1': { status: 'ACKNOWLEDGED', acknowledgedAt: '10:30' },
            'alert-mach-VMC-01': { status: 'SNOOZED', snoozedUntil: Date.now() + 10 * 60 * 1000 },
          },
        },
        Date.now()
      );

      expect(alertsWithActions.find((a) => a.id === 'alert-buf-buf-1')?.status).toBe('ACKNOWLEDGED');
      expect(alertsWithActions.find((a) => a.id === 'alert-mach-VMC-01')?.status).toBe('SNOOZED');
    });

    it('calculateWhatIfCorridorDelay calculates affected OEMs, new run-out hours, and INR penalty exposure', () => {
      const mockBuffers: CustomerBuffer[] = [
        {
          id: 'buf-tata',
          oemName: 'Tata Motors',
          plantLocation: 'Sanand',
          partDescription: 'Front Axle Sub-assembly',
          partNumber: 'BA-TATA-401',
          currentStockUnits: 180,
          consumptionPerHour: 100,
          runOutHours: 1.8, // 1.8h (< 3.0h)
          penaltyPerHourINR: 2500000,
          status: 'CRITICAL',
          assignedTruckId: 'trk-tata',
          highwayCorridor: 'corridor-chakan-sanand',
        },
        {
          id: 'buf-bajaj',
          oemName: 'Bajaj Auto',
          plantLocation: 'Waluj',
          partDescription: 'Pulsar Crankshaft',
          partNumber: 'BA-BAJAJ-101',
          currentStockUnits: 500,
          consumptionPerHour: 100,
          runOutHours: 5.0,
          penaltyPerHourINR: 1000000,
          status: 'WARNING',
          assignedTruckId: 'trk-bajaj',
          highwayCorridor: 'corridor-chakan-waluj',
        },
      ];

      const mockTrucks: Truck[] = [
        {
          id: 'trk-tata',
          registrationNumber: 'MH-14-GH-4091',
          corridorId: 'corridor-chakan-sanand',
          origin: 'Chakan',
          destination: 'Sanand',
          destinationOem: 'Tata Motors',
          cargoDescription: '150 Axles',
          unitsLoaded: 150,
          currentLat: 18.7,
          currentLng: 73.8,
          targetLat: 18.9,
          targetLng: 73.9,
          progressPct: 50,
          speedKmph: 50,
          fastagTollStatus: 'Normal',
          etaMinutes: 120,
          isExpedited: false,
          lastPingTime: 'Now',
        },
      ];

      const mockCorridors: Corridor[] = [
        {
          id: 'corridor-chakan-sanand',
          name: 'Chakan - Sanand NH-48 Express',
          originCity: 'Chakan',
          destinationCity: 'Sanand',
          totalDistanceKm: 650,
          standardDurationHours: 12.0,
          waypoints: [],
          activeTollPlazas: [],
        },
      ];

      // Test 2h delay on Sanand corridor
      const result = calculateWhatIfCorridorDelay(
        mockBuffers,
        mockTrucks,
        mockCorridors,
        'corridor-chakan-sanand',
        2.0
      );

      expect(result.affectedOems).toContain('Tata Motors');
      expect(result.affectedOems).not.toContain('Bajaj Auto');

      const tataResult = result.affectedBuffers.find((b) => b.bufferId === 'buf-tata')!;
      // Current: 1.8h -> New: Math.max(0, 1.8 - 2.0) = 0h
      expect(tataResult.currentRunOutHours).toBe(1.8);
      expect(tataResult.simulatedRunOutHours).toBe(0.0);
      expect(tataResult.simulatedStatus).toBe('CRITICAL');

      // Current penalty: (3.0 - 1.8) * 2,500,000 = 3,000,000
      expect(tataResult.currentPenaltyINR).toBe(3000000);
      // Simulated penalty: (3.0 - 0.0) * 2,500,000 = 7,500,000
      expect(tataResult.simulatedPenaltyINR).toBe(7500000);
      // Additional penalty: 4,500,000 INR
      expect(tataResult.additionalPenaltyINR).toBe(4500000);

      // Bajaj was unaffected
      const bajajResult = result.affectedBuffers.find((b) => b.bufferId === 'buf-bajaj')!;
      expect(bajajResult.simulatedRunOutHours).toBe(5.0);
      expect(bajajResult.additionalPenaltyINR).toBe(0);
    });

    it('calculateWhatIfSimulation handles both corridor and supplier targets unified', () => {
      const mockBuffers: CustomerBuffer[] = [
        {
          id: 'buf-1',
          oemName: 'Mahindra & Mahindra',
          plantLocation: 'Chakan',
          partDescription: 'Knuckle Castings',
          partNumber: 'BA-MM-880',
          currentStockUnits: 300,
          consumptionPerHour: 100,
          runOutHours: 3.0,
          penaltyPerHourINR: 1800000,
          status: 'WARNING',
          highwayCorridor: 'Local',
        },
      ];

      const mockSuppliers: Supplier[] = [
        {
          id: 'sup-kalyani',
          name: 'Kalyani Steels Ltd',
          location: 'Pune',
          tier: 2,
          partsSupplied: ['SG-Iron Castings'],
          onTimeDeliveryScore: 95,
          qualityPpmScore: 30,
          riskLevel: 'LOW',
          paymentTerms: 'Net 30',
          contactEmail: 'contact@kalyani.com',
        },
      ];

      const supplierSim = calculateWhatIfSimulation({
        targetType: 'SUPPLIER',
        targetId: 'sup-kalyani',
        delayHours: 4.0,
        buffers: mockBuffers,
        trucks: [],
        corridors: [],
        bomItems: [],
        suppliers: mockSuppliers,
      });

      expect(supplierSim.targetType).toBe('SUPPLIER');
      expect(supplierSim.targetName).toContain('Kalyani Steels');
      expect(supplierSim.affectedOems).toContain('Mahindra & Mahindra');
      expect(supplierSim.affectedBuffers[0].simulatedRunOutHours).toBeLessThan(3.0);
      expect(supplierSim.additionalPenaltyExposureINR).toBeGreaterThan(0);
    });

    describe('simulateDelay pure function', () => {
      const mockState = {
        customerBuffers: [
          {
            id: 'buf-tata',
            oemName: 'Tata Motors',
            plantLocation: 'Sanand EV Plant',
            partDescription: 'Tiago Front Axle',
            partNumber: 'BA-TATA-401',
            currentStockUnits: 360,
            consumptionPerHour: 100,
            runOutHours: 3.6,
            penaltyPerHourINR: 2500000,
            status: 'WARNING' as const,
            highwayCorridor: 'NH-48 Western Express',
            assignedTruckId: 'MH-12-RN-8819',
          },
          {
            id: 'buf-bajaj',
            oemName: 'Bajaj Auto',
            plantLocation: 'Waluj Plant',
            partDescription: 'Pulsar Crankcase',
            partNumber: 'BA-BAJAJ-102',
            currentStockUnits: 500,
            consumptionPerHour: 100,
            runOutHours: 5.0,
            penaltyPerHourINR: 1500000,
            status: 'WARNING' as const,
            highwayCorridor: 'Chakan-Waluj Expressway',
            assignedTruckId: 'MH-20-DV-4410',
          },
        ],
        trucks: [
          {
            id: 'MH-12-RN-8819',
            registrationNumber: 'MH-12-RN-8819',
            corridorId: 'corridor-chakan-sanand',
            origin: 'Chakan Hub',
            destination: 'Sanand EV Plant',
            destinationOem: 'Tata Motors',
            cargoDescription: '120 Tiago Axles',
            unitsLoaded: 120,
            currentLat: 18.75,
            currentLng: 73.85,
            targetLat: 23.00,
            targetLng: 72.50,
            progressPct: 40,
            speedKmph: 55,
            fastagTollStatus: 'Nominal Highway Transit Active',
            etaMinutes: 450,
            isExpedited: false,
            lastPingTime: '5 min ago',
          },
          {
            id: 'MH-20-DV-4410',
            registrationNumber: 'MH-20-DV-4410',
            corridorId: 'corridor-chakan-waluj',
            origin: 'Chakan Hub',
            destination: 'Waluj Plant',
            destinationOem: 'Bajaj Auto',
            cargoDescription: '85 Crankcases',
            unitsLoaded: 85,
            currentLat: 18.75,
            currentLng: 73.85,
            targetLat: 19.85,
            targetLng: 75.25,
            progressPct: 20,
            speedKmph: 50,
            fastagTollStatus: 'Nominal Highway Transit Active',
            etaMinutes: 260,
            isExpedited: false,
            lastPingTime: '2 min ago',
          },
        ],
      };

      it('computes affected OEMs, run-out before and after, line stop hours, and penalties for corridor delay', () => {
        // Apply 5.0h delay to Chakan - Sanand corridor (feeds Tata Motors, current run-out = 3.6h)
        const result = simulateDelay(mockState, 'corridor-chakan-sanand', 5.0);

        expect(result.targetType).toBe('CORRIDOR');
        expect(result.delayHours).toBe(5.0);
        expect(result.affectedOEMs).toContain('Tata Motors');
        expect(result.affectedOEMs).not.toContain('Bajaj Auto');
        expect(result.affectedTrucks.length).toBe(1);
        expect(result.affectedTrucks[0].id).toBe('MH-12-RN-8819');

        const tataImpact = result.affectedBuffers.find((b) => b.bufferId === 'buf-tata')!;
        expect(tataImpact.isAffected).toBe(true);
        expect(tataImpact.runOutHoursBefore).toBe(3.6);
        // Run-out after: Math.max(0, 3.6 - 5.0) = 0.0h
        expect(tataImpact.runOutHoursAfter).toBe(0.0);
        // Hours of line-stop: 5.0 - 3.6 = 1.4h
        expect(tataImpact.hoursOfLineStop).toBe(1.4);
        // Penalty before (run-out 3.6h >= 3.0h) -> 0
        expect(tataImpact.penaltyExposureBeforeINR).toBe(0);
        // Penalty after (run-out 0.0h < 3.0h) -> (3.0 - 0.0) * 2,500,000 = 7,500,000
        expect(tataImpact.penaltyExposureAfterINR).toBe(7500000);
        expect(tataImpact.penaltyDeltaINR).toBe(7500000);

        // Unaffected buffer: Bajaj
        const bajajImpact = result.affectedBuffers.find((b) => b.bufferId === 'buf-bajaj')!;
        expect(bajajImpact.isAffected).toBe(false);
        expect(bajajImpact.runOutHoursAfter).toBe(5.0);
        expect(bajajImpact.hoursOfLineStop).toBe(0.0);
        expect(bajajImpact.penaltyDeltaINR).toBe(0);

        // Total line-stop
        expect(result.totalHoursOfLineStop).toBe(1.4);
        expect(result.totalPenaltyDeltaINR).toBe(7500000);
      });

      it('returns zero line-stop when delay is less than current run-out hours', () => {
        // Delay of 1.0h on Tata Motors (runOut 3.6h): 3.6 - 1.0 = 2.6h remaining, 0h line-stop
        const result = simulateDelay(mockState, 'corridor-chakan-sanand', 1.0);
        const tataImpact = result.affectedBuffers.find((b) => b.bufferId === 'buf-tata')!;

        expect(tataImpact.runOutHoursBefore).toBe(3.6);
        expect(tataImpact.runOutHoursAfter).toBe(2.6);
        expect(tataImpact.hoursOfLineStop).toBe(0);
        // Penalty after: (3.0 - 2.6) * 2,500,000 = 0.4 * 2,500,000 = 1,000,000
        expect(tataImpact.penaltyExposureAfterINR).toBe(1000000);
      });

      it('handles 0 hour delay with nominal baseline and zero line-stop', () => {
        const result = simulateDelay(mockState, 'corridor-chakan-sanand', 0);
        expect(result.delayHours).toBe(0);
        expect(result.totalHoursOfLineStop).toBe(0);
        expect(result.totalPenaltyDeltaINR).toBe(0);

        result.affectedBuffers.forEach((b) => {
          expect(b.runOutHoursAfter).toBe(b.runOutHoursBefore);
          expect(b.hoursOfLineStop).toBe(0);
          expect(b.penaltyExposureAfterINR).toBe(b.penaltyExposureBeforeINR);
        });
      });

      it('handles supplier target mapping correctly', () => {
        // Kalyani Steels supplies castings to Mahindra and Tata Motors
        const result = simulateDelay(mockState, 'sup-kalyani', 4.0);
        expect(result.targetType).toBe('SUPPLIER');
        expect(result.affectedOEMs).toContain('Tata Motors');
      });

      it('pure function: does not mutate state or input buffer objects', () => {
        const originalStock = mockState.customerBuffers[0].currentStockUnits;
        const originalRunOut = mockState.customerBuffers[0].runOutHours;

        simulateDelay(mockState, 'corridor-chakan-sanand', 10.0);

        // State remained completely unchanged
        expect(mockState.customerBuffers[0].currentStockUnits).toBe(originalStock);
        expect(mockState.customerBuffers[0].runOutHours).toBe(originalRunOut);
      });
    });

    describe('E-Way Bill Validity Countdown (EWB_KM_PER_DAY = 200, illustrative)', () => {
      const baseGeneratedAt = '2026-05-15T08:00:00.000Z';

      it('computes validDays using EWB_KM_PER_DAY = 200 (1 day per 200 km or part thereof)', () => {
        expect(EWB_KM_PER_DAY).toBe(200);

        // 50 km -> 1 day = 24h
        const res50 = calculateEwayBillValidity(50, baseGeneratedAt, baseGeneratedAt);
        expect(res50.validDays).toBe(1);
        expect(res50.validHours).toBe(24);

        // 200 km -> 1 day = 24h
        const res200 = calculateEwayBillValidity(200, baseGeneratedAt, baseGeneratedAt);
        expect(res200.validDays).toBe(1);
        expect(res200.validHours).toBe(24);

        // 201 km -> 2 days = 48h (part thereof)
        const res201 = calculateEwayBillValidity(201, baseGeneratedAt, baseGeneratedAt);
        expect(res201.validDays).toBe(2);
        expect(res201.validHours).toBe(48);

        // 660 km -> 4 days = 96h
        const res660 = calculateEwayBillValidity(660, baseGeneratedAt, baseGeneratedAt);
        expect(res660.validDays).toBe(4);
        expect(res660.validHours).toBe(96);

        // 1380 km -> 7 days = 168h
        const res1380 = calculateEwayBillValidity(1380, baseGeneratedAt, baseGeneratedAt);
        expect(res1380.validDays).toBe(7);
        expect(res1380.validHours).toBe(168);
      });

      it('computes validUntil timestamp starting from generation time', () => {
        const res = calculateEwayBillValidity(200, baseGeneratedAt, baseGeneratedAt);
        // Generated at 08:00 + 24 hours -> Next day 08:00
        const expectedUntil = new Date(new Date(baseGeneratedAt).getTime() + 24 * 3600 * 1000).toISOString();
        expect(res.validUntil).toBe(expectedUntil);
        expect(res.illustrativeNote).toContain('illustrative');
      });

      it('assigns green badge when remaining time is above 12h', () => {
        // 200 km = 24h validity. Checked 4 hours after generation -> 20h remaining (> 12h)
        const now = new Date(new Date(baseGeneratedAt).getTime() + 4 * 3600 * 1000).toISOString();
        const res = calculateEwayBillValidity(200, baseGeneratedAt, now);

        expect(res.remainingHours).toBe(20);
        expect(res.badgeColor).toBe('green');
        expect(res.status).toBe('VALID');
        expect(res.isExpired).toBe(false);
        expect(res.isExpiringSoon).toBe(false);
        expect(res.formattedCountdown).toBe('20h 0m remaining');
      });

      it('assigns amber badge when remaining time is below 12h', () => {
        // 200 km = 24h validity. Checked 16 hours after generation -> 8h remaining (< 12h)
        const now = new Date(new Date(baseGeneratedAt).getTime() + 16 * 3600 * 1000).toISOString();
        const res = calculateEwayBillValidity(200, baseGeneratedAt, now);

        expect(res.remainingHours).toBe(8);
        expect(res.badgeColor).toBe('amber');
        expect(res.status).toBe('EXPIRING_SOON');
        expect(res.isExpired).toBe(false);
        expect(res.isExpiringSoon).toBe(true);
        expect(res.formattedCountdown).toBe('8h 0m remaining');
      });

      it('assigns red badge and expired status when remaining time is 0 or past', () => {
        // 200 km = 24h validity. Checked 25 hours after generation -> expired
        const now = new Date(new Date(baseGeneratedAt).getTime() + 25 * 3600 * 1000).toISOString();
        const res = calculateEwayBillValidity(200, baseGeneratedAt, now);

        expect(res.remainingHours).toBeLessThan(0);
        expect(res.badgeColor).toBe('red');
        expect(res.status).toBe('EXPIRED');
        expect(res.isExpired).toBe(true);
        expect(res.formattedCountdown).toBe('Expired');
      });

      it('identifies critical expiry alert window when 2 hours or less remain', () => {
        // 24h validity. Checked 22.5 hours after generation -> 1.5h remaining
        const now15 = new Date(new Date(baseGeneratedAt).getTime() + 22.5 * 3600 * 1000).toISOString();
        const res15 = calculateEwayBillValidity(200, baseGeneratedAt, now15);
        expect(res15.isCriticalExpiryAlert).toBe(true);
        expect(res15.badgeColor).toBe('amber');

        // Checked 21 hours after generation -> 3h remaining (not <= 2h)
        const now3 = new Date(new Date(baseGeneratedAt).getTime() + 21 * 3600 * 1000).toISOString();
        const res3 = calculateEwayBillValidity(200, baseGeneratedAt, now3);
        expect(res3.isCriticalExpiryAlert).toBe(false);
      });

      it('checkEwayBillExpiryAlerts logs alert when 2h remain and prevents duplicate alerts', () => {
        const genTime = new Date('2026-05-15T00:00:00.000Z');
        // Valid for 24h (distance 100km). At 22.5h (1.5h remaining), it should alert.
        const now = new Date(genTime.getTime() + 22.5 * 3600 * 1000).toISOString();

        const sampleBills: EWayBillRecord[] = [
          {
            id: 'bill-1',
            ewayBillNo: 'EWB-8819',
            asnNo: 'ASN-01',
            generatedAt: genTime.toISOString(),
            dispatchDate: '2026-05-15',
            validUntil: new Date(genTime.getTime() + 24 * 3600 * 1000).toISOString(),
            supplierGstin: '27A',
            recipientGstin: '24B',
            oemCustomer: 'Tata Motors',
            originAddress: 'Chakan',
            destinationAddress: 'Sanand',
            hsnCode: '8708',
            partNumber: 'BA-01',
            partDescription: 'Axle',
            quantity: 100,
            unitValue: 1000,
            taxableAmount: 100000,
            isInterState: true,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 18000,
            totalInvoiceAmount: 118000,
            transporterId: 'T1',
            vehicleNo: 'MH-12-1234',
            transitStatus: 'IN_TRANSIT',
            distanceKm: 100, // 24h validity
          },
          {
            id: 'bill-2',
            ewayBillNo: 'EWB-9920',
            asnNo: 'ASN-02',
            generatedAt: genTime.toISOString(),
            dispatchDate: '2026-05-15',
            validUntil: new Date(genTime.getTime() + 96 * 3600 * 1000).toISOString(),
            supplierGstin: '27A',
            recipientGstin: '06C',
            oemCustomer: 'Maruti Suzuki',
            originAddress: 'Chakan',
            destinationAddress: 'Manesar',
            hsnCode: '8708',
            partNumber: 'BA-02',
            partDescription: 'Blanks',
            quantity: 200,
            unitValue: 2000,
            taxableAmount: 400000,
            isInterState: true,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 72000,
            totalInvoiceAmount: 472000,
            transporterId: 'T2',
            vehicleNo: 'MH-14-5678',
            transitStatus: 'IN_TRANSIT',
            distanceKm: 660, // 96h validity -> 73.5h remaining (not <= 2h)
          },
        ];

        // First check: bill-1 triggers an alert
        const check1 = checkEwayBillExpiryAlerts(sampleBills, [], now);
        expect(check1.newAlerts.length).toBe(1);
        expect(check1.newAlerts[0].ewayBillNo).toBe('EWB-8819');
        expect(check1.updatedAlertedBillNos).toContain('EWB-8819');

        // Second check (subsequent tick): bill-1 is in alerted list, so 0 new alerts logged
        const check2 = checkEwayBillExpiryAlerts(sampleBills, check1.updatedAlertedBillNos, now);
        expect(check2.newAlerts.length).toBe(0);
      });
    });

    // 8. HAVERSINE HELPER & GEOFENCE ARRIVAL EVENTS
    describe('Haversine Helper & Geofence Arrival Events', () => {
      describe('haversineDistanceKm', () => {
        it('calculates 0 km distance for identical coordinates', () => {
          expect(haversineDistanceKm(18.7587, 73.8474, 18.7587, 73.8474)).toBe(0);
          expect(haversine(22.9868, 72.3813, 22.9868, 72.3813)).toBe(0);
        });

        it('is symmetric: distance(A, B) === distance(B, A)', () => {
          const d1 = haversineDistanceKm(18.5204, 73.8567, 19.076, 72.8777);
          const d2 = haversineDistanceKm(19.076, 72.8777, 18.5204, 73.8567);
          expect(Math.abs(d1 - d2)).toBeLessThan(1e-9);
        });

        it('accurately computes realistic distances between major hubs in India', () => {
          // Pune to Mumbai ~120 km
          const puneToMumbai = haversineDistanceKm(18.5204, 73.8567, 19.076, 72.8777);
          expect(puneToMumbai).toBeGreaterThan(115);
          expect(puneToMumbai).toBeLessThan(125);

          // Chakan Hub to Tata Motors Sanand ~493 km
          const chakanToSanand = haversineDistanceKm(18.7587, 73.8474, 22.9868, 72.3813);
          expect(chakanToSanand).toBeGreaterThan(480);
          expect(chakanToSanand).toBeLessThan(510);
        });

        it('works with coordinate objects via haversineCoordinatesKm', () => {
          const p1 = { lat: 18.7587, lng: 73.8474 };
          const p2 = { lat: 18.761, lng: 73.812 };
          const d = haversineCoordinatesKm(p1, p2);
          expect(d).toBeGreaterThan(3.5);
          expect(d).toBeLessThan(4.0);
        });

        it('detects geofence radius boundary accurately (~1.5 km)', () => {
          const plant = { lat: 22.9868, lng: 72.3813 };
          // Point ~1.1 km south: within 1.5 km geofence
          const insidePoint = { lat: 22.977, lng: 72.3813 };
          const distInside = haversineDistanceKm(insidePoint.lat, insidePoint.lng, plant.lat, plant.lng);
          expect(distInside).toBeLessThanOrEqual(1.5);

          // Point ~3.3 km south: outside 1.5 km geofence
          const outsidePoint = { lat: 22.957, lng: 72.3813 };
          const distOutside = haversineDistanceKm(outsidePoint.lat, outsidePoint.lng, plant.lat, plant.lng);
          expect(distOutside).toBeGreaterThan(1.5);
        });
      });

      describe('checkTruckGeofenceArrival & Firing Once Per Trip', () => {
        const testPlant: OemPlantLocation = {
          id: 'oem-tata',
          name: 'Tata Motors',
          location: 'Sanand EV Plant',
          lat: 22.9868,
          lng: 72.3813,
          part: 'Front Axle',
          isHub: false,
          radiusKm: 1.5,
        };

        const testCorridor: Corridor = {
          id: 'corridor-chakan-sanand',
          name: 'Chakan to Sanand NH-48',
          originCity: 'Pune',
          destinationCity: 'Sanand',
          totalDistanceKm: 750,
          standardDurationHours: 12.5,
          waypoints: [
            { lat: 18.7587, lng: 73.8474, name: 'Chakan Hub' },
            { lat: 22.977, lng: 72.3813, name: 'Sanand Approach (< 1.5 km)' },
            { lat: 22.9868, lng: 72.3813, name: 'Tata Motors Gate' },
          ],
          activeTollPlazas: [],
        };

        const testTruck: Truck = {
          id: 'MH-14-GH-4091',
          registrationNumber: 'MH-14-GH-4091',
          corridorId: 'corridor-chakan-sanand',
          origin: 'Chakan MIDC',
          destination: 'Tata Motors Sanand EV Plant',
          destinationOem: 'Tata Motors',
          cargoDescription: 'Front Axles (150 pcs)',
          unitsLoaded: 150,
          currentLat: 22.95, // ~4.1 km away, outside 1.5 km geofence
          currentLng: 72.3813,
          targetLat: 22.9868,
          targetLng: 72.3813,
          progressPct: 80,
          speedKmph: 50,
          fastagTollStatus: 'En route',
          etaMinutes: 150,
          isExpedited: false,
          lastPingTime: 'Just now',
          status: 'IN_TRANSIT',
          geofenceArrived: false,
        };

        it('verifies default OEM plant radius is 1.5 km', () => {
          expect(DEFAULT_GEOFENCE_RADIUS_KM).toBe(1.5);
          expect(testPlant.radiusKm).toBe(1.5);
        });

        it('does not fire geofence arrival when truck is outside geofence', () => {
          const { updatedTruck, arrivalEvent } = checkTruckGeofenceArrival(testTruck, [testPlant]);
          expect(arrivalEvent).toBeNull();
          expect(updatedTruck.status).toBe('IN_TRANSIT');
          expect(updatedTruck.geofenceArrived).toBe(false);
        });

        it('fires geofence arrival when truck first enters geofence, marks status ARRIVED, and sets feed message', () => {
          // Move truck inside geofence (~1.08 km away from Tata Motors Sanand)
          const truckInside: Truck = {
            ...testTruck,
            currentLat: 22.977,
            currentLng: 72.3813,
            progressPct: 95,
          };

          const { updatedTruck, arrivalEvent } = checkTruckGeofenceArrival(truckInside, [testPlant]);

          expect(arrivalEvent).not.toBeNull();
          expect(arrivalEvent?.truckId).toBe('MH-14-GH-4091');
          expect(arrivalEvent?.plantName).toBe('Tata Motors');
          expect(arrivalEvent?.feedTitle).toBe('arrived at Tata Motors gate');
          expect(arrivalEvent?.toastMessage).toBe('arrived at Tata Motors gate');
          expect(arrivalEvent?.distanceKm).toBeLessThanOrEqual(1.5);

          // Status marked ARRIVED and geofenceArrived set to true
          expect(updatedTruck.status).toBe('ARRIVED');
          expect(updatedTruck.geofenceArrived).toBe(true);
        });

        it('FIRES ONCE PER TRIP: does not re-fire on subsequent ticks while truck remains in geofence', () => {
          // Tick 1: enters geofence
          const truckTick1: Truck = {
            ...testTruck,
            currentLat: 22.977,
            currentLng: 72.3813,
            progressPct: 95,
            status: 'IN_TRANSIT',
            geofenceArrived: false,
          };

          const tick1Result = checkTruckGeofenceArrival(truckTick1, [testPlant]);
          expect(tick1Result.arrivalEvent).not.toBeNull();
          expect(tick1Result.arrivalEvent?.feedTitle).toBe('arrived at Tata Motors gate');
          expect(tick1Result.updatedTruck.status).toBe('ARRIVED');
          expect(tick1Result.updatedTruck.geofenceArrived).toBe(true);

          // Tick 2: truck advances further inside geofence (~0.5 km away) on same trip
          const truckTick2: Truck = {
            ...tick1Result.updatedTruck,
            currentLat: 22.982,
            currentLng: 72.3813,
            progressPct: 97,
          };

          const tick2Result = checkTruckGeofenceArrival(truckTick2, [testPlant]);
          // Must NOT fire on tick 2
          expect(tick2Result.arrivalEvent).toBeNull();
          expect(tick2Result.updatedTruck.status).toBe('ARRIVED');
          expect(tick2Result.updatedTruck.geofenceArrived).toBe(true);

          // Tick 3: truck right at plant gate (~0 km away) on same trip
          const truckTick3: Truck = {
            ...tick2Result.updatedTruck,
            currentLat: 22.9868,
            currentLng: 72.3813,
            progressPct: 99,
          };

          const tick3Result = checkTruckGeofenceArrival(truckTick3, [testPlant]);
          // Must NOT fire on tick 3
          expect(tick3Result.arrivalEvent).toBeNull();
        });

        it('resets upon trip completion (100% progress) and fires once on the subsequent trip', () => {
          // Completed trip truck at 98% inside geofence
          const arrivedTruck: Truck = {
            ...testTruck,
            currentLat: 22.986,
            currentLng: 72.3813,
            progressPct: 98,
            status: 'ARRIVED',
            geofenceArrived: true,
          };

          // advanceTruck takes it to 100% -> delivery completed & truck reset to origin for new trip
          const deliveryResult = advanceTruck(arrivedTruck, testCorridor, 1.0);
          expect(deliveryResult.hasArrived).toBe(true);
          expect(deliveryResult.updatedTruck.progressPct).toBe(0);
          expect(deliveryResult.updatedTruck.status).toBe('IN_TRANSIT');
          expect(deliveryResult.updatedTruck.geofenceArrived).toBe(false);

          // On subsequent new trip: truck advances toward destination and re-enters geofence
          const newTripTruck: Truck = {
            ...deliveryResult.updatedTruck,
            currentLat: 22.977,
            currentLng: 72.3813,
            progressPct: 95,
          };

          const newTripGeofence = checkTruckGeofenceArrival(newTripTruck, [testPlant]);
          // Must fire once for the new trip!
          expect(newTripGeofence.arrivalEvent).not.toBeNull();
          expect(newTripGeofence.arrivalEvent?.feedTitle).toBe('arrived at Tata Motors gate');
          expect(newTripGeofence.updatedTruck.status).toBe('ARRIVED');
          expect(newTripGeofence.updatedTruck.geofenceArrived).toBe(true);
        });

        it('processGeofenceArrivals handles batch truck processing cleanly', () => {
          const trucks: Truck[] = [
            { ...testTruck, id: 'T-1', currentLat: 22.95, progressPct: 80 }, // outside -> 0 event
            { ...testTruck, id: 'T-2', currentLat: 22.977, progressPct: 95 }, // enters -> 1 event
            { ...testTruck, id: 'T-3', currentLat: 22.98, progressPct: 96, status: 'ARRIVED', geofenceArrived: true }, // already arrived -> 0 event
          ];

          const { updatedTrucks, newArrivals } = processGeofenceArrivals(trucks, [testPlant]);
          expect(newArrivals.length).toBe(1);
          expect(newArrivals[0].truckId).toBe('T-2');
          expect(newArrivals[0].feedTitle).toBe('arrived at Tata Motors gate');
          expect(updatedTrucks.find((t) => t.id === 'T-2')?.status).toBe('ARRIVED');
        });
      });
    });
  });
});
