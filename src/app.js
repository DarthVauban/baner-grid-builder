import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './modules/auth/auth.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import gridRoutes from './modules/grids/grid.routes.js';
import bannerRoutes from './modules/banners/banner.routes.js';
import { env } from './config/env.js';
import { query } from './db/pool.js';
import { asyncHandler } from './lib/async-handler.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, '../public');
const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      imgSrc: ["'self'", 'data:', 'https:', 'http:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  hsts: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

if (env.APP_ORIGIN) {
  app.use(cors({ origin: env.APP_ORIGIN, credentials: true }));
}

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Забагато спроб. Повторіть пізніше.' } }
});

app.get('/api/health', asyncHandler(async (req, res) => {
  await query('SELECT 1');
  res.json({ data: { status: 'ok' } });
}));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/grids', gridRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api', notFoundHandler);

app.use(express.static(publicDir, { index: false, maxAge: env.isProduction ? '1h' : 0 }));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use(errorHandler);

export default app;
