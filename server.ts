import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketIOServer } from 'socket.io';
import { loadConfig, getConfig } from './src/server/config';
import { getDb } from './src/server/db';
import { createApiRouter } from './src/server/routes';
import {
  initHardwareSimulator,
  startConveyor,
  stopConveyor,
  pauseConveyor,
  emergencyStop,
  simulateFault
} from './src/server/hardware-simulator';
import { checkDeviceWatchdog } from './src/server/services/hardwareService';

// ── Load and validate config FIRST (exits on failure) ───
const config = loadConfig();

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // CSP breaks Vite dev server
    crossOriginEmbedderPolicy: false
  }));

  // CORS
  const corsOrigin = config.ALLOWED_ORIGIN || (config.NODE_ENV === 'development' ? '*' : undefined);
  app.use(cors({
    origin: corsOrigin || false,
    credentials: true
  }));

  // Body limits
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  // Initialize SQLite database
  console.log('[ParcelFlow] Initializing SQLite database...');
  await getDb();
  console.log('[ParcelFlow] Database ready.');

  // Initialize Socket.io
  const io = new SocketIOServer(httpServer, {
    cors: { origin: corsOrigin || '*' }
  });

  // Initialize hardware simulation engine
  initHardwareSimulator(io);

  // Periodic device watchdog check (every 2.5 seconds)
  setInterval(() => {
    checkDeviceWatchdog(io);
  }, 2500);

  // Client socket handlers
  io.on('connection', (socket) => {
    socket.on('conveyor:start', () => startConveyor());
    socket.on('conveyor:stop', () => stopConveyor());
    socket.on('conveyor:pause', () => pauseConveyor());
    socket.on('conveyor:emergency_stop', () => emergencyStop());
    socket.on('debug:simulate_fault', (data: { target: 'wifi' | 'sensor' | 'robot' | 'clear' }) => {
      simulateFault(data.target);
    });
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      mode: config.HARDWARE_MODE,
      googleLogin: Boolean(config.FIREBASE_PROJECT_ID)
    });
  });

  // API Routes
  app.use('/api', createApiRouter(io));

  // Catch-all for API routes to prevent fallback to SPA HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Central error handler — never expose internals
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[ParcelFlow] Unhandled error:', err.message || err);
    const status = typeof err.status === 'number' ? err.status : 500;
    res.status(status).json({
      error: config.NODE_ENV === 'production'
        ? 'An internal error occurred'
        : err.message || 'An internal error occurred'
    });
  });

  // Vite middleware in dev / static in prod
  if (config.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(config.PORT, '0.0.0.0', () => {
    console.log(`[ParcelFlow] Server running at http://0.0.0.0:${config.PORT}`);
    console.log(`[ParcelFlow] Hardware mode: ${config.HARDWARE_MODE}`);
    console.log(`[ParcelFlow] Google login: ${config.FIREBASE_PROJECT_ID ? 'available' : 'disabled'}`);
  });
}

startServer().catch((err) => {
  console.error('[ParcelFlow] Failed to start server:', err);
  process.exit(1);
});
