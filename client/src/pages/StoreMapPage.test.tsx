import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../toast/ToastContext';
import { ImportDialog } from './StoreMapPage';

describe('Store map import dialog', () => {
  it('accepts files dropped onto the XLSX dropzone', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ImportDialog onClose={vi.fn()} onCommitted={vi.fn(async () => undefined)} />
        </ToastProvider>
      </QueryClientProvider>
    );

    const prompt = screen.getByText('Перетягніть або оберіть XLSX-файл');
    const dropzone = prompt.closest('label');
    expect(dropzone).not.toBeNull();

    const file = new File(['not a spreadsheet'], 'stores.txt', { type: 'text/plain' });
    fireEvent.dragEnter(dropzone!, { dataTransfer: { files: [file], dropEffect: 'none' } });
    expect(screen.getByText('Відпустіть файл для завантаження')).toBeInTheDocument();

    fireEvent.drop(dropzone!, { dataTransfer: { files: [file], dropEffect: 'copy' } });

    expect(await screen.findByRole('status')).toHaveTextContent('Оберіть файл у форматі XLSX або XLS.');
    expect(screen.getByText('Перетягніть або оберіть XLSX-файл')).toBeInTheDocument();
  });
});
