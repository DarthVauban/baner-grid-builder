(function blogLivePreviewBridge() {
  var script = document.currentScript;
  var channel = script && script.getAttribute('data-channel');
  if (!channel) return;

  var renderMessageType = 'mt-blog-live-preview-render';
  var readyMessageType = 'mt-blog-live-preview-ready';

  function renderPreview(html) {
    var scrollLeft = window.scrollX;
    var scrollTop = window.scrollY;
    var next = new DOMParser().parseFromString(String(html || ''), 'text/html');
    var headNodes = Array.from(next.head.childNodes, function importHeadNode(node) {
      return document.importNode(node, true);
    });
    var bodyNodes = Array.from(next.body.childNodes, function importBodyNode(node) {
      return document.importNode(node, true);
    });

    document.documentElement.lang = next.documentElement.lang || 'uk';
    document.head.replaceChildren.apply(document.head, headNodes);
    document.body.replaceChildren.apply(document.body, bodyNodes);
    requestAnimationFrame(function restoreScroll() {
      window.scrollTo(scrollLeft, scrollTop);
    });
  }

  addEventListener('message', function receivePreview(event) {
    var data = event.data;
    if (!data || data.type !== renderMessageType || data.channel !== channel) return;
    renderPreview(data.html);
  });

  parent.postMessage({ type: readyMessageType, channel: channel }, '*');
})();
