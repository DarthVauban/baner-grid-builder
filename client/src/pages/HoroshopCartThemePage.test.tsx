import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { HoroshopCartThemeSettingsEnvelope } from '../types/horoshop-cart-theme';
import { HoroshopCartThemePage } from './HoroshopCartThemePage';

const response: HoroshopCartThemeSettingsEnvelope = {
  settings: {
    publicId: '71ca5c29-5a72-4af8-b5d7-4020e6ec1215',
    enabled: true,
    draftThemeId: 'balanced-upsell',
    publishedThemeId: 'balanced-upsell',
    publishedVersion: 2,
    storeDomain: 'mobiletrend.com.ua',
    updatedAt: '2026-08-28T08:00:00.000Z',
    publishedAt: '2026-08-28T08:00:00.000Z',
    embedCode: '<script async src="https://workspace.example.com/api/public/horoshop-cart-theme/embed.js?site=71ca5c29-5a72-4af8-b5d7-4020e6ec1215"></script>'
  },
  themes: [
    { id: 'balanced-upsell', name: 'Збалансований допродаж', description: 'Широкий кошик і чотири картки.', recommended: true },
    { id: 'accessory-showcase', name: 'Вітрина аксесуарів', description: 'Найбільші фото й картки.', recommended: false },
    { id: 'compact-wide', name: 'Компактний широкий', description: 'Помірна ширина для невеликих ноутбуків.', recommended: false }
  ]
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ToastProvider><HoroshopCartThemePage /></ToastProvider></QueryClientProvider>);
}

beforeEach(() => {
  vi.spyOn(api.horoshopCartTheme, 'settings').mockResolvedValue(response);
  vi.spyOn(api.horoshopCartTheme, 'saveDraft').mockResolvedValue(response.settings);
  vi.spyOn(api.horoshopCartTheme, 'publish').mockResolvedValue(response.settings);
  vi.spyOn(api.horoshopCartTheme, 'setEnabled').mockResolvedValue(response.settings);
});

afterEach(() => vi.restoreAllMocks());

describe('HoroshopCartThemePage', () => {
  it('explains the Horoshop boundary and exposes three responsive visual options', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Кошик Хорошоп' })).toBeInTheDocument();
    expect(screen.getByText(/Товари, ціни, кількість, рекомендації та оформлення замовлення залишаються під керуванням Хорошопа/u)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Збалансований допродаж/u })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('mobiletrend.com.ua')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Десктоп/u })).toHaveClass('is-active');

    fireEvent.click(screen.getByRole('button', { name: /Мобільний/u }));
    expect(screen.getByRole('button', { name: /Мобільний/u })).toHaveClass('is-active');
  });

  it('publishes the selected layout without exposing product or price controls', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Кошик Хорошоп' });

    fireEvent.click(screen.getByRole('radio', { name: /Вітрина аксесуарів/u }));
    expect(screen.getByText('Є незбережені зміни')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Зберегти чернетку/u })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Опублікувати й увімкнути/u }));
    await waitFor(() => expect(api.horoshopCartTheme.publish).toHaveBeenCalled());
    expect(vi.mocked(api.horoshopCartTheme.publish).mock.calls[0][0]).toEqual({ themeId: 'accessory-showcase' });

    expect(screen.queryByRole('textbox', { name: /товар/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /ціна/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /додати рекомендацію/iu })).not.toBeInTheDocument();
  });
});
