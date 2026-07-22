import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultCatalogAdminFilters } from '../lib/catalog-filters';
import { CatalogAdvancedFilters } from './CatalogAdvancedFilters';

describe('CatalogAdvancedFilters', () => {
  it('accepts a pasted spreadsheet column and applies unique names and codes', () => {
    const onChange = vi.fn();
    render(<CatalogAdvancedFilters
      value={defaultCatalogAdminFilters}
      feed={{ items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 }}
      brands={[]}
      brandDirectories={[]}
      templates={[]}
      onChange={onChange}
      onReset={vi.fn()}
      onClose={vi.fn()}
    />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Список назв або кодів' }), {
      target: { value: 'SM-000001\niPhone 15 128GB Black\nsm-000001\n\n' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Застосувати список' }));

    expect(onChange).toHaveBeenCalledWith({ productList: 'SM-000001\niPhone 15 128GB Black' });
    expect(screen.getByText('2 позицій')).toBeInTheDocument();
  });

  it('shows rows that were not found in the catalog', () => {
    render(<CatalogAdvancedFilters
      value={{ ...defaultCatalogAdminFilters, productList: 'SM-000001\nUnknown phone' }}
      feed={{
        items: [],
        total: 1,
        page: 1,
        pageSize: 25,
        pageCount: 1,
        diagnostics: { productList: { requestedCount: 2, matchedCount: 1, unmatched: ['Unknown phone'] } }
      }}
      brands={[]}
      brandDirectories={[]}
      templates={[]}
      onChange={vi.fn()}
      onReset={vi.fn()}
      onClose={vi.fn()}
    />);

    expect(screen.getByText('Знайдено 1 із 2')).toBeInTheDocument();
    expect(screen.getByText('Не знайдено: 1')).toBeInTheDocument();
  });
});
