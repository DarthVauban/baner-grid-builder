import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlogLivePreview } from './BlogLivePreview';

describe('BlogLivePreview', () => {
  it('keeps one sandboxed document and streams HTML updates into it', async () => {
    const { rerender } = render(<BlogLivePreview html="<p>Перший стан</p>" />);
    const frame = screen.getByTitle('Попередній перегляд статті') as HTMLIFrameElement;
    const source = frame.getAttribute('srcdoc');
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');

    fireEvent.load(frame);
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ html: '<p>Перший стан</p>' }), '*');

    rerender(<BlogLivePreview html="<p>Оновлений стан</p>" />);

    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ html: '<p>Оновлений стан</p>' }), '*'));
    expect(screen.getByTitle('Попередній перегляд статті')).toBe(frame);
    expect(frame.getAttribute('srcdoc')).toBe(source);
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  });
});
