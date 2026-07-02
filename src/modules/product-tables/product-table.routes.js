import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { serializeProductTable } from '../../lib/serializers.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { canViewAllSavedData } from '../access/access.service.js';

const router = Router();
router.use(requireAuth);

const idSchema = z.string().uuid();
const cellSchema = z.string().max(10000);
const tableRowSchema = z.object({
  sourceIndex: z.number().int().nonnegative(),
  values: z.array(cellSchema).min(1).max(200),
  completed: z.boolean().default(false),
  uploaded: z.boolean().default(false)
});
const tableSheetSchema = z.object({
  name: z.string().trim().min(1).max(255),
  headers: z.array(z.string().trim().min(1).max(1000)).min(1).max(200),
  showUploadedStatus: z.boolean().default(false),
  rows: z.array(tableRowSchema).max(20000)
});
const tableDataSchema = z.object({
  activeSheet: z.string().max(255).default(''),
  sheets: z.array(tableSheetSchema).min(1, 'Таблиця повинна містити хоча б один аркуш.').max(50)
});
const productTableSchema = z.object({
  name: z.string().trim().min(1, 'Вкажіть назву таблиці.').max(160),
  fileName: z.string().trim().max(255).default(''),
  data: tableDataSchema
});

function getTableStats(data) {
  return {
    sheetCount: data.sheets.length,
    rowCount: data.sheets.reduce((total, sheet) => total + sheet.rows.length, 0)
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const canViewAll = await canViewAllSavedData(req.user, 'product_tables');
  const ownershipFilter = canViewAll ? 'TRUE' : 'tables.user_id = $1';
  const result = await query(
    `SELECT tables.id, tables.name, tables.file_name, tables.sheet_count, tables.row_count,
            tables.user_id AS owner_id, users.name AS owner_name,
            tables.user_id = $1 AS is_owner,
            tables.created_at, tables.updated_at
     FROM product_tables AS tables
     JOIN users ON users.id = tables.user_id
     WHERE ${ownershipFilter}
       AND ($2 = '' OR tables.name ILIKE '%' || $2 || '%')
     ORDER BY tables.updated_at DESC`,
    [req.user.id, search]
  );
  res.json({ data: result.rows.map((row) => serializeProductTable(row, req.user)) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const canViewAll = await canViewAllSavedData(req.user, 'product_tables');
  const accessFilter = canViewAll ? 'TRUE' : 'tables.user_id = $2';
  const result = await query(
    `SELECT tables.id, tables.name, tables.file_name, tables.data,
            tables.sheet_count, tables.row_count,
            tables.user_id AS owner_id, users.name AS owner_name,
            tables.user_id = $2 AS is_owner,
            tables.created_at, tables.updated_at
     FROM product_tables AS tables
     JOIN users ON users.id = tables.user_id
     WHERE tables.id = $1 AND ${accessFilter}`,
    [id, req.user.id]
  );
  if (!result.rows[0]) throw new AppError(404, 'PRODUCT_TABLE_NOT_FOUND', 'Таблицю не знайдено.');
  res.json({ data: serializeProductTable(result.rows[0], req.user) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = parseInput(productTableSchema, req.body);
  const stats = getTableStats(input.data);
  const result = await query(
    `INSERT INTO product_tables (user_id, name, file_name, data, sheet_count, row_count)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING id, name, file_name, data, sheet_count, row_count, created_at, updated_at`,
    [
      req.user.id,
      input.name,
      input.fileName,
      JSON.stringify(input.data),
      stats.sheetCount,
      stats.rowCount
    ]
  );
  res.status(201).json({ data: serializeProductTable(result.rows[0], req.user) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(productTableSchema, req.body);
  const stats = getTableStats(input.data);
  const result = await query(
    `UPDATE product_tables
     SET name = $1, file_name = $2, data = $3::jsonb,
         sheet_count = $4, row_count = $5, updated_at = NOW()
     WHERE id = $6 AND user_id = $7
     RETURNING id, name, file_name, data, sheet_count, row_count, created_at, updated_at`,
    [
      input.name,
      input.fileName,
      JSON.stringify(input.data),
      stats.sheetCount,
      stats.rowCount,
      id,
      req.user.id
    ]
  );
  if (!result.rows[0]) throw new AppError(404, 'PRODUCT_TABLE_NOT_FOUND', 'Таблицю не знайдено.');
  res.json({ data: serializeProductTable(result.rows[0], req.user) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query(
    'DELETE FROM product_tables WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );
  if (!result.rowCount) throw new AppError(404, 'PRODUCT_TABLE_NOT_FOUND', 'Таблицю не знайдено.');
  res.status(204).end();
}));

export default router;
