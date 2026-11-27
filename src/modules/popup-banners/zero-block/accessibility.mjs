const label = value => typeof value === 'string' ? value.trim() : '';

/** The same effective action label is used by publication diagnostics and native controls. */
export function actionAccessibleName(element) {
  const content = element.content || {};
  const explicit = element.type === 'shape' ? label(content.accessibleName) || label(content.shape?.image?.alt)
    : element.type === 'image' ? label(content.alt)
    : ['text', 'button'].includes(element.type) ? label(content.text) : '';
  return explicit || (element.role === 'button' && element.action?.type === 'close' ? 'Закрити банер' : '');
}
