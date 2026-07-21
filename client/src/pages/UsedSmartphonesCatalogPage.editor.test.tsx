import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import appStyles from '../styles/app.css?raw';
import { CatalogDescriptionField } from './UsedSmartphonesCatalogPage';

function ControlledDescriptionField({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  return <>
    <CatalogDescriptionField value={value} onChange={setValue} />
    <output data-testid="description-value">{value}</output>
  </>;
}

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

  it('can clear, type and replace source without leaving source mode', async () => {
    const user = userEvent.setup();
    const original = '<section>Старий опис</section>';
    const firstTypedSource = '<section data-kind="phone">Новий опис';
    const firstReplacement = `${firstTypedSource}</section>`;
    const secondReplacement = '<script>window.catalogEditorReady = true;</script>';
    render(<ControlledDescriptionField initialValue={original} />);

    const sourceButton = screen.getByRole('button', { name: 'Джерело' });
    await user.click(sourceButton);
    const editor = await screen.findByRole('textbox', { name: 'Редактор HTML, CSS та JavaScript' });

    await user.click(editor);
    expect(editor).toHaveFocus();
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await waitFor(() => expect(screen.getByTestId('description-value').textContent).toBe(''));
    expect(sourceButton).toHaveClass('active');

    await user.type(editor, firstTypedSource);
    await waitFor(() => expect(screen.getByTestId('description-value').textContent).toBe(firstReplacement));
    expect(sourceButton).toHaveClass('active');

    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await waitFor(() => expect(screen.getByTestId('description-value').textContent).toBe(''));
    await user.type(editor, secondReplacement);
    await waitFor(() => expect(screen.getByTestId('description-value').textContent).toBe(secondReplacement));
    expect(sourceButton).toHaveClass('active');

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const srcDoc = screen.getByTitle('Preview опису').getAttribute('srcdoc') || '';
    expect(srcDoc).toContain(secondReplacement);
    expect(srcDoc).not.toContain(original);
  });

  it('keeps the editable surface usable and hides CodeMirror announcements defensively', () => {
    expect(appStyles).toMatch(/\.rich-editor__source \.cm-content\s*\{[^}]*min-height:\s*100%;[^}]*display:\s*block/);
    expect(appStyles).toMatch(/\.rich-editor__source \.cm-announced\s*\{[^}]*top:\s*-10000px\s*!important;[^}]*overflow:\s*hidden/);
  });
});
