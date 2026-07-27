import type {
  TradeInAnswer,
  TradeInAnswers,
  TradeInCondition,
  TradeInField,
  TradeInOption,
  TradeInStep
} from '../types/trade-in';

export function tradeInId(prefix: string) {
  return `${prefix}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

export function emptyTradeInCondition(): TradeInCondition {
  return { fieldKey: '', operator: 'equals', value: '' };
}

export function createTradeInStep(index: number): TradeInStep {
  return {
    id: tradeInId('step'),
    title: `Новий крок ${index + 1}`,
    description: '',
    condition: emptyTradeInCondition(),
    fields: []
  };
}

export function createTradeInField(index: number): TradeInField {
  return {
    id: tradeInId('field'),
    key: `new_field_${index + 1}`,
    label: `Нове поле ${index + 1}`,
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

export function createTradeInOption(index: number): TradeInOption {
  return {
    id: tradeInId('option'),
    label: `Варіант ${index + 1}`,
    value: `option_${index + 1}`
  };
}

export function matchesTradeInCondition(condition: TradeInCondition, answers: TradeInAnswers) {
  if (!condition.fieldKey) return true;
  const actual = answers[condition.fieldKey];
  if (condition.operator === 'answered') {
    return Array.isArray(actual) ? actual.length > 0 : Boolean(String(actual ?? '').trim());
  }
  if (condition.operator === 'not_equals') return String(actual ?? '') !== condition.value;
  if (condition.operator === 'one_of') {
    return condition.value.split(',').map((item) => item.trim()).filter(Boolean).includes(String(actual ?? ''));
  }
  if (condition.operator === 'contains') {
    return Array.isArray(actual)
      ? actual.map(String).includes(condition.value)
      : String(actual ?? '').includes(condition.value);
  }
  return String(actual ?? '') === condition.value;
}

export function visibleTradeInSteps(steps: TradeInStep[], answers: TradeInAnswers) {
  return steps.filter((step) => matchesTradeInCondition(step.condition, answers));
}

export function visibleTradeInFields(step: TradeInStep, answers: TradeInAnswers) {
  return step.fields.filter((field) => matchesTradeInCondition(field.condition, answers));
}

export function tradeInAnswerLabel(field: TradeInField, answer: TradeInAnswer | undefined) {
  if (Array.isArray(answer)) {
    return answer.map((value) => field.options.find((option) => option.value === value)?.label || value).join(', ');
  }
  if (typeof answer === 'boolean') return answer ? 'Так' : 'Ні';
  const value = String(answer ?? '');
  return field.options.find((option) => option.value === value)?.label || value;
}

export function isTradeInFieldComplete(field: TradeInField, answer: TradeInAnswer | undefined) {
  if (!field.required) return true;
  if (field.type === 'checkbox') {
    return field.options.length > 0 ? Array.isArray(answer) && answer.length > 0 : answer === true;
  }
  if (field.type === 'number') {
    const value = Number(answer);
    if (!String(answer ?? '').trim() || !Number.isFinite(value)) return false;
    if (field.min != null && value < field.min) return false;
    if (field.max != null && value > field.max) return false;
    return true;
  }
  return Boolean(String(answer ?? '').trim());
}

export function moveTradeInItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
