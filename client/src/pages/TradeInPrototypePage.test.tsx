import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TradeInPrototypePage } from './TradeInPrototypePage';

vi.stubGlobal('scrollTo', vi.fn());

describe('TradeInPrototypePage', () => {
  it('shows Apple-specific questions in the Apple smartphone scenario', async () => {
    const user = userEvent.setup();
    render(<TradeInPrototypePage />);

    await user.click(screen.getByRole('button', { name: /Смартфон Apple/ }));
    await user.click(screen.getByRole('button', { name: 'Далі' }));

    await user.click(screen.getByRole('radio', { name: /Обміняти/ }));
    await user.click(screen.getByRole('button', { name: 'Модель смартфона' }));
    await user.click(screen.getByRole('option', { name: 'iPhone 15' }));
    await user.click(screen.getByRole('button', { name: 'Обсяг памʼяті' }));
    await user.click(screen.getByRole('option', { name: '256 GB' }));
    await user.click(screen.getByRole('radio', { name: 'eSIM' }));

    expect(screen.getByRole('button', { name: 'Далі' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Далі' }));

    expect(screen.getByRole('spinbutton', { name: /Стан АКБ/ })).toBeInTheDocument();
    expect(screen.getByText('Загальний стан пристрою')).toBeInTheDocument();
    expect(screen.queryByText('Є зарядка?')).not.toBeInTheDocument();
  });

  it('switches laptop operating system copy for Apple laptops', async () => {
    const user = userEvent.setup();
    render(<TradeInPrototypePage />);

    await user.click(screen.getByRole('button', { name: /Ноутбук/ }));
    await user.click(screen.getByRole('button', { name: 'Далі' }));
    await user.click(screen.getByRole('radio', { name: /Продати/ }));
    await user.click(screen.getByRole('button', { name: 'Бренд ноутбука' }));
    await user.click(screen.getByRole('option', { name: 'Apple' }));
    await user.type(screen.getByLabelText('Модель'), 'MacBook Air M2');
    await user.click(screen.getByRole('button', { name: 'Далі' }));

    expect(screen.getByText('Встановлена macOS?')).toBeInTheDocument();
    expect(screen.getByText('Є зарядка?')).toBeInTheDocument();
    expect(screen.getByText('Дефекти ноутбука')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /Стан АКБ/ })).not.toBeInTheDocument();
  });
});
