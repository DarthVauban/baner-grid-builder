import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getInitials, roleLabels } from '../lib/user';
import { Icon } from './Icon';
import { NotificationCenter } from './NotificationCenter';

export function AppShell() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return null;

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className={`app-shell${sidebarOpen ? ' app-shell--sidebar-open' : ''}`}>
      <div className="app-shell__backdrop" onClick={closeSidebar} aria-hidden="true" />

      <aside className="sidebar" aria-label="Головне меню">
        <a className="sidebar__brand" href="/">
          <span className="sidebar__brand-mark">MT</span>
          <span>
            <strong>Mobile Trend</strong>
            <small>Робочий простір</small>
          </span>
        </a>

        <nav className="sidebar__nav">
          <p className="sidebar__label">Простір</p>
          <NavLink className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/" end onClick={closeSidebar}>
            <Icon name="home" />
            <span>Огляд</span>
          </NavLink>
          <NavLink className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/tasks" onClick={closeSidebar}>
            <Icon name="tasks" />
            <span>Справи</span>
            <span className="sidebar__new">Новий</span>
          </NavLink>
          {user.role === 'admin' && (
            <NavLink className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/admin/users" onClick={closeSidebar}>
              <Icon name="users" />
              <span>Користувачі</span>
            </NavLink>
          )}

          <p className="sidebar__label sidebar__label--spaced">Інструменти</p>
          <a className="sidebar__link" href="/legacy">
            <Icon name="tools" />
            <span>Поточні інструменти</span>
            <Icon name="arrow" size={16} />
          </a>
        </nav>

        <div className="sidebar__profile">
          <span className="avatar">{getInitials(user.name)}</span>
          <span className="sidebar__profile-copy">
            <strong>{user.name}</strong>
            <small>{roleLabels[user.role]}</small>
          </span>
          <button className="icon-button" type="button" onClick={() => void logout()} aria-label="Вийти">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <div className="app-shell__content">
        <header className="topbar">
          <button className="icon-button topbar__menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Відкрити меню">
            <Icon name="menu" />
          </button>
          <div className="topbar__spacer" />
          <NotificationCenter />
          <span className="topbar__avatar avatar">{getInitials(user.name)}</span>
        </header>

        <main className="page-container">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
