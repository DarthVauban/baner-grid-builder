import type {
  TradeInCondition,
  TradeInConditionOperator,
  TradeInField,
  TradeInStep
} from '../types/trade-in';

export const tradeInConditionOperatorLabels: Record<TradeInConditionOperator, string> = {
  equals: 'дорівнює',
  not_equals: 'не дорівнює',
  one_of: 'одне зі значень',
  contains: 'містить',
  answered: 'заповнено'
};

export interface TradeInFieldReference {
  field: TradeInField;
  fieldIndex: number;
  step: TradeInStep;
  stepIndex: number;
}

export interface TradeInLogicIssue {
  id: string;
  severity: 'error' | 'warning';
  title: string;
  description: string;
  stepId?: string;
  fieldKey?: string;
}

export function getTradeInFieldReferences(steps: TradeInStep[]) {
  return steps.flatMap((step, stepIndex) => step.fields.map((field, fieldIndex) => ({
    field,
    fieldIndex,
    step,
    stepIndex
  })));
}

export function getTradeInConditionSource(
  steps: TradeInStep[],
  condition: TradeInCondition
): TradeInFieldReference | null {
  if (!condition.fieldKey) return null;
  return getTradeInFieldReferences(steps).find((reference) => reference.field.key === condition.fieldKey) || null;
}

export function createTradeInStepCondition(steps: TradeInStep[], sourceStepId: string): TradeInCondition | null {
  const sourceStep = steps.find((step) => step.id === sourceStepId);
  const sourceField = sourceStep?.fields.find((field) => field.key.trim());
  if (!sourceField) return null;

  const hasSelectableOptions = sourceField.options.length > 0;
  return {
    fieldKey: sourceField.key,
    operator: hasSelectableOptions ? 'equals' : 'answered',
    value: hasSelectableOptions ? sourceField.options[0]?.value || '' : ''
  };
}

export function canConnectTradeInSteps(steps: TradeInStep[], sourceStepId: string, targetStepId: string) {
  const sourceIndex = steps.findIndex((step) => step.id === sourceStepId);
  const targetIndex = steps.findIndex((step) => step.id === targetStepId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex >= targetIndex) return false;
  return steps[sourceIndex].fields.some((field) => field.key.trim());
}

export function formatTradeInCondition(steps: TradeInStep[], condition: TradeInCondition) {
  if (!condition.fieldKey) return 'За порядком';
  const reference = getTradeInConditionSource(steps, condition);
  const fieldLabel = reference?.field.label || condition.fieldKey;
  const operatorLabel = tradeInConditionOperatorLabels[condition.operator];
  if (condition.operator === 'answered') return `${fieldLabel} — ${operatorLabel}`;

  const values = condition.value.split(',').map((value) => value.trim()).filter(Boolean);
  const formattedValue = values.map((value) => (
    reference?.field.options.find((option) => option.value === value)?.label || value
  )).join(', ');

  return `${fieldLabel} ${operatorLabel} ${formattedValue || '…'}`;
}

export function validateTradeInLogic(steps: TradeInStep[]) {
  const issues: TradeInLogicIssue[] = [];
  const references = getTradeInFieldReferences(steps);
  const referencesByKey = new Map<string, TradeInFieldReference[]>();

  references.forEach((reference) => {
    const key = reference.field.key.trim();
    if (!key) {
      issues.push({
        id: `empty-field-key-${reference.field.id}`,
        severity: 'error',
        title: 'Поле не має ключа',
        description: `У кроці «${reference.step.title || `Крок ${reference.stepIndex + 1}`}» є поле без технічного ключа.`,
        stepId: reference.step.id
      });
      return;
    }
    referencesByKey.set(key, [...(referencesByKey.get(key) || []), reference]);
  });

  referencesByKey.forEach((matchingReferences, key) => {
    if (matchingReferences.length < 2) return;
    issues.push({
      id: `duplicate-field-key-${key}`,
      severity: 'error',
      title: 'Неунікальний ключ поля',
      description: `Ключ «${key}» використовується ${matchingReferences.length} рази. Залежність буде неоднозначною.`,
      stepId: matchingReferences[0].step.id,
      fieldKey: key
    });
  });

  steps.forEach((step, stepIndex) => {
    if (!step.title.trim()) {
      issues.push({
        id: `empty-step-title-${step.id}`,
        severity: 'warning',
        title: 'Крок без назви',
        description: `Крок ${stepIndex + 1} буде складно розпізнати на схемі.`,
        stepId: step.id
      });
    }

    const condition = step.condition;
    if (!condition.fieldKey) return;

    const matchingReferences = referencesByKey.get(condition.fieldKey) || [];
    if (!matchingReferences.length) {
      issues.push({
        id: `missing-condition-field-${step.id}`,
        severity: 'error',
        title: 'Поле умови не існує',
        description: `Крок «${step.title || `Крок ${stepIndex + 1}`}» посилається на видалене поле «${condition.fieldKey}».`,
        stepId: step.id,
        fieldKey: condition.fieldKey
      });
      return;
    }

    const source = matchingReferences[0];
    if (stepIndex === 0 || source.stepIndex >= stepIndex) {
      issues.push({
        id: `unreachable-condition-${step.id}`,
        severity: 'error',
        title: 'Умову неможливо перевірити',
        description: stepIndex === 0
          ? 'Перший крок не може залежати від відповіді, якої ще немає.'
          : `Поле «${source.field.label}» знаходиться у цьому або наступному кроці.`,
        stepId: step.id,
        fieldKey: condition.fieldKey
      });
    }

    if (condition.operator !== 'answered' && !condition.value.trim()) {
      issues.push({
        id: `empty-condition-value-${step.id}`,
        severity: 'warning',
        title: 'Не задано значення умови',
        description: `Заповніть значення переходу до кроку «${step.title || `Крок ${stepIndex + 1}`}».`,
        stepId: step.id,
        fieldKey: condition.fieldKey
      });
    }
  });

  return issues;
}
