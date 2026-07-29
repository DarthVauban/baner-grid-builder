import { tradeInId } from './trade-in';
import type { TradeInConfig, TradeInField } from '../types/trade-in';

function contactField(key: 'first_name' | 'phone', label: string, type: 'text' | 'phone'): TradeInField {
  return {
    id: tradeInId('field'),
    key,
    label,
    type,
    placeholder: key === 'phone' ? '+380 (__) ___-__-__' : 'Як до вас звертатися',
    helpText: '',
    required: true,
    width: 'half',
    showInSummary: false,
    systemFieldType: key,
    condition: { fieldKey: '', operator: 'equals', value: '' },
    options: []
  };
}

export function createDefaultWorkflowForm(): TradeInConfig['form'] {
  const startId = tradeInId('start');
  const contactId = tradeInId('step');
  const finishId = tradeInId('finish');
  return {
    title: 'Нова покрокова форма',
    description: 'Заповніть коротку анкету — менеджер отримає відповіді та звʼяжеться з вами.',
    showProgress: true,
    showStepNumbers: true,
    showSummary: true,
    backLabel: 'Назад',
    nextLabel: 'Далі',
    submitLabel: 'Надіслати заявку',
    successTitle: 'Дякуємо! Заявку прийнято',
    successText: 'Менеджер перегляне відповіді та звʼяжеться з вами.',
    graph: {
      nodes: [
        {
          id: startId,
          type: 'start',
          position: { x: 40, y: 180 },
          title: 'Початок',
          description: 'Старт сценарію',
          fields: [],
          branches: [],
          defaultBranchLabel: ''
        },
        {
          id: contactId,
          type: 'fields',
          position: { x: 400, y: 180 },
          title: 'Контактні дані',
          description: 'Дані для зворотного звʼязку.',
          fields: [
            contactField('first_name', 'Імʼя', 'text'),
            contactField('phone', 'Номер телефону', 'phone')
          ],
          branches: [],
          defaultBranchLabel: ''
        },
        {
          id: finishId,
          type: 'finish',
          position: { x: 760, y: 180 },
          title: 'Заявку прийнято',
          description: 'Менеджер звʼяжеться з клієнтом.',
          fields: [],
          branches: [],
          defaultBranchLabel: ''
        }
      ],
      edges: [
        { id: tradeInId('edge'), source: startId, target: contactId, sourceHandle: 'next' },
        { id: tradeInId('edge'), source: contactId, target: finishId, sourceHandle: 'next' }
      ]
    },
    steps: []
  };
}
