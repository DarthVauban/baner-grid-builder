(function () {
  'use strict';

  const api = window.MTApi;
  const list = document.getElementById('admin-users-list');
  const summary = document.getElementById('admin-users-summary');
  const searchInput = document.getElementById('admin-users-search');
  const statusInput = document.getElementById('admin-users-status');
  const permissionsGrid = document.getElementById('admin-permissions-grid');
  const roleLabels = {
    admin: 'Адміністратор',
    editor: 'Редактор',
    content_manager: 'Контент-менеджер'
  };
  const resources = [
    { id: 'banner_grids', label: 'Банерні сітки', note: 'Перегляд усіх збережених сіток' },
    { id: 'saved_banners', label: 'Збережені банери', note: 'Перегляд усіх окремих банерів' },
    { id: 'product_tables', label: 'Таблиці товарів', note: 'Перегляд усіх завантажених таблиць' }
  ];
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

  function createRoleSelect(user) {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    const select = document.createElement('select');
    label.className = 'mt-admin__role-select';
    caption.textContent = 'Роль';
    select.className = 'mt-banner-builder__input';
    Object.entries(roleLabels).forEach(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    });
    select.value = user.role;
    select.addEventListener('change', async () => {
      const previousRole = user.role;
      select.disabled = true;
      try {
        await api.admin.setRole(user.id, select.value);
        notify('Роль користувача оновлено.', false);
        await loadUsers();
      } catch (error) {
        select.value = previousRole;
        notify(error.message, true);
      } finally {
        select.disabled = false;
      }
    });
    label.append(caption, select);
    return label;
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
      createBadge(roleLabels[user.role] || user.role, ''),
      createBadge(user.status, `mt-admin__badge--${user.status}`)
    );

    if (!isSelf) actions.appendChild(createRoleSelect(user));
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

    row.append(identity, badges, actions);
    return row;
  }

  function createPermissionCard(role, permissions) {
    const card = document.createElement('section');
    const title = document.createElement('h4');
    card.className = 'mt-admin-access__card';
    title.textContent = roleLabels[role];
    card.appendChild(title);

    resources.forEach((resource) => {
      const row = document.createElement('label');
      const copy = document.createElement('span');
      const name = document.createElement('strong');
      const note = document.createElement('small');
      const toggle = document.createElement('input');
      const current = permissions.find((item) => item.role === role && item.resource === resource.id);
      row.className = 'mt-admin-access__permission';
      name.textContent = resource.label;
      note.textContent = resource.note;
      copy.append(name, note);
      toggle.type = 'checkbox';
      toggle.className = 'mt-admin-access__toggle';
      toggle.checked = Boolean(current?.canViewAll);
      toggle.setAttribute('aria-label', `${roleLabels[role]}: ${resource.label}`);
      toggle.addEventListener('change', async () => {
        const nextValue = toggle.checked;
        toggle.disabled = true;
        try {
          await api.admin.setPermission(role, resource.id, nextValue);
          notify('Доступи ролі оновлено.', false);
        } catch (error) {
          toggle.checked = !nextValue;
          notify(error.message, true);
        } finally {
          toggle.disabled = false;
        }
      });
      row.append(copy, toggle);
      card.appendChild(row);
    });
    return card;
  }

  async function loadPermissions() {
    if (!currentUser || currentUser.role !== 'admin') return;
    permissionsGrid.setAttribute('aria-busy', 'true');
    try {
      const permissions = await api.admin.permissions();
      permissionsGrid.replaceChildren(
        createPermissionCard('editor', permissions),
        createPermissionCard('content_manager', permissions)
      );
    } catch (error) {
      permissionsGrid.textContent = error.message;
    } finally {
      permissionsGrid.removeAttribute('aria-busy');
    }
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
    if (currentUser.role === 'admin') Promise.all([loadUsers(), loadPermissions()]);
  });
  window.addEventListener('mt:signed-out', () => {
    currentUser = null;
    list.replaceChildren();
    permissionsGrid.replaceChildren();
  });
})();
