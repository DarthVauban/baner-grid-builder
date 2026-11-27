/** Layout breakpoints are independent of the campaign's binary device targeting. */
/** @type {readonly ['desktop','laptop','tablet','mobileLandscape','mobile']} */
export const POPUP_DEVICES = ['desktop', 'laptop', 'tablet', 'mobileLandscape', 'mobile'];
export const POPUP_STYLE_LAYERS = ['base', 'laptop', 'tablet', 'mobileLandscape', 'mobile'];
export const DEVICE_LABELS = { desktop: 'Комп’ютер', laptop: 'Ноутбук', tablet: 'Планшет', mobileLandscape: 'Телефон горизонтально', mobile: 'Телефон' };
export const DEVICE_SCREENS = { desktop: { width: 1920, height: 1080 }, laptop: { width: 1024, height: 768 }, tablet: { width: 768, height: 1180 }, mobileLandscape: { width: 480, height: 390 }, mobile: { width: 420, height: 844 } };
export const COMPOSITION_LIMITS = Object.freeze(Object.fromEntries(POPUP_DEVICES.map(device => [device, Object.freeze({
  minWidth: 320, maxWidth: Infinity,
  minHeight: 240, maxHeight: 2000,
})])));
export const deviceParent = device => device === 'mobileLandscape' ? 'mobile' : 'desktop';
/** @returns {'base'|'laptop'|'tablet'|'mobileLandscape'|'mobile'} */
export const styleLayer = device => device === 'desktop' ? 'base' : device;
export const hasResponsiveCompositions = document => ['laptop', 'tablet', 'mobileLandscape'].some(device => !!document[device]);
/** Adapt the editor's cloned draft; immutable published documents keep their former modes. */
export function restoreTwoCompositions(document) {
  const changed = hasResponsiveCompositions(document);
  for (const device of ['laptop', 'tablet', 'mobileLandscape']) delete document[device];
  return changed;
}
export function popupDevice(document, width, height) {
  if (!hasResponsiveCompositions(document)) return width < 768 ? 'mobile' : 'desktop';
  if (width < 1024 && width > height && height <= 480) return 'mobileLandscape';
  return width >= 1440 ? 'desktop' : width >= 1024 ? 'laptop' : width >= 768 ? 'tablet' : 'mobile';
}
export function compositionFor(document, device = 'desktop') { return document[device] || document[deviceParent(device)] || document.desktop; }
export function boxFor(element, device = 'desktop') { return element[device] || element[deviceParent(device)] || element.desktop; }
export function editableBox(element, device) { return element[device] ||= structuredClone(boxFor(element, device)); }
export function responsiveValues(config, device = 'desktop') {
  return { ...config?.base, ...(device === 'mobileLandscape' ? config?.mobile : {}), ...(device === 'desktop' ? {} : config?.[device]) };
}
export const activeStyleLayers = device => device === 'desktop' ? ['base'] : device === 'mobileLandscape' ? ['base','mobile','mobileLandscape'] : ['base',device];
export function styleFor(element, device = 'desktop') {
  return { ...element.style, ...(device === 'mobileLandscape' ? element.mobileStyle : {}), ...(device === 'desktop' ? {} : element[device + 'Style']) };
}
export const styleOverrideFor = (element,device) => element[device+'Style'];
export function editableStyle(element, device) {
  return device === 'desktop' ? element.style : (element[device + 'Style'] ||= { fontSize: styleFor(element, device).fontSize });
}
/** Mutates a cloned draft only; public legacy documents keep their original selection. */
export function ensureResponsiveCompositions(document) {
  let changed = false;
  for (const device of ['laptop', 'tablet', 'mobileLandscape']) {
    if (!document[device]) {
      document[device] = structuredClone(compositionFor(document, device));
      document[device].width = Math.min(document[device].width, COMPOSITION_LIMITS[device].maxWidth);
      for(const element of document.elements||[])element[device] ||= structuredClone(boxFor(element,device));
      changed = true;
    }
  }
  return changed;
}

function styleConfigs(element) {
  const content=element.content;
  return [content.typography,content.button,content.shape,content.promo,content.product,content.design,content.flow,content.appearance,
    content.flow?.reward?.promo?.promo,...Object.values(content.appearance?.types||{}),...(content.fields||[]).flatMap(field=>[field.appearance,...Object.values(field.appearance?.types||{})])].filter(Boolean);
}
export function hasDeviceOverrides(element, device) {
  return !!element[device] || !!element[device+'Style'] || element.content[device+'Fit']!==undefined || element.content.product?.[device+'Preset']!==undefined || styleConfigs(element).some(config=>config[device]!==undefined);
}
export function resetElementDevice(element, device) {
  if(device==='desktop')return;
  if(device==='mobile'){element.mobile=null;element.mobileStyle=null;}else{delete element[device];delete element[device+'Style'];}
  delete element.content[device+'Fit'];
  if(element.content.product)delete element.content.product[device+'Preset'];
  for(const config of styleConfigs(element))delete config[device];
}
