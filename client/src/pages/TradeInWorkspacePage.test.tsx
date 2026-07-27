import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TradeInWorkspacePage } from './TradeInWorkspacePage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Дмитро Лук’янчук', avatarUrl: '' }
  })
}));

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/trade-in/overview']}>
      <Routes>
        <Route path="/trade-in" element={<TradeInWorkspacePage />}>
          <Route path="overview" element={<p>Огляд Trade-in</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('TradeInWorkspacePage', () => {
  beforeEach(() => localStorage.removeItem('mt-trade-in-sidebar-collapsed'));

  it('provides its own navigation and remembers the collapsed state', async () => {
    const user = userEvent.setup();
    const view = renderWorkspace();

    expect(screen.getByRole('link', { name: 'Огляд' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Тестова форма' })).toBeInTheDocument();
    expect(view.container.querySelector('.trade-in-workspace')).not.toHaveClass('trade-in-workspace--sidebar-collapsed');

    await user.click(screen.getByRole('button', { name: 'Згорнути меню Trade-in' }));

    expect(view.container.querySelector('.trade-in-workspace')).toHaveClass('trade-in-workspace--sidebar-collapsed');
    expect(localStorage.getItem('mt-trade-in-sidebar-collapsed')).toBe('true');
  });
});
