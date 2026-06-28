(function () {
  'use strict';

  const api = window.MTApi;
  const list = document.getElementById('admin-users-list');
  const summary = document.getElementById('admin-users-summary');
  const searchInput = document.getElementById('admin-users-search');
  const statusInput = document.getElementById('admin-users-status');
  let currentUser = null;
  let searchTimer;

  function notify(message, error) {
    window.dispatchEvent(new CustomEvent('mt:notify', { detail: { message, error } }));
  }

  function createButton(text, modifier, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mt-banner-builder__button ${modifier}`;
    button.textContent = text;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await action();
        await loadUsers();
      } catch (error) {
        notify(error.message, true);
      } finally {
        button.disabled = false;
      }
    });
    return button;
  }

  function createBadge(text, modifier) {
    const badge = document.createElement('span');
    badge.className = `mt-admin__badge ${modifier || ''}`.trim();
    badge.textContent = text;
    return badge;
  }

  function renderUser(user) {
    const row = document.createElement('article');
    const identity = document.createElement('div');
    const name = document.createElement('strong');
    const email = document.createElement('span');
    const badges = document.createElement('div');
    const actions = document.createElement('div');
    const isSelf = currentUser && currentUser.id === user.id;

    row.className = 'mt-admin__user';
    identity.className = 'mt-admin__identity';
    badges.className = 'mt-admin__badges';
    actions.className = 'mt-admin__actions';
    name.textContent = user.name;
    email.textContent = user.email;
    identity.append(name, email);
    badges.append(
      createBadge(user.role, ''),
      createBadge(user.status, `mt-admin__badge--${user.status}`)
    );

    if (user.status !== 'approved') {
      actions.append(createButton('Схвалити', 'mt-banner-builder__button--primary', async () => {
        await api.admin.setStatus(user.id, 'approved');
        notify('Користувача схвалено.', false);
      }));
    }
    if (!isSelf && user.status !== 'rejected') {
      actions.append(createButton('Відхилити', 'mt-banner-builder__button--danger', async () => {
        await api.admin.setStatus(user.id, 'rejected');
        notify('Користувача відхилено.', false);
      }));
    }
    if (!isSelf) {
      const nextRole = user.role === 'admin' ? 'user' : 'admin';
      actions.append(createButton(
        user.role === 'admin' ? 'Зробити user' : 'Зробити admin',
        'mt-banner-builder__button--secondary',
        async () => {
          await api.admin.setRole(user.id, nextRole);
          notify('Роль користувача оновлено.', false);
        }
      ));
    }

    row.append(identity, badges, actions);
    return row;
  }

  async function loadUsers() {
    if (!currentUser || currentUser.role !== 'admin') return;
    summary.textContent = 'Завантаження…';

    try {
      const users = await api.admin.users({
        search: searchInput.value.trim(),
        status: statusInput.value
      });
      list.replaceChildren();
      users.forEach((user) => list.appendChild(renderUser(user)));
      if (!users.length) {
        const empty = document.createElement('div');
        empty.className = 'mt-banner-builder__empty';
        empty.textContent = 'Користувачів не знайдено.';
        list.appendChild(empty);
      }
      const pendingCount = users.filter((user) => user.status === 'pending').length;
      summary.textContent = `Користувачів: ${users.length} · Очікують схвалення: ${pendingCount}`;
    } catch (error) {
      summary.textContent = error.message;
    }
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadUsers, 250);
  });
  statusInput.addEventListener('change', loadUsers);
  window.addEventListener('mt:authenticated', (event) => {
    currentUser = event.detail.user;
    if (currentUser.role === 'admin') loadUsers();
  });
  window.addEventListener('mt:signed-out', () => {
    currentUser = null;
    list.replaceChildren();
  });
})();
