import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RichTextField } from './RichTextField';

describe('RichTextField', () => {
  it('loads existing HTML and exposes the full Tiptap toolbar', async () => {
    render(<RichTextField value="<p><strong>Готовий текст</strong></p>" onChange={vi.fn()} />);

    expect(await screen.findByText('Готовий текст')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Жирний текст' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Додати або змінити посилання' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вставити таблицю 3 на 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вставити зображення зі сховища' })).toBeInTheDocument();
  });

  it('creates a real table and emits sanitized HTML', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RichTextField value="<p>Перед таблицею</p>" onChange={onChange} />);

    await user.click(await screen.findByRole('button', { name: 'Вставити таблицю 3 на 3' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls.at(-1)?.[0]).toContain('<table class="mt-blog-table">');
      expect(onChange.mock.calls.at(-1)?.[0]).toContain('<th colspan="1" rowspan="1">');
    });
    expect(screen.getByRole('toolbar', { name: 'Керування таблицею' })).toBeInTheDocument();
  });

  it('opens the two-field link dialog', async () => {
    const user = userEvent.setup();
    render(<RichTextField value="Текст посилання" onChange={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Додати або змінити посилання' }));

    expect(screen.getByRole('dialog', { name: 'Додати посилання' })).toBeInTheDocument();
    expect(screen.getByLabelText('Посилання')).toBeInTheDocument();
    expect(screen.getByLabelText('Текст посилання')).toBeInTheDocument();
  });
});
