import type {
  TradeInAnswer,
  TradeInAnswers,
  TradeInCondition,
  TradeInConditionBranch,
  TradeInConditionGroup,
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

export function createTradeInConditionGroup(condition = emptyTradeInCondition()): TradeInConditionGroup {
  return { combinator: 'all', conditions: [condition] };
}

const transliterationPairs: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ю: 'yu', я: 'ya', ы: 'y', э: 'e', ё: 'yo', ъ: ''
};

export function transliterateTradeInFieldKey(label: string, fallback = 'field') {
  const transliterated = Array.from(label.trim().toLocaleLowerCase('uk-UA'))
    .map((character) => transliterationPairs[character] ?? character)
    .join('')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`ʼ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  const safe = transliterated || fallback;
  return /^\d/.test(safe) ? `${fallback}_${safe}` : safe;
}

export function uniqueTradeInFieldKey(label: string, usedKeys: Iterable<string>, fallback = 'field') {
  const base = transliterateTradeInFieldKey(label, fallback);
  const taken = new Set(usedKeys);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export function nextTradeInGeneratedKey(
  label: string,
  currentKey: string,
  previousLabel: string,
  usedKeys: Iterable<string>,
  fallback = 'field'
) {
  const previousGeneratedKey = transliterateTradeInFieldKey(previousLabel, fallback);
  const escapedPreviousKey = previousGeneratedKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasGeneratedSuffix = new RegExp(`^${escapedPreviousKey}_\\d+$`).test(currentKey);
  const isLegacyGeneratedKey = fallback === 'option'
    ? /^option_\d+$/.test(currentKey)
    : /^new_field_\d+$/.test(currentKey);

  if (currentKey && currentKey !== previousGeneratedKey && !hasGeneratedSuffix && !isLegacyGeneratedKey) {
    return currentKey;
  }
  return uniqueTradeInFieldKey(label, usedKeys, fallback);
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
  const label = `Нове поле ${index + 1}`;
  return {
    id: tradeInId('field'),
    key: transliterateTradeInFieldKey(label),
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

export function createTradeInOption(index: number, usedValues: Iterable<string> = []): TradeInOption {
  const label = `Варіант ${index + 1}`;
  return {
    id: tradeInId('option'),
    label,
    value: uniqueTradeInFieldKey(label, usedValues, 'option')
  };
}

export function matchesTradeInCondition(condition: TradeInCondition, answers: TradeInAnswers) {
  if (!condition.fieldKey) return true;
  const actual = answers[condition.fieldKey];
  const answered = Array.isArray(actual) ? actual.length > 0 : Boolean(String(actual ?? '').trim());
  if (condition.operator === 'answered') return answered;
  if (condition.operator === 'not_answered') return !answered;
  const actualValues = Array.isArray(actual) ? actual.map(String) : [String(actual ?? '')];
  if (condition.operator === 'not_equals') return !actualValues.includes(condition.value);
  if (condition.operator === 'one_of') {
    const expectedValues = condition.value.split(',').map((item) => item.trim()).filter(Boolean);
    return actualValues.some((value) => expectedValues.includes(value));
  }
  if (condition.operator === 'contains') {
    return actualValues.some((value) => value.includes(condition.value));
  }
  if (['greater_than', 'greater_or_equal', 'less_than', 'less_or_equal'].includes(condition.operator)) {
    const actualNumber = Number(actual);
    const expectedNumber = Number(condition.value);
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
    if (condition.operator === 'greater_than') return actualNumber > expectedNumber;
    if (condition.operator === 'greater_or_equal') return actualNumber >= expectedNumber;
    if (condition.operator === 'less_than') return actualNumber < expectedNumber;
    return actualNumber <= expectedNumber;
  }
  return actualValues.includes(condition.value);
}

export function tradeInConditionGroup(branch: TradeInConditionBranch): TradeInConditionGroup {
  if (branch.conditionGroup?.conditions?.length) return branch.conditionGroup;
  return {
    combinator: 'all',
    conditions: branch.condition?.fieldKey ? [branch.condition] : []
  };
}

export function matchesTradeInConditionGroup(group: TradeInConditionGroup, answers: TradeInAnswers) {
  const conditions = group.conditions.filter((condition) => condition.fieldKey);
  if (!conditions.length) return false;
  return group.combinator === 'any'
    ? conditions.some((condition) => matchesTradeInCondition(condition, answers))
    : conditions.every((condition) => matchesTradeInCondition(condition, answers));
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
