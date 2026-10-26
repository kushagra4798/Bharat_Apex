import { describe, it, expect } from 'vitest';
import {
  bharatApexReducer,
  getInitialDomainState,
} from './BharatApexContext';

describe('BharatApexContext reducer', () => {
  it('initializes with seed data matching requirements', () => {
    const state = getInitialDomainState();
    expect(state.customerBuffers.length).toBe(5);
    expect(state.machines.length).toBe(8);
    expect(state.workOrders.length).toBeGreaterThanOrEqual(15);
    expect(state.baseCurrency).toBe('INR');
    expect(state.currencyRates.USD).toBe(83.42);
    expect(state.plantFeed.length).toBeGreaterThan(0);
    expect(state.isDisruptionActive).toBe(false);
  });

  it('updates base currency and FX shocks without logging to plantFeed', () => {
    const initialState = getInitialDomainState();
    const updated = bharatApexReducer(initialState, {
      type: 'SET_BASE_CURRENCY',
      payload: 'USD',
    });

    expect(updated.baseCurrency).toBe('USD');
    expect(updated.plantFeed).toBe(initialState.plantFeed);

    const shocked = bharatApexReducer(updated, {
      type: 'SET_FX_SHOCKS',
      payload: { USD: 5, EUR: 3 },
    });
    expect(shocked.fxShocks.USD).toBe(5);
    expect(shocked.plantFeed).toBe(initialState.plantFeed);
  });

  it('updates currency rates and live rates flag correctly', () => {
    const initialState = getInitialDomainState();
    expect(initialState.isLiveRates).toBe(false);

    const liveUpdated = bharatApexReducer(initialState, {
      type: 'SET_CURRENCY_RATES',
      payload: { rates: { ...initialState.currencyRates, USD: 83.95 }, isLive: true },
    });
    expect(liveUpdated.currencyRates.USD).toBe(83.95);
    expect(liveUpdated.isLiveRates).toBe(true);

    const offlineUpdated = bharatApexReducer(liveUpdated, {
      type: 'SET_CURRENCY_RATES',
      payload: { rates: { ...initialState.currencyRates, USD: 83.42 }, isLive: false },
    });
    expect(offlineUpdated.currencyRates.USD).toBe(83.42);
    expect(offlineUpdated.isLiveRates).toBe(false);
  });

  it('toggles machine status and logs to plantFeed', () => {
    const initialState = getInitialDomainState();
    const updated = bharatApexReducer(initialState, {
      type: 'TOGGLE_MACHINE_STATUS',
      payload: { machineId: 'CNC-01', status: 'SETUP', reason: 'Jig alignment' },
    });

    const targetMachine = updated.machines.find((m) => m.id === 'CNC-01');
    expect(targetMachine?.status).toBe('SETUP');
    expect(targetMachine?.statusReason).toBe('Jig alignment');
    expect(updated.plantFeed[0].title).toContain('CNC-01 Status Changed');
  });

  it('advances work order stage and updates progress', () => {
    const initialState = getInitialDomainState();
    // WO-9821 starts in MACHINING
    const target = initialState.workOrders.find((w) => w.id === 'WO-9821')!;
    expect(target.stage).toBe('MACHINING');

    const updated = bharatApexReducer(initialState, {
      type: 'ADVANCE_WORK_ORDER',
      payload: { workOrderId: 'WO-9821' },
    });

    const advanced = updated.workOrders.find((w) => w.id === 'WO-9821')!;
    expect(advanced.stage).toBe('FABRICATION');
    expect(advanced.progress).toBeGreaterThan(target.progress);
    expect(updated.plantFeed[0].title).toContain('Work Order #WO-9821 Stage Advanced');
  });

  it('expedites transit without adding stock immediately; ignores if already expedited', () => {
    const initialState = getInitialDomainState();
    const truckId = 'MH-14-GH-4091';
    const truckBefore = initialState.trucks.find((t) => t.id === truckId)!;
    const tataBefore = initialState.customerBuffers.find((b) => b.oemName === 'Tata Motors')!;

    // Expedite once
    const expedited = bharatApexReducer(initialState, {
      type: 'EXPEDITE_TRANSIT',
      payload: { truckId, addedUnits: 50 },
    });

    const truckAfter = expedited.trucks.find((t) => t.id === truckId)!;
    const tataAfter = expedited.customerBuffers.find((b) => b.oemName === 'Tata Motors')!;

    expect(truckAfter.isExpedited).toBe(true);
    expect(truckAfter.etaMinutes).toBeLessThan(truckBefore.etaMinutes);
    // Requirement 4: Stock is NOT added on click
    expect(tataAfter.currentStockUnits).toBe(tataBefore.currentStockUnits);
    expect(expedited.plantFeed[0].title).toContain(`Convoy ${truckId} Expedited`);

    // Requirement 4: Ignore if already expedited
    const reExpedited = bharatApexReducer(expedited, {
      type: 'EXPEDITE_TRANSIT',
      payload: { truckId, addedUnits: 50 },
    });

    expect(reExpedited).toBe(expedited); // Identical reference, action ignored
  });

  it('adds stock to destination buffer upon truck arrival in UPDATE_TRUCKS_BATCH', () => {
    const initialState = getInitialDomainState();
    const tataBefore = initialState.customerBuffers.find((b) => b.id === 'buf-tata-sanand')!;
    const initialUnits = tataBefore.currentStockUnits;

    const updated = bharatApexReducer(initialState, {
      type: 'UPDATE_TRUCKS_BATCH',
      payload: {
        trucks: initialState.trucks,
        bufferDeliveries: [{ bufferId: 'buf-tata-sanand', addedUnits: 50 }],
      },
    });

    const tataAfter = updated.customerBuffers.find((b) => b.id === 'buf-tata-sanand')!;
    expect(tataAfter.currentStockUnits).toBe(initialUnits + 50);
    expect(tataAfter.runOutHours).toBeGreaterThan(tataBefore.runOutHours);
  });

  it('toggles disruption state dynamically in reducer without hardcoded buffer ID', () => {
    const initialState = getInitialDomainState();
    expect(initialState.isDisruptionActive).toBe(false);

    // Trigger disruption
    const disrupted = bharatApexReducer(initialState, { type: 'TOGGLE_DISRUPTION' });
    expect(disrupted.isDisruptionActive).toBe(true);
    expect(disrupted.disruptedBufferId).toBeDefined();

    const disruptedBuf = disrupted.customerBuffers.find((b) => b.id === disrupted.disruptedBufferId)!;
    expect(disruptedBuf.runOutHours).toBe(1.1); // Dynamically calculated to 1.1h
    expect(disrupted.plantFeed[0].title).toContain('DISRUPTION ACTIVE');

    // Clear disruption
    const cleared = bharatApexReducer(disrupted, { type: 'TOGGLE_DISRUPTION' });
    expect(cleared.isDisruptionActive).toBe(false);
    expect(cleared.disruptedBufferId).toBeUndefined();
    expect(cleared.plantFeed[0].title).toContain('Disruption Cleared');
  });

  it('resets demo data to initial seed baseline', () => {
    const initialState = getInitialDomainState();
    // Mutate state
    const modified = bharatApexReducer(initialState, {
      type: 'SET_BASE_CURRENCY',
      payload: 'EUR',
    });
    expect(modified.baseCurrency).toBe('EUR');

    // Reset
    const reset = bharatApexReducer(modified, { type: 'RESET_DEMO_DATA' });
    expect(reset.baseCurrency).toBe('INR');
    expect(reset.customerBuffers.length).toBe(5);
    expect(reset.plantFeed[0].title).toContain('Demo State Restored');
  });

  it('replenishes BOM stock recursively and records feed entry', () => {
    const initialState = getInitialDomainState();
    const targetItem = initialState.bomItems[0];
    const initialStock = targetItem.currentStock;

    const replenished = bharatApexReducer(initialState, {
      type: 'REPLENISH_BOM_STOCK',
      payload: { bomItemId: targetItem.id, addedStock: 150 },
    });

    const afterItem = replenished.bomItems[0];
    expect(afterItem.currentStock).toBe(initialStock + 150);
    expect(replenished.plantFeed[0].title).toContain('Emergency PO Stock Replenished');
  });

  it('transmits ASN, updates customer buffer, and logs to plantFeed', () => {
    const initialState = getInitialDomainState();
    const tataBefore = initialState.customerBuffers.find((b) => b.oemName === 'Tata Motors')!;
    const initialUnits = tataBefore.currentStockUnits;

    const transmitted = bharatApexReducer(initialState, {
      type: 'TRANSMIT_ASN',
      payload: {
        oemCustomer: 'Tata Motors',
        partNumber: 'BA-ASM-400',
        quantity: 150,
        ewayBillNo: '841920491829',
      },
    });

    const tataAfter = transmitted.customerBuffers.find((b) => b.oemName === 'Tata Motors')!;
    expect(tataAfter.currentStockUnits).toBe(initialUnits + 150);
    expect(transmitted.plantFeed[0].title).toContain('E-Way Bill #841920491829 Transmitted');
  });

  describe('simulation engine & disruption scenarios', () => {
    it('handles SET_SIMULATION_SPEED and TOGGLE_SIMULATION', () => {
      const initialState = getInitialDomainState();
      expect(initialState.isSimulating).toBe(true);
      expect(initialState.simulationSpeed).toBe(1);

      const spedUp = bharatApexReducer(initialState, {
        type: 'SET_SIMULATION_SPEED',
        payload: 5,
      });
      expect(spedUp.simulationSpeed).toBe(5);

      const paused = bharatApexReducer(spedUp, { type: 'TOGGLE_SIMULATION' });
      expect(paused.isSimulating).toBe(false);
      expect(paused.plantFeed[0].title).toBe('Simulation Paused');

      const resumed = bharatApexReducer(paused, { type: 'TOGGLE_SIMULATION' });
      expect(resumed.isSimulating).toBe(true);
      expect(resumed.plantFeed[0].title).toBe('Simulation Resumed');
    });

    it('TICK_SIMULATION drains buffers and advances trucks proportionally', () => {
      const initialState = getInitialDomainState();
      const initialStock0 = initialState.customerBuffers[0].currentStockUnits;
      const initialTruckProgress = initialState.trucks[0].progressPct;

      const ticked = bharatApexReducer(initialState, { type: 'TICK_SIMULATION' });

      // Customer buffers drain
      expect(ticked.customerBuffers[0].currentStockUnits).toBeLessThanOrEqual(initialStock0);
      // Trucks advance
      expect(ticked.trucks[0].progressPct).toBeGreaterThan(initialTruckProgress);
    });

    it('SIM_TICK action drains buffers with speedFactor and advances trucks in a single batched tick', () => {
      const initialState = getInitialDomainState();
      const initialStock0 = initialState.customerBuffers[0].currentStockUnits;
      const initialTruckProgress = initialState.trucks[0].progressPct;

      const ticked = bharatApexReducer(initialState, {
        type: 'SIM_TICK',
        payload: { realSeconds: 2, speedFactor: 5 },
      });

      // Customer buffers drain by 10 simulated minutes (2 sec * 5x)
      expect(ticked.customerBuffers[0].currentStockUnits).toBeLessThan(initialStock0);
      // Trucks advance proportionally
      expect(ticked.trucks[0].progressPct).toBeGreaterThan(initialTruckProgress);
    });

    it('ACTIVATE_SCENARIO with MONSOON delays all trucks +90m and logs feed entry', () => {
      const initialState = getInitialDomainState();
      const initialTruckEta = initialState.trucks[0].etaMinutes;

      const monsoonState = bharatApexReducer(initialState, {
        type: 'ACTIVATE_SCENARIO',
        payload: 'MONSOON',
      });

      expect(monsoonState.activeScenario?.type).toBe('MONSOON');
      expect(monsoonState.scenarioTriggerCount).toBe(1);
      expect(monsoonState.trucks[0].etaMinutes).toBe(initialTruckEta + 90);
      expect(monsoonState.trucks[0].fastagTollStatus).toContain('Monsoon Slowdown (+90m delay)');
      expect(monsoonState.plantFeed[0].title).toContain('NH-48 Monsoon Inundation');

      // Clear scenario restores truck transit
      const cleared = bharatApexReducer(monsoonState, { type: 'CLEAR_SCENARIO' });
      expect(cleared.activeScenario).toBeNull();
      expect(cleared.trucks[0].etaMinutes).toBe(initialTruckEta);
      expect(cleared.plantFeed[0].title).toContain('Scenario Cleared');
    });

    it('APPLY_WHAT_IF_SCENARIO adds transit delay to matching trucks, logs feed, and CLEAR_SCENARIO restores them', () => {
      const initialState = getInitialDomainState();
      const targetTruck = initialState.trucks[0];
      const initialTruckEta = targetTruck.etaMinutes;

      const whatIfState = bharatApexReducer(initialState, {
        type: 'APPLY_WHAT_IF_SCENARIO',
        payload: {
          targetType: 'CORRIDOR',
          targetId: targetTruck.corridorId,
          targetName: 'Chakan - Sanand NH-48',
          delayHours: 3.0,
          affectedTruckIds: [targetTruck.id],
          affectedOems: [targetTruck.destinationOem],
          totalHoursOfLineStop: 1.5,
          totalPenaltyDeltaINR: 3750000,
        },
      });

      // Matching truck receives +3h (180m) delay
      expect(whatIfState.activeScenario?.type).toBe('WHAT_IF');
      expect(whatIfState.activeScenario?.badge).toBe('What-If: +3h');
      const updatedTruck = whatIfState.trucks.find((t) => t.id === targetTruck.id)!;
      expect(updatedTruck.etaMinutes).toBe(initialTruckEta + 180);
      expect(updatedTruck.fastagTollStatus).toContain('Delay Applied');
      expect(whatIfState.plantFeed[0].title).toContain('SCENARIO ACTIVE: Chakan - Sanand NH-48');

      // Clear scenario cleanly restores previous truck ETA
      const cleared = bharatApexReducer(whatIfState, { type: 'CLEAR_SCENARIO' });
      expect(cleared.activeScenario).toBeNull();
      const restoredTruck = cleared.trucks.find((t) => t.id === targetTruck.id)!;
      expect(restoredTruck.etaMinutes).toBe(initialTruckEta);
      expect(cleared.plantFeed[0].title).toContain('Scenario Cleared');
    });

    it('ACTIVATE_SCENARIO with SUPPLIER_STRIKE depletes supplier raw casting stock', () => {
      const initialState = getInitialDomainState();

      const strikeState = bharatApexReducer(initialState, {
        type: 'ACTIVATE_SCENARIO',
        payload: 'SUPPLIER_STRIKE',
      });

      expect(strikeState.activeScenario?.type).toBe('SUPPLIER_STRIKE');
      expect(strikeState.scenarioTriggerCount).toBe(1);
      // Find bom-child-1 (Kalyani Steels SG-Iron casting)
      const findItem = (items: typeof strikeState.bomItems, id: string): any => {
        for (const item of items) {
          if (item.id === id) return item;
          if (item.children) {
            const found = findItem(item.children, id);
            if (found) return found;
          }
        }
        return null;
      };

      const depletedItem = findItem(strikeState.bomItems, 'bom-child-1');
      expect(depletedItem.currentStock).toBe(120); // Critically depleted below safety stock 600
      expect(strikeState.plantFeed[0].title).toContain('Supplier Strike');

      // Clear scenario restores stock
      const cleared = bharatApexReducer(strikeState, { type: 'CLEAR_SCENARIO' });
      expect(cleared.activeScenario).toBeNull();
      const restoredItem = findItem(cleared.bomItems, 'bom-child-1');
      expect(restoredItem.currentStock).toBe(820);
    });

    it('ACTIVATE_SCENARIO with MACHINE_BREAKDOWN sets CNC-01 to MAINTENANCE with 0 OEE', () => {
      const initialState = getInitialDomainState();

      const breakdownState = bharatApexReducer(initialState, {
        type: 'ACTIVATE_SCENARIO',
        payload: 'MACHINE_BREAKDOWN',
      });

      expect(breakdownState.activeScenario?.type).toBe('MACHINE_BREAKDOWN');
      expect(breakdownState.scenarioTriggerCount).toBe(1);
      const cnc01 = breakdownState.machines.find((m) => m.id === 'CNC-01')!;
      expect(cnc01.status).toBe('MAINTENANCE');
      expect(cnc01.oee).toBe(0.0);
      expect(breakdownState.plantFeed[0].title).toContain('Machine Breakdown (CNC-01)');

      // Clear scenario restores CNC-01
      const cleared = bharatApexReducer(breakdownState, { type: 'CLEAR_SCENARIO' });
      expect(cleared.activeScenario).toBeNull();
      const restoredCnc = cleared.machines.find((m) => m.id === 'CNC-01')!;
      expect(restoredCnc.status).toBe('RUNNING');
      expect(restoredCnc.oee).toBe(91.2);
    });

    it('ACTIVATE_SCENARIO with FX_SPIKE applies +5% USD shock and updates feed', () => {
      const initialState = getInitialDomainState();
      const initialUsdShock = initialState.fxShocks.USD ?? 0;

      const fxSpikeState = bharatApexReducer(initialState, {
        type: 'ACTIVATE_SCENARIO',
        payload: 'FX_SPIKE',
      });

      expect(fxSpikeState.activeScenario?.type).toBe('FX_SPIKE');
      expect(fxSpikeState.scenarioTriggerCount).toBe(1);
      expect(fxSpikeState.fxShocks.USD).toBe(initialUsdShock + 5.0);
      expect(fxSpikeState.plantFeed[0].title).toContain('USD/INR Spike');

      // Clear scenario restores FX shock
      const cleared = bharatApexReducer(fxSpikeState, { type: 'CLEAR_SCENARIO' });
      expect(cleared.activeScenario).toBeNull();
      expect(cleared.fxShocks.USD).toBe(initialUsdShock);
    });

    it('ACKNOWLEDGE_ALERT updates alert user action in reducer state and logs feed', () => {
      const initialState = getInitialDomainState();
      const alertId = 'alert-buf-buf-tata-sanand';

      const acknowledged = bharatApexReducer(initialState, {
        type: 'ACKNOWLEDGE_ALERT',
        payload: { alertId },
      });

      expect(acknowledged.alertUserActions[alertId]).toBeDefined();
      expect(acknowledged.alertUserActions[alertId].status).toBe('ACKNOWLEDGED');
      expect(acknowledged.alertUserActions[alertId].acknowledgedAt).toBeDefined();
      expect(acknowledged.plantFeed[0].title).toBe('Alert Acknowledged');
    });

    it('SNOOZE_ALERT sets snoozedUntil for 15 minutes and logs feed', () => {
      const initialState = getInitialDomainState();
      const alertId = 'alert-mach-VMC-01';
      const beforeTime = Date.now();

      const snoozed = bharatApexReducer(initialState, {
        type: 'SNOOZE_ALERT',
        payload: { alertId, durationMinutes: 15 },
      });

      expect(snoozed.alertUserActions[alertId]).toBeDefined();
      expect(snoozed.alertUserActions[alertId].status).toBe('SNOOZED');
      expect(snoozed.alertUserActions[alertId].snoozedUntil).toBeGreaterThanOrEqual(
        beforeTime + 15 * 60 * 1000 - 50
      );
      expect(snoozed.plantFeed[0].title).toContain('Alert Snoozed (15m)');
    });
  });
});
