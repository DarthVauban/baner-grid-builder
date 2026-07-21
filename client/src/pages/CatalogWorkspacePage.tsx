import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../auth/AuthContext';

const catalogLinks = [
  { to: '/catalog/products', icon: 'productSelection' as const, label: 'Товари' },
  { to: '/catalog/imports', icon: 'upload' as const, label: 'Імпорт XLSX' },
  { to: '/catalog/brands', icon: 'brands' as const, label: 'Бренди' },
  { to: '/catalog/characteristics', icon: 'characteristics' as const, label: 'Характеристики' },
  { to: '/catalog/storefront', icon: 'storefront' as const, label: 'Налаштування вітрини' },
  { to: '/catalog/product-card', icon: 'productCard' as const, label: 'Картка товару' },
  { to: '/catalog/product-page', icon: 'productPage' as const, label: 'Сторінка товару' },
  { to: '/catalog/preview', icon: 'visibility' as const, label: 'Preview магазину' },
  { to: '/catalog/audit', icon: 'history' as const, label: 'Історія змін' }
];

export function CatalogWorkspacePage() {
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('mt-catalog-sidebar-collapsed') === 'true');

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem('mt-catalog-sidebar-collapsed', String(next));
      return next;
    });
  };

  return <div className={`catalog-workspace${sidebarCollapsed ? ' catalog-workspace--sidebar-collapsed' : ''}`}>
    <button
      className="catalog-sidebar__collapse"
      type="button"
      onClick={toggleSidebar}
      aria-label={sidebarCollapsed ? 'Розгорнути меню каталогу' : 'Згорнути меню каталогу'}
      title={sidebarCollapsed ? 'Розгорнути меню' : 'Згорнути меню'}
    >
      <Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size={20} />
    </button>
    <aside className="catalog-sidebar">
      <Link className="catalog-sidebar__brand" to="/catalog/products" aria-label="Каталог смартфонів" title="Каталог смартфонів">
        <span><Icon name="catalog" size={22} /></span>
        <strong>Каталог смартфонів</strong>
      </Link>
      <nav className="catalog-sidebar__nav" aria-label="Меню каталогу смартфонів">
        {catalogLinks.map((item) => <NavLink aria-label={item.label} title={item.label} className={({ isActive }) => `catalog-sidebar__link${isActive ? ' catalog-sidebar__link--active' : ''}`} to={item.to} key={item.to}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>)}
      </nav>
      <div className="catalog-sidebar__footer">
        <Link className="button button--secondary button--small" to="/" aria-label="До Workspace" title="До Workspace"><Icon name="arrowLeft" size={15} /><span>До Workspace</span></Link>
        {user && <Link className="catalog-sidebar__profile" to="/profile" aria-label={user.name} title={user.name}><UserAvatar name={user.name} avatarUrl={user.avatarUrl} /><span>{user.name}</span></Link>}
      </div>
    </aside>
    <main className="catalog-workspace__content">
      <Outlet />
    </main>
  </div>;
}

export function CatalogPlaceholderPage({ title }: { title: string }) {
  return <section className="catalog-placeholder">
    <div className="empty-state__icon"><Icon name="phone" size={28} /></div>
    <h1>{title}</h1>
  </section>;
}
