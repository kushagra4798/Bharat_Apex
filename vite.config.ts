import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

function apiDevPlugin(): Plugin {
  return {
    name: 'vercel-api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';
        if (url === '/api/advisor' || url === '/api/handover' || url === '/api/ask') {
          try {
            let body: any = {};
            if (req.method === 'POST') {
              const chunks: any[] = [];
              let totalBytes = 0;
              for await (const chunk of req) {
                const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
                totalBytes += buf.length;
                if (totalBytes > 102400) {
                  res.statusCode = 413;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(
                    JSON.stringify({
                      error: 'PAYLOAD_TOO_LARGE',
                      message: 'Request payload exceeds 100 kB limit.',
                    })
                  );
                  return;
                }
                chunks.push(buf);
              }
              const rawBody = Buffer.concat(chunks).toString('utf-8');
              if (rawBody) {
                try {
                  body = JSON.parse(rawBody);
                } catch {
                  body = {};
                }
              }
            }

            (req as any).body = body;
            const resAny = res as any;
            resAny.status = (code: number) => {
              res.statusCode = code;
              return resAny;
            };
            resAny.json = (data: any) => {
              if (!res.headersSent) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              }
              return resAny;
            };

            if (url === '/api/advisor') {
              const { default: handler } = await server.ssrLoadModule('/api/advisor.ts');
              return await handler(req, resAny);
            } else if (url === '/api/handover') {
              const { default: handler } = await server.ssrLoadModule('/api/handover.ts');
              return await handler(req, resAny);
            } else if (url === '/api/ask') {
              const { default: handler } = await server.ssrLoadModule('/api/ask.ts');
              return await handler(req, resAny);
            }
          } catch (err: any) {
            console.error('[API Dev Middleware Error]:', err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'SERVER_DEV_ERROR', message: err.message }));
            }
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Populate server-side environment variables in process.env for local development
  process.env.GEMINI_API_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  process.env.GEMINI_MODEL = env.GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  return {
    plugins: [
      react(),
      tailwindcss(),
      apiDevPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
  };
});
