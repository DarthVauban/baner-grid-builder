import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductSelectionPage } from './ProductSelectionPage';

vi.mock('../toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() })
}));

describe('ProductSelectionPage', () => {
  it('shows the public asynchronous global price script', () => {
    render(<ProductSelectionPage />);

    expect(screen.getByRole('button', { name: 'Копіювати async-код' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Стара й акційна ціна на сторінці товару' })).toBeInTheDocument();

    const outputs = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
    const asyncCode = outputs.find((output) => output.value.includes('/api/public/product-price/embed.js'));
    expect(asyncCode?.value).toMatch(/^<script async src="https?:\/\//u);
  });
});
