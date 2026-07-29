import { fireEvent, render, screen } from '@testing-library/react';
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

  it('opens the node palette at the latest cursor position when Space is pressed', () => {
    const { container } = render(
      <TradeInLogicEditor
        config={config}
        mutate={vi.fn()}
        onUndo={vi.fn()}
        canUndo={false}
        historyDepth={0}
      />
    );
    const canvas = screen.getByLabelText('Графічний редактор форми');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 30,
      left: 20,
      top: 30,
      right: 1020,
      bottom: 630,
      width: 1000,
      height: 600,
      toJSON: () => ({})
    });

    fireEvent.pointerMove(canvas, { clientX: 420, clientY: 230 });
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });

    expect(container.querySelector('.trade-in-node-palette:not(.is-toolbar)')).toHaveStyle({
      left: '400px',
      top: '200px'
    });
  });

});
