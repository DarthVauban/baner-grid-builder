import { describe, expect, it } from 'vitest';
import type { TradeInField, TradeInStep } from '../types/trade-in';
import {
  emptyTradeInCondition,
  isTradeInFieldComplete,
  matchesTradeInCondition,
  moveTradeInItem,
  tradeInAnswerLabel,
  visibleTradeInSteps
} from './trade-in';

const baseField: TradeInField = {
  id: 'field',
  key: 'condition',
  label: 'Стан',
  type: 'radio',
  placeholder: '',
  helpText: '',
  required: true,
  width: 'full',
  showInSummary: true,
  systemFieldType: null,
  condition: emptyTradeInCondition(),
  options: [
    { id: 'ideal', label: 'Ідеальний', value: 'ideal' },
    { id: 'normal', label: 'Нормальний', value: 'normal' }
  ]
};

describe('Trade-in form helpers', () => {
  it('evaluates conditional steps for each device category', () => {
    const steps: TradeInStep[] = [
      { id: 'all', title: 'Категорія', description: '', condition: emptyTradeInCondition(), fields: [] },
      { id: 'apple', title: 'Apple', description: '', condition: { fieldKey: 'category', operator: 'equals', value: 'apple' }, fields: [] },
      { id: 'laptop', title: 'Ноутбук', description: '', condition: { fieldKey: 'category', operator: 'equals', value: 'laptop' }, fields: [] }
    ];
    expect(visibleTradeInSteps(steps, { category: 'apple' }).map((step) => step.id)).toEqual(['all', 'apple']);
    expect(matchesTradeInCondition({ fieldKey: 'category', operator: 'one_of', value: 'smartphone,apple' }, { category: 'smartphone' })).toBe(true);
  });

  it('validates required choices and formats their labels', () => {
    expect(isTradeInFieldComplete(baseField, undefined)).toBe(false);
    expect(isTradeInFieldComplete(baseField, 'ideal')).toBe(true);
    expect(tradeInAnswerLabel(baseField, 'ideal')).toBe('Ідеальний');
  });

  it('reorders items without mutating the original array', () => {
    const original = ['a', 'b', 'c'];
    expect(moveTradeInItem(original, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(original).toEqual(['a', 'b', 'c']);
  });
});
