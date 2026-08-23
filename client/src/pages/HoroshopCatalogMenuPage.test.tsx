import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { HoroshopCatalogMenuSettingsEnvelope } from '../types/horoshop-catalog-menu';
import { HoroshopCatalogMenuPage } from './HoroshopCatalogMenuPage';

const response: HoroshopCatalogMenuSettingsEnvelope = {
  settings: {
    publicId: '5caeedf8-8307-4cad-9668-bd9296603331',
    enabled: true,
    draftThemeId: 'compact-columns',
    publishedThemeId: 'compact-columns',
    publishedVersion: 2,
    storeDomain: 'mobiletrend.com.ua',
    updatedAt: '2026-08-23T08:00:00.000Z',
    publishedAt: '2026-08-23T08:00:00.000Z',
    embedCode: '<script async src="https://workspace.example.com/api/public/horoshop-catalog-menu/embed.js?site=5caeedf8-8307-4cad-9668-bd9296603331"></script>'
  },
  themes: [
    { id: 'compact-columns', name: 'Компактні колонки', description: 'Щільний список категорій.', recommended: true },
    { id: 'flat-directory', name: 'Плоский довідник', description: 'Три широкі колонки.', recommended: false },
    { id: 'grouped-sections', name: 'Груповані секції', description: 'Світлі груповані секції.', recommended: false }
  ]
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ToastProvider><HoroshopCatalogMenuPage /></ToastProvider></QueryClientProvider>);
}

beforeEach(() => {
  vi.spyOn(api.horoshopCatalogMenu, 'settings').mockResolvedValue(response);
  vi.spyOn(api.horoshopCatalogMenu, 'saveDraft').mockResolvedValue(response.settings);
  vi.spyOn(api.horoshopCatalogMenu, 'publish').mockResolvedValue(response.settings);
  vi.spyOn(api.horoshopCatalogMenu, 'setEnabled').mockResolvedValue(response.settings);
});

afterEach(() => vi.restoreAllMocks());

describe('HoroshopCatalogMenuPage', () => {
  it('explains the content boundary and exposes three curated visuals', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Меню каталогу' })).toBeInTheDocument();
    expect(screen.getByText(/Категорії, порядок, посилання та іконки залишаються під керуванням Хорошопа/u)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Компактні колонки/u })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByText('mobiletrend.com.ua')).toHaveLength(2);
  });

  it('publishes the selected theme without exposing catalog editing controls', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Меню каталогу' });

    fireEvent.click(screen.getByRole('radio', { name: /Груповані секції/u }));
    expect(screen.getByText('Є незбережений вибір')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Зберегти чернетку/u })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Опублікувати й увімкнути/u }));
    await waitFor(() => expect(api.horoshopCatalogMenu.publish).toHaveBeenCalled());
    expect(vi.mocked(api.horoshopCatalogMenu.publish).mock.calls[0][0]).toBe('grouped-sections');

    expect(screen.queryByRole('textbox', { name: /назва категорії/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /додати категорію/iu })).not.toBeInTheDocument();
  });
});
