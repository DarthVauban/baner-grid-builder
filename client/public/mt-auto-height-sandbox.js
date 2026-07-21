(function autoHeightSandbox() {
  var script = document.currentScript;
  var channel = script && script.getAttribute('data-channel');
  if (!channel) return;

  var resizeMessageType = 'mt-auto-height-sandbox';
  var configMessageType = 'mt-auto-height-sandbox-config';
  var scheduled = false;
  var fontFamily = '';

  function enforceTypography() {
    if (!fontFamily || !document.body) return;
    var elements = [document.documentElement, document.body].concat(Array.from(document.body.querySelectorAll('*')));
    elements.forEach(function applyFont(element) {
      if (element.style.getPropertyValue('font-family') === fontFamily
        && element.style.getPropertyPriority('font-family') === 'important') return;
      element.style.setProperty('font-family', fontFamily, 'important');
    });
  }

  function measure() {
    scheduled = false;
    enforceTypography();
    var body = document.body;
    var bodyRect = body ? body.getBoundingClientRect() : { top: 0, bottom: 0, height: 0 };
    var furthestBottom = bodyRect.bottom;

    if (body) {
      Array.from(body.querySelectorAll('*')).forEach(function includeElement(element) {
        var rect = element.getBoundingClientRect();
        if (Number.isFinite(rect.bottom)) furthestBottom = Math.max(furthestBottom, rect.bottom);
      });
    }

    var height = Math.ceil(Math.max(
      bodyRect.height,
      body ? body.offsetHeight : 0,
      furthestBottom - bodyRect.top,
      1
    )) + 1;
    parent.postMessage({ type: resizeMessageType, channel: channel, height: height }, '*');
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(measure);
  }

  function start() {
    schedule();
    if (window.ResizeObserver) {
      var resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(document.documentElement);
      if (document.body) resizeObserver.observe(document.body);
    }
    if (window.MutationObserver) {
      new MutationObserver(schedule).observe(document.documentElement, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true
      });
    }
    addEventListener('load', schedule, true);
    addEventListener('resize', schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    [0, 100, 350, 1000, 2000].forEach(function scheduleLater(delay) {
      setTimeout(schedule, delay);
    });
  }

  addEventListener('message', function receiveConfiguration(event) {
    var data = event.data;
    if (!data || data.type !== configMessageType || data.channel !== channel) return;
    if (typeof data.fontFamily === 'string' && data.fontFamily.length <= 500) {
      fontFamily = data.fontFamily;
      schedule();
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
