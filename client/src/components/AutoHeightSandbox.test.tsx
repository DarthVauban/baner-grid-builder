import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AutoHeightSandbox } from './AutoHeightSandbox';

describe('AutoHeightSandbox', () => {
  it('tracks the document height without an internal scrollbar and resets for new content', async () => {
    const { rerender } = render(<AutoHeightSandbox title="Опис" srcDoc="<!doctype html><html><head></head><body><div>Long content</div></body></html>" />);
    const frame = screen.getByTitle('Опис') as HTMLIFrameElement;
    const channelMatch = (frame.getAttribute('srcdoc') || '').match(/var channel=("[^"]+")/);
    expect(channelMatch).not.toBeNull();
    const channel = JSON.parse(channelMatch![1]) as string;

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

