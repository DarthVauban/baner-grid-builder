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
  const adminTab = document.getElementById('admin-users-tab');
  let currentUser = null;

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
    currentUserMeta.textContent = `${user.email} · ${user.role}`;
    adminTab.hidden = user.role !== 'admin';
    window.dispatchEvent(new CustomEvent('mt:authenticated', { detail: { user } }));
  }

  function closeApplication(message) {
    currentUser = null;
    builderApp.hidden = true;
    authScreen.hidden = false;
    adminTab.hidden = true;
    switchAuthForm('login-form');
    showMessage(message || '', Boolean(message));
  }

  authTabs.forEach((button) => {
    button.addEventListener('click', () => switchAuthForm(button.dataset.authTarget));
  });

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
