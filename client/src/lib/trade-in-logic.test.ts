import { describe, expect, it } from 'vitest';
import {
  buildTradeInDisplayPath,
  canConnectTradeInGraph,
  connectTradeInGraph,
  convertTradeInStepsToGraph,
  createTradeInFormNode,
  findNearestFreeNodePosition,
  validateTradeInLogic
} from './trade-in-logic';
import { emptyTradeInCondition } from './trade-in';
import type { TradeInField, TradeInFormGraph, TradeInFormNode, TradeInStep } from '../types/trade-in';

function field(id: string, key: string, label = key): TradeInField {
  return {
    id,
    key,
    label,
    type: 'text',
    placeholder: '',
    helpText: '',
    required: false,
    width: 'full',
    showInSummary: true,
    systemFieldType: null,
    min: null,
    max: null,
    condition: emptyTradeInCondition(),
    options: []
  };
}

function node(id: string, type: TradeInFormNode['type'], fields: TradeInField[] = []): TradeInFormNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    title: id,
    description: '',
    showInApplicationSummary: type === 'fields',
    fields,
    branches: [],
    defaultBranchLabel: 'Інші випадки'
  };
}

describe('Trade-in graph model', () => {
  it('converts legacy conditional steps into condition nodes with true and default branches', () => {
    const steps: TradeInStep[] = [
      { id: 'category', title: 'Категорія', description: '', condition: emptyTradeInCondition(), fields: [field('category-field', 'category')] },
      {
        id: 'apple',
        title: 'Apple',
        description: '',
        condition: { fieldKey: 'category', operator: 'equals', value: 'apple' },
        fields: [field('model-field', 'model')]
      }
    ];

    const graph = convertTradeInStepsToGraph(steps);
    const condition = graph.nodes.find((item) => item.id === 'condition_apple');
    expect(condition?.type).toBe('condition');
    expect(graph.nodes.find((item) => item.id === 'category')?.showInApplicationSummary).toBe(true);
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: 'condition_apple',
      target: 'apple',
      sourceHandle: 'branch_apple'
    }));
    expect(graph.edges.some((edge) => edge.source === 'condition_apple' && edge.sourceHandle === 'default')).toBe(true);
  });

  it('routes the public path through the first matching condition branch', () => {
    const start = node('start', 'start');
    const category = node('category', 'fields', [field('category-field', 'category')]);
    const condition = {
      ...node('condition', 'condition'),
      branches: [{
        id: 'apple-branch',
        label: 'Apple',
        condition: { fieldKey: 'category', operator: 'equals' as const, value: 'apple' }
      }]
    };
    const apple = node('apple', 'fields');
    const other = node('other', 'information');
    const finish = node('finish', 'finish');
    const graph: TradeInFormGraph = {
      nodes: [start, category, condition, apple, other, finish],
      edges: [
        { id: '1', source: 'start', target: 'category', sourceHandle: 'next' },
        { id: '2', source: 'category', target: 'condition', sourceHandle: 'next' },
        { id: '3', source: 'condition', target: 'apple', sourceHandle: 'apple-branch' },
        { id: '4', source: 'condition', target: 'other', sourceHandle: 'default' },
        { id: '5', source: 'apple', target: 'finish', sourceHandle: 'next' },
        { id: '6', source: 'other', target: 'finish', sourceHandle: 'next' }
      ]
    };

    expect(buildTradeInDisplayPath(graph, { category: 'apple' }).map((item) => item.id)).toEqual(['category', 'apple', 'finish']);
    expect(buildTradeInDisplayPath(graph, { category: 'samsung' }).map((item) => item.id)).toEqual(['category', 'other', 'finish']);
  });

  it('creates new nodes detached and finds the nearest collision-free position', () => {
    const existing = node('existing', 'fields');
    existing.position = { x: 200, y: 200 };
    const position = findNearestFreeNodePosition([existing], { x: 200, y: 200 });
    const created = createTradeInFormNode('fields', position, 1);

    expect(position).not.toEqual(existing.position);
    expect(created.type).toBe('fields');
    expect(created.position).toEqual(position);
    expect(created.showInApplicationSummary).toBe(true);
  });

  it('preserves the application summary setting when converting legacy steps', () => {
    const graph = convertTradeInStepsToGraph([
      {
        id: 'details',
        title: 'Деталі',
        description: '',
        showInApplicationSummary: false,
        condition: emptyTradeInCondition(),
        fields: [field('model-field', 'model')]
      }
    ]);

    expect(graph.nodes.find((item) => item.id === 'details')?.showInApplicationSummary).toBe(false);
  });

  it('blocks connections that would create a cycle', () => {
    const graph: TradeInFormGraph = {
      nodes: [node('start', 'start'), node('one', 'fields'), node('two', 'fields')],
      edges: [
        { id: '1', source: 'start', target: 'one', sourceHandle: 'next' },
        { id: '2', source: 'one', target: 'two', sourceHandle: 'next' }
      ]
    };

    expect(canConnectTradeInGraph(graph, 'two', 'start', 'next')).toBe(false);
    expect(canConnectTradeInGraph(graph, 'two', 'one', 'next')).toBe(false);
  });

  it('allows one output to connect to multiple nodes', () => {
    const graph: TradeInFormGraph = {
      nodes: [node('start', 'start'), node('one', 'fields'), node('two', 'fields')],
      edges: [{ id: '1', source: 'start', target: 'one', sourceHandle: 'next' }]
    };

    expect(canConnectTradeInGraph(graph, 'start', 'two', 'next')).toBe(true);
  });

  it('replaces the previous incoming edge but keeps multiple outgoing edges', () => {
    const graph: TradeInFormGraph = {
      nodes: [node('a', 'fields'), node('b', 'fields'), node('c', 'fields')],
      edges: [{ id: 'a-b', source: 'a', target: 'b', sourceHandle: 'next' }]
    };

    const replaced = connectTradeInGraph(graph, {
      id: 'c-b',
      source: 'c',
      target: 'b',
      sourceHandle: 'next'
    });
    expect(replaced.edges).toEqual([
      { id: 'c-b', source: 'c', target: 'b', sourceHandle: 'next' }
    ]);

    const branched = connectTradeInGraph(replaced, {
      id: 'c-a',
      source: 'c',
      target: 'a',
      sourceHandle: 'next'
    });
    expect(branched.edges).toEqual([
      { id: 'c-b', source: 'c', target: 'b', sourceHandle: 'next' },
      { id: 'c-a', source: 'c', target: 'a', sourceHandle: 'next' }
    ]);
  });

  it('reports unreachable nodes, missing exits and duplicate field keys', () => {
    const graph: TradeInFormGraph = {
      nodes: [
        node('start', 'start'),
        node('first', 'fields', [field('field-one', 'duplicate')]),
        node('second', 'fields', [field('field-two', 'duplicate')]),
        node('finish', 'finish')
      ],
      edges: [{ id: '1', source: 'start', target: 'first', sourceHandle: 'next' }]
    };

    const ids = validateTradeInLogic(graph).map((issue) => issue.id);
    expect(ids).toContain('duplicate-key-duplicate');
    expect(ids).toContain('missing-next-first');
    expect(ids).toContain('unreachable-second');
    expect(ids).toContain('unreachable-finish');
  });
});
