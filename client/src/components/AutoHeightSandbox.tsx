import { useEffect, useId, useMemo, useRef, useState } from 'react';

const resizeMessageType = 'mt-auto-height-sandbox';

function resizeBridge(channel: string) {
  return `<script>(function(){
    var channel=${JSON.stringify(channel)};
    var scheduled=false;
    function measure(){
      scheduled=false;
      var body=document.body;
      var root=document.documentElement;
      var height=Math.ceil(Math.max(
        body ? body.scrollHeight : 0,
        body ? body.getBoundingClientRect().height : 0,
        root ? root.scrollHeight : 0,
        root ? root.getBoundingClientRect().height : 0,
        1
      ));
      parent.postMessage({type:${JSON.stringify(resizeMessageType)},channel:channel,height:height},'*');
    }
    function schedule(){
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(measure);
    }
    function start(){
      schedule();
      if(window.ResizeObserver){
        var resizeObserver=new ResizeObserver(schedule);
        resizeObserver.observe(document.documentElement);
        if(document.body)resizeObserver.observe(document.body);
      }
      if(window.MutationObserver){
        new MutationObserver(schedule).observe(document.documentElement,{attributes:true,childList:true,characterData:true,subtree:true});
      }
      addEventListener('load',schedule,true);
      if(document.fonts&&document.fonts.ready)document.fonts.ready.then(schedule);
      [0,100,350,1000,2000].forEach(function(delay){setTimeout(schedule,delay);});
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
  })();<\/script>`;
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
    style={{ height: `${height}px` }}
  />;
}

