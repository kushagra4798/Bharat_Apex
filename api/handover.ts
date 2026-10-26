import { GoogleGenAI } from '@google/genai';

export interface HandoverIncident {
  timestamp: string;
  type: string;
  description: string;
}

export interface HandoverResponse {
  isConfigured: boolean;
  message?: string;
  shiftName: string;
  outgoingLead: string;
  summary: string;
  keyIncidents: HandoverIncident[];
  pendingActions: string[];
  equipmentStatusOverview?: string;
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

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only POST requests are accepted at /api/handover',
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

  const {
    plantFeed,
    metrics,
    outgoingLead = 'R. Deshmukh (Lead Controller)',
    shiftName = 'Shift A (06:00 - 14:00 IST)',
  } = req.body;

  if (plantFeed && (!Array.isArray(plantFeed) || plantFeed.length > 50)) {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'If provided, "plantFeed" must be an array of at most 50 items.',
    });
  }

  if (metrics && typeof metrics !== 'object') {
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: 'If provided, "metrics" must be an object.',
    });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const modelName = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

  const feedList = Array.isArray(plantFeed) ? plantFeed.slice(0, 15) : [];

  // Offline / Fallback data if key is not configured
  const offlineSummary: HandoverResponse = {
    isConfigured: false,
    message: 'Add GEMINI_API_KEY to .env to enable AI shift handover summarization',
    shiftName,
    outgoingLead,
    summary:
      'Standard telemetry shift handover compiled from plant SCADA logs. Chakan Complex Line 4 maintained nominal takt with active JIT buffer monitoring.',
    keyIncidents: feedList.map((f: any) => ({
      timestamp: f.timeDisplay || '10:00',
      type: f.category || f.type || 'SYSTEM',
      description: `${f.title}: ${f.description}`,
    })),
    pendingActions: [
      'Verify Tata Motors Sanand buffer replenishment convoy arrival',
      'Inspect CNC-03 tool wear indicators before starting high-precision batch',
      'Confirm FASTag Green Pass status for Chennai-bound logistics transit',
    ],
    equipmentStatusOverview: metrics?.activeWorkstations || '7 of 8 workstations operating nominally.',
  };

  if (!apiKey) {
    return res.status(200).json(offlineSummary);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Requirement 7: Use f.category instead of f.type in the prompt
    const promptContext = `You are an industrial plant operations manager for an Indian Tier-1 automotive manufacturing plant in Chakan MIDC.
Summarize the following plant telemetry feed and metrics into an executive shift handover briefing for the incoming shift supervisor:

Shift: ${shiftName}
Outgoing Lead: ${outgoingLead}
Plant Metrics: ${JSON.stringify(metrics || {}, null, 2)}
Recent Plant Telemetry Log:
${JSON.stringify(
  feedList.map((f: any) => ({
    time: f.timeDisplay,
    category: f.category || 'TELEMETRY',
    severity: f.severity,
    title: f.title,
    description: f.description,
  })),
  null,
  2
)}

Return strict JSON:
{
  "summary": "Executive summary of shift events, line efficiency, and buffer risks (3-4 sentences)",
  "keyIncidents": [
    {
      "timestamp": "HH:MM",
      "type": "DISRUPTION | MAINTENANCE | EXPEDITE | NORMAL",
      "description": "Concise summary of the incident"
    }
  ],
  "pendingActions": [
    "High priority item for incoming supervisor",
    "Second action item",
    "Third action item"
  ],
  "equipmentStatusOverview": "One sentence summary of machine cell readiness"
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
          'You are an industrial plant operations manager for an Indian Tier-1 automotive manufacturing plant in Chakan MIDC. Summarize plant activity and telemetry into a concise, professional shift handover briefing. Never invent numbers.',
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

    const payload: HandoverResponse = {
      isConfigured: true,
      shiftName,
      outgoingLead,
      summary: parsed.summary || offlineSummary.summary,
      keyIncidents: Array.isArray(parsed.keyIncidents) ? parsed.keyIncidents : offlineSummary.keyIncidents,
      pendingActions: Array.isArray(parsed.pendingActions) ? parsed.pendingActions : offlineSummary.pendingActions,
      equipmentStatusOverview: parsed.equipmentStatusOverview || offlineSummary.equipmentStatusOverview,
    };

    return res.status(200).json(payload);
  } catch (err: any) {
    console.error('[Gemini Handover Exception]:', err);
    return res.status(200).json({
      ...offlineSummary,
      error: 'GEMINI_HANDOVER_ERROR',
      message: err.message || 'Unable to communicate with Gemini API. Defaulting to SCADA telemetry logs.',
    });
  }
}
