import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, it, expect, vi } from 'vitest';
import { ConfirmDialogProvider } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { ToastProvider } from '../toast/ToastContext';
import type { SiteTheme } from '../types/site-theme';
import { SiteThemesPage } from './SiteThemesPage';

const date = '2026-11-23T09:00:00.000Z';

function renderTool() {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={query}>
      <ToastProvider>
        <ConfirmDialogProvider>
          <MemoryRouter initialEntries={['/tools/site-themes']}>
            <Routes>
              <Route path="/tools" element={<h1>Інструменти</h1>} />
              <Route path="/tools/site-themes" element={<SiteThemesPage />} />
            </Routes>
          </MemoryRouter>
        </ConfirmDialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

it('publishes a saved draft before activation and applies device settings to the draft preview', async () => {
  let saved: SiteTheme | undefined;
  vi.spyOn(api.siteThemes, 'list').mockImplementation(async () => saved ? [saved] : []);
  const create = vi.spyOn(api.siteThemes, 'create').mockImplementation(async (input) => {
    saved = {
      ...input, id: 'theme-1', promoBarEnabled: true, active: false, publishedAt: null,
      hasUnpublishedChanges: true, createdAt: date, updatedAt: date
    };
    return saved;
  });
  const publish = vi.spyOn(api.siteThemes, 'publish').mockImplementation(async () => {
    if (!saved) throw new Error('Theme must be saved before publishing.');
    saved = { ...saved, publishedAt: date, hasUnpublishedChanges: false };
    return saved;
  });
  const activate = vi.spyOn(api.siteThemes, 'setActive').mockImplementation(async (_, active) => {
    if (!saved?.publishedAt) throw new Error('Theme must be published before activation.');
    saved = { ...saved, active };
    return saved;
  });
  const setPromoBarEnabled = vi.spyOn(api.siteThemes, 'setPromoBarEnabled').mockImplementation(async (_, enabled) => {
    if (!saved) throw new Error('Theme must be saved before changing visibility.');
    saved = { ...saved, promoBarEnabled: enabled };
    return saved;
  });

  renderTool();
  await screen.findByText('Тут з’являться ваші теми');
  fireEvent.click(screen.getByRole('button', { name: 'Створити тему' }));
  fireEvent.change(screen.getByLabelText('Назва теми'), { target: { value: 'Знижки' } });
  fireEvent.change(screen.getByLabelText('Текст промосмуги'), { target: { value: 'Знижки на смартфони' } });
  const preview = within(screen.getByRole('region', { name: 'Попередній перегляд' }));
  expect(preview.getByText('Знижки на смартфони')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Стилі' }));
  fireEvent.click(screen.getByRole('button', { name: 'Вирівнювання' }));
  fireEvent.click(screen.getByRole('option', { name: 'Ліворуч' }));
  fireEvent.click(screen.getByRole('button', { name: 'Показ' }));
  fireEvent.click(screen.getByLabelText('Показувати на мобільному'));
  fireEvent.click(screen.getByRole('button', { name: 'Мобільний' }));
  expect(screen.getByText('Промосмугу приховано для цього пристрою.')).toBeVisible();
  expect(screen.getByRole('switch', { name: 'Тема на сайті' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Опублікувати тему' }));
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Тема на сайті' })).toBeEnabled());
  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Знижки', promoBar: expect.objectContaining({ text: 'Знижки на смартфони', alignment: 'left', showMobile: false })
  }));
  expect(publish).toHaveBeenCalledWith('theme-1');
  expect(activate).not.toHaveBeenCalled();
  expect(screen.getByText('Промосмугу приховано для цього пристрою.')).toBeVisible();

  fireEvent.click(screen.getByRole('switch', { name: 'Тема на сайті' }));
  await waitFor(() => {
    const themeSwitch = screen.getByRole('switch', { name: 'Тема на сайті' });
    expect(themeSwitch).toHaveAttribute('aria-checked', 'true');
    expect(themeSwitch).toBeEnabled();
  });
  expect(activate).toHaveBeenCalledWith('theme-1', true);

  fireEvent.click(screen.getByRole('button', { name: 'Десктоп' }));
  expect(preview.getByText('Знижки на смартфони')).toBeVisible();
  fireEvent.click(screen.getByRole('switch', { name: 'Показувати верхню промосмугу' }));
  expect(await preview.findByText('Промосмугу вимкнено.')).toBeVisible();
  expect(setPromoBarEnabled).toHaveBeenCalledWith('theme-1', false);
  expect(publish).toHaveBeenCalledTimes(1);
});

it('asks before leaving a theme with unsaved changes', async () => {
  vi.spyOn(api.siteThemes, 'list').mockResolvedValue([]);
  renderTool();
  await screen.findByText('Тут з’являться ваші теми');
  fireEvent.click(screen.getByRole('button', { name: 'Створити тему' }));
  fireEvent.change(screen.getByLabelText('Назва теми'), { target: { value: 'Чернетка' } });

  fireEvent.click(screen.getByRole('button', { name: 'До інструментів' }));
  const dialog = await screen.findByRole('dialog', { name: 'Вийти з редактора?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Продовжити редагування' }));
  expect(screen.getByLabelText('Назва теми')).toHaveValue('Чернетка');

  fireEvent.click(screen.getByRole('button', { name: 'До інструментів' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Вийти' }));
  expect(await screen.findByRole('heading', { name: 'Інструменти' })).toBeVisible();
});
