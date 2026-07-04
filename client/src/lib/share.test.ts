import { describe, expect, it } from 'vitest';
import { buildShareLink } from './share';

describe('buildShareLink', () => {
  it('builds a deep link to a task card', () => {
    expect(buildShareLink('task', 'task-id', 'https://workspace.example')).toBe(
      'https://workspace.example/tasks?task=task-id'
    );
  });

  it('builds a deep link to a blog publication card', () => {
    expect(buildShareLink('publication', 'publication-id', 'https://workspace.example')).toBe(
      'https://workspace.example/tools/blog-publications?publication=publication-id'
    );
  });
});
