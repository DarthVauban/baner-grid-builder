import { useCallback, useEffect, useId, useMemo, useRef } from 'react';

const previewMessageType = 'mt-blog-live-preview-render';
const previewReadyType = 'mt-blog-live-preview-ready';
const previewBridgePath = '/mt-blog-live-preview.js';

function createPreviewShell(channel: string) {
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><script src="${previewBridgePath}" data-channel="${channel}"><\/script></head><body></body></html>`;
}

export function BlogLivePreview({ html }: { html: string }) {
  const reactId = useId();
  const channel = useMemo(() => `blog-preview-${reactId.replace(/[^a-z0-9_-]/giu, '')}`, [reactId]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const htmlRef = useRef(html);
  const previewShell = useMemo(() => createPreviewShell(channel), [channel]);

  const updatePreview = useCallback((nextHtml: string) => {
    frameRef.current?.contentWindow?.postMessage({ type: previewMessageType, channel, html: nextHtml }, '*');
  }, [channel]);

  useEffect(() => {
    htmlRef.current = html;
    updatePreview(html);
  }, [html, updatePreview]);

  useEffect(() => {
    const handleReady = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== previewReadyType || event.data?.channel !== channel) return;
      updatePreview(htmlRef.current);
    };
    window.addEventListener('message', handleReady);
    return () => window.removeEventListener('message', handleReady);
  }, [channel, updatePreview]);

  return <iframe
    ref={frameRef}
    title="Попередній перегляд статті"
    sandbox="allow-scripts"
    srcDoc={previewShell}
    onLoad={() => updatePreview(htmlRef.current)}
  />;
}
