import {
  BomItem,
  CurrencyCode,
  CurrencyRates,
  CustomerBuffer,
  FxShocks,
  WorkOrder,
  WorkOrderStage,
  Truck,
  Corridor,
  Machine,
  Supplier,
  SystemAlert,
  AlertUserAction,
  WhatIfSimulationResult,
  WhatIfAffectedBuffer,
  EWayBillRecord,
} from '../types';
import { convertCurrency } from './currencyService';
import { CORRIDORS, INITIAL_SUPPLIERS } from '../data/mockData';
import { haversineDistanceKm, haversine, haversineCoordinatesKm, GeoCoordinate } from './haversine';
import { OEM_PLANTS, OemPlantLocation, DEFAULT_GEOFENCE_RADIUS_KM } from '../components/Maps/oemPlants';

export * from './haversine';
export { DEFAULT_GEOFENCE_RADIUS_KM };

/**
 * Calculates buffer run-out hours given stock units and hourly consumption.
 */
export function calculateRunOutHours(currentStockUnits: number, consumptionPerHour: number): number {
  if (consumptionPerHour <= 0) return 999;
  return Number((currentStockUnits / consumptionPerHour).toFixed(1));
}

/**
 * Calculates line-stop penalty exposure in INR if run-out is below threshold.
 */
export function calculatePenaltyExposure(
  runOutHours: number,
  penaltyPerHourINR: number,
  thresholdHours: number = 3.0
): number {
  if (runOutHours >= thresholdHours) return 0;
  const hoursAtRisk = thresholdHours - runOutHours;
  return Math.round(hoursAtRisk * penaltyPerHourINR);
}

/**
 * Stage progression flow: RAW_PREP -> MACHINING -> FABRICATION -> ASSEMBLY -> FINAL_DISPATCH
 */
const STAGE_ORDER: WorkOrderStage[] = [
  'RAW_PREP',
  'MACHINING',
  'FABRICATION',
  'ASSEMBLY',
  'FINAL_DISPATCH',
];

export function getNextWorkOrderStage(currentStage: WorkOrderStage): WorkOrderStage | null {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) {
    return null;
  }
  return STAGE_ORDER[currentIndex + 1];
}

/**
 * Calculates GST breakdown for E-Way bill generation.
 * - If Inter-State: IGST = gstRatePct (standard 18%), CGST = 0, SGST = 0
 * - If Intra-State: CGST = gstRatePct / 2 (9%), SGST = gstRatePct / 2 (9%), IGST = 0
 */
export interface GstCalculationResult {
  taxableAmount: number;
  isInterState: boolean;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  totalInvoiceAmount: number;
}

export function calculateGst(
  taxableAmount: number,
  isInterState: boolean,
  gstRatePct: number = 18
): GstCalculationResult {
  const round = (val: number) => Math.round(val * 100) / 100;

  if (isInterState) {
    const igstAmount = round((taxableAmount * gstRatePct) / 100);
    return {
      taxableAmount,
      isInterState: true,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount,
      totalTax: igstAmount,
      totalInvoiceAmount: round(taxableAmount + igstAmount),
    };
  } else {
    const halfRate = gstRatePct / 2;
    const cgstAmount = round((taxableAmount * halfRate) / 100);
    const sgstAmount = round((taxableAmount * halfRate) / 100);
    const totalTax = round(cgstAmount + sgstAmount);
    return {
      taxableAmount,
      isInterState: false,
      cgstAmount,
      sgstAmount,
      igstAmount: 0,
      totalTax,
      totalInvoiceAmount: round(taxableAmount + totalTax),
    };
  }
}

/**
 * Recursively rolls up landed cost of a BOM item in base currency (INR by default).
 */
export function rollUpBomLandedCost(
  item: BomItem,
  rates: CurrencyRates,
  fxShocks: FxShocks = {},
  baseCurrency: CurrencyCode = 'INR'
): number {
  const directUnitCostInBase = convertCurrency(item.unitCost, item.currency, baseCurrency, rates, fxShocks);

  if (!item.children || item.children.length === 0) {
    return directUnitCostInBase;
  }

  const childrenTotal = item.children.reduce((sum, child) => {
    const childLandedCost = rollUpBomLandedCost(child, rates, fxShocks, baseCurrency);
    return sum + childLandedCost * child.qtyPerAssembly;
  }, 0);

  return Number((directUnitCostInBase + childrenTotal).toFixed(2));
}

/**
 * Drains a customer buffer's stock given consumption per hour and elapsed simulated minutes.
 */
export function drainBufferStock(
  currentStockUnits: number,
  consumptionPerHour: number,
  simulatedMinutes: number
): number {
  if (consumptionPerHour <= 0 || simulatedMinutes <= 0) return currentStockUnits;
  const drained = (consumptionPerHour / 60) * simulatedMinutes;
  return Math.max(0, Math.round(currentStockUnits - drained));
}

/**
 * Computes buffer status based on hours remaining:
 * < 3.0h -> CRITICAL, < 6.0h -> WARNING, otherwise HEALTHY.
 */
export function calculateBufferStatus(runOutHours: number): 'CRITICAL' | 'WARNING' | 'HEALTHY' {
  if (runOutHours < 3.0) return 'CRITICAL';
  if (runOutHours < 6.0) return 'WARNING';
  return 'HEALTHY';
}

/**
 * Pure function: advances customer buffer by draining stock based on consumptionPerHour x simulatedHours,
 * then recomputes runOutHours and status.
 */
export function advanceBuffer(
  buffer: CustomerBuffer,
  simulatedHours: number
): CustomerBuffer {
  if (simulatedHours <= 0 || buffer.consumptionPerHour <= 0) {
    return buffer;
  }
  const drain = buffer.consumptionPerHour * simulatedHours;
  const currentStockUnits = Math.max(0, Math.round(buffer.currentStockUnits - drain));
  const runOutHours = calculateRunOutHours(currentStockUnits, buffer.consumptionPerHour);
  const status = calculateBufferStatus(runOutHours);
  return {
    ...buffer,
    currentStockUnits,
    runOutHours,
    status,
  };
}

/**
 * Pure function: drains buffer stock and updates run-out hours and status (wrapper around advanceBuffer).
 */
export function simulateBufferDrain(
  buffer: CustomerBuffer,
  simulatedMinutes: number
): CustomerBuffer {
  return advanceBuffer(buffer, simulatedMinutes / 60);
}

/**
 * Pure function: applies delivery of units to the destination buffer and recalculates runOutHours and status.
 */
export function applyDelivery(
  buffers: CustomerBuffer[],
  destinationOem: string,
  units: number
): CustomerBuffer[] {
  if (units <= 0) return buffers;
  return buffers.map((buf) => {
    const isMatch =
      buf.oemName.toLowerCase().includes(destinationOem.toLowerCase()) ||
      destinationOem.toLowerCase().includes(buf.oemName.toLowerCase());
    if (!isMatch) return buf;

    const newUnits = buf.currentStockUnits + units;
    const newRunOut = calculateRunOutHours(newUnits, buf.consumptionPerHour);
    const newStatus = calculateBufferStatus(newRunOut);
    return {
      ...buf,
      currentStockUnits: newUnits,
      runOutHours: newRunOut,
      status: newStatus,
    };
  });
}

/**
 * Alias for applyDelivery.
 */
export const applyBufferDelivery = applyDelivery;

export interface GeofenceArrivalEvent {
  truckId: string;
  truckRegistration: string;
  plantId: string;
  plantName: string;
  distanceKm: number;
  feedTitle: string;
  feedDescription: string;
  toastMessage: string;
}

export interface CheckGeofenceOptions {
  plants?: OemPlantLocation[];
  defaultRadiusKm?: number;
}

/**
 * Helper to match plant name with truck destination OEM
 */
function isPlantMatch(plantName: string, destinationOem: string): boolean {
  const p = plantName.toLowerCase();
  const d = destinationOem.toLowerCase();
  if (p.includes(d) || d.includes(p)) return true;
  const brandKeywords = ['tata', 'mahindra', 'maruti', 'hyundai', 'bajaj'];
  for (const brand of brandKeywords) {
    if (p.includes(brand) && d.includes(brand)) return true;
  }
  return false;
}

/**
 * Pure function: Checks whether a truck has entered an OEM plant's geofence.
 * Fires once per trip: if already marked ARRIVED or geofenceArrived on this trip, returns null.
 * When entering, sets truck status to ARRIVED, geofenceArrived to true, and returns arrival event.
 */
export function checkTruckGeofenceArrival(
  truck: Truck,
  plants: OemPlantLocation[] = OEM_PLANTS,
  options?: CheckGeofenceOptions
): {
  updatedTruck: Truck;
  arrivalEvent: GeofenceArrivalEvent | null;
} {
  // If already fired on this trip, do not fire again
  if (truck.geofenceArrived || truck.status === 'ARRIVED') {
    return { updatedTruck: truck, arrivalEvent: null };
  }

  const defaultRadius = options?.defaultRadiusKm ?? DEFAULT_GEOFENCE_RADIUS_KM;
  const oemPlants = plants.filter((p) => !p.isHub);

  // Match destination OEM plant first
  const destPlant = oemPlants.find((p) => isPlantMatch(p.name, truck.destinationOem));

  let matchedPlant: OemPlantLocation | undefined;
  let distanceKm = 0;
  let isInside = false;

  if (destPlant) {
    const d = haversineDistanceKm(
      truck.currentLat,
      truck.currentLng,
      destPlant.lat,
      destPlant.lng
    );
    const radius = destPlant.radiusKm ?? defaultRadius;
    if (d <= radius) {
      matchedPlant = destPlant;
      distanceKm = d;
      isInside = true;
    }
  }

  // If not inside destination plant, check any other OEM plant
  if (!isInside) {
    for (const plant of oemPlants) {
      const d = haversineDistanceKm(
        truck.currentLat,
        truck.currentLng,
        plant.lat,
        plant.lng
      );
      const radius = plant.radiusKm ?? defaultRadius;
      if (d <= radius) {
        matchedPlant = plant;
        distanceKm = d;
        isInside = true;
        break;
      }
    }
  }

  if (isInside && matchedPlant) {
    const updatedTruck: Truck = {
      ...truck,
      status: 'ARRIVED',
      geofenceArrived: true,
      fastagTollStatus: `Arrived at ${matchedPlant.name} Gate`,
    };

    const feedTitle = `arrived at ${matchedPlant.name} gate`;
    const feedDescription = `Truck ${truck.registrationNumber} arrived at ${matchedPlant.name} gate (entered ${(matchedPlant.radiusKm ?? defaultRadius).toFixed(1)} km geofence).`;
    const toastMessage = `arrived at ${matchedPlant.name} gate`;

    return {
      updatedTruck,
      arrivalEvent: {
        truckId: truck.id,
        truckRegistration: truck.registrationNumber,
        plantId: matchedPlant.id,
        plantName: matchedPlant.name,
        distanceKm,
        feedTitle,
        feedDescription,
        toastMessage,
      },
    };
  }

  return {
    updatedTruck: {
      ...truck,
      status: truck.status || 'IN_TRANSIT',
      geofenceArrived: false,
    },
    arrivalEvent: null,
  };
}

/**
 * Pure function: Batch processes trucks for geofence arrivals.
 */
export function processGeofenceArrivals(
  trucks: Truck[],
  plants: OemPlantLocation[] = OEM_PLANTS,
  options?: CheckGeofenceOptions
): {
  updatedTrucks: Truck[];
  newArrivals: GeofenceArrivalEvent[];
} {
  const updatedTrucks: Truck[] = [];
  const newArrivals: GeofenceArrivalEvent[] = [];

  for (const truck of trucks) {
    const { updatedTruck, arrivalEvent } = checkTruckGeofenceArrival(truck, plants, options);
    updatedTrucks.push(updatedTruck);
    if (arrivalEvent) {
      newArrivals.push(arrivalEvent);
    }
  }

  return { updatedTrucks, newArrivals };
}

export interface AdvanceTruckResult {
  updatedTruck: Truck;
  hasArrived: boolean;
  deliveredUnits: number;
  geofenceEvent?: GeofenceArrivalEvent | null;
}

/**
 * Pure function: advances truck along its corridor based on simulated hours.
 * Reuses waypoint interpolation with ETA = remaining fraction x corridor standardDurationHours.
 * When reaching 100%, returns hasArrived: true, deliveredUnits, and re-dispatches truck at origin.
 * Also monitors OEM plant geofence entry, firing once per trip.
 */
export function advanceTruck(
  truck: Truck,
  corridor: Corridor,
  simulatedHours: number,
  options?: {
    monsoonDelayMinutes?: number;
    plants?: OemPlantLocation[];
    defaultRadiusKm?: number;
  }
): AdvanceTruckResult {
  const waypoints = corridor.waypoints;
  if (!waypoints || waypoints.length < 2) {
    return { updatedTruck: truck, hasArrived: false, deliveredUnits: 0, geofenceEvent: null };
  }

  const monsoonDelayMinutes = options?.monsoonDelayMinutes || 0;
  const duration = Math.max(0.1, corridor.standardDurationHours);
  const speedMult = truck.isExpedited ? 1.5 : 1.0;
  const progressIncrement = (simulatedHours / duration) * 100 * speedMult;
  const nextProgress = truck.progressPct + progressIncrement;

  if (nextProgress >= 100) {
    // Arrival: reassign a new departure at origin, reset status to IN_TRANSIT and geofenceArrived to false
    const totalMinutes = Math.round(corridor.standardDurationHours * 60 + monsoonDelayMinutes);
    const updatedTruck: Truck = {
      ...truck,
      progressPct: 0,
      currentLat: waypoints[0].lat,
      currentLng: waypoints[0].lng,
      isExpedited: false,
      etaMinutes: totalMinutes,
      fastagTollStatus: 'Departed Chakan Hub - Gate 4 Outbound',
      lastPingTime: 'Just now',
      status: 'IN_TRANSIT',
      geofenceArrived: false,
    };

    return {
      updatedTruck,
      hasArrived: true,
      deliveredUnits: truck.unitsLoaded,
      geofenceEvent: null,
    };
  }

  // Interpolate along waypoints
  const totalSegments = waypoints.length - 1;
  const normalized = (nextProgress / 100) * totalSegments;
  const segmentIndex = Math.min(Math.floor(normalized), totalSegments - 1);
  const segmentFraction = normalized - segmentIndex;

  const p1 = waypoints[segmentIndex];
  const p2 = waypoints[segmentIndex + 1];

  const currentLat = Number((p1.lat + (p2.lat - p1.lat) * segmentFraction).toFixed(5));
  const currentLng = Number((p1.lng + (p2.lng - p1.lng) * segmentFraction).toFixed(5));

  // ETA = remaining fraction x corridor standardDurationHours (in minutes)
  const remainingFraction = Math.max(0, (100 - nextProgress) / 100);
  const remainingHours = remainingFraction * corridor.standardDurationHours * (truck.isExpedited ? 0.65 : 1.0);
  const remainingMinutes = Math.max(
    0,
    Math.round(remainingHours * 60 + monsoonDelayMinutes)
  );

  const intermediateTruck: Truck = {
    ...truck,
    currentLat,
    currentLng,
    progressPct: Number(nextProgress.toFixed(1)),
    etaMinutes: remainingMinutes,
    fastagTollStatus: truck.isExpedited
      ? 'FASTag Green Pass Active (Priority Express Bypass)'
      : monsoonDelayMinutes > 0
      ? `NH-48 Monsoon Slowdown (+${monsoonDelayMinutes}m delay)`
      : truck.status === 'ARRIVED'
      ? 'Arrived at Gate'
      : 'Nominal Highway Transit Active',
    lastPingTime: 'Just now',
    status: truck.status || 'IN_TRANSIT',
    geofenceArrived: truck.geofenceArrived || false,
  };

  // Check geofence arrival
  const { updatedTruck, arrivalEvent } = checkTruckGeofenceArrival(
    intermediateTruck,
    options?.plants || OEM_PLANTS,
    { defaultRadiusKm: options?.defaultRadiusKm }
  );

  return {
    updatedTruck,
    hasArrived: false,
    deliveredUnits: 0,
    geofenceEvent: arrivalEvent,
  };
}

/**
 * Pure function: advances truck progress along its corridor and reassigns departure upon arrival (progress >= 100).
 */
export function simulateTruckStep(
  truck: Truck,
  corridor: Corridor,
  speedMultiplier: number = 1,
  monsoonDelayMinutes: number = 0
): {
  updatedTruck: Truck;
  hasArrived: boolean;
  deliveredUnits: number;
} {
  const waypoints = corridor.waypoints;
  if (!waypoints || waypoints.length < 2) {
    return { updatedTruck: truck, hasArrived: false, deliveredUnits: 0 };
  }

  const baseStep = truck.isExpedited ? 2.5 : 1.5;
  const progressIncrement = baseStep * speedMultiplier;
  const nextProgress = truck.progressPct + progressIncrement;

  if (nextProgress >= 100) {
    // Arrival: reassign a new departure at origin
    const totalMinutes = Math.round(corridor.standardDurationHours * 60 + monsoonDelayMinutes);
    const updatedTruck: Truck = {
      ...truck,
      progressPct: 0,
      currentLat: waypoints[0].lat,
      currentLng: waypoints[0].lng,
      isExpedited: false,
      etaMinutes: totalMinutes,
      fastagTollStatus: 'Departed Chakan Hub - Gate 4 Outbound',
      lastPingTime: 'Just now',
      status: 'IN_TRANSIT',
      geofenceArrived: false,
    };

    return {
      updatedTruck,
      hasArrived: true,
      deliveredUnits: truck.unitsLoaded,
    };
  }

  // Interpolate along waypoints
  const totalSegments = waypoints.length - 1;
  const normalized = (nextProgress / 100) * totalSegments;
  const segmentIndex = Math.min(Math.floor(normalized), totalSegments - 1);
  const segmentFraction = normalized - segmentIndex;

  const p1 = waypoints[segmentIndex];
  const p2 = waypoints[segmentIndex + 1];

  const currentLat = Number((p1.lat + (p2.lat - p1.lat) * segmentFraction).toFixed(5));
  const currentLng = Number((p1.lng + (p2.lng - p1.lng) * segmentFraction).toFixed(5));

  const totalDurationMinutes = corridor.standardDurationHours * 60;
  const remainingMinutes = Math.max(
    5,
    Math.round(
      ((100 - nextProgress) / 100) * totalDurationMinutes * (truck.isExpedited ? 0.65 : 1.0) +
        monsoonDelayMinutes
    )
  );

  const updatedTruck: Truck = {
    ...truck,
    currentLat,
    currentLng,
    progressPct: Number(nextProgress.toFixed(1)),
    etaMinutes: remainingMinutes,
    fastagTollStatus: truck.isExpedited
      ? 'FASTag Green Pass Active (Priority Express Bypass)'
      : monsoonDelayMinutes > 0
      ? `NH-48 Monsoon Slowdown (+${monsoonDelayMinutes}m delay)`
      : 'Nominal Highway Transit Active',
    lastPingTime: 'Just now',
  };

  return {
    updatedTruck,
    hasArrived: false,
    deliveredUnits: 0,
  };
}

/**
 * Pure function: when a work order completes, its finished units are delivered to the matching OEM customer buffer.
 */
export function applyWorkOrderCompletion(
  buffers: CustomerBuffer[],
  workOrder: WorkOrder
): CustomerBuffer[] {
  return applyBufferDelivery(buffers, workOrder.oemName, workOrder.quantity);
}

/**
 * Formats a decimal hours value into a human-readable countdown string.
 * Example: 1.8 -> "1h 48m", 0.5 -> "30m", 0 -> "0m (Line Stop)"
 */
export function formatCountdown(runOutHours: number): string {
  if (runOutHours <= 0) return '0m (Line Stop)';
  const totalMinutes = Math.round(runOutHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Recursively collects BOM items that are below their safety stock threshold.
 */
export function collectLowStockBomItems(items: BomItem[]): BomItem[] {
  const lowItems: BomItem[] = [];

  function traverse(list: BomItem[]) {
    for (const item of list) {
      if (item.currentStock < item.safetyStock) {
        lowItems.push(item);
      }
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    }
  }

  traverse(items);
  return lowItems;
}

/**
 * Generates dynamic system alerts from live state:
 * - Buffers under 3h (CRITICAL) and under 6h (WARNING) with live countdowns
 * - BOM items below safety stock
 * - Machines in maintenance (CRITICAL)
 * - Trucks delayed by more than 60 minutes
 * Applies user actions (Acknowledge / Snooze 15m) stored in reducer.
 */
export function generateSystemAlerts(
  state: {
    customerBuffers: CustomerBuffer[];
    bomItems: BomItem[];
    machines: Machine[];
    trucks: Truck[];
    corridors?: Corridor[];
    alertUserActions?: Record<string, AlertUserAction>;
  },
  now: number = Date.now()
): SystemAlert[] {
  const alerts: SystemAlert[] = [];
  const userActions = state.alertUserActions || {};

  // 1. Buffers under 6h and 3h
  for (const buf of state.customerBuffers) {
    if (buf.runOutHours < 3.0) {
      const alertId = `alert-buf-${buf.id}`;
      alerts.push({
        id: alertId,
        category: 'BUFFER',
        severity: 'CRITICAL',
        title: `Critical Buffer Depletion: ${buf.oemName}`,
        description: `${buf.partDescription} down to ${buf.runOutHours.toFixed(1)}h (${buf.currentStockUnits} units). Immediate line-stop penalty exposed at ₹${(buf.penaltyPerHourINR / 100000).toFixed(1)}L/hr.`,
        targetId: buf.id,
        targetName: buf.oemName,
        runOutHours: buf.runOutHours,
        countdownSeconds: Math.max(0, Math.round(buf.runOutHours * 3600)),
        status: 'ACTIVE',
        createdAt: 'Live Telemetry',
      });
    } else if (buf.runOutHours < 6.0) {
      const alertId = `alert-buf-${buf.id}`;
      alerts.push({
        id: alertId,
        category: 'BUFFER',
        severity: 'WARNING',
        title: `Buffer Low Warning: ${buf.oemName}`,
        description: `${buf.partDescription} buffer at ${buf.runOutHours.toFixed(1)}h (${buf.currentStockUnits} units). Approaching safety replenishment threshold.`,
        targetId: buf.id,
        targetName: buf.oemName,
        runOutHours: buf.runOutHours,
        countdownSeconds: Math.max(0, Math.round(buf.runOutHours * 3600)),
        status: 'ACTIVE',
        createdAt: 'Live Telemetry',
      });
    }
  }

  // 2. BOM items below safety stock
  const lowBomItems = collectLowStockBomItems(state.bomItems);
  for (const item of lowBomItems) {
    const alertId = `alert-bom-${item.id}`;
    const deficit = item.safetyStock - item.currentStock;
    const isCritical = item.currentStock <= item.safetyStock * 0.5;

    alerts.push({
      id: alertId,
      category: 'BOM',
      severity: isCritical ? 'CRITICAL' : 'WARNING',
      title: `BOM Safety Stock Deficit: ${item.partNumber}`,
      description: `${item.description} has ${item.currentStock} units in bonded warehouse vs ${item.safetyStock} safety stock (-${deficit} deficit).`,
      targetId: item.id,
      targetName: item.partNumber,
      status: 'ACTIVE',
      createdAt: 'Warehouse Audit',
    });
  }

  // 3. Machines in maintenance
  for (const m of state.machines) {
    if (m.status === 'MAINTENANCE') {
      const alertId = `alert-mach-${m.id}`;
      alerts.push({
        id: alertId,
        category: 'MACHINE',
        severity: 'CRITICAL',
        title: `Station Downtime: ${m.name} in Maintenance`,
        description: `${m.model} (${m.operation}) is OFFLINE. Station OEE: 0.0%. ${m.statusReason || 'Unscheduled downtime reported.'}`,
        targetId: m.id,
        targetName: m.name,
        status: 'ACTIVE',
        createdAt: 'SCADA Telemetry',
      });
    }
  }

  // 4. Trucks delayed more than 60 minutes
  for (const t of state.trucks) {
    const standardDuration = 5.0; // standard 5h fallback
    const expectedRemaining = Math.max(0, ((100 - t.progressPct) / 100) * standardDuration * 60);
    const delayMinutes = Math.max(0, t.etaMinutes - expectedRemaining);

    const isExplicitlyDelayed =
      t.fastagTollStatus.includes('Delayed') ||
      t.fastagTollStatus.includes('Monsoon') ||
      t.fastagTollStatus.includes('+90') ||
      t.fastagTollStatus.includes('+95');

    if (delayMinutes >= 60 || isExplicitlyDelayed) {
      const displayDelay = delayMinutes >= 60 ? Math.round(delayMinutes) : 90;
      const alertId = `alert-trk-${t.id}`;

      alerts.push({
        id: alertId,
        category: 'LOGISTICS',
        severity: displayDelay >= 90 ? 'CRITICAL' : 'WARNING',
        title: `Convoy Delayed: ${t.registrationNumber} (+${displayDelay}m)`,
        description: `Shipment of ${t.cargoDescription} to ${t.destinationOem} delayed by ${displayDelay} min. Current ETA: ${t.etaMinutes}m (${t.fastagTollStatus}).`,
        targetId: t.id,
        targetName: t.registrationNumber,
        status: 'ACTIVE',
        createdAt: 'FASTag GPS Feed',
      });
    }
  }

  // Apply User Actions (Acknowledge / Snooze) stored in state
  return alerts.map((alert) => {
    const action = userActions[alert.id];
    if (!action) return alert;

    if (action.status === 'ACKNOWLEDGED') {
      return {
        ...alert,
        status: 'ACKNOWLEDGED',
        acknowledgedAt: action.acknowledgedAt,
      };
    }

    if (action.status === 'SNOOZED' && action.snoozedUntil && action.snoozedUntil > now) {
      return {
        ...alert,
        status: 'SNOOZED',
        snoozedUntil: action.snoozedUntil,
      };
    }

    return alert;
  });
}

/**
 * Pure function: Calculates What-If corridor transit delay scenario.
 */
export function calculateWhatIfCorridorDelay(
  buffers: CustomerBuffer[],
  trucks: Truck[],
  corridors: Corridor[],
  selectedCorridorId: string,
  delayHours: number
): WhatIfSimulationResult {
  const corridor = corridors.find((c) => c.id === selectedCorridorId);
  const corridorName = corridor ? corridor.name : selectedCorridorId;

  // Identify trucks on this corridor
  const affectedTrucks = trucks.filter((t) => t.corridorId === selectedCorridorId);

  const affectedOemSet = new Set<string>();
  affectedTrucks.forEach((t) => affectedOemSet.add(t.destinationOem));

  // Also check buffer assignment: assignedTruckId or highwayCorridor matching selectedCorridorId
  buffers.forEach((b) => {
    const isTruckMatch = affectedTrucks.some((t) => t.id === b.assignedTruckId);
    const isCorridorIdMatch = b.highwayCorridor.toLowerCase().includes(selectedCorridorId.toLowerCase());
    const isDestinationCityMatch = Boolean(
      corridor &&
        corridor.destinationCity &&
        b.highwayCorridor.toLowerCase().includes(corridor.destinationCity.toLowerCase().split(',')[0].trim())
    );

    if (isTruckMatch || isCorridorIdMatch || isDestinationCityMatch) {
      affectedOemSet.add(b.oemName);
    }
  });

  const affectedOems = Array.from(affectedOemSet);

  let totalCurrentPenaltyINR = 0;
  let totalSimulatedPenaltyINR = 0;

  const affectedBuffers: WhatIfAffectedBuffer[] = buffers.map((buf) => {
    const isAffected =
      affectedOems.some(
        (oem) =>
          buf.oemName.toLowerCase().includes(oem.toLowerCase()) ||
          oem.toLowerCase().includes(buf.oemName.toLowerCase())
      ) ||
      affectedTrucks.some((t) => t.id === buf.assignedTruckId);

    const currentRunOutHours = buf.runOutHours;
    const currentStatus = calculateBufferStatus(currentRunOutHours);
    const currentPenaltyINR = calculatePenaltyExposure(currentRunOutHours, buf.penaltyPerHourINR, 3.0);

    const simulatedRunOutHours = isAffected
      ? Math.max(0, Number((currentRunOutHours - delayHours).toFixed(1)))
      : currentRunOutHours;

    const simulatedStatus = calculateBufferStatus(simulatedRunOutHours);
    const simulatedPenaltyINR = isAffected
      ? calculatePenaltyExposure(simulatedRunOutHours, buf.penaltyPerHourINR, 3.0)
      : currentPenaltyINR;

    const additionalPenaltyINR = Math.max(0, simulatedPenaltyINR - currentPenaltyINR);

    totalCurrentPenaltyINR += currentPenaltyINR;
    totalSimulatedPenaltyINR += simulatedPenaltyINR;

    return {
      bufferId: buf.id,
      oemName: buf.oemName,
      partDescription: buf.partDescription,
      currentStockUnits: buf.currentStockUnits,
      consumptionPerHour: buf.consumptionPerHour,
      currentRunOutHours,
      simulatedRunOutHours,
      currentStatus,
      simulatedStatus,
      penaltyPerHourINR: buf.penaltyPerHourINR,
      currentPenaltyINR,
      simulatedPenaltyINR,
      additionalPenaltyINR,
    };
  });

  const additionalPenaltyExposureINR = Math.max(0, totalSimulatedPenaltyINR - totalCurrentPenaltyINR);

  const summary =
    affectedOems.length > 0
      ? `A ${delayHours}h delay on ${corridorName} impacts ${affectedOems.join(', ')}. Buffer hours drop by ${delayHours}h, generating ₹${(additionalPenaltyExposureINR / 100000).toFixed(2)} Lakh additional penalty exposure.`
      : `No active OEM convoys routed via ${corridorName}. Zero additional penalty impact projected.`;

  return {
    targetType: 'CORRIDOR',
    targetId: selectedCorridorId,
    targetName: corridorName,
    delayHours,
    affectedOems,
    affectedBuffers,
    totalCurrentPenaltyINR,
    totalSimulatedPenaltyINR,
    additionalPenaltyExposureINR,
    summary,
  };
}

/**
 * Pure function: Calculates What-If Tier-2 supplier disruption scenario.
 */
export function calculateWhatIfSupplierDelay(
  buffers: CustomerBuffer[],
  bomItems: BomItem[],
  suppliers: Supplier[],
  selectedSupplierId: string,
  delayHours: number
): WhatIfSimulationResult {
  const supplier = suppliers.find((s) => s.id === selectedSupplierId);
  const supplierName = supplier ? supplier.name : selectedSupplierId;

  // Supplier to OEM dependency mapping based on domain BOM mock
  const supplierOemMap: Record<string, string[]> = {
    'sup-bforge': ['Tata Motors', 'Hyundai Motor India'],
    'sup-kalyani': ['Mahindra & Mahindra', 'Tata Motors'],
    'sup-sonablw': ['Maruti Suzuki'],
    'sup-skf': ['Tata Motors', 'Maruti Suzuki'],
    'sup-sundram': ['Tata Motors', 'Mahindra & Mahindra', 'Maruti Suzuki', 'Hyundai Motor India', 'Bajaj Auto'],
    'sup-gabriel': ['Bajaj Auto', 'Tata Motors'],
  };

  const mappedOems = supplierOemMap[selectedSupplierId] || ['Tata Motors'];
  const affectedOems = mappedOems.filter((oem) =>
    buffers.some((b) => b.oemName.toLowerCase().includes(oem.toLowerCase()))
  );

  let totalCurrentPenaltyINR = 0;
  let totalSimulatedPenaltyINR = 0;

  // Supplier parts starve downstream buffer at ~70% rate of delay
  const drainFactor = 0.7;

  const affectedBuffers: WhatIfAffectedBuffer[] = buffers.map((buf) => {
    const isAffected = affectedOems.some((oem) =>
      buf.oemName.toLowerCase().includes(oem.toLowerCase())
    );

    const currentRunOutHours = buf.runOutHours;
    const currentStatus = calculateBufferStatus(currentRunOutHours);
    const currentPenaltyINR = calculatePenaltyExposure(currentRunOutHours, buf.penaltyPerHourINR, 3.0);

    const simulatedRunOutHours = isAffected
      ? Math.max(0, Number((currentRunOutHours - delayHours * drainFactor).toFixed(1)))
      : currentRunOutHours;

    const simulatedStatus = calculateBufferStatus(simulatedRunOutHours);
    const simulatedPenaltyINR = isAffected
      ? calculatePenaltyExposure(simulatedRunOutHours, buf.penaltyPerHourINR, 3.0)
      : currentPenaltyINR;

    const additionalPenaltyINR = Math.max(0, simulatedPenaltyINR - currentPenaltyINR);

    totalCurrentPenaltyINR += currentPenaltyINR;
    totalSimulatedPenaltyINR += simulatedPenaltyINR;

    return {
      bufferId: buf.id,
      oemName: buf.oemName,
      partDescription: buf.partDescription,
      currentStockUnits: buf.currentStockUnits,
      consumptionPerHour: buf.consumptionPerHour,
      currentRunOutHours,
      simulatedRunOutHours,
      currentStatus,
      simulatedStatus,
      penaltyPerHourINR: buf.penaltyPerHourINR,
      currentPenaltyINR,
      simulatedPenaltyINR,
      additionalPenaltyINR,
    };
  });

  const additionalPenaltyExposureINR = Math.max(0, totalSimulatedPenaltyINR - totalCurrentPenaltyINR);

  const summary = `A ${delayHours}h supply disruption from ${supplierName} starves sub-assemblies for ${affectedOems.join(' & ')}, increasing line-stop penalty exposure by ₹${(additionalPenaltyExposureINR / 100000).toFixed(2)} Lakh.`;

  return {
    targetType: 'SUPPLIER',
    targetId: selectedSupplierId,
    targetName: supplierName,
    delayHours,
    affectedOems,
    affectedBuffers,
    totalCurrentPenaltyINR,
    totalSimulatedPenaltyINR,
    additionalPenaltyExposureINR,
    summary,
  };
}

/**
 * Unified What-If Simulation Runner
 */
export function calculateWhatIfSimulation(params: {
  targetType: 'CORRIDOR' | 'SUPPLIER';
  targetId: string;
  delayHours: number;
  buffers: CustomerBuffer[];
  trucks: Truck[];
  corridors: Corridor[];
  bomItems: BomItem[];
  suppliers: Supplier[];
}): WhatIfSimulationResult {
  if (params.targetType === 'CORRIDOR') {
    return calculateWhatIfCorridorDelay(
      params.buffers,
      params.trucks,
      params.corridors,
      params.targetId,
      params.delayHours
    );
  }
  return calculateWhatIfSupplierDelay(
    params.buffers,
    params.bomItems,
    params.suppliers,
    params.targetId,
    params.delayHours
  );
}

export type DelayTarget =
  | string
  | { type: 'CORRIDOR' | 'SUPPLIER'; id: string };

export interface BufferDelayImpact {
  bufferId: string;
  oemName: string;
  plantLocation: string;
  partDescription: string;
  partNumber: string;
  currentStockUnits: number;
  consumptionPerHour: number;
  runOutHoursBefore: number;
  runOutHoursAfter: number;
  hoursOfLineStop: number;
  penaltyPerHourINR: number;
  penaltyExposureBeforeINR: number;
  penaltyExposureAfterINR: number;
  penaltyDeltaINR: number;
  statusBefore: 'CRITICAL' | 'WARNING' | 'HEALTHY';
  statusAfter: 'CRITICAL' | 'WARNING' | 'HEALTHY';
  isAffected: boolean;
}

export interface SimulateDelayResult {
  targetType: 'CORRIDOR' | 'SUPPLIER';
  targetId: string;
  targetName: string;
  delayHours: number;
  affectedOEMs: string[];
  affectedBuffers: BufferDelayImpact[];
  affectedTrucks: Truck[];
  totalHoursOfLineStop: number;
  totalPenaltyBeforeINR: number;
  totalPenaltyAfterINR: number;
  totalPenaltyDeltaINR: number;
  summary: string;
}

/**
 * Pure function: simulates delay of 0 to 24 hours for a supplier or corridor.
 * Computes affected OEMs, run-out hours before and after, hours of line stop,
 * and penalty exposure in INR before and after.
 */
export function simulateDelay(
  state: {
    customerBuffers: CustomerBuffer[];
    trucks: Truck[];
    bomItems?: BomItem[];
  },
  target: DelayTarget,
  hours: number
): SimulateDelayResult {
  const clampedHours = Math.max(0, Math.min(24, Number(hours || 0)));

  // Resolve targetType and targetId
  let targetType: 'CORRIDOR' | 'SUPPLIER' = 'CORRIDOR';
  let targetId = '';

  if (typeof target === 'string') {
    targetId = target;
    if (target.startsWith('sup-') || INITIAL_SUPPLIERS.some((s) => s.id === target)) {
      targetType = 'SUPPLIER';
    } else {
      targetType = 'CORRIDOR';
    }
  } else if (target && typeof target === 'object') {
    targetType = target.type || 'CORRIDOR';
    targetId = target.id || '';
  }

  let targetName = targetId;
  const affectedOemSet = new Set<string>();
  let matchingTrucks: Truck[] = [];

  if (targetType === 'CORRIDOR') {
    const corridor = CORRIDORS.find((c) => c.id === targetId);
    targetName = corridor ? corridor.name : targetId;

    matchingTrucks = state.trucks.filter(
      (t) => t.corridorId === targetId || t.corridorId.toLowerCase() === targetId.toLowerCase()
    );
    matchingTrucks.forEach((t) => affectedOemSet.add(t.destinationOem));

    state.customerBuffers.forEach((b) => {
      const isTruckMatch = matchingTrucks.some((t) => t.id === b.assignedTruckId);
      const isCorridorMatch = b.highwayCorridor.toLowerCase().includes(targetId.toLowerCase());
      const isCityMatch = Boolean(
        corridor &&
          corridor.destinationCity &&
          b.highwayCorridor.toLowerCase().includes(corridor.destinationCity.split(',')[0].trim().toLowerCase())
      );
      if (isTruckMatch || isCorridorMatch || isCityMatch) {
        affectedOemSet.add(b.oemName);
      }
    });
  } else {
    // Supplier target
    const supplier = INITIAL_SUPPLIERS.find((s) => s.id === targetId);
    targetName = supplier ? supplier.name : targetId;

    const supplierOemMap: Record<string, string[]> = {
      'sup-bforge': ['Tata Motors', 'Hyundai Motor India'],
      'sup-kalyani': ['Mahindra & Mahindra', 'Tata Motors'],
      'sup-sonablw': ['Maruti Suzuki'],
      'sup-skf': ['Tata Motors', 'Maruti Suzuki'],
      'sup-sundram': ['Tata Motors', 'Mahindra & Mahindra', 'Maruti Suzuki', 'Hyundai Motor India', 'Bajaj Auto'],
      'sup-gabriel': ['Bajaj Auto', 'Tata Motors'],
    };

    const mappedOems = supplierOemMap[targetId] || ['Tata Motors'];
    mappedOems.forEach((oem) => affectedOemSet.add(oem));

    matchingTrucks = state.trucks.filter((t) =>
      mappedOems.some(
        (oem) =>
          t.destinationOem.toLowerCase().includes(oem.toLowerCase()) ||
          oem.toLowerCase().includes(t.destinationOem.toLowerCase())
      )
    );
  }

  const affectedOEMs = Array.from(affectedOemSet);

  const affectedBuffers: BufferDelayImpact[] = state.customerBuffers.map((buf) => {
    const isAffected =
      affectedOEMs.some(
        (oem) =>
          buf.oemName.toLowerCase().includes(oem.toLowerCase()) ||
          oem.toLowerCase().includes(buf.oemName.toLowerCase())
      ) || matchingTrucks.some((t) => t.id === buf.assignedTruckId);

    const runOutHoursBefore = buf.runOutHours;
    const statusBefore = calculateBufferStatus(runOutHoursBefore);
    const penaltyExposureBeforeINR = calculatePenaltyExposure(
      runOutHoursBefore,
      buf.penaltyPerHourINR,
      3.0
    );

    // If affected, run-out hours reduce by the delay hours
    const runOutHoursAfter = isAffected
      ? Math.max(0, Number((runOutHoursBefore - clampedHours).toFixed(1)))
      : runOutHoursBefore;
    const statusAfter = calculateBufferStatus(runOutHoursAfter);

    // Line stop occurs if the delay exceeds the buffer's stock
    const hoursOfLineStop = isAffected && clampedHours > runOutHoursBefore
      ? Number((clampedHours - runOutHoursBefore).toFixed(1))
      : 0;

    const penaltyExposureAfterINR = isAffected
      ? calculatePenaltyExposure(runOutHoursAfter, buf.penaltyPerHourINR, 3.0)
      : penaltyExposureBeforeINR;

    const penaltyDeltaINR = Math.max(0, penaltyExposureAfterINR - penaltyExposureBeforeINR);

    return {
      bufferId: buf.id,
      oemName: buf.oemName,
      plantLocation: buf.plantLocation,
      partDescription: buf.partDescription,
      partNumber: buf.partNumber,
      currentStockUnits: buf.currentStockUnits,
      consumptionPerHour: buf.consumptionPerHour,
      runOutHoursBefore,
      runOutHoursAfter,
      hoursOfLineStop,
      penaltyPerHourINR: buf.penaltyPerHourINR,
      penaltyExposureBeforeINR,
      penaltyExposureAfterINR,
      penaltyDeltaINR,
      statusBefore,
      statusAfter,
      isAffected,
    };
  });

  const totalHoursOfLineStop = Number(
    affectedBuffers.reduce((sum, b) => sum + b.hoursOfLineStop, 0).toFixed(1)
  );
  const totalPenaltyBeforeINR = affectedBuffers.reduce(
    (sum, b) => sum + b.penaltyExposureBeforeINR,
    0
  );
  const totalPenaltyAfterINR = affectedBuffers.reduce(
    (sum, b) => sum + b.penaltyExposureAfterINR,
    0
  );
  const totalPenaltyDeltaINR = Math.max(0, totalPenaltyAfterINR - totalPenaltyBeforeINR);

  const summary =
    affectedOEMs.length > 0 && clampedHours > 0
      ? `A ${clampedHours}h delay on ${targetName} impacts ${affectedOEMs.join(', ')}. Run-out drops by ${clampedHours}h, causing ${totalHoursOfLineStop}h of line-stop and ₹${(totalPenaltyDeltaINR / 100000).toFixed(2)} Lakh additional penalty exposure.`
      : `Nominal baseline: No active delay or unaffected OEM line routing via ${targetName}. Zero line-stop exposure projected.`;

  return {
    targetType,
    targetId,
    targetName,
    delayHours: clampedHours,
    affectedOEMs,
    affectedBuffers,
    affectedTrucks: matchingTrucks,
    totalHoursOfLineStop,
    totalPenaltyBeforeINR,
    totalPenaltyAfterINR,
    totalPenaltyDeltaINR,
    summary,
  };
}

/**
 * Illustrative standard under GST E-Way Bill rules:
 * 1 day per 200 km or part thereof.
 * Labelled "illustrative".
 */
export const EWB_KM_PER_DAY = 200;

export interface EwayBillValidityResult {
  distanceKm: number;
  validDays: number;
  validHours: number;
  generatedAt: string;
  validUntil: string;
  remainingMs: number;
  remainingHours: number;
  remainingMinutes: number;
  status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';
  badgeColor: 'green' | 'amber' | 'red';
  formattedCountdown: string;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isCriticalExpiryAlert: boolean; // <= 2.0h and > 0h
  illustrativeNote: string;
}

/**
 * Pure function: Computes E-Way Bill validUntil and live countdown from distance and generation time.
 * Distance rule: 1 day per 200 km or part thereof (EWB_KM_PER_DAY = 200), labelled "illustrative".
 * Badge color:
 * - green above 12h
 * - amber below 12h
 * - red when expired
 */
export function calculateEwayBillValidity(
  distanceKm: number,
  generatedAt: string | Date | number,
  now: string | Date | number = new Date()
): EwayBillValidityResult {
  const safeDistance = Math.max(1, Number(distanceKm || 1));
  const validDays = Math.max(1, Math.ceil(safeDistance / EWB_KM_PER_DAY));
  const validHours = validDays * 24;

  const genDate = new Date(generatedAt);
  const genTime = isNaN(genDate.getTime()) ? new Date().getTime() : genDate.getTime();
  const validDurationMs = validDays * 24 * 60 * 60 * 1000;
  const validUntilTime = genTime + validDurationMs;
  const validUntil = new Date(validUntilTime).toISOString();

  const nowDate = new Date(now);
  const currentTime = isNaN(nowDate.getTime()) ? new Date().getTime() : nowDate.getTime();

  const remainingMs = validUntilTime - currentTime;
  const remainingHours = Number((remainingMs / (1000 * 60 * 60)).toFixed(2));
  const remainingMinutes = Math.floor(remainingMs / (1000 * 60));

  let status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';
  let badgeColor: 'green' | 'amber' | 'red';
  let formattedCountdown: string;
  let isExpired = false;
  let isExpiringSoon = false;
  let isCriticalExpiryAlert = false;

  if (remainingMs <= 0) {
    status = 'EXPIRED';
    badgeColor = 'red';
    isExpired = true;
    formattedCountdown = 'Expired';
  } else if (remainingHours < 12) {
    status = 'EXPIRING_SOON';
    badgeColor = 'amber';
    isExpiringSoon = true;
    isCriticalExpiryAlert = remainingHours <= 2.0;

    const hrs = Math.floor(remainingHours);
    const mins = Math.max(0, remainingMinutes % 60);
    if (hrs === 0) {
      formattedCountdown = `${Math.max(1, mins)}m remaining`;
    } else {
      formattedCountdown = `${hrs}h ${mins}m remaining`;
    }
  } else {
    status = 'VALID';
    badgeColor = 'green';

    const days = Math.floor(remainingHours / 24);
    const hrs = Math.floor(remainingHours % 24);
    if (days >= 1) {
      formattedCountdown = `${days}d ${hrs}h remaining`;
    } else {
      const mins = Math.max(0, remainingMinutes % 60);
      formattedCountdown = `${hrs}h ${mins}m remaining`;
    }
  }

  return {
    distanceKm: safeDistance,
    validDays,
    validHours,
    generatedAt: new Date(genTime).toISOString(),
    validUntil,
    remainingMs,
    remainingHours,
    remainingMinutes,
    status,
    badgeColor,
    formattedCountdown,
    isExpired,
    isExpiringSoon,
    isCriticalExpiryAlert,
    illustrativeNote: 'illustrative: 1 day per 200 km or part thereof',
  };
}

export interface EwayBillAlertNotification {
  ewayBillNo: string;
  oemCustomer: string;
  vehicleNo: string;
  remainingHours: number;
  formattedCountdown: string;
}

/**
 * Pure function: Checks a list of E-Way Bills for those with 2 hours or less remaining,
 * filtering out any bill numbers that have already been alerted.
 */
export function checkEwayBillExpiryAlerts(
  ewayBills: EWayBillRecord[],
  alertedBillNos: string[] = [],
  now: string | Date | number = new Date()
): {
  newAlerts: EwayBillAlertNotification[];
  updatedAlertedBillNos: string[];
} {
  const alertedSet = new Set(alertedBillNos);
  const newAlerts: EwayBillAlertNotification[] = [];

  for (const bill of ewayBills) {
    if (alertedSet.has(bill.ewayBillNo)) continue;

    const distance = bill.distanceKm || (bill.isInterState ? 660 : 75);
    const validity = calculateEwayBillValidity(distance, bill.generatedAt, now);

    // Alert when 2 hours or less remain and bill is not yet expired
    if (validity.remainingHours <= 2.0 && validity.remainingHours > 0) {
      alertedSet.add(bill.ewayBillNo);
      newAlerts.push({
        ewayBillNo: bill.ewayBillNo,
        oemCustomer: bill.oemCustomer,
        vehicleNo: bill.vehicleNo,
        remainingHours: validity.remainingHours,
        formattedCountdown: validity.formattedCountdown,
      });
    }
  }

  return {
    newAlerts,
    updatedAlertedBillNos: Array.from(alertedSet),
  };
}
