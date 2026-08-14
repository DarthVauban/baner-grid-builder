import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateTimePicker } from './DateTimePicker';

function ControlledPicker({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('2026-08-14T12:00');
  return <DateTimePicker
    label="Дата й час"
    value={value}
    onChange={(nextValue) => {
      setValue(nextValue);
      onChange(nextValue);
    }}
  />;
}

describe('DateTimePicker', () => {
  it('keeps another selected day as a draft and applies it on confirmation', () => {
    const onChange = vi.fn();
    render(<ControlledPicker onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '14 серп. 2026 р., 12:00' }));
    const selectedDay = screen.getByRole('button', { name: '20 серпня 2026 р.' });
    fireEvent.click(selectedDay);

    expect(selectedDay).toHaveAttribute('aria-pressed', 'true');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));

    expect(onChange).toHaveBeenCalledWith('2026-08-20T12:00');
    expect(screen.getByRole('button', { name: '20 серп. 2026 р., 12:00' })).toBeInTheDocument();
  });

  it('discards an unconfirmed day when the picker is closed', () => {
    const onChange = vi.fn();
    render(<ControlledPicker onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '14 серп. 2026 р., 12:00' }));
    fireEvent.click(screen.getByRole('button', { name: '20 серпня 2026 р.' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '14 серп. 2026 р., 12:00' }));

    expect(screen.getByRole('button', { name: '14 серпня 2026 р.' })).toHaveAttribute('aria-pressed', 'true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the picker open while choosing time from a portal menu', () => {
    const onChange = vi.fn();
    render(<ControlledPicker onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '14 серп. 2026 р., 12:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Година' }));
    const hourOption = screen.getByRole('option', { name: '15' });
    fireEvent.pointerDown(hourOption);

    expect(screen.getByRole('dialog', { name: 'Дата й час' })).toBeInTheDocument();

    fireEvent.click(hourOption);
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));

    expect(onChange).toHaveBeenCalledWith('2026-08-14T15:00');
  });
});
