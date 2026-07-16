import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { roleLabels } from '../lib/user';
import { Icon } from './Icon';
import { NotificationCenter } from './NotificationCenter';
import { useTheme } from '../theme/ThemeContext';
import { UserAvatar } from './UserAvatar';

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('mt-sidebar-collapsed') === 'true');
  const sidebarRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousLayoutRef = useRef<{ contentLeft: number; sidebarWidth: number } | null>(null);
  const layoutAnimationsRef = useRef<Animation[]>([]);
  const locationRef = useRef(location);
  const toolAccess = useQuery({
    queryKey: ['tool-access'],
    queryFn: api.users.toolAccess,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true
  });
  const hasChatAccess = toolAccess.data?.includes('chat') === true;
  const hasApplicationsAccess = toolAccess.data?.includes('applications') === true;
  const hasCatalogAccess = toolAccess.data?.includes('used_smartphones_catalog') === true;
  const chatUnread = useQuery({
    queryKey: ['chat-unread-count'],
    queryFn: api.chat.unreadCount,
    enabled: hasChatAccess,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true
  });

  useEffect(() => { locationRef.current = location; }, [location]);

  useEffect(() => {
    if (!hasChatAccess || !userId) return undefined;
    const stream = new EventSource('/api/chat/stream');
    const sound = new Audio('/sounds/chat-notification.mp3');
    sound.preload = 'auto';
    sound.volume = 0.55;
    const refresh = (event: Event) => {
      let payload: { type?: string; conversationId?: string; senderId?: string; isTyping?: boolean } = {};
      try { payload = JSON.parse((event as MessageEvent).data || '{}'); } catch { /* ignore malformed event data */ }
      if (payload.type === 'typing') {
        window.dispatchEvent(new CustomEvent('mt:chat-typing', { detail: payload }));
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['chat-unread-count'] });
      if (payload.conversationId) void queryClient.invalidateQueries({ queryKey: ['chat-messages', payload.conversationId] });
      const currentLocation = locationRef.current;
      const activeConversation = new URLSearchParams(currentLocation.search).get('conversation');
      const isActiveConversation = currentLocation.pathname === '/chat' && activeConversation === payload.conversationId;
      if (payload.type === 'message' && payload.senderId !== userId && !isActiveConversation) {
        sound.currentTime = 0;
        void sound.play().catch(() => undefined);
      }
    };
    stream.addEventListener('chat', refresh);
    return () => { stream.removeEventListener('chat', refresh); stream.close(); sound.pause(); };
  }, [hasChatAccess, queryClient, userId]);

  useEffect(() => {
    if (!hasApplicationsAccess || !userId) return undefined;
    const stream = new EventSource('/api/applications/stream');
    const refresh = (event: Event) => {
      let payload: { applicationId?: string } = {};
      try { payload = JSON.parse((event as MessageEvent).data || '{}'); } catch { /* ignore malformed event data */ }
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      void queryClient.invalidateQueries({ queryKey: ['application-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['application-form-filters'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      if (payload.applicationId) {
        void queryClient.invalidateQueries({ queryKey: ['application', payload.applicationId] });
        void queryClient.invalidateQueries({ queryKey: ['shared-application', payload.applicationId] });
      }
    };
    stream.addEventListener('applications', refresh);
    return () => { stream.removeEventListener('applications', refresh); stream.close(); };
  }, [hasApplicationsAccess, queryClient, userId]);

  useEffect(() => {
    if (!hasCatalogAccess || !userId) return undefined;
    const stream = new EventSource('/api/catalog/stream');
    const refresh = (event: Event) => {
      let payload: { productId?: string } = {};
      try { payload = JSON.parse((event as MessageEvent).data || '{}'); } catch { /* ignore malformed event data */ }
      void queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-imports'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-brand-directories'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-brands'] });
      void queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      if (payload.productId) void queryClient.invalidateQueries({ queryKey: ['catalog-product', payload.productId] });
    };
    stream.addEventListener('catalog', refresh);
    return () => { stream.removeEventListener('catalog', refresh); stream.close(); };
  }, [hasCatalogAccess, queryClient, userId]);

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
          </NavLink>
          {hasChatAccess && <NavLink aria-label="Чат" title="Чат" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/chat" onClick={closeSidebar}>
            <Icon name="chat" />
            <span>Чат</span>
            {(chatUnread.data || 0) > 0 && <span className="sidebar__count">{(chatUnread.data || 0) > 99 ? '99+' : chatUnread.data}</span>}
          </NavLink>}
          {(user.role === 'admin' || user.canManageToolAccess) && (
            <>
              <p className="sidebar__label sidebar__label--spaced">Панель керування</p>
              <NavLink aria-label="Користувачі" title="Користувачі" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/admin/users" onClick={closeSidebar}>
                <Icon name="users" />
                <span>Користувачі</span>
              </NavLink>
              {user.role === 'admin' && (
                <NavLink aria-label="Інтеграції" title="Інтеграції" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/admin/integrations" onClick={closeSidebar}>
                  <Icon name="integrations" />
                  <span>Інтеграції</span>
                </NavLink>
              )}
            </>
          )}

          <p className="sidebar__label sidebar__label--spaced">Інструменти</p>
          <NavLink aria-label="Інструменти" title="Інструменти" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/tools" onClick={closeSidebar}>
            <Icon name="tools" />
            <span>Інструменти</span>
          </NavLink>
          {hasCatalogAccess && <NavLink aria-label="Каталог смартфонів" title="Каталог смартфонів" className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to="/catalog/products" onClick={closeSidebar}>
            <Icon name="phone" />
            <span>Каталог смартфонів</span>
          </NavLink>}
        </nav>

        <div className="sidebar__profile">
          <Link className="sidebar__profile-link" to="/profile" title="Відкрити профіль">
            <UserAvatar name={user.name} avatarUrl={user.avatarUrl} />
            <span className="sidebar__profile-copy"><strong>{user.name}</strong><small>{roleLabels[user.role]}</small></span>
          </Link>
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
          <Link className="topbar__profile" to="/profile" title="Відкрити профіль"><UserAvatar name={user.name} avatarUrl={user.avatarUrl} /></Link>
        </header>

        <main className="page-container">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
