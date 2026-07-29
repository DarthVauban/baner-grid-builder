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
  if (config.form.graph?.nodes?.length) {
    const graph = config.form.graph;
    const fields = [];
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const outgoing = new Map();
    for (const edge of graph.edges) {
      outgoing.set(`${edge.source}:${edge.sourceHandle || 'next'}`, edge.target);
    }
    let node = graph.nodes.find((item) => item.type === 'start') || null;
    const visited = new Set();
    while (node && !visited.has(node.id) && visited.size <= graph.nodes.length) {
      visited.add(node.id);
      if (node.type === 'fields') {
        for (const field of node.fields) {
          if (matchesTradeInCondition(field.condition, answers)) fields.push(field);
        }
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
    return fields;
  }

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
