import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './modules/auth/auth.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import gridRoutes from './modules/grids/grid.routes.js';
import bannerRoutes from './modules/banners/banner.routes.js';
import productTableRoutes from './modules/product-tables/product-table.routes.js';
import taskRoutes from './modules/tasks/task.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import userRoutes from './modules/users/user.routes.js';
import publicationRoutes from './modules/publications/publication.routes.js';
import chatRoutes from './modules/chat/chat.routes.js';
import applicationRoutes from './modules/applications/application.routes.js';
import formRoutes from './modules/applications/form.routes.js';
import publicApplicationRoutes from './modules/applications/public.routes.js';
import catalogRoutes from './modules/catalog/catalog.routes.js';
import storefrontRoutes from './modules/catalog/storefront.routes.js';
import { env } from './config/env.js';
import { query } from './db/pool.js';
import { asyncHandler } from './lib/async-handler.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const webDistDir = path.resolve(currentDir, '../dist/web');
const webIndex = path.join(webDistDir, 'index.html');
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
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
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
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/public/application-forms')) return next();
    if (req.path.startsWith('/api/storefront')) return next();
    return cors({ origin: env.APP_ORIGIN, credentials: true })(req, res, next);
  });
}

const publicEmbedCors = cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
});

app.use(express.json({ limit: '25mb' }));
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
app.use('/api/product-tables', productTableRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/publications', publicationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/storefront', publicEmbedCors, storefrontRoutes);
app.use('/api/public/application-forms', publicEmbedCors, publicApplicationRoutes);
app.use('/api', notFoundHandler);

app.use(express.static(webDistDir, { index: false, maxAge: env.isProduction ? '1h' : 0 }));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (!existsSync(webIndex)) {
    return res.status(503).send('Web application is not built. Run npm run build first.');
  }
  return res.sendFile(webIndex);
});

app.use(errorHandler);

export default app;
