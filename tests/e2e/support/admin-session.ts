import { expect, test, type APIRequestContext } from '@playwright/test';

type StorageState = Awaited<ReturnType<APIRequestContext['storageState']>>;

export const adminTest = test.extend<object, { adminStorageState: StorageState }>({
  adminStorageState: [async ({ playwright }, provide, workerInfo) => {
    const session = await playwright.request.newContext({ baseURL: workerInfo.project.use.baseURL });
    let state: StorageState;
    try {
      const login = await session.post('/api/auth/login', { data: {
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD
      } });
      expect(login.status(), 'E2E admin sign-in').toBe(200);
      state = await session.storageState();
      expect(state.cookies.some(({ name }) => name === process.env.COOKIE_NAME), 'E2E admin session cookie').toBe(true);
    } finally {
      await session.dispose();
    }
    await provide(state);
  }, { scope: 'worker' }],
  storageState: async ({ adminStorageState }, provide) => {
    await provide(adminStorageState);
  }
});
