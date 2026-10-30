import { describe, expect, it } from 'vitest';
import { getSmartSearchReturnPath } from './smart-search-auth';

const query = new URLSearchParams({
  response_type: 'code',
  client_id: 'smart-search-dev',
  redirect_uri: 'https://smart-search.mt-panel.sbs/auth/workspace/callback',
  scope: 'smart-search:admin',
  state: 's'.repeat(43),
  code_challenge_method: 'S256',
  code_challenge: 'c'.repeat(43)
});
const path = `/api/integrations/smart-search/authorize?${query}`;
const loginSearch = (value: string) => `?${new URLSearchParams({ returnTo: value })}`;

describe('Smart Search login return path', () => {
  it('preserves the exact local authorize query including state and S256 challenge', () => {
    expect(getSmartSearchReturnPath(loginSearch(path))).toBe(path);
  });

  it.each([
    'https://evil.example/authorize',
    '//evil.example/authorize',
    '/\\evil.example/authorize',
    '/api/integrations/smart-search/authorize/../revoke?x=1',
    path.replace('/authorize?', '/%61uthorize?'),
    `${path}#fragment`,
    `${path}&state=${'a'.repeat(43)}`,
    `${path}&extra=true`,
    path.replace('code_challenge_method=S256', 'code_challenge_method=plain'),
    path.replace('response_type=code', 'response_type=token'),
    path.replace('scope=smart-search%3Aadmin', 'scope=other'),
    path.replace(`code_challenge=${'c'.repeat(43)}`, 'code_challenge=short'),
    path.replace('https%3A%2F%2Fsmart-search.mt-panel.sbs', 'javascript%3Aalert(1)'),
    path.replace('https%3A%2F%2Fsmart-search.mt-panel.sbs', 'https%3A%2F%2Fuser%3Apass%40smart-search.mt-panel.sbs')
  ])('rejects an unsafe or malformed return path: %s', (value) => {
    expect(getSmartSearchReturnPath(loginSearch(value))).toBeNull();
  });

  it('rejects duplicate returnTo parameters and absent return paths', () => {
    expect(getSmartSearchReturnPath(`${loginSearch(path)}&returnTo=${encodeURIComponent(path)}`)).toBeNull();
    expect(getSmartSearchReturnPath('')).toBeNull();
  });
});
