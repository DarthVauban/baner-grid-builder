import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AutoHeightSandbox } from './AutoHeightSandbox';

describe('AutoHeightSandbox', () => {
  it('tracks the document height without an internal scrollbar and resets for new content', async () => {
    const { rerender } = render(<AutoHeightSandbox title="Опис" srcDoc="<!doctype html><html><head></head><body><div>Long content</div></body></html>" />);
    const frame = screen.getByTitle('Опис') as HTMLIFrameElement;
    const frameDocument = frame.getAttribute('srcdoc') || '';
    const channelMatch = frameDocument.match(/data-channel="([^"]+)"/);
    expect(channelMatch).not.toBeNull();
    const channel = channelMatch![1];
    expect(frameDocument).toContain('src="/mt-auto-height-sandbox.js"');
    expect(frameDocument).not.toContain('function measure');

    frame.style.fontFamily = 'Inter, sans-serif';
    const configure = vi.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.load(frame);
    expect(configure).toHaveBeenCalledWith({
      type: 'mt-auto-height-sandbox-config',
      channel,
      fontFamily: 'Inter, sans-serif'
    }, '*');

    fireEvent(window, new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'mt-auto-height-sandbox', channel, height: 1240 }
    }));
    await waitFor(() => expect(frame).toHaveStyle({ height: '1240px' }));
    expect(frame).toHaveAttribute('scrolling', 'no');

    rerender(<AutoHeightSandbox title="Опис" srcDoc="<!doctype html><html><head></head><body><p>Short</p></body></html>" />);
    await waitFor(() => expect(frame).toHaveStyle({ height: '1px' }));
  });
});
