import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { isWorkspaceToolPath, ToolBackButton } from './ToolBackButton';

function CurrentPath() {
  return <output aria-label="Поточний шлях">{useLocation().pathname}</output>;
}

describe('ToolBackButton', () => {
  it('returns to the previous route when the tool was opened inside the workspace', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/tasks', '/tools/popup-banners']} initialIndex={1}>
      <ToolBackButton />
      <CurrentPath />
    </MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Повернутися на попередню сторінку' }));
    expect(screen.getByLabelText('Поточний шлях')).toHaveTextContent('/tasks');
  });

  it('uses the safe fallback when a tool was opened directly', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/tools/popup-banners']}>
      <ToolBackButton />
      <CurrentPath />
    </MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Повернутися на попередню сторінку' }));
    expect(screen.getByLabelText('Поточний шлях')).toHaveTextContent('/tools');
  });

  it('recognizes every route rendered as a workspace tool', () => {
    expect(isWorkspaceToolPath('/tools/popup-banners')).toBe(true);
    expect(isWorkspaceToolPath('/tools/blog-publications/article/editor')).toBe(true);
    expect(isWorkspaceToolPath('/chat')).toBe(true);
    expect(isWorkspaceToolPath('/tools')).toBe(false);
    expect(isWorkspaceToolPath('/admin/system')).toBe(false);
  });
});
