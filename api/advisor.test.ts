import { describe, it, expect, vi, beforeEach } from 'vitest';
import advisorHandler from './advisor';
import handoverHandler from './handover';

describe('Serverless API Handlers (/api)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('/api/advisor', () => {
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

      await advisorHandler(req, res);
      expect(statusCode).toBe(405);
      expect(jsonBody?.error).toBe('METHOD_NOT_ALLOWED');
    });

    it('rejects requests exceeding 100 kB with 413 Payload Too Large', async () => {
      let statusCode = 0;
      let jsonBody: any = null;

      const hugeString = 'x'.repeat(105000);
      const req: any = {
        method: 'POST',
        body: {
          buffers: [{ oemName: 'Tata', runOutHours: 1.0, data: hugeString }],
        },
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

      await advisorHandler(req, res);
      expect(statusCode).toBe(413);
      expect(jsonBody?.error).toBe('PAYLOAD_TOO_LARGE');
    });

    it('validates input and rejects missing buffers with 400', async () => {
      let statusCode = 0;
      let jsonBody: any = null;

      const req: any = { method: 'POST', body: {} };
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

      await advisorHandler(req, res);
      expect(statusCode).toBe(400);
      expect(jsonBody?.error).toBe('INVALID_INPUT');
    });

    it('returns friendly unconfigured message without crashing when GEMINI_API_KEY is empty', async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      let statusCode = 0;
      let jsonBody: any = null;

      const req: any = {
        method: 'POST',
        headers: { 'x-forwarded-for': '192.168.1.100' },
        body: {
          buffers: [
            {
              id: 'b-1',
              oemName: 'Tata Motors',
              currentStockUnits: 120,
              consumptionPerHour: 100,
              runOutHours: 1.2,
            },
          ],
        },
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

      await advisorHandler(req, res);

      expect(statusCode).toBe(200);
      expect(jsonBody?.isConfigured).toBe(false);
      expect(jsonBody?.message).toContain('Add GEMINI_API_KEY to .env to enable the AI advisor');
      expect(jsonBody?.risks).toEqual([]);
      expect(jsonBody?.summary).toBeDefined();

      if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    });
  });

  describe('/api/handover', () => {
    it('rejects handover payloads over 100 kB with 413', async () => {
      let statusCode = 0;
      let jsonBody: any = null;

      const hugeString = 'x'.repeat(105000);
      const req: any = {
        method: 'POST',
        body: {
          plantFeed: [{ description: hugeString }],
        },
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

      await handoverHandler(req, res);
      expect(statusCode).toBe(413);
      expect(jsonBody?.error).toBe('PAYLOAD_TOO_LARGE');
    });

    it('returns structured handover fallback when GEMINI_API_KEY is unconfigured', async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      let statusCode = 0;
      let jsonBody: any = null;

      const req: any = {
        method: 'POST',
        headers: { 'x-forwarded-for': '192.168.1.101' },
        body: {
          plantFeed: [
            {
              id: 'f-1',
              timeDisplay: '08:30',
              category: 'DISRUPTION',
              title: 'Toll Congestion',
              description: 'Talegaon Plaza delayed 45m',
            },
          ],
          metrics: { averageOee: '87.5%' },
        },
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

      await handoverHandler(req, res);

      expect(statusCode).toBe(200);
      expect(jsonBody?.isConfigured).toBe(false);
      expect(jsonBody?.message).toContain('Add GEMINI_API_KEY to .env');
      expect(jsonBody?.keyIncidents).toHaveLength(1);
      expect(jsonBody?.keyIncidents[0].description).toContain('Talegaon Plaza');
      expect(jsonBody?.pendingActions.length).toBeGreaterThan(0);

      if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    });
  });
});
