import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeBanner, serializeGrid, serializeUser } from '../src/lib/serializers.js';

test('serializers expose camelCase API contracts', () => {
  const created = new Date().toISOString();
  const user = serializeUser({
    id: '1', name: 'User', email: 'u@example.com', role: 'user', status: 'approved',
    approved_at: created, created_at: created, updated_at: created
  });
  const grid = serializeGrid({
    id: '2', name: 'Grid', share_description: 'Description', banners: [],
    owner_id: '1', owner_name: 'User', is_owner: true,
    created_at: created, updated_at: created
  });
  const banner = serializeBanner({
    id: '3', name: 'Banner', data: { title: 'Title' },
    owner_id: '1', owner_name: 'User', is_owner: false,
    created_at: created, updated_at: created
  });

  assert.equal(user.approvedAt, created);
  assert.equal(grid.shareDescription, 'Description');
  assert.equal(grid.owner.name, 'User');
  assert.equal(grid.isOwner, true);
  assert.equal(banner.banner.title, 'Title');
  assert.equal(banner.isOwner, false);
});
