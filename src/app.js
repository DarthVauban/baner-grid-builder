import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
import { catalogMediaDir } from './modules/catalog/catalog.media.js';
import { catalogToolId, loadPreviewProduct, loadPublicProduct } from './modules/catalog/catalog.service.js';
import {
  isAllowedStandaloneStorefrontRequest,
  isStandaloneStorefrontRequest,
  standaloneStorefrontProductPath
} from './modules/catalog/storefront.domain.js';
import { injectStorefrontProductSeo } from './modules/catalog/storefront.seo.js';
import { env } from './config/env.js';
import { query } from './db/pool.js';
import { asyncHandler } from './lib/async-handler.js';
import { requireAuth } from './middleware/auth.js';
import { requireToolAccess } from './modules/access/access.service.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const webDistDir = path.resolve(currentDir, '../dist/web');
const webIndex = path.join(webDistDir, 'index.html');
const storefrontIndex = path.join(webDistDir, 'storefront.html');
const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-MT-Build-Sha', env.APP_BUILD_SHA);
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // CodeMirror builds its scoped base theme and syntax highlighting in a
      // runtime <style> element. Keep scripts restricted to self, but allow
      // the editor (and the app's existing React style attributes) to render.
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
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

app.use((req, res, next) => {
  req.isStandaloneStorefront = isStandaloneStorefrontRequest(req, env.STOREFRONT_ORIGIN);
  if (!req.isStandaloneStorefront || isAllowedStandaloneStorefrontRequest(req)) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ресурс не знайдено.' } });
  }
  return res.status(404).type('text').send('Not found');
});

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
  res.json({ data: { status: 'ok', buildSha: env.APP_BUILD_SHA } });
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

app.use('/media/catalog', express.static(catalogMediaDir, {
  index: false,
  immutable: true,
  maxAge: env.isProduction ? '30d' : 0
}));
app.use(express.static(webDistDir, { index: false, maxAge: env.isProduction ? '1h' : 0 }));

function sendBuiltHtml(res, file, label) {
  if (!existsSync(file)) {
    return res.status(503).send(`${label} is not built. Run npm run build first.`);
  }
  return res.sendFile(file);
}

function requestOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  if (!host) return '';
  try {
    return new URL(`${forwardedProto}://${host}`).origin;
  } catch {
    return '';
  }
}

async function sendStorefrontProductHtml(req, res, { preview = false } = {}) {
  if (!existsSync(storefrontIndex)) {
    return res.status(503).send('Storefront is not built. Run npm run build first.');
  }
  const product = preview
    ? await loadPreviewProduct(req.params.slug)
    : await loadPublicProduct(req.params.slug);
  if (!product) return sendBuiltHtml(res, storefrontIndex, preview ? 'Storefront preview' : 'Storefront');
  const seoProduct = req.isStandaloneStorefront
    ? { ...product, publicPath: standaloneStorefrontProductPath(product.slug) }
    : product;
  const html = await readFile(storefrontIndex, 'utf8');
  res.setHeader('Cache-Control', preview ? 'no-store' : 'no-cache');
  return res.type('html').send(injectStorefrontProductSeo(html, seoProduct, {
    origin: requestOrigin(req),
    preview
  }));
}

app.get('/catalog/preview/storefront/smartphones/:slug', requireAuth, requireToolAccess(catalogToolId), asyncHandler(async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  await sendStorefrontProductHtml(req, res, { preview: true });
}));

app.get(/^\/catalog\/preview\/storefront(?:\/.*)?$/, requireAuth, requireToolAccess(catalogToolId), (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  return sendBuiltHtml(res, storefrontIndex, 'Storefront preview');
});

app.get('/smartphones/:slug', asyncHandler(async (req, res, next) => {
  if (!req.isStandaloneStorefront) return next();
  await sendStorefrontProductHtml(req, res);
}));

app.get('/', (req, res, next) => {
  if (!req.isStandaloneStorefront) return next();
  return sendBuiltHtml(res, storefrontIndex, 'Storefront');
});

app.get('/storefront', (req, res, next) => {
  if (!req.isStandaloneStorefront) return next();
  return res.redirect(308, '/');
});

app.get('/storefront/smartphones/:slug', (req, res, next) => {
  if (!req.isStandaloneStorefront) return next();
  return res.redirect(308, standaloneStorefrontProductPath(req.params.slug));
});

app.get('/storefront/smartphones/:slug', asyncHandler(async (req, res) => {
  await sendStorefrontProductHtml(req, res);
}));

app.get(/^\/storefront(?:\/.*)?$/, (req, res) => sendBuiltHtml(res, storefrontIndex, 'Storefront'));

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  return sendBuiltHtml(res, webIndex, 'Web application');
});

app.use(errorHandler);

export default app;
