import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUndoableState } from './use-undoable-state';

function HistoryHarness({ limit = 15, groupWindowMs = 350 }: { limit?: number; groupWindowMs?: number }) {
  const { state, setState, replaceState, canUndo, historyDepth } = useUndoableState(0, { limit, groupWindowMs });
  return <>
    <output aria-label="value">{state}</output>
    <output aria-label="depth">{historyDepth}</output>
    <output aria-label="can undo">{String(canUndo)}</output>
    <button type="button" onClick={() => setState((current) => current + 1)}>increment</button>
    <button type="button" onClick={() => replaceState(100)}>replace</button>
    <input aria-label="editor input" onKeyDown={(event) => event.stopPropagation()} />
  </>;
}

describe('useUndoableState', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('groups rapid updates into one undo action and handles Ctrl+Z', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T10:00:00Z'));
    render(<HistoryHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'increment' }));
    vi.advanceTimersByTime(100);
    fireEvent.click(screen.getByRole('button', { name: 'increment' }));

    expect(screen.getByLabelText('value')).toHaveTextContent('2');
    expect(screen.getByLabelText('depth')).toHaveTextContent('1');

    fireEvent.keyDown(screen.getByLabelText('editor input'), { key: 'я', code: 'KeyZ', ctrlKey: true });

    expect(screen.getByLabelText('value')).toHaveTextContent('0');
    expect(screen.getByLabelText('can undo')).toHaveTextContent('false');
  });

  it('handles Cmd+Z by its physical key code', () => {
    render(<HistoryHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'increment' }));

    fireEvent.keyDown(screen.getByLabelText('editor input'), { key: 'я', code: 'KeyZ', metaKey: true });

    expect(screen.getByLabelText('value')).toHaveTextContent('0');
    expect(screen.getByLabelText('can undo')).toHaveTextContent('false');
  });

  it('keeps only the configured number of previous actions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T10:00:00Z'));
    render(<HistoryHarness limit={15} />);

    for (let index = 0; index < 20; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'increment' }));
      vi.advanceTimersByTime(500);
    }

    expect(screen.getByLabelText('value')).toHaveTextContent('20');
    expect(screen.getByLabelText('depth')).toHaveTextContent('15');

    for (let index = 0; index < 15; index += 1) {
      fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    }

    expect(screen.getByLabelText('value')).toHaveTextContent('5');
    expect(screen.getByLabelText('can undo')).toHaveTextContent('false');
  });

  it('clears stale history when state is replaced from the server', () => {
    render(<HistoryHarness groupWindowMs={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'increment' }));
    fireEvent.click(screen.getByRole('button', { name: 'replace' }));

    expect(screen.getByLabelText('value')).toHaveTextContent('100');
    expect(screen.getByLabelText('can undo')).toHaveTextContent('false');
  });
});
