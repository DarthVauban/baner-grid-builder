import express from 'express';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../../../src/db/pool.js';
import { encryptHoroshopCredentials } from '../../../src/modules/search/horoshop/credential-cipher.js';
import { horoshopFeedService } from '../../../src/modules/search/horoshop/feeds.service.js';
import { HoroshopClient } from '../../../src/modules/search/horoshop/horoshop.client.js';

// The browser talks to real Express routes and PostgreSQL queries. Only the
// external Horoshop transport is replaced, including its documented envelope.
export function createFeedFixtureApplication(app) {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.ok(process.env.DATABASE_URL.startsWith('pg-mem://'));
  const wrapper = express();
  let remote = [];
  let mode = 'normal';
  let exportCalls = 0;
  let imports = [];
  const originalFactory = horoshopFeedService.clientFactory;
  const response = (data) => new Response(JSON.stringify({ status: 'OK', response: data }), {
    headers: { 'content-type': 'application/json' }
  });
  const exportMarketplaces = (value) => value.split(';').filter(Boolean)
    .map((name) => ({ id: name === 'Facebook Feed' ? 4 : name === 'Google Feed for Merchant Center' ? 1 : 7, value: name }));
  horoshopFeedService.clientFactory = () => new HoroshopClient('feeds-fixture.example.com', {
    fetchImplementation: async (url, init) => {
      const body = JSON.parse(init.body);
      if (url.pathname.endsWith('/auth/')) return response({ token: 'fixture-token' });
      if (url.pathname.endsWith('/catalog/export/')) {
        exportCalls += 1;
        assert.deepEqual(body.includedParams, ['export_to_marketplace']);
        const products = remote.slice(body.offset, body.offset + body.limit).map((offer) => {
          const result = { parent_article: offer.parent_article, article: offer.article };
          // Actual connected-store response: [{ id: 4, value: 'Facebook Feed' }].
          if (mode !== 'missing') result.export_to_marketplace = exportMarketplaces(offer.export_to_marketplace);
          return result;
        });
        return response({ products, total: remote.length });
      }
      assert.ok(url.pathname.endsWith('/catalog/import/'));
      imports.push(structuredClone(body.products));
      for (const update of body.products) {
        assert.deepEqual(Object.keys(update).sort(), ['article', 'export_to_marketplace']);
        const offer = remote.find((item) => item.article === update.article);
        assert.ok(offer);
        if (mode !== 'unconfirmed') offer.export_to_marketplace = update.export_to_marketplace;
      }
      return response({ imported: body.products.length });
    }
  });

  wrapper.use('/__e2e/horoshop-feeds', express.json());
  wrapper.post('/__e2e/horoshop-feeds/reset', async (req, res, next) => {
    try {
      assert.equal(horoshopFeedService.running, false);
      await pool.query('DELETE FROM search_horoshop_connections');
      remote = []; exportCalls = 0; imports = []; mode = req.body.mode || 'normal';
      const connection = randomUUID(); const generation = randomUUID(); const run = randomUUID();
      await pool.query(`INSERT INTO search_horoshop_connections
        (id, generation, store_domain, encrypted_credentials, status, last_sync_at)
        VALUES ($1, $2, 'feeds-fixture.example.com', $3, 'connected', NOW())`,
      [connection, generation, encryptHoroshopCredentials({ login: 'fixture', password: 'fixture' })]);
      const productIds = [];
      for (let index = 1; index <= 27; index += 1) {
        const id = randomUUID(); const sku = `FEED-${String(index).padStart(3, '0')}`;
        productIds.push(id);
        await pool.query(`INSERT INTO search_horoshop_products
          (id, connection_id, generation, external_id, sku, titles, brand, availability, source_data, last_seen_sync_id)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'В наявності', $8::jsonb, $9)`,
        [id, connection, generation, String(index), sku, JSON.stringify({ uk: `Товар фідів ${index}` }),
          index % 2 ? 'Apple' : 'Samsung', JSON.stringify({ article: sku }), run]);
        const offers = index === 1 ? [`${sku}-BLACK`, `${sku}-WHITE`] : [sku];
        for (const article of offers) {
          let marketplaces = 'Facebook Feed;Rozetka Feed';
          if (req.body.withFeedStatuses) {
            if (index === 1 && article.endsWith('-BLACK')) marketplaces += ';Google Feed for Merchant Center';
            if (index === 2) marketplaces = '';
            if (index === 3) marketplaces = 'Google Feed for Merchant Center';
          }
          remote.push({ parent_article: sku, article, export_to_marketplace: marketplaces });
          const source = { article, ...(req.body.withFeedStatuses
            ? { export_to_marketplace: index === 4 ? null : exportMarketplaces(marketplaces) } : {}) };
          await pool.query(`INSERT INTO search_horoshop_modifications
            (connection_id, generation, product_id, external_id, sku, titles, source_data, last_seen_sync_id)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
          [connection, generation, id, `${index}:${article}`, article, JSON.stringify({ uk: article }), JSON.stringify(source), run]);
        }
      }
      res.json({ productIds });
    } catch (error) { next(error); }
  });
  wrapper.get('/__e2e/horoshop-feeds/state', (_req, res) => res.json({ exports: exportCalls, imports, remote }));
  wrapper.post('/__e2e/horoshop-feeds/clear', async (_req, res, next) => {
    try {
      if (horoshopFeedService.running) {
        for (let count = 0; count < 100 && horoshopFeedService.running; count += 1) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(horoshopFeedService.running, false);
      await pool.query('DELETE FROM search_horoshop_connections'); res.json({ cleared: true });
    } catch (error) { next(error); }
  });
  wrapper.use(app);
  return { app: wrapper, restore: () => { horoshopFeedService.clientFactory = originalFactory; } };
}
