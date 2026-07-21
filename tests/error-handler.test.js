import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middleware/error-handler.js';

function createResponse() {
  return {
    headersSent: false,
    statusCode: 200,
    payload: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    }
  };
}

test('database connectivity failures are reported as a temporary outage', () => {
  const response = createResponse();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    errorHandler(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      { originalUrl: '/api/auth/login' },
      response,
      () => {}
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.error.code, 'SERVICE_UNAVAILABLE');
});

test('nested PostgreSQL shutdown errors are reported as a temporary outage', () => {
  const response = createResponse();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    errorHandler(
      Object.assign(new Error('query failed'), {
        cause: Object.assign(new Error('terminating connection'), { code: '57P01' })
      }),
      { originalUrl: '/api/health' },
      response,
      () => {}
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.error.code, 'SERVICE_UNAVAILABLE');
});

test('connection pool timeouts are reported as a temporary outage', () => {
  const response = createResponse();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    errorHandler(
      new Error('timeout exceeded when trying to connect'),
      { originalUrl: '/api/health' },
      response,
      () => {}
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.error.code, 'SERVICE_UNAVAILABLE');
});
