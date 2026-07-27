import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { UserAvatar } from '../components/UserAvatar';

const tradeInLinks = [
  { to: '/trade-in/overview', icon: 'home' as const, label: 'Огляд' },
  { to: '/trade-in/prototype', icon: 'formBuilder' as const, label: 'Тестова форма' }
];

export function TradeInWorkspacePage() {
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('mt-trade-in-sidebar-collapsed') === 'true'
  );

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem('mt-trade-in-sidebar-collapsed', String(next));
      return next;
    });
  }

  return (
    <div className={`trade-in-workspace${sidebarCollapsed ? ' trade-in-workspace--sidebar-collapsed' : ''}`}>
      <button
        className="trade-in-sidebar__collapse"
        type="button"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? 'Розгорнути меню Trade-in' : 'Згорнути меню Trade-in'}
        title={sidebarCollapsed ? 'Розгорнути меню' : 'Згорнути меню'}
      >
        <Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size={20} />
      </button>

      <aside className="trade-in-sidebar">
        <Link className="trade-in-sidebar__brand" to="/trade-in/overview" aria-label="Trade-in Mobile Trend">
          <span><Icon name="tradeIn" size={22} /></span>
          <strong>Trade-in</strong>
        </Link>

        <nav className="trade-in-sidebar__nav" aria-label="Меню розділу Trade-in">
          {tradeInLinks.map((item) => (
            <NavLink
              aria-label={item.label}
              title={item.label}
              className={({ isActive }) => `trade-in-sidebar__link${isActive ? ' trade-in-sidebar__link--active' : ''}`}
              to={item.to}
              key={item.to}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="trade-in-sidebar__footer">
          <Link className="button button--secondary button--small" to="/" aria-label="До Workspace" title="До Workspace">
            <Icon name="arrowLeft" size={15} />
            <span>До Workspace</span>
          </Link>
          {user && (
            <Link className="trade-in-sidebar__profile" to="/profile" aria-label={user.name} title={user.name}>
              <UserAvatar name={user.name} avatarUrl={user.avatarUrl} />
              <span>{user.name}</span>
            </Link>
          )}
        </div>
      </aside>

      <main className="trade-in-workspace__content">
        <Outlet />
      </main>
    </div>
  );
}
