import { Link, NavLink, Outlet } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { UserAvatar } from '../components/UserAvatar';
import { useAuth } from '../auth/AuthContext';

const catalogLinks = [
  { to: '/catalog/products', icon: 'phone' as const, label: 'Товари' },
  { to: '/catalog/imports', icon: 'upload' as const, label: 'Імпорт XLSX' },
  { to: '/catalog/brands', icon: 'savedBanners' as const, label: 'Бренди' },
  { to: '/catalog/characteristics', icon: 'productTables' as const, label: 'Характеристики' },
  { to: '/catalog/filters', icon: 'search' as const, label: 'Фільтри' },
  { to: '/catalog/storefront', icon: 'integrations' as const, label: 'Налаштування вітрини' },
  { to: '/catalog/preview', icon: 'visibility' as const, label: 'Preview магазину' },
  { to: '/catalog/audit', icon: 'schedule' as const, label: 'Історія змін' }
];

export function CatalogWorkspacePage() {
  const { user } = useAuth();

  return <div className="catalog-workspace">
    <aside className="catalog-sidebar">
      <Link className="catalog-sidebar__brand" to="/catalog/products">
        <span><Icon name="phone" size={22} /></span>
        <strong>Каталог смартфонів</strong>
      </Link>
      <nav className="catalog-sidebar__nav" aria-label="Меню каталогу смартфонів">
        {catalogLinks.map((item) => <NavLink className={({ isActive }) => `catalog-sidebar__link${isActive ? ' catalog-sidebar__link--active' : ''}`} to={item.to} key={item.to}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>)}
      </nav>
      <div className="catalog-sidebar__footer">
        <Link className="button button--secondary button--small" to="/"><Icon name="arrowLeft" size={15} /> До Workspace</Link>
        {user && <Link className="catalog-sidebar__profile" to="/profile"><UserAvatar name={user.name} avatarUrl={user.avatarUrl} /><span>{user.name}</span></Link>}
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
