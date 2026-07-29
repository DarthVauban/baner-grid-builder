import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TradeInConfig } from '../../types/trade-in';
import { TradeInLogicEditor } from './TradeInLogicEditor';

const config = {
  form: {
    title: 'Попередня оцінка пристрою',
    description: '',
    showProgress: true,
    showStepNumbers: true,
    showSummary: true,
    backLabel: 'Назад',
    nextLabel: 'Далі',
    submitLabel: 'Надіслати',
    successTitle: 'Готово',
    successText: 'Заявку прийнято',
    steps: [{
      id: 'step_device',
      title: 'Пристрій',
      description: '',
      condition: { fieldKey: '', operator: 'equals', value: '' },
      fields: []
    }]
  }
} as unknown as TradeInConfig;

describe('TradeInLogicEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  it('renders without entering a state update loop', () => {
    render(
      <TradeInLogicEditor
        config={config}
        mutate={vi.fn()}
        onUndo={vi.fn()}
        canUndo={false}
        historyDepth={0}
      />
    );

    expect(screen.getByRole('heading', { name: 'Конструктор форми' })).toBeInTheDocument();
  });
});
