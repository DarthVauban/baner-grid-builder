import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PasswordField } from './PasswordField';

function TestField() {
  const [value, setValue] = useState('SecretPassword123!');
  return <PasswordField label="Пароль" name="password" value={value} onChange={setValue} autoComplete="new-password" placeholder="Пароль" allowGenerate />;
}

describe('PasswordField', () => {
  it('toggles visibility and can generate a strong password', async () => {
    render(<TestField />);
    const input = screen.getByPlaceholderText('Пароль');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Показати пароль' }));
    expect(input).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: /\u0417генерувати/ }));
    expect((input as HTMLInputElement).value).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%&*+\-=?]).{18}$/);
  });
});
