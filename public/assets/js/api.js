(function () {
  'use strict';

  class ApiError extends Error {
    constructor(status, payload) {
      super(payload?.error?.message || 'Помилка запиту до сервера.');
      this.name = 'ApiError';
      this.status = status;
      this.code = payload?.error?.code || 'API_ERROR';
      this.details = payload?.error?.details;
    }
  }

  async function request(path, options) {
    const settings = options || {};
    const headers = new Headers(settings.headers || {});
    let body = settings.body;

    if (body !== undefined && !(body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }

    const response = await fetch(path, {
      ...settings,
      headers,
      body,
      credentials: 'same-origin'
    });

    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new ApiError(response.status, payload);
      if (response.status === 401 && !path.includes('/auth/login')) {
        window.dispatchEvent(new CustomEvent('mt:unauthorized'));
      }
      throw error;
    }

    return payload.data;
  }

  function queryString(params) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        search.set(key, String(value));
      }
    });
    const value = search.toString();
    return value ? `?${value}` : '';
  }

  window.MTApi = {
    ApiError,
    auth: {
      register: (data) => request('/api/auth/register', { method: 'POST', body: data }),
      login: (data) => request('/api/auth/login', { method: 'POST', body: data }),
      logout: () => request('/api/auth/logout', { method: 'POST' }),
      me: () => request('/api/auth/me')
    },
    grids: {
      list: (search) => request(`/api/grids${queryString({ search })}`),
      create: (data) => request('/api/grids', { method: 'POST', body: data }),
      update: (id, data) => request(`/api/grids/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
      remove: (id) => request(`/api/grids/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    banners: {
      list: (search) => request(`/api/banners${queryString({ search })}`),
      create: (data) => request('/api/banners', { method: 'POST', body: data }),
      update: (id, data) => request(`/api/banners/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
      remove: (id) => request(`/api/banners/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    productTables: {
      list: (search) => request(`/api/product-tables${queryString({ search })}`),
      get: (id) => request(`/api/product-tables/${encodeURIComponent(id)}`),
      create: (data) => request('/api/product-tables', { method: 'POST', body: data }),
      update: (id, data) => request(`/api/product-tables/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: data
      }),
      remove: (id) => request(`/api/product-tables/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    admin: {
      users: (filters) => request(`/api/admin/users${queryString(filters)}`),
      setStatus: (id, status) => request(`/api/admin/users/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: { status }
      }),
      setRole: (id, role) => request(`/api/admin/users/${encodeURIComponent(id)}/role`, {
        method: 'PATCH',
        body: { role }
      })
    }
  };
})();
