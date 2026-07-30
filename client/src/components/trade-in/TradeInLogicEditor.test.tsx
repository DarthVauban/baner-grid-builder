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
      fields: [{
        id: 'field-model',
        key: 'model',
        label: 'Модель',
        type: 'text',
        placeholder: '',
        helpText: '',
        required: true,
        width: 'full',
        showInSummary: true,
        systemFieldType: null,
        condition: { fieldKey: '', operator: 'equals', value: '' },
        options: []
      }]
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
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => null)
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

  it('labels the field setting as application main information', () => {
    render(
      <TradeInLogicEditor
        config={config}
        mutate={vi.fn()}
        onUndo={vi.fn()}
        canUndo={false}
        historyDepth={0}
      />
    );

    fireEvent.click(screen.getByText('Пристрій'));

    expect(screen.getByText('Показувати в основній інформації заявки')).toBeInTheDocument();
    expect(screen.queryByText('У підсумку анкети')).not.toBeInTheDocument();
  });

  it('keeps toggle inputs inside their visible switch container', () => {
    const mutate = vi.fn();
    render(
      <TradeInLogicEditor
        config={config}
        mutate={mutate}
        onUndo={vi.fn()}
        canUndo={false}
        historyDepth={0}
      />
    );

    fireEvent.click(screen.getByText('Пристрій'));

    const checkbox = screen.getByRole('checkbox', {
      name: 'Показувати в основній інформації заявки'
    });
    expect(checkbox.parentElement).toHaveClass('trade-in-graph-toggle__switch');

    fireEvent.click(checkbox);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('starts from an output and completes the connection by clicking a node', () => {
    const mutate = vi.fn();
    const { container } = render(
      <TradeInLogicEditor
        config={config}
        mutate={mutate}
        onUndo={vi.fn()}
        canUndo={false}
        historyDepth={0}
      />
    );

    const source = container.querySelector<HTMLElement>('.react-flow__handle.source[data-nodeid="form_start"]');
    const target = container.querySelector<HTMLElement>('.react-flow__node[data-id="step_device"]');
    expect(source).not.toBeNull();
    expect(target).not.toBeNull();

    fireEvent.click(source!);
    expect(source).toHaveClass('clickconnecting');
    fireEvent.click(target!);

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(source).not.toHaveClass('clickconnecting');
  });

  it('creates and connects a node when a click connection ends on the pane', () => {
    const mutate = vi.fn();
    const { container } = render(
      <TradeInLogicEditor
        config={config}
        mutate={mutate}
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
    const source = container.querySelector<HTMLElement>('.react-flow__handle.source[data-nodeid="form_start"]');
    const pane = container.querySelector<HTMLElement>('.react-flow__pane');
    expect(source).not.toBeNull();
    expect(pane).not.toBeNull();
    vi.spyOn(source!, 'getBoundingClientRect').mockReturnValue({
      x: 300,
      y: 200,
      left: 300,
      top: 200,
      right: 312,
      bottom: 212,
      width: 12,
      height: 12,
      toJSON: () => ({})
    });

    fireEvent.click(source!, { clientX: 306, clientY: 206 });
    fireEvent.click(pane!, { clientX: 620, clientY: 330 });

    expect(screen.getByText('Створити та з’єднати')).toBeInTheDocument();
    expect(container.querySelector('.trade-in-pending-connection')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Крок з полями', { selector: '.trade-in-node-palette strong' }));
    expect(mutate).toHaveBeenCalledTimes(1);

    const nextConfig = structuredClone(config) as TradeInConfig;
    mutate.mock.calls[0][0](nextConfig);
    const createdNode = nextConfig.form.graph?.nodes.find((node) => (
      node.type === 'fields' && node.id !== 'step_device'
    ));
    expect(createdNode).toBeDefined();
    expect(nextConfig.form.graph?.edges).toContainEqual(expect.objectContaining({
      source: 'form_start',
      target: createdNode?.id,
      sourceHandle: 'next'
    }));
  });
});
