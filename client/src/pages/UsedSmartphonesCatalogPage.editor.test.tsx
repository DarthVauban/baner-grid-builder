import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CatalogDescriptionField } from './UsedSmartphonesCatalogPage';

describe('RichTextEditor source mode', () => {
  it('uses a syntax-aware HTML editor and keeps HTML, CSS and JavaScript in preview', async () => {
    const source = '<style>.card{display:grid}</style><section class="card">Phone</section><script>document.body.dataset.ready="true";</script>';
    const { container } = render(<CatalogDescriptionField value={source} onChange={vi.fn()} />);

    const visualButton = screen.getByRole('button', { name: 'Візуально' });
    const sourceButton = screen.getByRole('button', { name: 'Джерело' });
    await userEvent.click(sourceButton);
    await screen.findByText('HTML / CSS / JavaScript');
    expect(container.querySelector('.rich-editor__source .cm-editor')).toBeInTheDocument();
    expect(container.querySelector('.rich-editor__source .cm-lineNumbers')).toBeInTheDocument();
    expect(container.querySelector('.cm-content')).toHaveTextContent('document.body.dataset.ready');
    expect(screen.getByText('HTML / CSS / JavaScript')).toBeInTheDocument();

    await userEvent.click(container.querySelector('.cm-content')!);
    expect(sourceButton).toHaveClass('active');
    expect(visualButton).not.toHaveClass('active');

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const frame = screen.getByTitle('Preview опису');
    const srcDoc = frame.getAttribute('srcdoc') || '';
    expect(srcDoc).toContain('<section class="card">Phone</section>');
    expect(srcDoc).toContain('<script>document.body.dataset.ready="true";</script>');
    expect(srcDoc).toContain('mt-auto-height-sandbox');
    expect(frame).toHaveAttribute('scrolling', 'no');
  });
});
