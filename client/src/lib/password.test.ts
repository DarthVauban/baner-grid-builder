import { describe, expect, it } from 'vitest';
import { generateStrongPassword } from './password';

describe('generateStrongPassword', () => {
  it('creates a password with all required character groups', () => {
    const password = generateStrongPassword();
    expect(password).toHaveLength(18);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[!@#$%&*+\-=?]/);
  });
});
