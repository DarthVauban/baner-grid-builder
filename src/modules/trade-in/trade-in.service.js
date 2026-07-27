import { query } from '../../db/pool.js';
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

export function visibleTradeInFields(config, answers) {
  const fields = [];
  for (const step of config.form.steps) {
    if (!matchesTradeInCondition(step.condition, answers)) continue;
    for (const field of step.fields) {
      if (matchesTradeInCondition(field.condition, answers)) fields.push(field);
    }
  }
  return fields;
}

export function submissionForm(settings, answers) {
  const fields = visibleTradeInFields(settings.publishedConfig, answers).map((field, index) => ({
    id: null,
    key: field.key,
    label: field.label,
    type: field.type,
    placeholder: field.placeholder || '',
    helpText: field.helpText || '',
    defaultValue: '',
    required: field.required === true,
    active: true,
    system: Boolean(field.systemFieldType),
    systemFieldType: field.systemFieldType || null,
    showInSummary: field.showInSummary === true,
    sortOrder: index,
    validation: {
      min: field.min ?? undefined,
      max: field.max ?? undefined
    },
    options: (field.options || []).map((item, optionIndex) => ({
      id: null,
      label: item.label,
      value: item.value,
      sortOrder: optionIndex,
      active: true
    }))
  }));
  return {
    id: null,
    publicId: settings.publicId,
    name: 'Trade-in',
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
