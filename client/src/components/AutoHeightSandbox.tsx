import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

const resizeMessageType = 'mt-auto-height-sandbox';
const configMessageType = 'mt-auto-height-sandbox-config';
const resizeBridgePath = '/mt-auto-height-sandbox.js';

function resizeBridge(channel: string) {
  return `<script src="${resizeBridgePath}" data-channel="${channel}"><\/script>`;
}

function injectResizeBridge(srcDoc: string, channel: string) {
  const bridge = resizeBridge(channel);
  if (/<\/head\s*>/i.test(srcDoc)) return srcDoc.replace(/<\/head\s*>/i, `${bridge}</head>`);
  return `${bridge}${srcDoc}`;
}

export function AutoHeightSandbox({
  title,
  srcDoc,
  className
}: {
  title: string;
  srcDoc: string;
  className?: string;
}) {
  const reactId = useId();
  const channel = useMemo(() => `sandbox-${reactId.replace(/[^a-z0-9_-]/gi, '')}`, [reactId]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1);
  const documentWithBridge = useMemo(() => injectResizeBridge(srcDoc, channel), [channel, srcDoc]);

  const configureFrame = useCallback(() => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    const fontFamily = window.getComputedStyle(frame).fontFamily;
    frame.contentWindow.postMessage({ type: configMessageType, channel, fontFamily }, '*');
  }, [channel]);

  useEffect(() => setHeight(1), [documentWithBridge]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; channel?: unknown; height?: unknown } | null;
      if (!data || data.type !== resizeMessageType || data.channel !== channel) return;
      const nextHeight = Number(data.height);
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
      setHeight(Math.ceil(nextHeight));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [channel]);

  return <iframe
    ref={frameRef}
    className={className}
    title={title}
    sandbox="allow-scripts"
    scrolling="no"
    srcDoc={documentWithBridge}
    onLoad={configureFrame}
    style={{ height: `${height}px` }}
  />;
}
