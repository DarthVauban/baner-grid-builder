/** Shared inert workspace decoration; also mounted inside the editor's Shadow DOM. */
export function renderEditorPlaceholder(host, type) {
  host.setAttribute('data-editor-placeholder', '');
  host.style.background = 'transparent';
  const root = host.ownerDocument.createElement('div');
  root.className = 'ui-editor-placeholder'; root.dataset.kind = type;
  root.setAttribute('role', 'img'); root.setAttribute('aria-label', type === 'image' ? 'Порожнє зображення' : 'Товар не вибрано');
  const tokens = getComputedStyle(host.ownerDocument.documentElement);
  Object.assign(root.style, { width: '100%', height: '100%', boxSizing: 'border-box', position: 'relative', pointerEvents: 'none',
    overflow: 'hidden', background: tokens.getPropertyValue('--surface-dark'), color: tokens.getPropertyValue('--color-accent'),
    border: `1px solid ${tokens.getPropertyValue('--color-dark-raised')}`, borderRadius: tokens.getPropertyValue('--radius-sm') });
  const ns = 'http://www.w3.org/2000/svg';
  const svg = host.ownerDocument.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 100 60'); svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '80%', height: '80%', maxWidth: '100px', maxHeight: '60px' });
  const parts = type === 'image' ? [
    ['rect', { x: '16', y: '8', width: '68', height: '44', rx: '7' }], ['circle', { cx: '35', cy: '23', r: '4' }], ['path', { d: 'M18 44l20-16 13 11 12-9 19 17' }],
  ] : [
    ['path', { d: 'M19 18h30l4 34H15l4-34z M26 19v-6a8 8 0 0116 0v6' }],
    ['path', { d: 'M64 20h20M64 30h14M64 42h18' }],
  ];
  for (const [tag, attributes] of parts) {
    const part = host.ownerDocument.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) part.setAttribute(key, value);
    part.setAttribute('fill', 'none'); part.setAttribute('stroke', 'currentColor'); part.setAttribute('stroke-width', '1.5'); part.setAttribute('stroke-linecap', 'round'); part.setAttribute('stroke-linejoin', 'round'); svg.append(part);
  }
  root.append(svg); host.replaceChildren(root);
}
