import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultTradeInConfig, normalizeTradeInConfig } from '../src/modules/trade-in/trade-in.defaults.js';
import { submissionForm, visibleTradeInFields } from '../src/modules/trade-in/trade-in.service.js';

function graphField(id, key) {
  return {
    id,
    key,
    label: key,
    type: 'text',
    placeholder: '',
    helpText: '',
    required: false,
    width: 'full',
    showInSummary: true,
    systemFieldType: null,
    condition: { fieldKey: '', operator: 'equals', value: '' },
    options: []
  };
}

test('legacy Trade-in steps are converted to the current graph version', () => {
  const config = normalizeTradeInConfig(defaultTradeInConfig);

  assert.equal(config.version, 3);
  assert.equal(config.form.graph.nodes.filter((node) => node.type === 'start').length, 1);
  assert.ok(config.form.graph.nodes.some((node) => node.type === 'condition'));
  assert.ok(config.form.graph.nodes.some((node) => node.type === 'finish'));
  assert.ok(config.form.graph.edges.every((edge) => edge.source && edge.target && edge.sourceHandle));
});

test('graph traversal exposes fields only from the selected condition branch', () => {
  const config = normalizeTradeInConfig({
    form: {
      ...defaultTradeInConfig.form,
      graph: {
        nodes: [
          { id: 'start', type: 'start', position: { x: 0, y: 0 }, title: 'Start' },
          {
            id: 'category',
            type: 'fields',
            position: { x: 300, y: 0 },
            title: 'Category',
            fields: [graphField('category-field', 'category')]
          },
          {
            id: 'condition',
            type: 'condition',
            position: { x: 600, y: 0 },
            title: 'Condition',
            branches: [{
              id: 'apple',
              label: 'Apple',
              condition: { fieldKey: 'category', operator: 'equals', value: 'apple' }
            }],
            defaultBranchLabel: 'Other'
          },
          {
            id: 'apple-fields',
            type: 'fields',
            position: { x: 900, y: -100 },
            title: 'Apple',
            fields: [graphField('apple-field', 'apple_model')]
          },
          {
            id: 'other-fields',
            type: 'fields',
            position: { x: 900, y: 100 },
            title: 'Other',
            fields: [graphField('other-field', 'other_model')]
          },
          { id: 'finish', type: 'finish', position: { x: 1200, y: 0 }, title: 'Finish' }
        ],
        edges: [
          { id: '1', source: 'start', target: 'category', sourceHandle: 'next' },
          { id: '2', source: 'category', target: 'condition', sourceHandle: 'next' },
          { id: '3', source: 'condition', target: 'apple-fields', sourceHandle: 'apple' },
          { id: '4', source: 'condition', target: 'other-fields', sourceHandle: 'default' },
          { id: '5', source: 'apple-fields', target: 'finish', sourceHandle: 'next' },
          { id: '6', source: 'other-fields', target: 'finish', sourceHandle: 'next' }
        ]
      }
    }
  });

  assert.deepEqual(
    visibleTradeInFields(config, { category: 'apple' }).map((field) => field.key),
    ['category', 'apple_model']
  );
  assert.deepEqual(
    visibleTradeInFields(config, { category: 'samsung' }).map((field) => field.key),
    ['category', 'other_model']
  );

  const form = submissionForm(
    { publicId: 'legacy-public-id', publishedConfig: config },
    { category: 'apple' },
    { id: 'workflow-form-id', public_id: 'workflow-public-id', name: 'Trade-in форма' }
  );
  assert.equal(form.id, 'workflow-form-id');
  assert.equal(form.publicId, 'workflow-public-id');
  assert.equal(form.name, 'Trade-in форма');
  assert.deepEqual(
    form.fields.map((field) => [field.key, field.stepTitle, field.stepSortOrder]),
    [
      ['category', 'Category', 0],
      ['apple_model', 'Apple', 1]
    ]
  );
});
