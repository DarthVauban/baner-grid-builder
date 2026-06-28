import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { parseInput } from '../src/lib/validation.js';
import { AppError } from '../src/lib/app-error.js';

test('parseInput returns validated data', () => {
  const schema = z.object({ name: z.string().min(2) });
  assert.deepEqual(parseInput(schema, { name: 'Test' }), { name: 'Test' });
});

test('parseInput converts zod issues to AppError', () => {
  const schema = z.object({ name: z.string().min(2) });

  assert.throws(
    () => parseInput(schema, { name: '' }),
    (error) => error instanceof AppError && error.status === 422 && error.code === 'VALIDATION_ERROR'
  );
});
