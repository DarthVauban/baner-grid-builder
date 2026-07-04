import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './ToastContext';

function ToastTrigger() {
  const { showToast } = useToast();
  return <button type="button" onClick={() => showToast('Скопійовано.')}>Копіювати</button>;
}

describe('ToastProvider', () => {
  afterEach(() => vi.useRealTimers());

  it('shows a compact notification and dismisses it automatically', () => {
    vi.useFakeTimers();
    render(<ToastProvider><ToastTrigger /></ToastProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Копіювати' }));
    expect(screen.getByRole('status')).toHaveTextContent('Скопійовано.');

    act(() => vi.advanceTimersByTime(2800));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
