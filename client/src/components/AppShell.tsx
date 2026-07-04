import { useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getInitials, roleLabels } from '../lib/user';
import { Icon } from './Icon';
import { NotificationCenter } from './NotificationCenter';
import { useTheme } from '../theme/ThemeContext';

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('mt-sidebar-collapsed') === 'true');
  const sidebarRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousLayoutRef = useRef<{ contentLeft: number; sidebarWidth: number } | null>(null);
  const layoutAnimationsRef = useRef<Animation[]>([]);

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebar = () => {
    if (window.matchMedia('(min-width: 921px)').matches && sidebarRef.current && contentRef.current) {
      previousLayoutRef.current = {
        contentLeft: contentRef.current.getBoundingClientRect().left,
        sidebarWidth: sidebarRef.current.getBoundingClientRect().width
      };
    }
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem('mt-sidebar-collapsed', String(next));
      return next;
    });
  };

  useLayoutEffect(() => {
    const previousLayout = previousLayoutRef.current;
    if (!previousLayout || !sidebarRef.current || !contentRef.current) return;

    layoutAnimationsRef.current.forEach((animation) => animation.cancel());
    layoutAnimationsRef.current = [];
    previousLayoutRef.current = null;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof contentRef.current.animate !== 'function' || typeof sidebarRef.current.animate !== 'function') return;

    const currentContentLeft = contentRef.current.getBoundingClientRect().left;
    const currentSidebarWidth = sidebarRef.current.getBoundingClientRect().width;
    const options: KeyframeAnimationOptions = {
      duration: 180,
      easing: 'cubic-bezier(.2,.8,.2,1)'
    };

    const animations = [
      contentRef.current.animate([
        { transform: `translateX(${previousLayout.contentLeft - currentContentLeft}px)` },
        { transform: 'translateX(0)' }
      ], options),
      sidebarRef.current.animate([
        { width: `${previousLayout.sidebarWidth}px` },
        { width: `${currentSidebarWidth}px` }
      ], options)
    ];
    layoutAnimationsRef.current = animations;

    return () => {
      animations.forEach((animation) => animation.cancel());
      if (layoutAnimationsRef.current === animations) layoutAnimationsRef.current = [];
    };
  }, [sidebarCollapsed]);

  if (!user) return null;

  return (
    <div className={`app-shell${sidebarOpen ? ' app-shell--sidebar-open' : ''}${sidebarCollapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
      <div className="app-shell__backdrop" onClick={closeSidebar} aria-hidden="true" />

      <button
        className="sidebar__collapse"
        type="button"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? 'Розгорнути бічне меню' : 'Згорнути бічне меню'}
        title={sidebarCollapsed ? 'Розгорнути меню' : 'Згорнути меню'}
      >
        <Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size={20} />
      </button>

      <aside className="sidebar" aria-label="Головне меню" ref={sidebarRef}>
        <a className="sidebar__brand" href="/">
          <span className="sidebar__brand-mark">MT</span>
          <span>
            <strong>Mobile Trend</strong>
            <small>Робочий простір</small>
          </span>
        </a>

        <nav className="sidebar__nav">
          <p className="sidebar__label">Простір</p>
          <NavLink aria-label="Огляд" title="Огляд" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/" end onClick={closeSidebar}>
            <Icon name="home" />
            <span>Огляд</span>
          </NavLink>
          <NavLink aria-label="Справи" title="Справи" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/tasks" onClick={closeSidebar}>
            <Icon name="tasks" />
            <span>Справи</span>
            <span className="sidebar__new">Новий</span>
          </NavLink>
          {user.role === 'admin' && (
            <NavLink aria-label="Користувачі" title="Користувачі" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/admin/users" onClick={closeSidebar}>
              <Icon name="users" />
              <span>Користувачі</span>
            </NavLink>
          )}

          <p className="sidebar__label sidebar__label--spaced">Інструменти</p>
          <NavLink aria-label="Банерна сітка" title="Банерна сітка" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/tools/banner-grid" onClick={closeSidebar}>
            <Icon name="bannerGrid" />
            <span>Банерна сітка</span>
          </NavLink>
          <NavLink aria-label="Вибірка товарів" title="Вибірка товарів" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/tools/product-selection" onClick={closeSidebar}>
            <Icon name="productSelection" />
            <span>Вибірка товарів</span>
          </NavLink>
          <NavLink aria-label="Таблиці товарів" title="Таблиці товарів" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/tools/product-tables" onClick={closeSidebar}>
            <Icon name="productTables" />
            <span>Таблиці товарів</span>
          </NavLink>
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

      <div className="app-shell__content" ref={contentRef}>
        <header className="topbar">
          <button className="icon-button topbar__menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Відкрити меню">
            <Icon name="menu" />
          </button>
          <div className="topbar__spacer" />
          <button className="icon-button topbar__theme" type="button" onClick={toggleTheme} aria-label={theme === 'light' ? 'Увімкнути фірмову темну тему' : 'Увімкнути світлу тему'} title={theme === 'light' ? 'Фірмова темна тема' : 'Світла тема'}>
            <Icon name={theme === 'light' ? 'darkMode' : 'lightMode'} />
          </button>
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
