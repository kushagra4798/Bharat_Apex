import { GoogleGenAI, Type } from '@google/genai';
import {
  calculateBufferStatus,
  calculatePenaltyExposure,
  collectLowStockBomItems,
} from '../src/services/calculations';
import {
  INITIAL_CUSTOMER_BUFFERS,
  INITIAL_TRUCKS,
  INITIAL_BOM,
  MACHINES,
  CORRIDORS,
} from '../src/data/mockData';
import { CustomerBuffer, Truck, BomItem, Machine, Corridor } from '../src/types';

export interface CalledToolRecord {
  name: string;
  args: Record<string, any>;
  result: any;
}

export interface AskResponse {
  isConfigured: boolean;
  answer: string;
  calledTools?: CalledToolRecord[];
  message?: string;
  error?: string;
}

// In-memory per-IP rate limiting: 20 requests per minute
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();

function checkRateLimit(ip: string, maxRequests = 20, windowMs = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetTime) rateLimitMap.delete(k);
    }
  }

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count += 1;
  return true;
}

/**
 * Pure Tool Implementations using existing pure functions and live domain state
 */
export function executeGetBufferStatus(
  buffers: CustomerBuffer[],
  oem?: string
): any {
  let list = buffers;
  if (oem && typeof oem === 'string' && oem.trim()) {
    const q = oem.toLowerCase().trim();
    list = buffers.filter(
      (b) =>
        b.oemName.toLowerCase().includes(q) ||
        q.includes(b.oemName.toLowerCase())
    );
    if (list.length === 0) list = buffers; // fallback to all if query didn't match
  }

  return list.map((b) => ({
    oemName: b.oemName,
    plantLocation: b.plantLocation,
    componentSupplied: b.partDescription,
    partNumber: b.partNumber,
    currentStockUnits: b.currentStockUnits,
    consumptionPerHour: b.consumptionPerHour,
    runOutHours: b.runOutHours,
    status: calculateBufferStatus(b.runOutHours),
    penaltyPerHourINR: b.penaltyPerHourINR,
    penaltyExposureINR: calculatePenaltyExposure(b.runOutHours, b.penaltyPerHourINR, 3.0),
    assignedTruckId: b.assignedTruckId,
    highwayCorridor: b.highwayCorridor,
  }));
}

export function executeSimulateTruckDelay(
  trucks: Truck[],
  buffers: CustomerBuffer[],
  corridors: Corridor[],
  truckId: string,
  hours: number
): any {
  const normalizedQuery = (truckId || '').toLowerCase().trim();
  const truck =
    trucks.find(
      (t) =>
        t.id.toLowerCase() === normalizedQuery ||
        t.registrationNumber.toLowerCase().includes(normalizedQuery) ||
        normalizedQuery.includes(t.registrationNumber.toLowerCase())
    ) || trucks[0];

  if (!truck) {
    return { error: `Truck '${truckId}' not found in active telematics.` };
  }

  const corridor =
    corridors.find((c) => c.id === truck.corridorId) || corridors[0];
  const delayMinutes = Math.round(hours * 60);
  const simulatedEtaMinutes = truck.etaMinutes + delayMinutes;

  // Match downstream destination buffer
  const matchedBuffer = buffers.find(
    (b) =>
      b.oemName.toLowerCase().includes(truck.destinationOem.toLowerCase()) ||
      truck.destinationOem.toLowerCase().includes(b.oemName.toLowerCase())
  );

  let bufferImpact = null;
  if (matchedBuffer) {
    const currentRunOut = matchedBuffer.runOutHours;
    const currentPenalty = calculatePenaltyExposure(
      currentRunOut,
      matchedBuffer.penaltyPerHourINR,
      3.0
    );
    const simulatedRunOut = Math.max(
      0,
      Number((currentRunOut - hours).toFixed(1))
    );
    const simulatedPenalty = calculatePenaltyExposure(
      simulatedRunOut,
      matchedBuffer.penaltyPerHourINR,
      3.0
    );

    bufferImpact = {
      bufferId: matchedBuffer.id,
      oemName: matchedBuffer.oemName,
      componentSupplied: matchedBuffer.partDescription,
      currentRunOutHours: currentRunOut,
      simulatedRunOutHours: simulatedRunOut,
      currentStatus: calculateBufferStatus(currentRunOut),
      simulatedStatus: calculateBufferStatus(simulatedRunOut),
      currentPenaltyINR: currentPenalty,
      simulatedPenaltyINR: simulatedPenalty,
      additionalPenaltyINR: Math.max(0, simulatedPenalty - currentPenalty),
    };
  }

  return {
    truckId: truck.id,
    registrationNumber: truck.registrationNumber,
    destinationOem: truck.destinationOem,
    cargoDescription: truck.cargoDescription,
    unitsLoaded: truck.unitsLoaded,
    corridorName: corridor.name,
    standardEtaMinutes: truck.etaMinutes,
    simulatedEtaMinutes,
    delayHours: hours,
    downstreamBufferImpact: bufferImpact,
  };
}

export function executeGetLowStockItems(bomItems: BomItem[]): any {
  const lowItems = collectLowStockBomItems(bomItems);
  return lowItems.map((item) => ({
    partNumber: item.partNumber,
    description: item.description,
    currentStock: item.currentStock,
    safetyStock: item.safetyStock,
    deficitUnits: item.safetyStock - item.currentStock,
    leadTimeDays: item.leadTimeDays,
    supplierId: item.supplierId,
    unitCost: item.unitCost,
    currency: item.currency,
    isCriticalDeficit: item.currentStock <= item.safetyStock * 0.5,
  }));
}

export function executeGetMachineStatus(machines: Machine[]): any {
  return machines.map((m) => ({
    machineId: m.id,
    name: m.name,
    model: m.model,
    operation: m.operation,
    status: m.status,
    oee: m.oee,
    availability: m.availability,
    performance: m.performance,
    quality: m.quality,
    operator: m.operator,
    statusReason: m.statusReason || (m.status === 'RUNNING' ? 'Nominal operation' : undefined),
    activeWorkOrderId: m.activeWorkOrderId,
  }));
}

export default async function handler(req: any, res: any) {
  // Support CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only POST requests are accepted at /api/ask',
    });
  }

  // 1. 100 kB Payload Limit Check
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(rawBody, 'utf-8') > 102400) {
    return res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload exceeds 100 kB limit.',
    });
  }

  // 2. Basic Per-IP Rate Limiting
  const clientIp =
    (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    '127.0.0.1';

  if (!checkRateLimit(clientIp, 20, 60000)) {
    return res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded: maximum 20 requests per minute per IP.',
    });
  }

  // 3. Strict Input Validation
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Request body must be a valid JSON object.',
    });
  }

  const { message, history, state } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Request body must contain a non-empty "message" string.',
    });
  }

  if (message.length > 2000) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: '"message" must be 2000 characters or fewer.',
    });
  }

  if (history && (!Array.isArray(history) || history.length > 20)) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'If provided, "history" must be an array of at most 20 items.',
    });
  }

  // Domain data fallback to seed baseline if not provided in body
  const customerBuffers: CustomerBuffer[] =
    state?.customerBuffers && Array.isArray(state.customerBuffers)
      ? state.customerBuffers
      : INITIAL_CUSTOMER_BUFFERS;

  const trucks: Truck[] =
    state?.trucks && Array.isArray(state.trucks)
      ? state.trucks
      : INITIAL_TRUCKS;

  const bomItems: BomItem[] =
    state?.bomItems && Array.isArray(state.bomItems)
      ? state.bomItems
      : INITIAL_BOM;

  const machines: Machine[] =
    state?.machines && Array.isArray(state.machines)
      ? state.machines
      : MACHINES;

  const corridors: Corridor[] = CORRIDORS;

  // 4. API Key Check: Friendly message when missing without crashing
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const modelName = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

  if (!apiKey) {
    const responsePayload: AskResponse = {
      isConfigured: false,
      answer: "Add GEMINI_API_KEY to .env to enable the 'Ask the Plant' AI assistant.",
      calledTools: [],
    };
    return res.status(200).json(responsePayload);
  }

  // Tool declaration definitions for Gemini function calling
  const tools: any = [
    {
      functionDeclarations: [
        {
          name: 'getBufferStatus',
          description:
            'Retrieves current stock units, consumption per hour, run-out hours, status (CRITICAL, WARNING, HEALTHY), and line-stop penalty exposure in INR for customer buffers.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              oem: {
                type: Type.STRING,
                description:
                  'Optional OEM name (e.g., "Tata Motors", "Mahindra", "Maruti Suzuki", "Hyundai", "Bajaj Auto"). Omit to retrieve all buffers.',
              },
            },
          },
        },
        {
          name: 'simulateTruckDelay',
          description:
            'Simulates a highway corridor transit delay for an outbound convoy truck and calculates downstream buffer depletion, new run-out hours, and line-stop penalty exposure in INR.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              truckId: {
                type: Type.STRING,
                description:
                  'Truck identifier or registration number (e.g., "MH-14-GH-4091", "MH-12-PQ-9912", "MH-04-AZ-2210").',
              },
              hours: {
                type: Type.NUMBER,
                description: 'Delay horizon in hours (e.g. 1.5, 3.0).',
              },
            },
            required: ['truckId', 'hours'],
          },
        },
        {
          name: 'getLowStockItems',
          description:
            'Retrieves all BOM bill-of-materials components currently below their safety stock threshold, including stock deficit and supplier details.',
          parameters: {
            type: Type.OBJECT,
            properties: {},
          },
        },
        {
          name: 'getMachineStatus',
          description:
            'Retrieves real-time station operating status (RUNNING, SETUP, MAINTENANCE, IDLE), OEE percentage, and downtime reasons for all manufacturing machines.',
          parameters: {
            type: Type.OBJECT,
            properties: {},
          },
        },
      ],
    },
  ];

  const systemInstruction = `You are the "Ask the Plant" intelligent assistant for Bharat Apex Automotive, Chakan Complex Line 4.
CRITICAL CONSTRAINT: You must answer ONLY and strictly from tool execution results. Never calculate, estimate, or hallucinate numbers yourself.
Always invoke the available tools (getBufferStatus, simulateTruckDelay, getLowStockItems, getMachineStatus) whenever the user asks about plant status, inventory, buffers, delays, or machines.
Format your final answer clearly in markdown with structured bullet points and bold numbers.`;

  try {
    const ai = new GoogleGenAI({ apiKey });

    // 15-second timeout controller
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Model generation timed out after 15 seconds.')), 15000);
    });

    const userContent = {
      role: 'user',
      parts: [{ text: message.trim() }],
    };

    // First model turn: evaluate prompt and decide which tool to call
    const firstCallPromise = ai.models.generateContent({
      model: modelName || 'gemini-2.5-flash',
      contents: [userContent],
      config: {
        tools,
        systemInstruction,
      },
    });

    const firstResponse = await Promise.race([firstCallPromise, timeoutPromise]);
    const functionCalls = firstResponse.functionCalls;
    const calledTools: CalledToolRecord[] = [];

    // If model didn't call any tools, return its direct text response
    if (!functionCalls || functionCalls.length === 0) {
      return res.status(200).json({
        isConfigured: true,
        answer: firstResponse.text || 'No telemetry tools were needed to address this inquiry.',
        calledTools: [],
      });
    }

    // Execute each requested tool using our pure functions
    const toolResponseParts: any[] = [];

    for (const call of functionCalls) {
      let toolResult: any = null;

      if (call.name === 'getBufferStatus') {
        const oemArg = (call.args as any)?.oem;
        toolResult = executeGetBufferStatus(customerBuffers, oemArg);
      } else if (call.name === 'simulateTruckDelay') {
        const truckIdArg = (call.args as any)?.truckId || 'MH-14-GH-4091';
        const hoursArg = Number((call.args as any)?.hours) || 2.0;
        toolResult = executeSimulateTruckDelay(trucks, customerBuffers, corridors, truckIdArg, hoursArg);
      } else if (call.name === 'getLowStockItems') {
        toolResult = executeGetLowStockItems(bomItems);
      } else if (call.name === 'getMachineStatus') {
        toolResult = executeGetMachineStatus(machines);
      } else {
        toolResult = { error: `Unknown tool: ${call.name}` };
      }

      calledTools.push({
        name: call.name || 'unknown_tool',
        args: (call.args as Record<string, any>) || {},
        result: toolResult,
      });

      toolResponseParts.push({
        functionResponse: {
          name: call.name || 'unknown_tool',
          response: { output: toolResult },
        },
      });
    }

    // Second model turn: provide tool execution results to generate final answer strictly from tool results
    const secondCallPromise = ai.models.generateContent({
      model: modelName || 'gemini-2.5-flash',
      contents: [
        userContent,
        (firstResponse.candidates?.[0]?.content as any) || {
          role: 'model',
          parts: functionCalls.map((c) => ({
            functionCall: { name: c.name, args: c.args },
          })),
        },
        {
          role: 'tool',
          parts: toolResponseParts,
        },
      ],
      config: {
        systemInstruction,
      },
    });

    const secondResponse = await Promise.race([secondCallPromise, timeoutPromise]);

    return res.status(200).json({
      isConfigured: true,
      answer: secondResponse.text || 'Telemetry tool executed successfully.',
      calledTools,
    });
  } catch (error: any) {
    console.error('[/api/ask error]:', error);
    return res.status(200).json({
      isConfigured: true,
      answer: `Unable to complete AI inquiry: ${error?.message || 'Server timeout or API communication error'}.`,
      calledTools: [],
      error: error?.message,
    });
  }
}
