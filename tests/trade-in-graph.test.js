import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultTradeInConfig, normalizeTradeInConfig } from '../src/modules/trade-in/trade-in.defaults.js';
import { submissionForm, visibleTradeInFields } from '../src/modules/trade-in/trade-in.service.js';

function graphField(id, key, showInSummary = true) {
  return {
    id,
    key,
    label: key,
    type: 'text',
    placeholder: '',
    helpText: '',
    required: false,
    width: 'full',
    showInSummary,
    systemFieldType: null,
    condition: { fieldKey: '', operator: 'equals', value: '' },
    options: []
  };
}

test('legacy Trade-in steps are converted to the current graph version', () => {
  const config = normalizeTradeInConfig(defaultTradeInConfig);

  assert.equal(config.version, 5);
  assert.equal(config.form.graph.nodes.filter((node) => node.type === 'start').length, 1);
  assert.ok(config.form.graph.nodes.some((node) => node.type === 'condition'));
  assert.ok(config.form.graph.nodes.some((node) => node.type === 'finish'));
  assert.ok(config.form.graph.edges.every((edge) => edge.source && edge.target && edge.sourceHandle));
});

test('graph normalization keeps converging inputs and one path per output', () => {
  const config = normalizeTradeInConfig({
    form: {
      ...defaultTradeInConfig.form,
      graph: {
        nodes: [
          { id: 'start', type: 'start', position: { x: 0, y: 0 }, title: 'Start' },
          { id: 'left', type: 'fields', position: { x: 300, y: -100 }, title: 'Left' },
          { id: 'right', type: 'fields', position: { x: 300, y: 100 }, title: 'Right' },
          { id: 'merge', type: 'information', position: { x: 600, y: 0 }, title: 'Merge' },
          { id: 'finish', type: 'finish', position: { x: 900, y: 0 }, title: 'Finish' }
        ],
        edges: [
          { id: 'start-left', source: 'start', target: 'left', sourceHandle: 'next' },
          { id: 'start-right', source: 'start', target: 'right', sourceHandle: 'next' },
          { id: 'left-merge', source: 'left', target: 'merge', sourceHandle: 'next' },
          { id: 'right-merge', source: 'right', target: 'merge', sourceHandle: 'next' },
          { id: 'merge-finish', source: 'merge', target: 'finish', sourceHandle: 'next' }
        ]
      }
    }
  });

  assert.deepEqual(
    config.form.graph.edges.map((edge) => edge.id),
    ['start-right', 'left-merge', 'right-merge', 'merge-finish']
  );
  assert.equal(config.form.graph.edges.filter((edge) => edge.target === 'merge').length, 2);
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
            fields: [graphField('apple-field', 'apple_model', false)]
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
    form.fields.map((field) => [field.key, field.stepTitle, field.stepSortOrder, field.showInSummary]),
    [
      ['category', 'Category', 0, true],
      ['apple_model', 'Apple', 1, false]
    ]
  );
});

test('graph traversal supports normalized compound branch conditions', () => {
  const config = normalizeTradeInConfig({
    form: {
      ...defaultTradeInConfig.form,
      graph: {
        nodes: [
          { id: 'start', type: 'start', position: { x: 0, y: 0 }, title: 'Start' },
          {
            id: 'device',
            type: 'fields',
            position: { x: 300, y: 0 },
            title: 'Device',
            fields: [
              graphField('category-field', 'category'),
              graphField('battery-field', 'battery')
            ]
          },
          {
            id: 'condition',
            type: 'condition',
            position: { x: 600, y: 0 },
            title: 'Condition',
            branches: [{
              id: 'valuable',
              label: 'Valuable',
              conditionGroup: {
                combinator: 'all',
                conditions: [
                  { fieldKey: 'category', operator: 'equals', value: 'apple' },
                  { fieldKey: 'battery', operator: 'greater_or_equal', value: '85' }
                ]
              }
            }],
            defaultBranchLabel: 'Other'
          },
          {
            id: 'valuable-fields',
            type: 'fields',
            position: { x: 900, y: -100 },
            title: 'Valuable',
            fields: [graphField('offer-field', 'special_offer')]
          },
          {
            id: 'other-fields',
            type: 'fields',
            position: { x: 900, y: 100 },
            title: 'Other',
            fields: [graphField('other-field', 'regular_offer')]
          },
          { id: 'finish', type: 'finish', position: { x: 1200, y: 0 }, title: 'Finish' }
        ],
        edges: [
          { id: '1', source: 'start', target: 'device', sourceHandle: 'next' },
          { id: '2', source: 'device', target: 'condition', sourceHandle: 'next' },
          { id: '3', source: 'condition', target: 'valuable-fields', sourceHandle: 'valuable' },
          { id: '4', source: 'condition', target: 'other-fields', sourceHandle: 'default' },
          { id: '5', source: 'valuable-fields', target: 'finish', sourceHandle: 'next' },
          { id: '6', source: 'other-fields', target: 'finish', sourceHandle: 'next' }
        ]
      }
    }
  });

  const branch = config.form.graph.nodes.find((node) => node.id === 'condition').branches[0];
  assert.equal(branch.conditionGroup.combinator, 'all');
  assert.equal(branch.conditionGroup.conditions.length, 2);
  assert.deepEqual(
    visibleTradeInFields(config, { category: 'apple', battery: '90' }).map((field) => field.key),
    ['category', 'battery', 'special_offer']
  );
  assert.deepEqual(
    visibleTradeInFields(config, { category: 'apple', battery: '70' }).map((field) => field.key),
    ['category', 'battery', 'regular_offer']
  );
});
