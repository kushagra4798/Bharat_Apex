// Currency Types
export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'JPY' | 'CNY' | 'GBP';

export type CurrencyRates = Record<CurrencyCode, number>;

export type FxShocks = Partial<Record<CurrencyCode, number>>; // Percentage shocks, e.g. { USD: 1.5, EUR: 0.4 }

// BOM Item
export interface BomItem {
  id: string;
  partNumber: string;
  description: string;
  level: 1 | 2 | 3;
  parentId?: string;
  qtyPerAssembly: number;
  unitCost: number;
  currency: CurrencyCode;
  landedCostInBase?: number;
  currentStock: number;
  safetyStock: number;
  leadTimeDays: number;
  supplierId: string;
  category: string;
  subAssembly?: string;
  children?: BomItem[];
}

// Work Order Stage & Status
export type WorkOrderStage = 'RAW_PREP' | 'MACHINING' | 'FABRICATION' | 'ASSEMBLY' | 'FINAL_DISPATCH';

export type WorkOrderStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CRITICAL' | 'RUSH';

export interface WorkOrder {
  id: string;
  oemName: string;
  partDescription: string;
  partNumber: string;
  quantity: number;
  stage: WorkOrderStage;
  progress: number; // 0 to 100
  machineId: string;
  dueShift: string;
  dueTime: string;
  scrapCount: number;
  scrapRate: string; // e.g. "4 pcs (0.4%)"
  status: WorkOrderStatus;
  priority: 'Standard' | 'Rush' | 'Buffer';
  createdAt?: string;
}

// Machine Status & Machine
export type MachineStatus = 'RUNNING' | 'SETUP' | 'MAINTENANCE' | 'IDLE';

export interface Machine {
  id: string; // e.g. "CNC-01"
  name: string; // e.g. "CNC-01"
  model: string; // e.g. "Doosan 5-Axis"
  operation: string; // e.g. "Crankshaft Pin Machining"
  status: MachineStatus;
  oee: number; // e.g. 91.2
  availability: number; // e.g. 94.0
  performance: number; // e.g. 98.0
  quality: number; // e.g. 99.0
  operator: string; // e.g. "S. Patil"
  activeWorkOrderId?: string;
  statusReason?: string;
  remainingMinutes?: number;
}

// Customer Buffer (OEM Line)
export interface CustomerBuffer {
  id: string;
  oemName: string; // e.g. "Tata Motors"
  plantLocation: string; // e.g. "Sanand EV Plant"
  partDescription: string; // e.g. "Tiago Front Axle Beam"
  partNumber: string; // e.g. "BA-TATA-401"
  currentStockUnits: number;
  consumptionPerHour: number;
  runOutHours: number; // Calculated or live, e.g. 1.8
  penaltyPerHourINR: number; // in INR, e.g. 2500000 (₹25L)
  status: 'CRITICAL' | 'WARNING' | 'HEALTHY';
  assignedTruckId?: string;
  highwayCorridor: string; // e.g. "NH-48 Western Express"
}

// Truck & Telematics
export type TruckStatus = 'IN_TRANSIT' | 'ARRIVED' | 'DELAYED';

export interface Truck {
  id: string; // e.g. "MH-12-RN-8819"
  registrationNumber: string;
  corridorId: string;
  origin: string; // "Chakan MIDC"
  destination: string; // e.g. "Sanand EV Plant"
  destinationOem: string;
  cargoDescription: string;
  unitsLoaded: number;
  currentLat: number;
  currentLng: number;
  targetLat: number;
  targetLng: number;
  progressPct: number; // 0 to 100
  speedKmph: number;
  fastagTollStatus: string; // e.g. "Cleared Talegaon Plaza"
  etaMinutes: number;
  isExpedited: boolean;
  lastPingTime: string;
  status?: TruckStatus;
  geofenceArrived?: boolean;
}

// Logistics Corridor
export interface CorridorWaypoint {
  lat: number;
  lng: number;
  name?: string;
}

export interface TollPlaza {
  name: string;
  status: 'CLEAR' | 'CONGESTED' | 'DELAYED';
  delayMinutes: number;
}

export interface Corridor {
  id: string;
  name: string; // e.g. "Chakan - Sanand NH-48"
  originCity: string;
  destinationCity: string;
  totalDistanceKm: number;
  standardDurationHours: number;
  waypoints: CorridorWaypoint[];
  activeTollPlazas: TollPlaza[];
}

// Tier-2 Supplier
export interface Supplier {
  id: string;
  name: string;
  location: string;
  tier: 2;
  partsSupplied: string[];
  onTimeDeliveryScore: number; // percentage, e.g. 96.5
  qualityPpmScore: number; // PPM, e.g. 45
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  paymentTerms: string;
  contactEmail?: string;
}

// Single E-Way Bill Record with ASNRecord alias
export interface EWayBillRecord {
  id: string;
  ewayBillNo: string;
  asnNo: string;
  generatedAt: string;
  dispatchDate: string;
  validUntil: string;
  supplierGstin: string; // Bharat Apex Chakan GSTIN (27AAAAA0000A1Z5)
  recipientGstin: string;
  oemCustomer: string;
  originAddress: string;
  destinationAddress: string;
  hsnCode: string;
  partNumber: string;
  partDescription: string;
  quantity: number;
  unitValue: number; // in base currency INR
  taxableAmount: number;
  isInterState: boolean; // true = IGST 18%, false = CGST 9% + SGST 9%
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalInvoiceAmount: number;
  transporterId: string;
  vehicleNo: string;
  transitStatus: 'GENERATED' | 'IN_TRANSIT' | 'DELIVERED';
  distanceKm?: number;
}

// Export alias ASNRecord
export type ASNRecord = EWayBillRecord;

// Plant Activity Live Feed Entry
export interface PlantFeedEntry {
  id: string;
  timestamp: string;
  timeDisplay: string; // e.g. "10:14"
  category: 'TELEMETRY' | 'ASN' | 'FASTAG' | 'EDI' | 'DISRUPTION' | 'SCHEDULE' | 'SYSTEM' | 'SUPPLIER' | 'CURRENCY' | 'MAINTENANCE';
  title: string;
  description: string;
  severity: 'NORMAL' | 'WARN' | 'CRITICAL';
}

// Simulation & Scenario Types
export type SimulationSpeed = 1 | 5 | 20;

export type ScenarioType =
  | 'NONE'
  | 'MONSOON'
  | 'SUPPLIER_STRIKE'
  | 'MACHINE_BREAKDOWN'
  | 'FX_SPIKE'
  | 'WHAT_IF';

export interface ActiveScenario {
  type: ScenarioType;
  name: string;
  badge: string;
  description: string;
  activatedAt: string;
  previousValues?: {
    machineId?: string;
    machineStatus?: MachineStatus;
    machineOee?: number;
    supplierId?: string;
    supplierRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
    depletedBomItemId?: string;
    depletedStockAmount?: number;
    delayedTruckIds?: string[];
    previousTruckEtas?: Record<string, number>;
    fxUsdShock?: number;
  };
}

// System Alerts Types
export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type AlertCategory = 'BUFFER' | 'BOM' | 'MACHINE' | 'LOGISTICS';
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'SNOOZED';

export interface SystemAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  targetId: string;
  targetName: string;
  runOutHours?: number;
  countdownSeconds?: number;
  status: AlertStatus;
  createdAt: string;
  acknowledgedAt?: string;
  snoozedUntil?: number; // timestamp in ms
}

export interface AlertUserAction {
  status: 'ACKNOWLEDGED' | 'SNOOZED';
  acknowledgedAt?: string;
  snoozedUntil?: number; // timestamp in ms
}

// What-If Simulation Types
export interface WhatIfSimulationInput {
  targetType: 'CORRIDOR' | 'SUPPLIER';
  targetId: string;
  delayHours: number;
}

export interface WhatIfAffectedBuffer {
  bufferId: string;
  oemName: string;
  partDescription: string;
  currentStockUnits: number;
  consumptionPerHour: number;
  currentRunOutHours: number;
  simulatedRunOutHours: number;
  currentStatus: 'CRITICAL' | 'WARNING' | 'HEALTHY';
  simulatedStatus: 'CRITICAL' | 'WARNING' | 'HEALTHY';
  penaltyPerHourINR: number;
  currentPenaltyINR: number;
  simulatedPenaltyINR: number;
  additionalPenaltyINR: number;
}

export interface WhatIfSimulationResult {
  targetType: 'CORRIDOR' | 'SUPPLIER';
  targetId: string;
  targetName: string;
  delayHours: number;
  affectedOems: string[];
  affectedBuffers: WhatIfAffectedBuffer[];
  totalCurrentPenaltyINR: number;
  totalSimulatedPenaltyINR: number;
  additionalPenaltyExposureINR: number;
  summary: string;
}
