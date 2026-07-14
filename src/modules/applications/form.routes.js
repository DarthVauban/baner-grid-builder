import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import {
  buildButtonScript,
  buildCompactButtonScript,
  cleanText,
  ensureSystemFields,
  loadFields,
  loadForm,
  normalizeSlug,
  serializeBank,
  serializeButtonConfig,
  serializeForm
} from './application.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess('form_builder'));

const idSchema = z.string().uuid();
const jsonObject = z.record(z.string(), z.unknown()).default({});
const optionSchema = z.object({
  label: z.string().trim().min(1).max(160),
  value: z.string().trim().min(1).max(120).optional(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  active: z.boolean().default(true)
});
const fieldSchema = z.object({
  key: z.string().trim().max(80).optional(),
  label: z.string().trim().min(1).max(160),
  type: z.enum(['text', 'textarea', 'select', 'radio', 'checkbox', 'email', 'phone', 'number']),
  placeholder: z.string().trim().max(180).default(''),
  helpText: z.string().trim().max(240).default(''),
  defaultValue: z.string().trim().max(1000).default(''),
  required: z.boolean().default(false),
  active: z.boolean().default(true),
  system: z.boolean().default(false),
  systemFieldType: z.enum(['first_name', 'last_name', 'phone', 'bank']).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).default(100),
  validation: jsonObject,
  options: z.array(optionSchema).max(40).default([])
});
const formSchema = z.object({
  name: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(220),
  description: z.string().trim().max(5000).default(''),
  buttonText: z.string().trim().min(1).max(120),
  successMessage: z.string().trim().min(1).max(240),
  settings: jsonObject,
  styles: jsonObject,
  fields: z.array(fieldSchema).max(60).optional()
});
const bankSchema = z.object({
  label: z.string().trim().min(1).max(160),
  value: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0)
});
const buttonSchema = z.object({
  name: z.string().trim().min(1).max(160),
  formId: z.string().uuid(),
  selector: z.string().trim().min(1).max(500),
  insertPosition: z.enum(['start', 'end', 'before', 'after']).default('after'),
  text: z.string().trim().min(1).max(120),
  styles: jsonObject,
  cssClass: z.string().trim().max(120).default(''),
  fullWidth: z.boolean().default(false),
  active: z.boolean().default(true),
  productSelectors: jsonObject
});

function publicOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const candidate = forwardedHost ? `${forwardedProto}://${forwardedHost}` : `${req.protocol}://${req.get('host')}`;
  try { return new URL(candidate).origin; } catch { return ''; }
}

async function replaceEditableFields(db, formId, fields = []) {
  await ensureSystemFields(db, formId);
  const seenKeys = new Set(['first_name', 'last_name', 'phone', 'bank']);

  for (const field of fields.filter((item) => item.system && item.systemFieldType)) {
    const type = field.systemFieldType === 'bank' ? 'select' : field.systemFieldType === 'phone' ? 'phone' : 'text';
    await db.query(
      `UPDATE application_form_fields
       SET label = $1, type = $2, placeholder = $3, help_text = $4,
           required = TRUE, active = TRUE, updated_at = NOW()
       WHERE form_id = $5 AND system_field_type = $6`,
      [
        field.label,
        type,
        field.placeholder,
        field.helpText,
        formId,
        field.systemFieldType
      ]
    );
  }

  await db.query(
    `DELETE FROM application_form_fields
     WHERE form_id = $1 AND system = FALSE`,
    [formId]
  );

  for (const [index, field] of fields.filter((item) => !item.system).entries()) {
    let key = normalizeSlug(field.key || field.label, `field_${index + 1}`);
    while (seenKeys.has(key)) key = `${key}_${randomSuffix()}`;
    seenKeys.add(key);
    const inserted = await db.query(
      `INSERT INTO application_form_fields (
         form_id, key, label, type, placeholder, help_text, default_value,
         required, active, system, system_field_type, sort_order, validation
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, NULL, $10, $11::JSONB)
       RETURNING id`,
      [
        formId,
        key,
        field.label,
        field.type,
        field.placeholder,
        field.helpText,
        field.defaultValue,
        field.required,
        field.active,
        field.sortOrder || 100 + index,
        JSON.stringify(field.validation || {})
      ]
    );
    const fieldId = inserted.rows[0].id;
    if (['select', 'radio', 'checkbox'].includes(field.type)) {
      for (const [optionIndex, option] of field.options.entries()) {
        await db.query(
          `INSERT INTO application_form_field_options (
             field_id, label, value, sort_order, active
           ) VALUES ($1, $2, $3, $4, $5)`,
          [
            fieldId,
            option.label,
            option.value || normalizeSlug(option.label, `option_${optionIndex + 1}`),
            option.sortOrder || optionIndex,
            option.active
          ]
        );
      }
    }
  }
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 7);
}

router.get('/banks', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT *
     FROM application_banks
     ORDER BY sort_order, lower(label)`
  );
  res.json({ data: result.rows.map(serializeBank) });
}));

router.post('/banks', asyncHandler(async (req, res) => {
  const input = parseInput(bankSchema, req.body);
  const value = input.value || normalizeSlug(input.label, 'bank');
  const result = await query(
    `INSERT INTO application_banks (label, value, active, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.label, value, input.active, input.sortOrder]
  );
  res.status(201).json({ data: serializeBank(result.rows[0]) });
}));

router.patch('/banks/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(bankSchema.partial(), req.body);
  const current = await query('SELECT * FROM application_banks WHERE id = $1', [id]);
  if (!current.rows[0]) throw new AppError(404, 'BANK_NOT_FOUND', 'Банк не знайдено.');
  const result = await query(
    `UPDATE application_banks
     SET label = $1, value = $2, active = $3, sort_order = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [
      input.label ?? current.rows[0].label,
      input.value ?? current.rows[0].value,
      input.active ?? current.rows[0].active,
      input.sortOrder ?? current.rows[0].sort_order,
      id
    ]
  );
  res.json({ data: serializeBank(result.rows[0]) });
}));

router.delete('/banks/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query('DELETE FROM application_banks WHERE id = $1', [id]);
  if (!result.rowCount) throw new AppError(404, 'BANK_NOT_FOUND', 'Банк не знайдено.');
  res.status(204).end();
}));

router.get('/', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT *
     FROM application_forms
     WHERE status <> 'archived'
     ORDER BY updated_at DESC`
  );
  const forms = await Promise.all(result.rows.map(async (row) => serializeForm(row, await loadFields(row.id))));
  res.json({ data: forms });
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = parseInput(formSchema.omit({ fields: true }), req.body);
  const client = await pool.connect();
  let formId;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO application_forms (
         created_by, name, title, description, button_text, success_message, settings, styles
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB, $8::JSONB)
       RETURNING id`,
      [
        req.user.id,
        input.name,
        input.title,
        input.description,
        input.buttonText,
        input.successMessage,
        JSON.stringify(input.settings || {}),
        JSON.stringify(input.styles || {})
      ]
    );
    formId = result.rows[0].id;
    await ensureSystemFields(client, formId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  res.status(201).json({ data: await loadForm(formId) });
}));

router.get('/buttons/list', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT config.*, form.public_id AS form_public_id
     FROM application_button_configurations AS config
     JOIN application_forms AS form ON form.id = config.form_id
     WHERE config.archived_at IS NULL
     ORDER BY config.updated_at DESC`
  );
  res.json({ data: result.rows.map(serializeButtonConfig) });
}));

router.post('/buttons', asyncHandler(async (req, res) => {
  const input = parseInput(buttonSchema, req.body);
  const result = await query(
    `INSERT INTO application_button_configurations (
       name, form_id, selector, insert_position, text, styles, css_class,
       full_width, active, product_selectors
     ) VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7, $8, $9, $10::JSONB)
     RETURNING *`,
    [
      input.name,
      input.formId,
      input.selector,
      input.insertPosition,
      input.text,
      JSON.stringify(input.styles || {}),
      input.cssClass,
      input.fullWidth,
      input.active,
      JSON.stringify(input.productSelectors || {})
    ]
  );
  res.status(201).json({ data: serializeButtonConfig(result.rows[0]) });
}));

router.put('/buttons/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(buttonSchema, req.body);
  const result = await query(
    `UPDATE application_button_configurations
     SET name = $1, form_id = $2, selector = $3, insert_position = $4,
         text = $5, styles = $6::JSONB, css_class = $7, full_width = $8,
         active = $9, product_selectors = $10::JSONB, updated_at = NOW()
     WHERE id = $11 AND archived_at IS NULL
     RETURNING *`,
    [
      input.name,
      input.formId,
      input.selector,
      input.insertPosition,
      input.text,
      JSON.stringify(input.styles || {}),
      input.cssClass,
      input.fullWidth,
      input.active,
      JSON.stringify(input.productSelectors || {}),
      id
    ]
  );
  if (!result.rows[0]) throw new AppError(404, 'BUTTON_CONFIG_NOT_FOUND', 'Конфігурацію кнопки не знайдено.');
  res.json({ data: serializeButtonConfig(result.rows[0]) });
}));

router.patch('/buttons/:id/archive', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query(
    `UPDATE application_button_configurations
     SET archived_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [id]
  );
  if (!result.rows[0]) throw new AppError(404, 'BUTTON_CONFIG_NOT_FOUND', 'Конфігурацію кнопки не знайдено.');
  res.status(204).end();
}));

router.get('/buttons/:id/script', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query(
    `SELECT config.*, form.public_id AS form_public_id
     FROM application_button_configurations AS config
     JOIN application_forms AS form ON form.id = config.form_id
     WHERE config.id = $1 AND config.archived_at IS NULL`,
    [id]
  );
  const config = result.rows[0];
  if (!config) throw new AppError(404, 'BUTTON_CONFIG_NOT_FOUND', 'Конфігурацію кнопки не знайдено.');
  res.json({ data: {
    script: buildButtonScript(config, publicOrigin(req)),
    compactScript: buildCompactButtonScript(config, publicOrigin(req))
  } });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const form = await loadForm(id);
  if (!form) throw new AppError(404, 'FORM_NOT_FOUND', 'Форму не знайдено.');
  res.json({ data: form });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(formSchema, req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `UPDATE application_forms
       SET name = $1, title = $2, description = $3, button_text = $4,
           success_message = $5, settings = $6::JSONB, styles = $7::JSONB,
           updated_at = NOW()
       WHERE id = $8 AND status <> 'archived'
       RETURNING id`,
      [
        input.name,
        input.title,
        input.description,
        input.buttonText,
        input.successMessage,
        JSON.stringify(input.settings || {}),
        JSON.stringify(input.styles || {}),
        id
      ]
    );
    if (!existing.rows[0]) throw new AppError(404, 'FORM_NOT_FOUND', 'Форму не знайдено.');
    if (input.fields) await replaceEditableFields(client, id, input.fields);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
  res.json({ data: await loadForm(id) });
}));

router.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const client = await pool.connect();
  let formId;
  try {
    await client.query('BEGIN');
    const source = await client.query('SELECT * FROM application_forms WHERE id = $1 AND status <> $2', [id, 'archived']);
    const form = source.rows[0];
    if (!form) throw new AppError(404, 'FORM_NOT_FOUND', 'Форму не знайдено.');
    const created = await client.query(
      `INSERT INTO application_forms (
         created_by, name, title, description, button_text, success_message, settings, styles
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB, $8::JSONB)
       RETURNING id`,
      [
        req.user.id,
        `${form.name} копія`,
        form.title,
        form.description,
        form.button_text,
        form.success_message,
        JSON.stringify(form.settings || {}),
        JSON.stringify(form.styles || {})
      ]
    );
    formId = created.rows[0].id;
    const fields = await client.query(
      `SELECT *
       FROM application_form_fields
       WHERE form_id = $1
       ORDER BY sort_order`,
      [id]
    );
    for (const field of fields.rows) {
      const copied = await client.query(
        `INSERT INTO application_form_fields (
           form_id, key, label, type, placeholder, help_text, default_value,
           required, active, system, system_field_type, sort_order, validation
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::JSONB)
         RETURNING id`,
        [
          formId,
          field.key,
          field.label,
          field.type,
          field.placeholder,
          field.help_text,
          field.default_value,
          field.required,
          field.active,
          field.system,
          field.system_field_type,
          field.sort_order,
          JSON.stringify(field.validation || {})
        ]
      );
      const options = await client.query(
        'SELECT * FROM application_form_field_options WHERE field_id = $1 ORDER BY sort_order',
        [field.id]
      );
      for (const option of options.rows) {
        await client.query(
          `INSERT INTO application_form_field_options (field_id, label, value, sort_order, active)
           VALUES ($1, $2, $3, $4, $5)`,
          [copied.rows[0].id, option.label, option.value, option.sort_order, option.active]
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
  res.status(201).json({ data: await loadForm(formId) });
}));

router.patch('/:id/publish', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const activeBanks = await query('SELECT COUNT(*)::INTEGER AS count FROM application_banks WHERE active = TRUE');
  if ((activeBanks.rows[0]?.count || 0) < 1) {
    throw new AppError(422, 'ACTIVE_BANK_REQUIRED', 'Додайте хоча б один активний банк перед публікацією форми.');
  }
  await ensureSystemFields({ query }, id);
  const result = await query(
    `UPDATE application_forms
     SET status = 'published', updated_at = NOW()
     WHERE id = $1 AND status <> 'archived'
     RETURNING id`,
    [id]
  );
  if (!result.rows[0]) throw new AppError(404, 'FORM_NOT_FOUND', 'Форму не знайдено.');
  res.json({ data: await loadForm(id) });
}));

router.patch('/:id/disable', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query(
    `UPDATE application_forms
     SET status = 'disabled', updated_at = NOW()
     WHERE id = $1 AND status <> 'archived'
     RETURNING id`,
    [id]
  );
  if (!result.rows[0]) throw new AppError(404, 'FORM_NOT_FOUND', 'Форму не знайдено.');
  res.json({ data: await loadForm(id) });
}));

router.patch('/:id/archive', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query(
    `UPDATE application_forms
     SET status = 'archived', archived_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [id]
  );
  if (!result.rows[0]) throw new AppError(404, 'FORM_NOT_FOUND', 'Форму не знайдено.');
  res.status(204).end();
}));

export default router;
