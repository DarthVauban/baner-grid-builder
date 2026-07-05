import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '../toast/ToastContext';
import { ChatLinkPreview } from './ChatLinkPreview';

describe('ChatLinkPreview', () => {
  it('opens screenshot previews inside a fullscreen dialog', async () => {
    render(<ToastProvider><ChatLinkPreview preview={{
      type: 'image',
      url: 'https://mt.in.ua/img/example.png',
      hostname: 'mt.in.ua'
    }} /></ToastProvider>);

    await userEvent.click(screen.getByRole('button', { name: 'Відкрити зображення' }));
    expect(screen.getByRole('dialog', { name: 'Перегляд зображення' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Зображення з посилання' })).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(screen.queryByRole('dialog', { name: 'Перегляд зображення' })).not.toBeInTheDocument();
  });
});
