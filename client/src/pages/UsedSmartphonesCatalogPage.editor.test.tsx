import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RichTextEditor } from './UsedSmartphonesCatalogPage';

describe('RichTextEditor source mode', () => {
  it('uses a syntax-aware HTML editor and keeps HTML, CSS and JavaScript in preview', async () => {
    const source = '<style>.card{display:grid}</style><section class="card">Phone</section><script>document.body.dataset.ready="true";</script>';
    const { container } = render(<RichTextEditor value={source} onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Джерело' }));
    await screen.findByText('HTML / CSS / JavaScript');
    expect(container.querySelector('.rich-editor__source .cm-editor')).toBeInTheDocument();
    expect(container.querySelector('.rich-editor__source .cm-lineNumbers')).toBeInTheDocument();
    expect(container.querySelector('.cm-content')).toHaveTextContent('document.body.dataset.ready');
    expect(screen.getByText('HTML / CSS / JavaScript')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const frame = screen.getByTitle('Preview опису');
    const srcDoc = frame.getAttribute('srcdoc') || '';
    expect(srcDoc).toContain('<section class="card">Phone</section>');
    expect(srcDoc).toContain('<script>document.body.dataset.ready="true";</script>');
    expect(srcDoc).toContain('mt-auto-height-sandbox');
    expect(frame).toHaveAttribute('scrolling', 'no');
  });
});
