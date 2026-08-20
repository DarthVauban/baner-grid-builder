import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export class HoroshopApiError extends Error {
  constructor(code, httpStatus = null, apiMessage = null) {
    super(`Horoshop API request failed: ${code}${httpStatus ? ` (HTTP ${httpStatus})` : ''}`);
    this.name = 'HoroshopApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.apiMessage = apiMessage;
  }
}

function publicIpv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [first = 0, second = 0, third = 0] = octets;
  return !(first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 192 && second === 0 && third === 0)
    || (first === 192 && second === 0 && third === 2)
    || (first === 192 && second === 88 && third === 99)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113));
}

function embeddedIpv4(address) {
  const dotted = address.match(/(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
  if (dotted) return dotted;
  const mapped = address.toLowerCase().match(/(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u);
  if (!mapped) return null;
  const high = Number.parseInt(mapped[1] || '', 16);
  const low = Number.parseInt(mapped[2] || '', 16);
  if (!Number.isInteger(high) || !Number.isInteger(low)) return null;
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

function publicNetworkAddress(address) {
  const normalized = address.replace(/^\[|\]$/gu, '').toLowerCase();
  const family = isIP(normalized);
  if (family === 4) return publicIpv4(normalized);
  if (family !== 6) return false;
  const mapped = embeddedIpv4(normalized);
  if (mapped) return publicIpv4(mapped);
  return normalized !== '::' && normalized !== '::1'
    && !/^f[cd]/u.test(normalized)
    && !/^fe[89a-f]/u.test(normalized)
    && !/^ff/u.test(normalized)
    && !/^2001:db8(?::|$)/u.test(normalized);
}

function unsafeResolutionError() {
  const error = new Error('Horoshop domain must resolve only to public addresses');
  error.code = 'EACCES';
  return error;
}

function publicLookup(resolve) {
  return (hostname, options, callback) => {
    void resolve(hostname).then((addresses) => {
      if (addresses.length === 0 || addresses.some((entry) => !publicNetworkAddress(entry.address))) {
        callback(unsafeResolutionError(), '', 0);
        return;
      }
      if (options.all) {
        callback(null, addresses.map((entry) => ({
          address: entry.address,
          family: entry.family === 6 ? 6 : 4
        })));
        return;
      }
      const requestedFamily = Number(options.family || 0);
      const selected = addresses.find((entry) => requestedFamily === 0 || entry.family === requestedFamily)
        || addresses[0];
      callback(null, selected?.address || '', selected?.family || 0);
    }).catch((reason) => {
      callback(reason instanceof Error ? reason : new Error('Horoshop DNS lookup failed'), '', 0);
    });
  };
}

function httpsFetch(resolve) {
  return (input, init = {}) => new Promise((resolveResponse, reject) => {
    const endpoint = input instanceof URL ? input : new URL(String(input));
    const headers = new Headers(init.headers);
    const request = httpsRequest(endpoint, {
      method: init.method || 'GET',
      headers: Object.fromEntries(headers.entries()),
      lookup: publicLookup(resolve),
      signal: init.signal || undefined
    }, (incoming) => {
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      incoming.on('error', reject);
      incoming.on('end', () => {
        const responseHeaders = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
          const name = incoming.rawHeaders[index];
          const value = incoming.rawHeaders[index + 1];
          if (name && value !== undefined) responseHeaders.append(name, value);
        }
        const status = incoming.statusCode || 500;
        const body = status === 204 || status === 205 || status === 304 ? null : Buffer.concat(chunks);
        resolveResponse(new Response(body, {
          status,
          ...(incoming.statusMessage ? { statusText: incoming.statusMessage } : {}),
          headers: responseHeaders
        }));
      });
    });
    request.on('error', reject);
    if (init.body !== undefined && init.body !== null) {
      if (typeof init.body !== 'string' && !ArrayBuffer.isView(init.body) && !(init.body instanceof ArrayBuffer)) {
        request.destroy(new Error('Unsupported Horoshop request body'));
        return;
      }
      request.write(init.body);
    }
    request.end();
  });
}

export function normalizeHoroshopStoreDomain(value) {
  const candidate = String(value || '').includes('://') ? String(value) : `https://${String(value || '')}`;
  const url = new URL(candidate);
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
  const addressHost = hostname.replace(/^\[|\]$/gu, '');

  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error('Horoshop domain must be a plain HTTPS store domain');
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
    || hostname.endsWith('.internal') || hostname.endsWith('.home.arpa') || !hostname.includes('.')
    || (isIP(addressHost) !== 0 && !publicNetworkAddress(addressHost))) {
    throw new Error('Private network hosts cannot be used as Horoshop domains');
  }

  url.hostname = hostname;
  return url;
}

function extractArray(response, keys) {
  if (Array.isArray(response)) return response;
  const source = response !== null && typeof response === 'object' ? response : {};
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
}

function errorCode(status, payload) {
  const source = payload !== null && typeof payload === 'object' ? payload : {};
  const nested = source.response !== null && typeof source.response === 'object' ? source.response : {};
  const detail = [
    source.error, source.message, source.status, source.response,
    nested.error, nested.message, nested.status
  ].filter((value) => typeof value === 'string').join(' ').toLocaleLowerCase();
  if (/subscription.*limit|limit.*subscription/u.test(detail)) return 'subscription_limit';
  if (status === 401 || status === 403
    || /permission|forbidden|access denied|not allowed|доступ|дозвіл|разреш/u.test(detail)) {
    return 'permission_denied';
  }
  if (status === 404
    || /unknown function|function[^.]{0,80}(?:not found|unsupported)|unsupported (?:function|operation)/u.test(detail)) {
    return 'unsupported_operation';
  }
  return 'api_rejected';
}

function responseMessage(payload) {
  const messages = [];
  const visit = (value, key = '', depth = 0) => {
    if (messages.length >= 4 || depth > 4 || value === null || value === undefined) return;
    if (/token|password|login|credential|authorization/iu.test(key)) return;
    if (typeof value === 'string') {
      const message = value.trim();
      if (message && !['OK', 'ERROR', 'HTTP_ERROR', 'EMPTY'].includes(message.toUpperCase())) {
        messages.push(message.slice(0, 500));
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 4)) visit(item, key, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    const preferredKeys = ['message', 'error', 'description', 'errors', 'response', 'details'];
    for (const preferredKey of preferredKeys) {
      if (Object.hasOwn(value, preferredKey)) visit(value[preferredKey], preferredKey, depth + 1);
    }
  };
  visit(payload);
  return [...new Set(messages)].join(' · ').slice(0, 700) || null;
}

export class HoroshopClient {
  constructor(storeDomain, options = {}) {
    this.baseUrl = normalizeHoroshopStoreDomain(storeDomain);
    const lookupImplementation = options.lookupImplementation || (async (hostname) =>
      dnsLookup(hostname, { all: true, verbatim: true }));
    this.fetchImplementation = options.fetchImplementation || httpsFetch(lookupImplementation);
    this.sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.timeoutMilliseconds = options.timeoutMilliseconds || 15_000;
    this.hostname = this.baseUrl.hostname.replace(/^\[|\]$/gu, '');
    this.lookupImplementation = options.fetchImplementation && options.lookupImplementation
      ? options.lookupImplementation
      : null;
  }

  get storeDomain() {
    return this.baseUrl.hostname;
  }

  async authenticate(login, password) {
    const response = await this.post('auth', { login, password });
    const source = response !== null && typeof response === 'object' ? response : {};
    if (typeof source.token !== 'string' || !source.token) {
      throw new HoroshopApiError('invalid_response');
    }
    return source.token;
  }

  async exportCategories(token) {
    const response = await this.post('pages/export', { token });
    return extractArray(response, ['pages', 'categories']);
  }

  async exportCatalog(token, offset = 0, limit = 200) {
    const response = await this.post('catalog/export', { token, offset, limit });
    const products = extractArray(response, ['products', 'catalog', 'items']);
    const source = response !== null && typeof response === 'object' ? response : {};
    const pagination = source.pagination !== null && typeof source.pagination === 'object'
      ? source.pagination
      : {};
    const explicitNext = Number(source.next_offset ?? pagination.next_offset);
    const total = Number(source.total ?? pagination.total);
    const nextOffset = Number.isInteger(explicitNext) && explicitNext > offset
      ? explicitNext
      : Number.isFinite(total) && offset + products.length < total
        ? offset + products.length
        : products.length >= limit ? offset + products.length : null;
    return { products, nextOffset };
  }

  async importCatalog(token, products, options = {}) {
    return this.post('catalog/import', { token, products }, {
      ...options,
      timeoutMilliseconds: options.timeoutMilliseconds || 30_000
    });
  }

  async post(functionName, body, options = {}) {
    const endpoint = new URL(`/api/${functionName}/`, this.baseUrl);
    let lastError;
    const timeoutMilliseconds = options.timeoutMilliseconds || this.timeoutMilliseconds;
    const maxAttempts = Number.isInteger(options.maxAttempts)
      ? Math.min(3, Math.max(1, options.maxAttempts))
      : 3;

    if (this.lookupImplementation && isIP(this.hostname) === 0) {
      const addresses = await this.lookupImplementation(this.hostname);
      if (addresses.length === 0 || addresses.some((entry) => !publicNetworkAddress(entry.address))) {
        throw unsafeResolutionError();
      }
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
      try {
        const response = await this.fetchImplementation(endpoint, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify(body),
          redirect: 'error',
          signal: controller.signal
        });
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new HoroshopApiError('invalid_response', response.status);
        }
        if (!response.ok) {
          throw new HoroshopApiError(errorCode(response.status, payload), response.status, responseMessage(payload));
        }
        const envelope = payload !== null && typeof payload === 'object' ? payload : {};
        if (envelope.status === 'EMPTY') return {};
        if (envelope.status === 'OK') return envelope.response || {};
        if (Object.hasOwn(envelope, 'status')) {
          throw new HoroshopApiError(errorCode(response.status, payload), response.status, responseMessage(payload));
        }
        return payload;
      } catch (error) {
        lastError = error;
        const unsafeResolution = error instanceof Error && error.code === 'EACCES';
        const clientFailure = error instanceof HoroshopApiError
          && error.httpStatus !== null && error.httpStatus >= 400 && error.httpStatus < 500
          && error.httpStatus !== 429;
        if (attempt === maxAttempts || unsafeResolution || clientFailure) break;
        await this.sleep(200 * 2 ** (attempt - 1));
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Horoshop request failed');
  }
}
