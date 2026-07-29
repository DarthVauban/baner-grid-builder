import { describe, expect, it } from 'vitest';
import {
  canConnectTradeInSteps,
  createTradeInStepCondition,
  formatTradeInCondition,
  validateTradeInLogic
} from './trade-in-logic';
import { emptyTradeInCondition } from './trade-in';
import type { TradeInField, TradeInStep } from '../types/trade-in';

function field(id: string, key: string, label = key, options: TradeInField['options'] = []): TradeInField {
  return {
    id,
    key,
    label,
    type: options.length ? 'radio' : 'text',
    placeholder: '',
    helpText: '',
    required: false,
    width: 'full',
    showInSummary: true,
    systemFieldType: null,
    min: null,
    max: null,
    condition: emptyTradeInCondition(),
    options
  };
}

function step(id: string, fields: TradeInField[], condition = emptyTradeInCondition()): TradeInStep {
  return { id, title: id, description: '', fields, condition };
}

describe('trade-in logic graph helpers', () => {
  it('creates a condition from the first selectable field in the source step', () => {
    const steps = [
      step('category', [field('category-field', 'category', 'Категорія', [
        { id: 'smartphone', label: 'Смартфон', value: 'smartphone' }
      ])]),
      step('model', [])
    ];

    expect(createTradeInStepCondition(steps, 'category')).toEqual({
      fieldKey: 'category',
      operator: 'equals',
      value: 'smartphone'
    });
    expect(canConnectTradeInSteps(steps, 'category', 'model')).toBe(true);
    expect(canConnectTradeInSteps(steps, 'model', 'category')).toBe(false);
  });

  it('uses the answered operator for a source field without options', () => {
    const steps = [step('contact', [field('phone-field', 'phone', 'Телефон')])];

    expect(createTradeInStepCondition(steps, 'contact')).toEqual({
      fieldKey: 'phone',
      operator: 'answered',
      value: ''
    });
  });

  it('formats option values using their customer-facing labels', () => {
    const steps = [
      step('category', [field('category-field', 'category', 'Категорія', [
        { id: 'smartphone', label: 'Смартфон', value: 'smartphone' }
      ])])
    ];

    expect(formatTradeInCondition(steps, {
      fieldKey: 'category',
      operator: 'equals',
      value: 'smartphone'
    })).toBe('Категорія дорівнює Смартфон');
  });

  it('reports missing, ambiguous and unreachable dependencies', () => {
    const steps = [
      step('first', [field('first-duplicate', 'duplicate')], {
        fieldKey: 'future',
        operator: 'answered',
        value: ''
      }),
      step('second', [field('second-duplicate', 'duplicate'), field('future-field', 'future')], {
        fieldKey: 'missing',
        operator: 'equals',
        value: ''
      })
    ];

    const issueIds = validateTradeInLogic(steps).map((issue) => issue.id);
    expect(issueIds).toContain('duplicate-field-key-duplicate');
    expect(issueIds).toContain('unreachable-condition-first');
    expect(issueIds).toContain('missing-condition-field-second');
  });

  it('accepts a dependency on a field from an earlier step', () => {
    const steps = [
      step('category', [field('category-field', 'category', 'Категорія')]),
      step('details', [], { fieldKey: 'category', operator: 'answered', value: '' })
    ];

    expect(validateTradeInLogic(steps)).toEqual([]);
  });
});
