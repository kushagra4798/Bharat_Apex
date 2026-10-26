import React, { createContext, useContext, useReducer, useEffect, ReactNode, useCallback } from 'react';
import {
  ActiveScenario,
  AlertUserAction,
  BomItem,
  CurrencyCode,
  CurrencyRates,
  CustomerBuffer,
  FxShocks,
  Machine,
  MachineStatus,
  PlantFeedEntry,
  ScenarioType,
  SimulationSpeed,
  SystemAlert,
  Truck,
  WorkOrder,
  WorkOrderStage,
  EWayBillRecord,
} from '../types';
import {
  CORRIDORS,
  DEFAULT_CURRENCY_RATES,
  DEFAULT_FX_SHOCKS,
  INITIAL_BOM,
  INITIAL_CUSTOMER_BUFFERS,
  INITIAL_PLANT_FEED,
  INITIAL_TRUCKS,
  INITIAL_WORK_ORDERS,
  INITIAL_EWAY_BILLS,
  MACHINES,
} from '../data/mockData';
import {
  getStorageKey,
  loadFromLocalStorage,
  saveToLocalStorageThrottled,
  removeFromLocalStorage,
} from '../hooks/usePersistentState';
import {
  calculateRunOutHours,
  getNextWorkOrderStage,
  advanceBuffer,
  advanceTruck,
  applyDelivery,
  simulateBufferDrain,
  applyBufferDelivery,
  simulateTruckStep,
  applyWorkOrderCompletion,
  calculateEwayBillValidity,
  checkEwayBillExpiryAlerts,
} from '../services/calculations';
import { fetchLiveRates } from '../services/currencyService';

// Domain State Model
export interface BharatApexState {
  customerBuffers: CustomerBuffer[];
  workOrders: WorkOrder[];
  machines: Machine[];
  bomItems: BomItem[];
  trucks: Truck[];
  plantFeed: PlantFeedEntry[];
  currencyRates: CurrencyRates;
  fxShocks: FxShocks;
  baseCurrency: CurrencyCode;
  isLiveRates: boolean;
  lastRatesFetchTime?: string;
  isDisruptionActive: boolean;
  disruptedBufferId?: string;
  disruptionOriginalStock?: number;
  disruptionTruckId?: string;
  disruptionDelayMinutes?: number;
  // Simulation Engine & Scenario state
  simulationSpeed: SimulationSpeed;
  isSimulating: boolean;
  activeScenario: ActiveScenario | null;
  scenarioTriggerCount: number;
  // Alerts Center state
  alertUserActions: Record<string, AlertUserAction>;
  // E-Way Bill Ledger & Expiry Alert Tracking
  ewayBills: EWayBillRecord[];
  alertedEwayBills: string[];
  pendingToast?: { id: string; message: string; type?: 'info' | 'success' | 'warning' | 'error' } | null;
}

// Initial Seed Factory
export function getInitialDomainState(): BharatApexState {
  return {
    customerBuffers: JSON.parse(JSON.stringify(INITIAL_CUSTOMER_BUFFERS)),
    workOrders: JSON.parse(JSON.stringify(INITIAL_WORK_ORDERS)),
    machines: JSON.parse(JSON.stringify(MACHINES)),
    bomItems: JSON.parse(JSON.stringify(INITIAL_BOM)),
    trucks: JSON.parse(JSON.stringify(INITIAL_TRUCKS)),
    plantFeed: JSON.parse(JSON.stringify(INITIAL_PLANT_FEED)),
    ewayBills: JSON.parse(JSON.stringify(INITIAL_EWAY_BILLS)),
    alertedEwayBills: [],
    pendingToast: null,
    currencyRates: { ...DEFAULT_CURRENCY_RATES },
    fxShocks: { ...DEFAULT_FX_SHOCKS },
    baseCurrency: 'INR',
    isLiveRates: false,
    isDisruptionActive: false,
    simulationSpeed: 1,
    isSimulating: true,
    activeScenario: null,
    scenarioTriggerCount: 0,
    alertUserActions: {},
  };
}

// Action Types
export type BharatApexAction =
  | { type: 'SET_BASE_CURRENCY'; payload: CurrencyCode }
  | { type: 'SET_CURRENCY_RATES'; payload: { rates: CurrencyRates; isLive: boolean; fetchTime?: string } | CurrencyRates }
  | { type: 'SET_FX_SHOCKS'; payload: FxShocks }
  | { type: 'RESET_DEMO_DATA' }
  | { type: 'TOGGLE_MACHINE_STATUS'; payload: { machineId: string; status?: MachineStatus; reason?: string } }
  | { type: 'ADVANCE_WORK_ORDER'; payload: { workOrderId: string } }
  | { type: 'ADD_WORK_ORDER'; payload: WorkOrder }
  | { type: 'LOG_SCRAP_DISRUPTION'; payload: { workOrderId: string; scrapCount: number; reason: string } }
  | { type: 'EXPEDITE_TRANSIT'; payload: { truckId: string; addedUnits?: number } }
  | { type: 'UPDATE_BUFFER_STOCK'; payload: { bufferId: string; deltaUnits: number } }
  | { type: 'ADD_PLANT_FEED'; payload: Omit<PlantFeedEntry, 'id' | 'timestamp' | 'timeDisplay'> & { timeDisplay?: string } }
  | { type: 'UPDATE_TRUCK_POSITION'; payload: { truckId: string; currentLat: number; currentLng: number; progressPct: number; etaMinutes: number } }
  | { type: 'UPDATE_TRUCKS_BATCH'; payload: { trucks: Truck[]; bufferDeliveries?: { bufferId: string; addedUnits: number }[] } }
  | { type: 'TOGGLE_DISRUPTION' }
  | { type: 'REPLENISH_BOM_STOCK'; payload: { bomItemId: string; addedStock: number } }
  | {
      type: 'TRANSMIT_ASN';
      payload: {
        oemCustomer: string;
        partNumber: string;
        quantity: number;
        ewayBillNo: string;
        distanceKm?: number;
        recipientGstin?: string;
        destinationAddress?: string;
        partDescription?: string;
        unitValue?: number;
        isInterState?: boolean;
        vehicleNo?: string;
        transporterId?: string;
      };
    }
  | { type: 'LOAD_SAVED_STATE'; payload: BharatApexState }
  | { type: 'SIM_TICK'; payload?: { realSeconds?: number; speedFactor?: number } }
  | { type: 'TICK_SIMULATION' }
  | { type: 'SET_SIMULATION_SPEED'; payload: SimulationSpeed }
  | { type: 'TOGGLE_SIMULATION' }
  | { type: 'ACTIVATE_SCENARIO'; payload: ScenarioType }
  | { type: 'CLEAR_SCENARIO' }
  | {
      type: 'APPLY_WHAT_IF_SCENARIO';
      payload: {
        targetType: 'CORRIDOR' | 'SUPPLIER';
        targetId: string;
        targetName: string;
        delayHours: number;
        affectedTruckIds: string[];
        affectedOems: string[];
        totalHoursOfLineStop: number;
        totalPenaltyDeltaINR: number;
      };
    }
  | { type: 'ACKNOWLEDGE_ALERT'; payload: { alertId: string } }
  | { type: 'SNOOZE_ALERT'; payload: { alertId: string; durationMinutes?: number } }
  | { type: 'CLEAR_ALERT_ACTIONS' };

// Helper to format current time string (HH:mm)
function getCurrentTimeString(): { timeDisplay: string; timestamp: string } {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return {
    timeDisplay: `${hours}:${minutes}`,
    timestamp: now.toISOString(),
  };
}

// Prepend Plant Feed Entry Helper
function prependFeedEntry(
  feed: PlantFeedEntry[],
  title: string,
  description: string,
  category: PlantFeedEntry['category'] = 'TELEMETRY',
  severity: PlantFeedEntry['severity'] = 'NORMAL'
): PlantFeedEntry[] {
  const { timeDisplay, timestamp } = getCurrentTimeString();
  const newEntry: PlantFeedEntry = {
    id: `feed-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp,
    timeDisplay,
    category,
    title,
    description,
    severity,
  };
  return [newEntry, ...feed.slice(0, 49)]; // Keep latest 50 entries
}

export function bharatApexReducer(state: BharatApexState, action: BharatApexAction): BharatApexState {
  switch (action.type) {
    case 'SET_BASE_CURRENCY': {
      return {
        ...state,
        baseCurrency: action.payload,
      };
    }

    case 'SET_CURRENCY_RATES': {
      if ('rates' in action.payload) {
        return {
          ...state,
          currencyRates: action.payload.rates,
          isLiveRates: action.payload.isLive,
          lastRatesFetchTime: action.payload.fetchTime,
        };
      }
      return {
        ...state,
        currencyRates: action.payload,
        isLiveRates: true,
      };
    }

    case 'SET_FX_SHOCKS': {
      return {
        ...state,
        fxShocks: action.payload,
      };
    }

    case 'RESET_DEMO_DATA': {
      removeFromLocalStorage('domain_state');
      const fresh = getInitialDomainState();
      return {
        ...fresh,
        plantFeed: prependFeedEntry(
          fresh.plantFeed,
          'Demo State Restored',
          'All domain buffers, work orders, machines, and BOM items reset to seed baseline.',
          'SYSTEM',
          'NORMAL'
        ),
      };
    }

    case 'TOGGLE_MACHINE_STATUS': {
      const { machineId, status: newStatus, reason } = action.payload;
      const updatedMachines = state.machines.map((m) => {
        if (m.id !== machineId) return m;

        let nextStatus = newStatus;
        if (!nextStatus) {
          // Cycle status if not specified: RUNNING -> SETUP -> MAINTENANCE -> IDLE -> RUNNING
          const statusCycle: MachineStatus[] = ['RUNNING', 'SETUP', 'MAINTENANCE', 'IDLE'];
          const currentIndex = statusCycle.indexOf(m.status);
          nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length];
        }

        const oeeMap: Record<MachineStatus, number> = {
          RUNNING: 91.5,
          SETUP: 62.0,
          MAINTENANCE: 0.0,
          IDLE: 72.0,
        };

        return {
          ...m,
          status: nextStatus,
          oee: oeeMap[nextStatus],
          statusReason: reason || (nextStatus === 'MAINTENANCE' ? 'Unscheduled downtime reported' : undefined),
        };
      });

      const targetMachine = state.machines.find((m) => m.id === machineId);
      const machineName = targetMachine ? targetMachine.name : machineId;

      return {
        ...state,
        machines: updatedMachines,
        plantFeed: prependFeedEntry(
          state.plantFeed,
          `${machineName} Status Changed`,
          `Station state toggled to ${newStatus ?? 'next cycle'} by Lead Controller.`,
          'TELEMETRY',
          newStatus === 'MAINTENANCE' ? 'CRITICAL' : 'NORMAL'
        ),
      };
    }

    case 'ADVANCE_WORK_ORDER': {
      const { workOrderId } = action.payload;
      let advancedOem = '';
      let nextStageName = '';
      let completedWo: WorkOrder | null = null;

      const updatedWorkOrders = state.workOrders.map((wo) => {
        if (wo.id !== workOrderId) return wo;
        advancedOem = wo.oemName;
        const next = getNextWorkOrderStage(wo.stage);
        if (!next) {
          const comp: WorkOrder = { ...wo, progress: 100, status: 'COMPLETED' as const };
          completedWo = comp;
          return comp;
        }
        nextStageName = next;
        const progressIncrement = Math.min(100, wo.progress + 25);
        const isCompleted = progressIncrement >= 100;
        const updated: WorkOrder = {
          ...wo,
          stage: next,
          progress: progressIncrement,
          status: isCompleted ? ('COMPLETED' as const) : wo.status,
        };
        if (isCompleted) {
          completedWo = updated;
        }
        return updated;
      });

      let updatedBuffers = state.customerBuffers;
      let feed = state.plantFeed;

      if (completedWo) {
        updatedBuffers = applyWorkOrderCompletion(updatedBuffers, completedWo);
        feed = prependFeedEntry(
          feed,
          `Work Order #${workOrderId} Completed`,
          `Production completed. Finished ${(completedWo as WorkOrder).quantity} units transferred to ${(completedWo as WorkOrder).oemName} customer buffer.`,
          'SCHEDULE',
          'NORMAL'
        );
      } else {
        feed = prependFeedEntry(
          feed,
          `Work Order #${workOrderId} Stage Advanced`,
          `Production transferred to ${nextStageName || 'FINAL_DISPATCH'} for ${advancedOem}.`,
          'SCHEDULE',
          'NORMAL'
        );
      }

      return {
        ...state,
        workOrders: updatedWorkOrders,
        customerBuffers: updatedBuffers,
        plantFeed: feed,
      };
    }

    case 'ADD_WORK_ORDER': {
      const newWo = action.payload;
      return {
        ...state,
        workOrders: [newWo, ...state.workOrders],
        plantFeed: prependFeedEntry(
          state.plantFeed,
          `New Work Order #${newWo.id} Created`,
          `Scheduled ${newWo.quantity} pcs of ${newWo.partDescription} for ${newWo.oemName}.`,
          'SCHEDULE',
          newWo.priority === 'Rush' ? 'WARN' : 'NORMAL'
        ),
      };
    }

    case 'LOG_SCRAP_DISRUPTION': {
      const { workOrderId, scrapCount, reason } = action.payload;
      let targetWoName = workOrderId;

      const updatedWorkOrders = state.workOrders.map((wo) => {
        if (wo.id !== workOrderId) return wo;
        targetWoName = `${wo.oemName} (${wo.partDescription})`;
        const newScrap = wo.scrapCount + scrapCount;
        const total = wo.quantity || 1;
        const pct = ((newScrap / total) * 100).toFixed(1);
        return {
          ...wo,
          scrapCount: newScrap,
          scrapRate: `${newScrap} pcs (${pct}%)`,
        };
      });

      return {
        ...state,
        workOrders: updatedWorkOrders,
        plantFeed: prependFeedEntry(
          state.plantFeed,
          `Scrap Logged on WO #${workOrderId}`,
          `${scrapCount} defective pcs logged. Reason: ${reason} on ${targetWoName}.`,
          'TELEMETRY',
          'WARN'
        ),
      };
    }

    case 'EXPEDITE_TRANSIT': {
      const { truckId, addedUnits = 50 } = action.payload;
      const targetTruck = state.trucks.find((t) => t.id === truckId);

      // Requirement 4: "ignore the action if the truck is already expedited"
      if (!targetTruck || targetTruck.isExpedited) {
        return state;
      }

      const updatedTrucks = state.trucks.map((t) => {
        if (t.id !== truckId) return t;
        return {
          ...t,
          isExpedited: true,
          unitsLoaded: t.unitsLoaded + addedUnits,
          fastagTollStatus: 'FASTag Green Pass Issued (Express Bypass)',
          etaMinutes: Math.max(15, Math.round(t.etaMinutes * 0.65)), // 35% time cut
          lastPingTime: 'Just now',
        };
      });

      // Requirement 4: Stock is added to destination buffer when the truck arrives (progress reaching 100), not on click
      return {
        ...state,
        trucks: updatedTrucks,
        plantFeed: prependFeedEntry(
          state.plantFeed,
          `Convoy ${truckId} Expedited`,
          `Green Corridor bypass granted for ${targetTruck.destinationOem}. +${addedUnits} units will be credited upon gate arrival.`,
          'FASTAG',
          'WARN'
        ),
      };
    }

    case 'UPDATE_TRUCKS_BATCH': {
      const { trucks: nextTrucks, bufferDeliveries = [] } = action.payload;
      let newFeed = state.plantFeed;
      let newBuffers = state.customerBuffers;

      // When truck arrives (progress reaching 100), add stock to destination buffer
      if (bufferDeliveries.length > 0) {
        newBuffers = state.customerBuffers.map((b) => {
          const delivery = bufferDeliveries.find((d) => d.bufferId === b.id);
          if (!delivery) return b;

          const updatedUnits = b.currentStockUnits + delivery.addedUnits;
          const updatedRunOut = calculateRunOutHours(updatedUnits, b.consumptionPerHour);
          const updatedStatus =
            updatedRunOut < 3.0 ? ('CRITICAL' as const) : updatedRunOut < 6.0 ? ('WARNING' as const) : ('HEALTHY' as const);

          return {
            ...b,
            currentStockUnits: updatedUnits,
            runOutHours: updatedRunOut,
            status: updatedStatus,
          };
        });

        bufferDeliveries.forEach((d) => {
          const buf = state.customerBuffers.find((b) => b.id === d.bufferId);
          newFeed = prependFeedEntry(
            newFeed,
            `Delivery Arrived: ${buf?.oemName || 'OEM Buffer'} Stock Replenished`,
            `+${d.addedUnits} units received at destination gate. Live buffer hours recalculated.`,
            'TELEMETRY',
            'NORMAL'
          );
        });
      }

      return {
        ...state,
        trucks: nextTrucks,
        customerBuffers: newBuffers,
        plantFeed: newFeed,
      };
    }

    case 'TOGGLE_DISRUPTION': {
      if (!state.isDisruptionActive) {
        // Find critical buffer dynamically without hardcoded ID
        const targetBuffer =
          state.customerBuffers.find((b) => b.runOutHours <= 2.5) || state.customerBuffers[0];
        if (!targetBuffer) return state;

        // Compute delta dynamically to reach critical 1.1h threshold without hardcoded -70
        const targetUnits = Math.round(1.1 * targetBuffer.consumptionPerHour);
        const deltaUnits = targetUnits - targetBuffer.currentStockUnits;

        // Find matching truck for this OEM dynamically
        const matchedTruck =
          state.trucks.find(
            (t) =>
              t.destinationOem.toLowerCase().includes(targetBuffer.oemName.toLowerCase()) ||
              targetBuffer.oemName.toLowerCase().includes(t.destinationOem.toLowerCase())
          ) || state.trucks[0];

        const delayMinutes = 95;

        const updatedBuffers = state.customerBuffers.map((b) => {
          if (b.id !== targetBuffer.id) return b;
          const newUnits = Math.max(0, b.currentStockUnits + deltaUnits);
          const newRunOut = calculateRunOutHours(newUnits, b.consumptionPerHour);
          return {
            ...b,
            currentStockUnits: newUnits,
            runOutHours: newRunOut,
            status: 'CRITICAL' as const,
          };
        });

        const updatedTrucks = state.trucks.map((t) => {
          if (t.id !== matchedTruck.id) return t;
          return {
            ...t,
            progressPct: Math.max(10, t.progressPct - 20),
            etaMinutes: t.etaMinutes + delayMinutes,
            fastagTollStatus: 'Delayed at Highway Bottleneck (+95 min)',
          };
        });

        return {
          ...state,
          isDisruptionActive: true,
          disruptedBufferId: targetBuffer.id,
          disruptionOriginalStock: targetBuffer.currentStockUnits,
          disruptionTruckId: matchedTruck.id,
          disruptionDelayMinutes: delayMinutes,
          customerBuffers: updatedBuffers,
          trucks: updatedTrucks,
          plantFeed: prependFeedEntry(
            state.plantFeed,
            'DISRUPTION ACTIVE: NH-48 Heavy Rain Bottleneck',
            `Monsoon congestion on highway corridor. ${targetBuffer.oemName} buffer reduced to 1.1h. Convoy ${matchedTruck.registrationNumber} delayed +${delayMinutes}m.`,
            'DISRUPTION',
            'CRITICAL'
          ),
        };
      } else {
        // Clear disruption restoring previous baseline dynamically
        const bufferId = state.disruptedBufferId;
        const originalStock = state.disruptionOriginalStock;
        const truckId = state.disruptionTruckId;
        const delay = state.disruptionDelayMinutes || 95;

        const updatedBuffers = state.customerBuffers.map((b) => {
          if (b.id !== bufferId) return b;
          const restoredUnits = originalStock ?? Math.round(b.consumptionPerHour * 1.8);
          const restoredRunOut = calculateRunOutHours(restoredUnits, b.consumptionPerHour);
          return {
            ...b,
            currentStockUnits: restoredUnits,
            runOutHours: restoredRunOut,
            status: restoredRunOut < 3.0 ? ('CRITICAL' as const) : ('WARNING' as const),
          };
        });

        const updatedTrucks = state.trucks.map((t) => {
          if (t.id !== truckId) return t;
          return {
            ...t,
            etaMinutes: Math.max(15, t.etaMinutes - delay),
            fastagTollStatus: 'Standard Highway Transit Active',
          };
        });

        return {
          ...state,
          isDisruptionActive: false,
          disruptedBufferId: undefined,
          disruptionOriginalStock: undefined,
          disruptionTruckId: undefined,
          disruptionDelayMinutes: undefined,
          customerBuffers: updatedBuffers,
          trucks: updatedTrucks,
          plantFeed: prependFeedEntry(
            state.plantFeed,
            'Disruption Cleared: Nominal Telemetry Restored',
            'Highway traffic normalization signal received. Buffer stock and convoy schedules restored.',
            'DISRUPTION',
            'NORMAL'
          ),
        };
      }
    }

    case 'UPDATE_BUFFER_STOCK': {
      const { bufferId, deltaUnits } = action.payload;
      const updatedBuffers = state.customerBuffers.map((b) => {
        if (b.id !== bufferId) return b;
        const newUnits = Math.max(0, b.currentStockUnits + deltaUnits);
        const newRunOut = calculateRunOutHours(newUnits, b.consumptionPerHour);
        const newStatus =
          newRunOut < 3.0 ? ('CRITICAL' as const) : newRunOut < 6.0 ? ('WARNING' as const) : ('HEALTHY' as const);

        return {
          ...b,
          currentStockUnits: newUnits,
          runOutHours: newRunOut,
          status: newStatus,
        };
      });

      return {
        ...state,
        customerBuffers: updatedBuffers,
      };
    }

    case 'ADD_PLANT_FEED': {
      const { title, description, category = 'TELEMETRY', severity = 'NORMAL' } = action.payload;
      return {
        ...state,
        plantFeed: prependFeedEntry(state.plantFeed, title, description, category, severity),
      };
    }

    case 'UPDATE_TRUCK_POSITION': {
      const { truckId, currentLat, currentLng, progressPct, etaMinutes } = action.payload;
      const updatedTrucks = state.trucks.map((t) => {
        if (t.id !== truckId) return t;
        return {
          ...t,
          currentLat,
          currentLng,
          progressPct,
          etaMinutes,
          lastPingTime: 'Just now',
        };
      });

      return {
        ...state,
        trucks: updatedTrucks,
      };
    }

    case 'REPLENISH_BOM_STOCK': {
      const { bomItemId, addedStock } = action.payload;

      // Recursive BOM updater
      const updateBomRecursive = (items: BomItem[]): BomItem[] => {
        return items.map((item) => {
          if (item.id === bomItemId) {
            return { ...item, currentStock: item.currentStock + addedStock };
          }
          if (item.children && item.children.length > 0) {
            return { ...item, children: updateBomRecursive(item.children) };
          }
          return item;
        });
      };

      return {
        ...state,
        bomItems: updateBomRecursive(state.bomItems),
        plantFeed: prependFeedEntry(
          state.plantFeed,
          `Emergency PO Stock Replenished`,
          `+${addedStock} units received into bonded warehouse inventory.`,
          'TELEMETRY',
          'NORMAL'
        ),
      };
    }

    case 'TRANSMIT_ASN': {
      const { oemCustomer, partNumber, quantity, ewayBillNo } = action.payload;
      const { timestamp } = getCurrentTimeString();
      const distanceKm = action.payload.distanceKm || (action.payload.isInterState ? 660 : 45);
      const validity = calculateEwayBillValidity(distanceKm, timestamp);

      const newRecord: EWayBillRecord = {
        id: `ewb-${Date.now()}`,
        ewayBillNo,
        asnNo: `ASN-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
        generatedAt: timestamp,
        dispatchDate: new Date().toISOString().split('T')[0],
        validUntil: validity.validUntil,
        supplierGstin: '27AAAAA0000A1Z5',
        recipientGstin: action.payload.recipientGstin || '24AABCT2004L1Z2',
        oemCustomer,
        originAddress: 'Plot B-14, Phase 2, Chakan MIDC, Pune 410501, Maharashtra',
        destinationAddress: action.payload.destinationAddress || 'Sanand Industrial Estate, Gujarat',
        hsnCode: '8708.29.00',
        partNumber,
        partDescription: action.payload.partDescription || `${partNumber} Assembly`,
        quantity,
        unitValue: action.payload.unitValue || 1250,
        taxableAmount: (action.payload.unitValue || 1250) * quantity,
        isInterState: action.payload.isInterState ?? true,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: Math.round((action.payload.unitValue || 1250) * quantity * 0.18),
        totalInvoiceAmount: Math.round((action.payload.unitValue || 1250) * quantity * 1.18),
        transporterId: action.payload.transporterId || '27AAACV7710K1Z4 (VRL Logistics)',
        vehicleNo: action.payload.vehicleNo || 'MH-14-GH-4091',
        transitStatus: 'IN_TRANSIT',
        distanceKm,
      };

      // Update destination buffer with newly transmitted units
      const updatedBuffers = state.customerBuffers.map((b) => {
        if (!b.oemName.toLowerCase().includes(oemCustomer.toLowerCase())) return b;
        const newUnits = b.currentStockUnits + quantity;
        const newRunOut = calculateRunOutHours(newUnits, b.consumptionPerHour);
        const newStatus =
          newRunOut < 3.0 ? ('CRITICAL' as const) : newRunOut < 6.0 ? ('WARNING' as const) : ('HEALTHY' as const);

        return {
          ...b,
          currentStockUnits: newUnits,
          runOutHours: newRunOut,
          status: newStatus,
        };
      });

      return {
        ...state,
        customerBuffers: updatedBuffers,
        ewayBills: [newRecord, ...(state.ewayBills || INITIAL_EWAY_BILLS)],
        plantFeed: prependFeedEntry(
          state.plantFeed,
          `E-Way Bill #${ewayBillNo} Transmitted`,
          `GST EWB-01 validated (${distanceKm} km · ${validity.validDays}d validity illustrative). Staged dispatch of ${quantity} units to ${oemCustomer}.`,
          'ASN',
          'NORMAL'
        ),
      };
    }

    case 'LOAD_SAVED_STATE': {
      return {
        ...action.payload,
      };
    }

    case 'SIM_TICK':
    case 'TICK_SIMULATION': {
      if (!state.isSimulating) return state;

      const speedFactor =
        action.type === 'SIM_TICK' && action.payload?.speedFactor
          ? action.payload.speedFactor
          : state.simulationSpeed || 1;
      const realSeconds =
        action.type === 'SIM_TICK' && action.payload?.realSeconds
          ? action.payload.realSeconds
          : 2;

      // Simulated minutes = real seconds x speed factor
      const simulatedMinutes = realSeconds * speedFactor;
      const simulatedHours = simulatedMinutes / 60;

      // 1. Every customer buffer drains by consumptionPerHour x simulated hours, then recompute runOutHours and status
      const drainedBuffers = state.customerBuffers.map((buf) =>
        advanceBuffer(buf, simulatedHours)
      );

      // 2. Trucks advance along their corridor (reuse existing interpolation) with ETA = remaining fraction x corridor standardDurationHours.
      // When a truck reaches 100%, add its units to destination buffer exactly once, log feed entry, then re-dispatch after a delay.
      const monsoonDelayMinutes = state.activeScenario?.type === 'MONSOON' ? 90 : 0;
      let bufferDeliveredState = drainedBuffers;
      let feedAfterTrucks = state.plantFeed;
      let latestPendingToast = state.pendingToast || null;

      const updatedTrucks = state.trucks.map((truck) => {
        const corridor = CORRIDORS.find((c) => c.id === truck.corridorId) || CORRIDORS[0];
        const result = advanceTruck(truck, corridor, simulatedHours, { monsoonDelayMinutes });

        // Geofence Arrival Event (fires once per trip when first entering OEM plant geofence)
        if (result.geofenceEvent) {
          feedAfterTrucks = prependFeedEntry(
            feedAfterTrucks,
            result.geofenceEvent.feedTitle,
            result.geofenceEvent.feedDescription,
            'TELEMETRY',
            'NORMAL'
          );
          latestPendingToast = {
            id: `geofence-${Date.now()}-${result.geofenceEvent.truckId}-${Math.random()}`,
            message: result.geofenceEvent.toastMessage,
            type: 'info',
          };
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('app-toast', {
                detail: {
                  message: result.geofenceEvent.toastMessage,
                  type: 'info',
                },
              })
            );
          }
        }

        if (result.hasArrived) {
          bufferDeliveredState = applyDelivery(
            bufferDeliveredState,
            truck.destinationOem,
            result.deliveredUnits
          );
          feedAfterTrucks = prependFeedEntry(
            feedAfterTrucks,
            `Convoy Arrived: ${truck.destinationOem}`,
            `Vehicle ${truck.registrationNumber} completed route. +${result.deliveredUnits} units received at OEM dock.`,
            'TELEMETRY',
            'NORMAL'
          );
        }

        return result.updatedTruck;
      });

      // 3. Completed work orders add finished units to matching OEM buffer once
      let finalBuffers = bufferDeliveredState;
      let finalFeed = feedAfterTrucks;
      const updatedWorkOrders = state.workOrders.map((wo) => {
        if (wo.status === 'IN_PROGRESS' && wo.progress < 100) {
          const step = 0.25 * speedFactor;
          const nextProg = Math.min(100, wo.progress + step);
          if (nextProg >= 100) {
            const completedWo: WorkOrder = {
              ...wo,
              progress: 100,
              status: 'COMPLETED' as const,
            };
            finalBuffers = applyDelivery(finalBuffers, completedWo.oemName, completedWo.quantity);
            finalFeed = prependFeedEntry(
              finalFeed,
              `Work Order #${wo.id} Completed`,
              `Batch of ${wo.quantity} pcs (${wo.partDescription}) finished. Units delivered to ${wo.oemName} customer buffer.`,
              'SCHEDULE',
              'NORMAL'
            );
            return completedWo;
          }
          return { ...wo, progress: Number(nextProg.toFixed(1)) };
        }
        return wo;
      });

      // 4. E-Way Bill Validity Alerts (Log alert when <= 2 hours remain, only once per bill)
      const currentEwayBills = state.ewayBills || INITIAL_EWAY_BILLS;
      const { newAlerts, updatedAlertedBillNos } = checkEwayBillExpiryAlerts(
        currentEwayBills,
        state.alertedEwayBills || []
      );

      for (const alert of newAlerts) {
        finalFeed = prependFeedEntry(
          finalFeed,
          `E-Way Bill Expiry Warning: #${alert.ewayBillNo} (<2h)`,
          `GST EWB-01 #${alert.ewayBillNo} for ${alert.oemCustomer} expires in ${alert.formattedCountdown} (illustrative 200 km/day rule). Staged vehicle: ${alert.vehicleNo}.`,
          'ASN',
          'WARN'
        );
      }

      return {
        ...state,
        customerBuffers: finalBuffers,
        trucks: updatedTrucks,
        workOrders: updatedWorkOrders,
        plantFeed: finalFeed,
        alertedEwayBills: updatedAlertedBillNos,
        pendingToast: latestPendingToast,
      };
    }

    case 'SET_SIMULATION_SPEED': {
      return {
        ...state,
        simulationSpeed: action.payload,
      };
    }

    case 'TOGGLE_SIMULATION': {
      const nextSimulating = !state.isSimulating;
      return {
        ...state,
        isSimulating: nextSimulating,
        plantFeed: prependFeedEntry(
          state.plantFeed,
          nextSimulating ? 'Simulation Resumed' : 'Simulation Paused',
          nextSimulating
            ? `Telemetry engine ticking at ${state.simulationSpeed || 1}x speed.`
            : 'Simulation clock paused by operator.',
          'SYSTEM',
          'NORMAL'
        ),
      };
    }

    case 'ACTIVATE_SCENARIO': {
      const scenario = action.payload;
      const { timeDisplay } = getCurrentTimeString();

      if (scenario === 'NONE') {
        return bharatApexReducer(state, { type: 'CLEAR_SCENARIO' });
      }

      if (scenario === 'MONSOON') {
        const delayMinutes = 90;
        const updatedTrucks = state.trucks.map((t) => ({
          ...t,
          etaMinutes: t.etaMinutes + delayMinutes,
          fastagTollStatus: `NH-48 Monsoon Slowdown (+${delayMinutes}m delay)`,
        }));

        const activeScenario: ActiveScenario = {
          type: 'MONSOON',
          name: 'NH-48 Monsoon Inundation',
          badge: 'Monsoon (+90m)',
          description: 'Torrential downpour on NH-48 corridor between Chakan and Talegaon. Inbound & outbound convoys delayed +90 minutes.',
          activatedAt: timeDisplay,
        };

        return {
          ...state,
          trucks: updatedTrucks,
          activeScenario,
          scenarioTriggerCount: (state.scenarioTriggerCount || 0) + 1,
          plantFeed: prependFeedEntry(
            state.plantFeed,
            'SCENARIO ACTIVE: NH-48 Monsoon Inundation',
            'Severe monsoon waterlogging on NH-48 corridor. All truck convoys delayed +90m. ETA and risk recalculation triggered.',
            'DISRUPTION',
            'CRITICAL'
          ),
        };
      }

      if (scenario === 'SUPPLIER_STRIKE') {
        // Deplete Tier-2 casting stock for Kalyani Steels (bom-child-1) to 120 (safetyStock is 600)
        let previousStock = 820;
        const updateBomRecursive = (items: BomItem[]): BomItem[] => {
          return items.map((item) => {
            if (item.id === 'bom-child-1') {
              previousStock = item.currentStock;
              return { ...item, currentStock: 120 };
            }
            if (item.children && item.children.length > 0) {
              return { ...item, children: updateBomRecursive(item.children) };
            }
            return item;
          });
        };

        const activeScenario: ActiveScenario = {
          type: 'SUPPLIER_STRIKE',
          name: 'Tier-2 Supplier Strike (Kalyani Steels)',
          badge: 'Supplier Strike',
          description: 'Work stoppage at Kalyani Steels foundry. Inbound SG-Iron castings halted; warehouse stock depleted below safety threshold.',
          activatedAt: timeDisplay,
          previousValues: {
            depletedBomItemId: 'bom-child-1',
            depletedStockAmount: previousStock,
          },
        };

        return {
          ...state,
          bomItems: updateBomRecursive(state.bomItems),
          activeScenario,
          scenarioTriggerCount: (state.scenarioTriggerCount || 0) + 1,
          plantFeed: prependFeedEntry(
            state.plantFeed,
            'SCENARIO ACTIVE: Supplier Strike (Kalyani Steels)',
            'Tier-2 casting foundry strike reported in Pune MIDC. Inbound shipments stopped; raw knuckle casting stock critically depleted to 120 units.',
            'SUPPLIER',
            'CRITICAL'
          ),
        };
      }

      if (scenario === 'MACHINE_BREAKDOWN') {
        const targetId = 'CNC-01';
        const cncMachine = state.machines.find((m) => m.id === targetId);

        const updatedMachines = state.machines.map((m) => {
          if (m.id !== targetId) return m;
          return {
            ...m,
            status: 'MAINTENANCE' as const,
            oee: 0.0,
            availability: 0.0,
            statusReason: 'Spindle Bearing Seizure (Emergency Maintenance)',
          };
        });

        const activeScenario: ActiveScenario = {
          type: 'MACHINE_BREAKDOWN',
          name: 'Machine Breakdown (CNC-01)',
          badge: 'CNC-01 Offline',
          description: 'Doosan 5-Axis VMC CNC-01 suffered severe spindle bearing seizure. Machine transferred to emergency maintenance.',
          activatedAt: timeDisplay,
          previousValues: {
            machineId: targetId,
            machineStatus: cncMachine?.status || 'RUNNING',
            machineOee: cncMachine?.oee || 91.2,
          },
        };

        return {
          ...state,
          machines: updatedMachines,
          activeScenario,
          scenarioTriggerCount: (state.scenarioTriggerCount || 0) + 1,
          plantFeed: prependFeedEntry(
            state.plantFeed,
            'SCENARIO ACTIVE: Machine Breakdown (CNC-01)',
            'Emergency downtime on CNC-01 (5-Axis VMC). Spindle seized, station OEE dropped to 0%. Work order WO-9821 stalled.',
            'MAINTENANCE',
            'CRITICAL'
          ),
        };
      }

      if (scenario === 'FX_SPIKE') {
        const prevUsdShock = state.fxShocks.USD || 0;
        const newUsdShock = prevUsdShock + 5.0; // +5% USD shock

        const activeScenario: ActiveScenario = {
          type: 'FX_SPIKE',
          name: 'USD/INR FX Shock (+5.0%)',
          badge: 'USD +5%',
          description: 'Macro currency volatility surge: USD strengthens +5% against INR, raising landed cost on all imported BOM parts.',
          activatedAt: timeDisplay,
          previousValues: {
            fxUsdShock: prevUsdShock,
          },
        };

        return {
          ...state,
          fxShocks: {
            ...state.fxShocks,
            USD: newUsdShock,
          },
          activeScenario,
          scenarioTriggerCount: (state.scenarioTriggerCount || 0) + 1,
          plantFeed: prependFeedEntry(
            state.plantFeed,
            'SCENARIO ACTIVE: USD/INR Spike (+5.0%)',
            'Foreign exchange rate shock applied (+5.0% USD). Direct landed cost impact calculated on imported BOM assemblies.',
            'CURRENCY',
            'WARN'
          ),
        };
      }

      return state;
    }

    case 'CLEAR_SCENARIO': {
      if (!state.activeScenario) return state;

      const currentScenario = state.activeScenario;
      let nextTrucks = state.trucks;
      let nextBom = state.bomItems;
      let nextMachines = state.machines;
      let nextShocks = state.fxShocks;

      if (currentScenario.type === 'MONSOON') {
        nextTrucks = state.trucks.map((t) => ({
          ...t,
          etaMinutes: Math.max(10, t.etaMinutes - 90),
          fastagTollStatus: t.isExpedited
            ? 'FASTag Green Pass Active (Priority Express Bypass)'
            : 'Nominal Highway Transit Active',
        }));
      } else if (currentScenario.type === 'SUPPLIER_STRIKE') {
        const restoredStock = currentScenario.previousValues?.depletedStockAmount || 820;
        const restoreBomRecursive = (items: BomItem[]): BomItem[] => {
          return items.map((item) => {
            if (item.id === 'bom-child-1') {
              return { ...item, currentStock: restoredStock };
            }
            if (item.children && item.children.length > 0) {
              return { ...item, children: restoreBomRecursive(item.children) };
            }
            return item;
          });
        };
        nextBom = restoreBomRecursive(state.bomItems);
      } else if (currentScenario.type === 'MACHINE_BREAKDOWN') {
        const prevStatus = currentScenario.previousValues?.machineStatus || 'RUNNING';
        const prevOee = currentScenario.previousValues?.machineOee || 91.2;
        nextMachines = state.machines.map((m) => {
          if (m.id !== 'CNC-01') return m;
          return {
            ...m,
            status: prevStatus,
            oee: prevOee,
            availability: 94.0,
            statusReason: undefined,
          };
        });
      } else if (currentScenario.type === 'FX_SPIKE') {
        const prevShock = currentScenario.previousValues?.fxUsdShock || 0;
        nextShocks = {
          ...state.fxShocks,
          USD: prevShock,
        };
      } else if (currentScenario.type === 'WHAT_IF') {
        const delayedIds = currentScenario.previousValues?.delayedTruckIds || [];
        const prevEtas = currentScenario.previousValues?.previousTruckEtas || {};
        nextTrucks = state.trucks.map((t) => {
          if (delayedIds.includes(t.id)) {
            const restoredEta = prevEtas[t.id] ?? Math.max(10, t.etaMinutes - 60);
            return {
              ...t,
              etaMinutes: restoredEta,
              fastagTollStatus: t.isExpedited
                ? 'FASTag Green Pass Active (Priority Express Bypass)'
                : 'Nominal Highway Transit Active',
            };
          }
          return t;
        });
      }

      return {
        ...state,
        trucks: nextTrucks,
        bomItems: nextBom,
        machines: nextMachines,
        fxShocks: nextShocks,
        activeScenario: null,
        plantFeed: prependFeedEntry(
          state.plantFeed,
          'Scenario Cleared: Baseline Telemetry Restored',
          `Disruption scenario (${currentScenario.name}) deactivated. Shop floor, supply chain, and transit schedules returned to nominal baseline.`,
          'SYSTEM',
          'NORMAL'
        ),
      };
    }

    case 'APPLY_WHAT_IF_SCENARIO': {
      const { timeDisplay } = getCurrentTimeString();
      const {
        targetName,
        delayHours,
        affectedTruckIds,
        affectedOems,
        totalHoursOfLineStop,
        totalPenaltyDeltaINR,
      } = action.payload;

      const previousTruckEtas: Record<string, number> = {};
      const addedMinutes = Math.round(delayHours * 60);

      const updatedTrucks = state.trucks.map((t) => {
        const isTargeted =
          affectedTruckIds.includes(t.id) ||
          affectedOems.some(
            (oem) =>
              t.destinationOem.toLowerCase().includes(oem.toLowerCase()) ||
              oem.toLowerCase().includes(t.destinationOem.toLowerCase())
          );

        if (isTargeted) {
          previousTruckEtas[t.id] = t.etaMinutes;
          return {
            ...t,
            etaMinutes: t.etaMinutes + addedMinutes,
            fastagTollStatus: `${t.fastagTollStatus} (+${delayHours}h Delay Applied)`,
            lastPingTime: 'Just now',
          };
        }
        return t;
      });

      const activeScenario: ActiveScenario = {
        type: 'WHAT_IF',
        name: `What-If: ${targetName} (+${delayHours}h)`,
        badge: `What-If: +${delayHours}h`,
        description: `What-If scenario applied: ${delayHours}h transit delay on ${targetName} impacting ${affectedOems.join(', ')} logistics convoys. Projected line-stop: ${totalHoursOfLineStop}h.`,
        activatedAt: timeDisplay,
        previousValues: {
          delayedTruckIds: Object.keys(previousTruckEtas),
          previousTruckEtas,
        },
      };

      return {
        ...state,
        trucks: updatedTrucks,
        activeScenario,
        scenarioTriggerCount: (state.scenarioTriggerCount || 0) + 1,
        plantFeed: prependFeedEntry(
          state.plantFeed,
          `SCENARIO ACTIVE: ${targetName} (+${delayHours}h Delay)`,
          `Disruption scenario applied: ${delayHours}h delay (+${addedMinutes}m) added to ${affectedOems.join(', ')} logistics convoys. Additional penalty exposure: ₹${(totalPenaltyDeltaINR / 100000).toFixed(2)} L.`,
          'DISRUPTION',
          totalPenaltyDeltaINR > 0 || totalHoursOfLineStop > 0 ? 'CRITICAL' : 'WARN'
        ),
      };
    }

    case 'ACKNOWLEDGE_ALERT': {
      const { alertId } = action.payload;
      const { timeDisplay } = getCurrentTimeString();
      return {
        ...state,
        alertUserActions: {
          ...state.alertUserActions,
          [alertId]: {
            status: 'ACKNOWLEDGED',
            acknowledgedAt: timeDisplay,
          },
        },
        plantFeed: prependFeedEntry(
          state.plantFeed,
          'Alert Acknowledged',
          `Operator reviewed and acknowledged alert [${alertId}].`,
          'SYSTEM',
          'NORMAL'
        ),
      };
    }

    case 'SNOOZE_ALERT': {
      const { alertId, durationMinutes = 15 } = action.payload;
      const snoozedUntil = Date.now() + durationMinutes * 60 * 1000;
      return {
        ...state,
        alertUserActions: {
          ...state.alertUserActions,
          [alertId]: {
            status: 'SNOOZED',
            snoozedUntil,
          },
        },
        plantFeed: prependFeedEntry(
          state.plantFeed,
          `Alert Snoozed (${durationMinutes}m)`,
          `Alert [${alertId}] muted for ${durationMinutes} minutes. SCADA live monitoring remains active.`,
          'SYSTEM',
          'NORMAL'
        ),
      };
    }

    case 'CLEAR_ALERT_ACTIONS': {
      return {
        ...state,
        alertUserActions: {},
      };
    }

    default:
      return state;
  }
}

// React Context Interface
export interface BharatApexContextValue {
  state: BharatApexState;
  dispatch: React.Dispatch<BharatApexAction>;
  resetDemoData: () => void;
  setBaseCurrency: (currency: CurrencyCode) => void;
  setFxShocks: (shocks: FxShocks) => void;
  toggleMachineStatus: (machineId: string, status?: MachineStatus, reason?: string) => void;
  advanceWorkOrder: (workOrderId: string) => void;
  addWorkOrder: (workOrder: WorkOrder) => void;
  logScrapDisruption: (workOrderId: string, scrapCount: number, reason: string) => void;
  expediteTransit: (truckId: string, addedUnits?: number) => void;
  addFeedEntry: (title: string, description: string, category?: PlantFeedEntry['category'], severity?: PlantFeedEntry['severity']) => void;
  replenishBomStock: (bomItemId: string, addedStock: number) => void;
  transmitAsn: (
    oemCustomer: string,
    partNumber: string,
    quantity: number,
    ewayBillNo: string,
    details?: {
      distanceKm?: number;
      recipientGstin?: string;
      destinationAddress?: string;
      partDescription?: string;
      unitValue?: number;
      isInterState?: boolean;
      vehicleNo?: string;
      transporterId?: string;
    }
  ) => void;
  toggleDisruption: () => void;
  // Simulation & Scenario helpers
  toggleSimulation: () => void;
  setSimulationSpeed: (speed: SimulationSpeed) => void;
  activateScenario: (scenario: ScenarioType) => void;
  clearScenario: () => void;
  applyWhatIfScenario: (payload: {
    targetType: 'CORRIDOR' | 'SUPPLIER';
    targetId: string;
    targetName: string;
    delayHours: number;
    affectedTruckIds: string[];
    affectedOems: string[];
    totalHoursOfLineStop: number;
    totalPenaltyDeltaINR: number;
  }) => void;
  // Alerts Center helpers
  acknowledgeAlert: (alertId: string) => void;
  snoozeAlert: (alertId: string, durationMinutes?: number) => void;
}

const BharatApexContext = createContext<BharatApexContextValue | undefined>(undefined);

const DOMAIN_STORAGE_KEY = 'domain_state';

export const BharatApexProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize from localStorage or fallback to seed data
  const [state, dispatch] = useReducer(
    bharatApexReducer,
    undefined,
    () => loadFromLocalStorage<BharatApexState>(DOMAIN_STORAGE_KEY, getInitialDomainState())
  );

  // Automatically persist domain state on every change, throttled to max once per second
  useEffect(() => {
    saveToLocalStorageThrottled(DOMAIN_STORAGE_KEY, state, 1000);
  }, [state]);

  // Fetch live FX rates on startup and when base currency changes
  useEffect(() => {
    let isMounted = true;
    fetchLiveRates().then(({ rates, isLive, fetchTime }) => {
      if (isMounted) {
        dispatch({ type: 'SET_CURRENCY_RATES', payload: { rates, isLive, fetchTime } });
      }
    });
    return () => {
      isMounted = false;
    };
  }, [state.baseCurrency]);

  const resetDemoData = useCallback(() => {
    dispatch({ type: 'RESET_DEMO_DATA' });
  }, []);

  const setBaseCurrency = useCallback((currency: CurrencyCode) => {
    dispatch({ type: 'SET_BASE_CURRENCY', payload: currency });
  }, []);

  const setFxShocks = useCallback((shocks: FxShocks) => {
    dispatch({ type: 'SET_FX_SHOCKS', payload: shocks });
  }, []);

  const toggleMachineStatus = useCallback((machineId: string, status?: MachineStatus, reason?: string) => {
    dispatch({ type: 'TOGGLE_MACHINE_STATUS', payload: { machineId, status, reason } });
  }, []);

  const advanceWorkOrder = useCallback((workOrderId: string) => {
    dispatch({ type: 'ADVANCE_WORK_ORDER', payload: { workOrderId } });
  }, []);

  const addWorkOrder = useCallback((workOrder: WorkOrder) => {
    dispatch({ type: 'ADD_WORK_ORDER', payload: workOrder });
  }, []);

  const logScrapDisruption = useCallback((workOrderId: string, scrapCount: number, reason: string) => {
    dispatch({ type: 'LOG_SCRAP_DISRUPTION', payload: { workOrderId, scrapCount, reason } });
  }, []);

  const expediteTransit = useCallback((truckId: string, addedUnits?: number) => {
    dispatch({ type: 'EXPEDITE_TRANSIT', payload: { truckId, addedUnits } });
  }, []);

  const addFeedEntry = useCallback(
    (
      title: string,
      description: string,
      category: PlantFeedEntry['category'] = 'TELEMETRY',
      severity: PlantFeedEntry['severity'] = 'NORMAL'
    ) => {
      dispatch({ type: 'ADD_PLANT_FEED', payload: { title, description, category, severity } });
    },
    []
  );

  const replenishBomStock = useCallback((bomItemId: string, addedStock: number) => {
    dispatch({ type: 'REPLENISH_BOM_STOCK', payload: { bomItemId, addedStock } });
  }, []);

  const transmitAsn = useCallback(
    (
      oemCustomer: string,
      partNumber: string,
      quantity: number,
      ewayBillNo: string,
      details?: {
        distanceKm?: number;
        recipientGstin?: string;
        destinationAddress?: string;
        partDescription?: string;
        unitValue?: number;
        isInterState?: boolean;
        vehicleNo?: string;
        transporterId?: string;
      }
    ) => {
      dispatch({
        type: 'TRANSMIT_ASN',
        payload: { oemCustomer, partNumber, quantity, ewayBillNo, ...details },
      });
    },
    []
  );

  const toggleDisruption = useCallback(() => {
    dispatch({ type: 'TOGGLE_DISRUPTION' });
  }, []);

  const toggleSimulation = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIMULATION' });
  }, []);

  const setSimulationSpeed = useCallback((speed: SimulationSpeed) => {
    dispatch({ type: 'SET_SIMULATION_SPEED', payload: speed });
  }, []);

  const activateScenario = useCallback((scenario: ScenarioType) => {
    dispatch({ type: 'ACTIVATE_SCENARIO', payload: scenario });
  }, []);

  const clearScenario = useCallback(() => {
    dispatch({ type: 'CLEAR_SCENARIO' });
  }, []);

  const applyWhatIfScenario = useCallback(
    (payload: {
      targetType: 'CORRIDOR' | 'SUPPLIER';
      targetId: string;
      targetName: string;
      delayHours: number;
      affectedTruckIds: string[];
      affectedOems: string[];
      totalHoursOfLineStop: number;
      totalPenaltyDeltaINR: number;
    }) => {
      dispatch({ type: 'APPLY_WHAT_IF_SCENARIO', payload });
    },
    []
  );

  const acknowledgeAlert = useCallback((alertId: string) => {
    dispatch({ type: 'ACKNOWLEDGE_ALERT', payload: { alertId } });
  }, []);

  const snoozeAlert = useCallback((alertId: string, durationMinutes = 15) => {
    dispatch({ type: 'SNOOZE_ALERT', payload: { alertId, durationMinutes } });
  }, []);

  return (
    <BharatApexContext.Provider
      value={{
        state,
        dispatch,
        resetDemoData,
        setBaseCurrency,
        setFxShocks,
        toggleMachineStatus,
        advanceWorkOrder,
        addWorkOrder,
        logScrapDisruption,
        expediteTransit,
        addFeedEntry,
        replenishBomStock,
        transmitAsn,
        toggleDisruption,
        toggleSimulation,
        setSimulationSpeed,
        activateScenario,
        clearScenario,
        applyWhatIfScenario,
        acknowledgeAlert,
        snoozeAlert,
      }}
    >
      {children}
    </BharatApexContext.Provider>
  );
};

export function useBharatApex(): BharatApexContextValue {
  const context = useContext(BharatApexContext);
  if (!context) {
    throw new Error('useBharatApex must be used within a BharatApexProvider');
  }
  return context;
}
