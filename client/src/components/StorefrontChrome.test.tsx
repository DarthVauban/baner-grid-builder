import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { cloneStorefrontTheme } from '../lib/storefront-theme';
import { StorefrontFooter, StorefrontHeader, storefrontLinkHref } from './StorefrontChrome';

describe('StorefrontChrome', () => {
  it('renders configurable header navigation and resolves the storefront root', () => {
    const theme = cloneStorefrontTheme();
    theme.header.links = [
      { id: 'catalog', label: 'Каталог', url: '/', newTab: false },
      { id: 'delivery', label: 'Доставка', url: 'https://example.com/delivery', newTab: true }
    ];

    const { container } = render(<StorefrontHeader theme={theme} basePath="/storefront" />);

    expect(container.querySelector('.storefront-header > .storefront-header__container')).toBeInTheDocument();
    expect(screen.getByText('Смартфони з гарантією')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Каталог' })).toHaveAttribute('href', '/storefront');
    expect(screen.getByRole('link', { name: 'Доставка' })).toHaveAttribute('target', '_blank');
  });

  it('renders footer contacts, sections, socials and a dynamic year', () => {
    const theme = cloneStorefrontTheme();
    theme.footer.email = 'hello@example.com';
    theme.footer.phone = '+380 50 123 45 67';
    theme.footer.copyright = '{year} Тестовий магазин';
    theme.footer.socialLinks = [{ id: 'telegram', platform: 'telegram', label: 'Наш Telegram', url: 'https://t.me/example' }];

    render(<StorefrontFooter theme={theme} basePath="/" />);

    expect(screen.getByText(theme.footer.description)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'hello@example.com' })).toHaveAttribute('href', 'mailto:hello@example.com');
    expect(screen.getByRole('link', { name: 'Наш Telegram' })).toHaveAttribute('href', 'https://t.me/example');
    expect(screen.getByText(`© ${new Date().getFullYear()} Тестовий магазин`)).toBeInTheDocument();
  });

  it('opens the burger menu and closes it with Escape or after navigation', async () => {
    const user = userEvent.setup();
    const theme = cloneStorefrontTheme();
    theme.header.links = [{ id: 'catalog', label: 'Каталог', url: '#catalog', newTab: false }];

    const { container } = render(<StorefrontHeader theme={theme} />);
    const toggle = screen.getByRole('button', { name: 'Відкрити меню' });
    const menu = container.querySelector('.storefront-header__menu');

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(menu).not.toHaveClass('storefront-header__menu--open');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(menu).toHaveClass('storefront-header__menu--open');

    await user.keyboard('{Escape}');

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    await user.click(screen.getByRole('link', { name: 'Каталог' }));

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('rejects unsafe link protocols', () => {
    expect(storefrontLinkHref('javascript:alert(1)', '/storefront')).toBe('/storefront');
  });
});
