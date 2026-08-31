import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductSelectionPage } from './ProductSelectionPage';

vi.mock('../toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() })
}));

describe('ProductSelectionPage', () => {
  it('shows readable and minified variants of the safe global price script', () => {
    render(<ProductSelectionPage />);

    expect(screen.getByRole('button', { name: 'Копіювати глобальний код' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Копіювати мініфікований код' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Компактна версія глобального скрипта' })).toBeInTheDocument();

    const outputs = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    const minified = outputs.find((output) => output.value.includes('MT GLOBAL PRODUCT PRICE START') && !output.value.includes('\n'));
    expect(minified).toBeDefined();
  });
});
