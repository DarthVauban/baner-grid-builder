import { pool, query } from '../../db/pool.js';
import { defaultTradeInConfig, matchesTradeInCondition, normalizeTradeInConfig } from './trade-in.defaults.js';

export const tradeInToolId = 'trade_in';

export async function loadTradeInSettings(db = { query }) {
  const result = await db.query(
    `SELECT public_id, status, public_origin, draft_config, published_config,
            updated_at, published_at
     FROM trade_in_settings
     WHERE id = TRUE`
  );
  const row = result.rows[0] || {};
  const hasDraft = row.draft_config && Object.keys(row.draft_config).length > 0;
  return {
    publicId: row.public_id || '',
    status: row.status || 'draft',
    publicOrigin: row.public_origin || '',
    draftConfig: normalizeTradeInConfig(hasDraft ? row.draft_config : defaultTradeInConfig),
    publishedConfig: row.published_config ? normalizeTradeInConfig(row.published_config) : null,
    updatedAt: row.updated_at || null,
    publishedAt: row.published_at || null
  };
}

export async function ensureTradeInWorkflowForm(createdBy = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const settingsResult = await client.query(
      `SELECT status, draft_config, published_config
       FROM trade_in_settings
       WHERE id = TRUE
       FOR UPDATE`
    );
    const row = settingsResult.rows[0] || {};
    const draftConfig = normalizeTradeInConfig(
      row.draft_config && Object.keys(row.draft_config).length ? row.draft_config : defaultTradeInConfig
    );
    const previousDraftReference = { ...draftConfig.formReference };
    let form = null;
    if (draftConfig.formReference.formId) {
      const existing = await client.query(
        `SELECT *
         FROM application_forms
         WHERE id = $1 AND form_type = 'workflow' AND status <> 'archived'`,
        [draftConfig.formReference.formId]
      );
      form = existing.rows[0] || null;
    }

    if (!form) {
      const created = await client.query(
        `INSERT INTO application_forms (
           created_by, form_type, name, title, description, button_text,
           success_message, status, workflow_definition
         ) VALUES ($1, 'workflow', $2, $3, $4, $5, $6, $7, $8::JSONB)
         RETURNING *`,
        [
          createdBy,
          'Trade-in — основна форма',
          draftConfig.form.title,
          draftConfig.form.description,
          draftConfig.form.submitLabel,
          draftConfig.form.successText,
          'published',
          JSON.stringify(draftConfig.form)
        ]
      );
      form = created.rows[0];
    }

    const reference = { formId: form.id, formName: form.name };
    draftConfig.formReference = reference;
    const publishedConfig = row.published_config
      ? normalizeTradeInConfig(row.published_config)
      : null;
    const previousPublishedReference = publishedConfig ? { ...publishedConfig.formReference } : null;
    if (publishedConfig) publishedConfig.formReference = reference;
    const referenceChanged = previousDraftReference.formId !== reference.formId
      || previousDraftReference.formName !== reference.formName
      || (previousPublishedReference && (
        previousPublishedReference.formId !== reference.formId
        || previousPublishedReference.formName !== reference.formName
      ));
    if (referenceChanged) {
      await client.query(
        `UPDATE trade_in_settings
         SET draft_config = $1::JSONB,
             published_config = $2::JSONB,
             updated_at = NOW()
         WHERE id = TRUE`,
        [JSON.stringify(draftConfig), publishedConfig ? JSON.stringify(publishedConfig) : null]
      );
    }
    await client.query('COMMIT');
    return form;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function hydrateTradeInWorkflow(config, { publishedOnly = false, db = { query } } = {}) {
  const normalized = normalizeTradeInConfig(config);
  if (!normalized.formReference.formId) return { config: normalized, form: null };
  const params = [normalized.formReference.formId];
  const result = await db.query(
    `SELECT *
     FROM application_forms
     WHERE id = $1
       AND form_type = 'workflow'
       AND status <> 'archived'
       ${publishedOnly ? "AND status = 'published'" : ''}`,
    params
  );
  const form = result.rows[0] || null;
  if (!form) return { config: normalized, form: null };
  normalized.form = normalizeTradeInConfig({ form: form.workflow_definition || {} }).form;
  normalized.formReference = { formId: form.id, formName: form.name };
  return { config: normalized, form };
}

export function visibleTradeInFieldEntries(config, answers) {
  if (config.form.graph?.nodes?.length) {
    const graph = config.form.graph;
    const entries = [];
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const outgoing = new Map();
    for (const edge of graph.edges) {
      outgoing.set(`${edge.source}:${edge.sourceHandle || 'next'}`, edge.target);
    }
    let node = graph.nodes.find((item) => item.type === 'start') || null;
    const visited = new Set();
    let stepSortOrder = 0;
    while (node && !visited.has(node.id) && visited.size <= graph.nodes.length) {
      visited.add(node.id);
      if (node.type === 'fields') {
        for (const field of node.fields) {
          if (matchesTradeInCondition(field.condition, answers)) {
            entries.push({
              field,
              stepId: node.id,
              stepTitle: node.title,
              stepDescription: node.description,
              stepSortOrder,
              showInApplicationSummary: node.showInApplicationSummary === true
            });
          }
        }
        stepSortOrder += 1;
      }
      if (node.type === 'finish') break;
      let sourceHandle = 'next';
      if (node.type === 'condition') {
        const branch = node.branches.find((item) => (
          item.condition.fieldKey && matchesTradeInCondition(item.condition, answers)
        ));
        sourceHandle = branch?.id || 'default';
      }
      const targetId = outgoing.get(`${node.id}:${sourceHandle}`);
      node = targetId ? nodesById.get(targetId) || null : null;
    }
    return entries;
  }

  const entries = [];
  for (const [stepSortOrder, step] of config.form.steps.entries()) {
    if (!matchesTradeInCondition(step.condition, answers)) continue;
    for (const field of step.fields) {
      if (matchesTradeInCondition(field.condition, answers)) {
        entries.push({
          field,
          stepId: step.id,
          stepTitle: step.title,
          stepDescription: step.description,
          stepSortOrder,
          showInApplicationSummary: step.showInApplicationSummary !== false
        });
      }
    }
  }
  return entries;
}

export function visibleTradeInFields(config, answers) {
  return visibleTradeInFieldEntries(config, answers).map((entry) => entry.field);
}

export function submissionForm(settings, answers, linkedForm = null) {
  const fields = visibleTradeInFieldEntries(settings.publishedConfig, answers).map((entry, index) => ({
    id: null,
    key: entry.field.key,
    label: entry.field.label,
    type: entry.field.type,
    placeholder: entry.field.placeholder || '',
    helpText: entry.field.helpText || '',
    defaultValue: '',
    required: entry.field.required === true,
    active: true,
    system: Boolean(entry.field.systemFieldType),
    systemFieldType: entry.field.systemFieldType || null,
    showInSummary: entry.showInApplicationSummary === true,
    sortOrder: index,
    stepId: entry.stepId,
    stepTitle: entry.stepTitle,
    stepDescription: entry.stepDescription,
    stepSortOrder: entry.stepSortOrder,
    validation: {
      min: entry.field.min ?? undefined,
      max: entry.field.max ?? undefined
    },
    options: (entry.field.options || []).map((item, optionIndex) => ({
      id: null,
      label: item.label,
      value: item.value,
      sortOrder: optionIndex,
      active: true
    }))
  }));
  return {
    id: linkedForm?.id || null,
    publicId: linkedForm?.public_id || settings.publicId,
    name: linkedForm?.name || settings.publishedConfig.formReference.formName || 'Trade-in',
    formType: 'workflow',
    title: settings.publishedConfig.form.title,
    description: settings.publishedConfig.form.description,
    buttonText: settings.publishedConfig.form.submitLabel,
    successMessage: settings.publishedConfig.form.successText,
    status: 'published',
    settings: {},
    styles: {},
    fields,
    banks: []
  };
}
