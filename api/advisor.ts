import { GoogleGenAI } from '@google/genai';

export interface AdvisorRiskItem {
  oem: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  recommendedAction: string;
}

export interface AdvisorResponse {
  isConfigured: boolean;
  message?: string;
  risks: AdvisorRiskItem[];
  summary: string;
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

  // Clean old entries if map grows
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
      message: 'Only POST requests are accepted at /api/advisor',
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

  const { buffers, workOrders, bomItems } = req.body;

  if (!buffers || !Array.isArray(buffers) || buffers.length === 0 || buffers.length > 50) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Request body must contain a "buffers" array with 1 to 50 items.',
    });
  }

  // Validate each buffer item has minimum required fields
  const invalidBuffer = buffers.find(
    (b: any) => !b || typeof b.oemName !== 'string' || typeof b.runOutHours !== 'number'
  );
  if (invalidBuffer) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'Each buffer item must contain "oemName" (string) and "runOutHours" (number).',
    });
  }

  if (workOrders && (!Array.isArray(workOrders) || workOrders.length > 100)) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'If provided, "workOrders" must be an array of at most 100 items.',
    });
  }

  if (bomItems && (!Array.isArray(bomItems) || bomItems.length > 100)) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'If provided, "bomItems" must be an array of at most 100 items.',
    });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const modelName = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

  // Check if API key is provided
  if (!apiKey) {
    const responsePayload: AdvisorResponse = {
      isConfigured: false,
      message: 'Add GEMINI_API_KEY to .env to enable the AI advisor',
      risks: [],
      summary:
        'AI Line-Stop Advisor is currently standing by. Add GEMINI_API_KEY to .env to enable automated JIT supply chain analytics.',
    };
    return res.status(200).json(responsePayload);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Format telemetry payload for the model (pure factual context, no hallucinations)
    const promptContext = `Analyze the following real-time JIT buffer and shop-floor telemetry for Chakan Tier-1 Automotive plant:

1. OEM Customer Buffers:
${JSON.stringify(
  buffers.slice(0, 10).map((b: any) => ({
    id: b.id,
    oemName: b.oemName,
    plantLocation: b.plantLocation,
    partDescription: b.partDescription,
    currentStockUnits: b.currentStockUnits ?? b.stockOnHandUnits,
    consumptionPerHour: b.consumptionPerHour ?? b.consumptionPerHourUnits,
    runOutHours: b.runOutHours,
    penaltyPerHourINR: b.penaltyPerHourINR,
  })),
  null,
  2
)}

2. Active Work Orders (Sample):
${JSON.stringify(
  (workOrders || []).slice(0, 10).map((w: any) => ({
    id: w.id,
    oemName: w.oemName,
    partDescription: w.partDescription,
    quantity: w.quantity,
    stage: w.stage,
    machineId: w.machineId,
  })),
  null,
  2
)}

3. BOM Overview:
${JSON.stringify(
  (bomItems || []).slice(0, 8).map((item: any) => ({
    partNumber: item.partNumber,
    description: item.description,
    currentStock: item.currentStock ?? item.stockOnHand,
    safetyStock: item.safetyStock,
    unitCost: item.unitCost,
    currency: item.currency,
  })),
  null,
  2
)}

Return strict JSON matching this structure:
{
  "risks": [
    {
      "oem": "Exact OEM Name from buffer data",
      "severity": "HIGH" | "MEDIUM" | "LOW",
      "reason": "Specific factual reason citing run-out hours, stock units, or line penalty",
      "recommendedAction": "Concrete immediate mitigation action (e.g., Expedite truck dispatch, reallocate machining cell)"
    }
  ],
  "summary": "Concise 2-3 sentence executive synthesis of plant line-stop exposure and immediate priorities"
}`;

    // 15-second timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Gemini API call timed out after 15 seconds')), 15000);
    });

    const generatePromise = ai.models.generateContent({
      model: modelName,
      contents: promptContext,
      config: {
        systemInstruction:
          'You are a JIT supply chain analyst for an Indian Tier-1 auto supplier. Use only the data provided. Never invent numbers.',
        responseMimeType: 'application/json',
      },
    });

    const result = await Promise.race([generatePromise, timeoutPromise]);
    const responseText = result.text || '{}';

    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleanJson);
    }

    const payload: AdvisorResponse = {
      isConfigured: true,
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      summary: parsed.summary || 'JIT line-stop risk analysis complete.',
    };

    return res.status(200).json(payload);
  } catch (err: any) {
    console.error('[Gemini Advisor Exception]:', err);
    return res.status(200).json({
      isConfigured: false,
      error: 'GEMINI_ADVISOR_ERROR',
      message: err.message || 'Unable to communicate with Gemini API. Please check your network and API key.',
      risks: [],
      summary: 'AI Advisor temporarily unavailable. Check GEMINI_API_KEY configuration or network connectivity.',
    });
  }
}
