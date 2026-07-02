(function () {
  'use strict';

  const api = window.MTApi;
  const authScreen = document.getElementById('auth-screen');
  const builderApp = document.getElementById('builder-app');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authTabs = Array.from(document.querySelectorAll('[data-auth-target]'));
  const authMessage = document.getElementById('auth-message');
  const logoutButton = document.getElementById('logout-button');
  const currentUserName = document.getElementById('current-user-name');
  const currentUserMeta = document.getElementById('current-user-meta');
  const currentUserAvatar = document.getElementById('current-user-avatar');
  const adminTab = document.getElementById('admin-users-tab');
  const profileMenuToggle = document.getElementById('profile-menu-toggle');
  const profileMenu = document.getElementById('profile-menu');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const sidebarCollapseToggle = document.getElementById('sidebar-collapse-toggle');
  const navigationButtons = Array.from(document.querySelectorAll('[data-tab-target]'));
  let currentUser = null;
  let sidebarContentAnimation = null;
  const roleLabels = {
    admin: 'Адміністратор',
    editor: 'Редактор',
    content_manager: 'Контент-менеджер'
  };

  function getInitials(name) {
    return String(name || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || 'MT';
  }

  function setProfileMenu(open) {
    profileMenu.hidden = !open;
    profileMenuToggle.setAttribute('aria-expanded', String(open));
  }

  function setSidebar(open) {
    builderApp.classList.toggle('mt-app-shell--sidebar-open', open);
    sidebarToggle.setAttribute('aria-expanded', String(open));
    sidebarBackdrop.hidden = !open;
  }

  function setSidebarCompact(compact, persist) {
    const content = builderApp.querySelector(':scope > .mt-banner-builder');
    const shouldAnimate = persist !== false
      && window.matchMedia('(min-width: 921px)').matches
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && typeof content?.animate === 'function';
    const previousLeft = shouldAnimate && content ? content.getBoundingClientRect().left : 0;

    builderApp.classList.toggle('mt-app-shell--sidebar-compact', compact);
    sidebarCollapseToggle.setAttribute('aria-pressed', String(compact));
    sidebarCollapseToggle.setAttribute('aria-label', compact ? 'Розгорнути сайдбар' : 'Згорнути сайдбар');

    if (shouldAnimate && content) {
      const nextLeft = content.getBoundingClientRect().left;
      sidebarContentAnimation?.cancel();
      sidebarContentAnimation = content.animate(
        [
          { transform: `translateX(${previousLeft - nextLeft}px)` },
          { transform: 'translateX(0)' }
        ],
        { duration: 180, easing: 'cubic-bezier(.2, .8, .2, 1)' }
      );
      sidebarContentAnimation.addEventListener('finish', () => {
        sidebarContentAnimation = null;
      }, { once: true });
    }

    if (persist !== false) {
      try {
        window.localStorage.setItem('mt-sidebar-compact', String(compact));
      } catch (error) {
        // The layout still works when a browser blocks local storage.
      }
    }
  }

  function getSavedSidebarState() {
    try {
      return window.localStorage.getItem('mt-sidebar-compact') === 'true';
    } catch (error) {
      return false;
    }
  }

  function showMessage(message, isError) {
    authMessage.textContent = message;
    authMessage.hidden = !message;
    authMessage.classList.toggle('mt-auth__message--error', Boolean(isError));
  }

  function switchAuthForm(targetId) {
    authTabs.forEach((button) => {
      button.classList.toggle('mt-auth__tab--active', button.dataset.authTarget === targetId);
    });
    loginForm.hidden = targetId !== 'login-form';
    registerForm.hidden = targetId !== 'register-form';
    showMessage('', false);
  }

  function setFormPending(form, pending) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = pending;
    if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent.trim();
    button.textContent = pending ? 'Зачекайте…' : button.dataset.defaultText;
  }

  function openApplication(user) {
    currentUser = user;
    authScreen.hidden = true;
    builderApp.hidden = false;
    currentUserName.textContent = user.name;
    currentUserMeta.textContent = `${user.email} · ${roleLabels[user.role] || user.role}`;
    currentUserAvatar.textContent = getInitials(user.name);
    adminTab.hidden = user.role !== 'admin';
    setProfileMenu(false);
    setSidebar(false);
    window.dispatchEvent(new CustomEvent('mt:authenticated', { detail: { user } }));
  }

  function closeApplication(message) {
    currentUser = null;
    builderApp.hidden = true;
    authScreen.hidden = false;
    adminTab.hidden = true;
    setProfileMenu(false);
    setSidebar(false);
    switchAuthForm('login-form');
    showMessage(message || '', Boolean(message));
  }

  authTabs.forEach((button) => {
    button.addEventListener('click', () => switchAuthForm(button.dataset.authTarget));
  });

  profileMenuToggle.addEventListener('click', () => {
    setProfileMenu(profileMenu.hidden);
  });

  sidebarToggle.addEventListener('click', () => {
    setSidebar(!builderApp.classList.contains('mt-app-shell--sidebar-open'));
  });

  sidebarCollapseToggle.addEventListener('click', () => {
    setSidebarCompact(!builderApp.classList.contains('mt-app-shell--sidebar-compact'));
  });

  sidebarBackdrop.addEventListener('click', () => setSidebar(false));

  navigationButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setProfileMenu(false);
      setSidebar(false);
    });
  });

  document.addEventListener('click', (event) => {
    if (!profileMenu.hidden && !event.target.closest('.mt-sidebar__profile')) {
      setProfileMenu(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    setProfileMenu(false);
    setSidebar(false);
  });

  setSidebarCompact(getSavedSidebarState(), false);

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFormPending(loginForm, true);
    showMessage('', false);

    try {
      const data = new FormData(loginForm);
      const user = await api.auth.login({
        email: String(data.get('email') || ''),
        password: String(data.get('password') || '')
      });
      loginForm.reset();
      openApplication(user);
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setFormPending(loginForm, false);
    }
  });

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFormPending(registerForm, true);
    showMessage('', false);

    try {
      const data = new FormData(registerForm);
      await api.auth.register({
        name: String(data.get('name') || ''),
        email: String(data.get('email') || ''),
        password: String(data.get('password') || '')
      });
      registerForm.reset();
      switchAuthForm('login-form');
      showMessage('Реєстрацію завершено. Після схвалення адміністратором ви зможете увійти.', false);
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setFormPending(registerForm, false);
    }
  });

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    try {
      await api.auth.logout();
    } finally {
      logoutButton.disabled = false;
      closeApplication('');
      window.dispatchEvent(new CustomEvent('mt:signed-out'));
    }
  });

  window.addEventListener('mt:unauthorized', () => {
    closeApplication('Сесія завершилась. Увійдіть знову.');
    window.dispatchEvent(new CustomEvent('mt:signed-out'));
  });

  api.auth.me()
    .then(openApplication)
    .catch(() => closeApplication(''));
})();
