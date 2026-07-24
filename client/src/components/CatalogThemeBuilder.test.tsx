import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ThemeRangeField, ThemeToggle } from './CatalogThemeBuilder';

function RangeHarness() {
  const [value, setValue] = useState(32);
  return <ThemeRangeField label="Розмір" value={value} min={24} max={80} onChange={setValue} />;
}

function ToggleHarness() {
  const [checked, setChecked] = useState(false);
  return <ThemeToggle label="Показувати блок" checked={checked} onChange={setChecked} />;
}

describe('ThemeRangeField', () => {
  it('allows a multi-digit value to be typed before applying range limits', async () => {
    const user = userEvent.setup();
    render(<RangeHarness />);
    const input = screen.getByRole('spinbutton');

    await user.clear(input);
    await user.type(input, '36');

    expect(input).toHaveValue(36);
    expect(screen.getByText('36px')).toBeInTheDocument();
  });

  it('clamps a completed out-of-range value only when editing finishes', async () => {
    const user = userEvent.setup();
    render(<RangeHarness />);
    const input = screen.getByRole('spinbutton');

    await user.clear(input);
    await user.type(input, '200');
    expect(input).toHaveValue(200);

    await user.tab();
    expect(input).toHaveValue(80);
    expect(screen.getByText('80px')).toBeInTheDocument();
  });
});

describe('ThemeToggle', () => {
  it('uses the shared switch control and updates its state', async () => {
    const user = userEvent.setup();
    render(<ToggleHarness />);
    const input = screen.getByRole('checkbox', { name: 'Показувати блок' });

    expect(input).toHaveClass('switch');
    expect(input).not.toBeChecked();

    await user.click(input);

    expect(input).toBeChecked();
  });
});
