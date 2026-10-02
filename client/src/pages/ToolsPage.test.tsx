import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ToolsPage } from './ToolsPage';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ToolsPage /></MemoryRouter>
    </QueryClientProvider>
  );
}

async function expandCategory(name: string) {
  const label = await screen.findByText(name);
  const summary = label.closest('summary');
  expect(summary).not.toBeNull();
  fireEvent.click(summary!);
}

describe('ToolsPage loading recovery', () => {
  it('lets the user cancel and restart a stalled catalog request', async () => {
    vi.useFakeTimers();
    const catalogSpy = vi.spyOn(api.users, 'toolCatalog').mockImplementation((signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));

    renderPage();
    expect(screen.getByText('Завантажуємо інструменти…')).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(8_000));
    const restart = screen.getByRole('button', { name: 'Перезапустити завантаження' });
    expect(screen.getByText('Завантаження триває довше, ніж зазвичай.')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(restart);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(catalogSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Завантажуємо інструменти…')).toBeInTheDocument();
  });
});

describe('ToolsPage catalog', () => {
  it('shows bulk sticker management in the Horoshop API category', async () => {
    vi.spyOn(api.users, 'toolCatalog').mockResolvedValue({ tools: [{ toolId: 'horoshop_stickers', granted: true, accessible: true, blockedByTwoFactor: false, requiresTwoFactor: false }], twoFactorEnabled: true });
    renderPage();
    await expandCategory('Керування Хорошопом через API');
    const tile = await screen.findByRole('link', { name: /Стікери Хорошоп/u });
    expect(tile).toHaveAttribute('href', '/tools/horoshop-stickers');
    expect(tile.closest('details')).toHaveTextContent('Керування Хорошопом через API');
  });
  it('keeps cached tools visible while a slow background refresh is pending', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['tool-catalog'], {
      tools: [{
        toolId: 'horoshop_photo_parser',
        granted: true,
        accessible: true,
        blockedByTwoFactor: false,
        requiresTwoFactor: false
      }],
      twoFactorEnabled: true
    }, { updatedAt: Date.now() - 31_000 });
    vi.spyOn(api.users, 'toolCatalog').mockImplementation(() => new Promise(() => {}));

    renderPage(client);

    await expandCategory('Керування Хорошопом через API');
    expect(await screen.findByRole('link', { name: /Фото товарів Хорошоп/ })).toBeInTheDocument();
    expect(screen.queryByText('Завантажуємо інструменти…')).not.toBeInTheDocument();
  });

  it('shows Facebook group publications as a separate tool tile', async () => {
    vi.spyOn(api.users, 'toolCatalog').mockResolvedValue({
      tools: [{
        toolId: 'facebook_group_publications',
        granted: true,
        accessible: true,
        blockedByTwoFactor: false,
        requiresTwoFactor: false
      }],
      twoFactorEnabled: true
    });

    renderPage();

    await expandCategory('Інструменти робочого простору');
    const tile = await screen.findByRole('link', { name: /Публікації у міські Facebook-групи/ });
    expect(tile).toHaveAttribute('href', '/tools/facebook-publications');
  });

  it('shows the Horoshop related-products catalog as a separate tool tile', async () => {
    vi.spyOn(api.users, 'toolCatalog').mockResolvedValue({
      tools: [{
        toolId: 'horoshop_related_products',
        granted: true,
        accessible: true,
        blockedByTwoFactor: false,
        requiresTwoFactor: false
      }],
      twoFactorEnabled: true
    });

    renderPage();

    await expandCategory('Керування Хорошопом через API');
    const tile = await screen.findByRole('link', { name: /Супутні товари Хорошоп/ });
    expect(tile).toHaveAttribute('href', '/tools/horoshop-related-products');
  });

  it('links to a dedicated Horoshop widget section', async () => {
    vi.spyOn(api.users, 'toolCatalog').mockResolvedValue({
      tools: [{
        toolId: 'popup_banners',
        granted: true,
        accessible: true,
        blockedByTwoFactor: false,
        requiresTwoFactor: false
      }],
      twoFactorEnabled: true
    });

    renderPage();

    const entry = await screen.findByRole('link', { name: /Віджети для Хорошопа/ });
    expect(entry).toHaveAttribute('href', '/tools/horoshop-widgets');
    expect(screen.queryByRole('link', { name: /Попап-банери/ })).not.toBeInTheDocument();
  });

  it('keeps forms in workspace tools and sends storefront buttons to widgets', async () => {
    vi.spyOn(api.users, 'toolCatalog').mockResolvedValue({
      tools: [{
        toolId: 'form_builder',
        granted: true,
        accessible: true,
        blockedByTwoFactor: false,
        requiresTwoFactor: false
      }],
      twoFactorEnabled: true
    });

    renderPage();

    await expandCategory('Інструменти робочого простору');
    const tile = await screen.findByRole('link', { name: /Конструктор форм/u });
    expect(tile).toHaveAttribute('href', '/tools/forms');
    expect(await screen.findByRole('link', { name: /Віджети для Хорошопа/ })).toHaveAttribute('href', '/tools/horoshop-widgets');
    expect(screen.queryByRole('link', { name: /Кнопки форм/u })).not.toBeInTheDocument();
  });

  it('groups the product selection builder under Horoshop tools', async () => {
    vi.spyOn(api.users, 'toolCatalog').mockResolvedValue({
      tools: [{
        toolId: 'product_selection',
        granted: true,
        accessible: true,
        blockedByTwoFactor: false,
        requiresTwoFactor: false
      }],
      twoFactorEnabled: true
    });

    renderPage();

    await expandCategory('Керування Хорошопом через API');
    const tile = await screen.findByRole('link', { name: /Вибірка товарів/u });
    expect(tile).toHaveAttribute('href', '/tools/product-selection');
    expect(screen.queryByText('Інструменти робочого простору')).not.toBeInTheDocument();
  });

  it('keeps workspace and API categories separate from the widget section', async () => {
    vi.spyOn(api.users, 'toolCatalog').mockResolvedValue({
      tools: [
        { toolId: 'popup_banners', granted: true, accessible: true, blockedByTwoFactor: false, requiresTwoFactor: false },
        { toolId: 'online_support', granted: true, accessible: true, blockedByTwoFactor: false, requiresTwoFactor: false },
        { toolId: 'horoshop_cart_theme', granted: true, accessible: true, blockedByTwoFactor: false, requiresTwoFactor: false },
        { toolId: 'blog_publications', granted: true, accessible: true, blockedByTwoFactor: false, requiresTwoFactor: false },
        { toolId: 'horoshop_stickers', granted: true, accessible: true, blockedByTwoFactor: false, requiresTwoFactor: false }
      ],
      twoFactorEnabled: true
    });

    renderPage();

    expect(await screen.findByText('Керування Хорошопом через API')).toBeInTheDocument();
    const widgetEntry = screen.getByRole('link', { name: /Віджети для Хорошопа/ });
    expect(widgetEntry).toHaveAttribute('href', '/tools/horoshop-widgets');
    expect(screen.getByText('Інструменти робочого простору')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Онлайн-підтримка/ })).not.toBeInTheDocument();
  });
});
