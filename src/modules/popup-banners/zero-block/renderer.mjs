/* Public DOM renderer shared with the editor. No editor gestures are shipped here. */
import { paintAccessibilityCss,paintForeground,paintShadows,disposePaints,isGradient,mountFormContent, formMinimumSize, measureFormContent, mountShapeContent,mountTextContent,setTextFontBase,mountButtonContent,measureStyledButton,buttonCss,mountPromoContent,measurePromoContent,promoCss,mountTimerContent,timerCss,copyPromoValue,mountProductContent,measureProductContent,productCss,resolveProductElement,mountImageContent,placeNode,imageCorners,placementFor,placementLayout,boxFor,styleFor,compositionFor,popupDevice,actionAccessibleName } from './element-runtime.mjs';
export { mountFormContent } from './element-runtime.mjs';
export {measureTextContent} from './element-runtime.mjs';
const css = paintAccessibilityCss+buttonCss+promoCss+productCss+timerCss+`
:host{all:initial}.kk-backdrop{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(0,0,0,.48);font-family:Arial,sans-serif;color:#25231f;pointer-events:auto}
.kk-frame{position:absolute;pointer-events:auto;outline:none}
.kk-artboard{position:relative;overflow:hidden;transform-origin:top left;box-sizing:border-box;box-shadow:0 18px 54px rgba(0,0,0,.25);font-family:Arial,sans-serif}
.kk-artboard[data-editor],.kk-artboard[data-editor] *{user-select:none;-webkit-user-select:none;-webkit-user-drag:none}
.kk-artboard[data-editor]{overflow:visible}
.kk-backdrop[data-contained]{position:absolute;z-index:1}
.kk-element{isolation:isolate;position:absolute;box-sizing:border-box;min-width:0;min-height:0;overflow-wrap:anywhere;white-space:pre-wrap;line-height:1.35}
.kk-element[data-type=image] img{display:block;width:100%;height:100%}.kk-element[data-type=button],.kk-action{cursor:pointer}
.kk-element[data-type=button] .kk-action{display:flex;align-items:center;justify-content:inherit;text-decoration:none}
.kk-action{display:block;border:0;padding:0;width:100%;height:100%;font:inherit;color:inherit;background:transparent;text-align:inherit;white-space:inherit;overflow-wrap:inherit}
.kk-element[data-type=image]>.kk-action{border-radius:inherit;overflow:hidden}.kk-element[data-type=image]>.kk-action:focus-visible{outline-offset:-3px}
.kk-action:focus-visible,.kk-close:focus-visible,.kk-field:focus-visible{outline:3px solid #826324;outline-offset:2px}
.kk-field{box-sizing:border-box;width:100%;height:100%;padding:10px;border:1px solid #8b8275;border-radius:8px;font:inherit;color:inherit;background:transparent}
.kk-element[data-type=field]{display:flex;flex-direction:column}.kk-element[data-type=field] .kk-field{flex:1;min-height:0}
.kk-element[data-type=button]{white-space:pre;overflow-wrap:normal}
.kk-close{position:absolute;right:10px;top:10px;z-index:1000;border:0;border-radius:99px;width:36px;height:36px;background:#fff;color:#25231f;font-size:22px;cursor:pointer;box-shadow:0 1px 6px #0004}
.kk-close[aria-disabled=true]{cursor:default}
.kk-status{position:absolute;left:12px;right:56px;bottom:10px;z-index:1000;max-width:calc(100% - 68px);padding:7px 11px;border-radius:8px;background:#fff;color:#25231f;font-size:12px;box-shadow:0 1px 5px #0002}
@media(prefers-reduced-motion:reduce){.kk-artboard{scroll-behavior:auto}}
`;
const create = (tag, className) => { const node = document.createElement(tag); if (className) node.className = className; return node; };
const geo = boxFor;
export const BUTTON_PADDING = 4;
const buttonMeasurements = new Map();
let measurementContext;
/** Uses the same actual font and line metrics as paint; independent of zoom. */
export function measureButtonContent(element, device = 'desktop', products = {}) {
  if(element.type==='product'){const size=measureProductContent(element,device,products[element.content.productId]||null);return {width:size.minWidth,height:size.height};}
  if(element.type==='promo'&&element.content.promo?.version===1){const size=measurePromoContent(element,device);return {width:size.minWidth,height:size.height};}
  if (element.type === 'form') {
    const box = geo(element,device), scale = box.scale || 1;
    const font = styleFor(element,device).fontSize;
    const minimum = element.content.design?.version===1?measureFormContent(element.content,box.width/scale,device):formMinimumSize(element.content,Math.max(box.width / scale,240 * font / scale / 16),font / scale,device);
    return { width: minimum.width * scale, height: minimum.height * scale };
  }
  if(element.type==='shape')return {width:1,height:1};
  if (element.type !== 'button') return { width: 16, height: 16 };
  if(element.content.button?.version===1)return measureStyledButton(element,device);
  const fontSize = styleFor(element,device).fontSize;
  const text = element.content.text || ''; const key = `${fontSize}/${element.style.fontWeight}/${text}`;
  const cached = buttonMeasurements.get(key); if (cached) return cached;
  measurementContext ||= document.createElement('canvas').getContext('2d');
  measurementContext.font = `${element.style.fontWeight} ${fontSize}px Arial`;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const result = { width: Math.max(16, Math.ceil(Math.max(...lines.map(line => measurementContext.measureText(line).width))) + BUTTON_PADDING * 2),
    height: Math.max(16, Math.ceil(lines.length * fontSize * 1.35) + BUTTON_PADDING * 2) };
  if (buttonMeasurements.size >= 300) buttonMeasurements.clear(); buttonMeasurements.set(key, result);
  return result;
}
function paint(element, node, device) {
  const box = geo(element, device); const style = element.style; const minimum = measureButtonContent(element, device); const scale = box.scale || 1;
  const radius = styleFor(element,device).radius;
  Object.assign(node.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width / scale}px`, height: `${box.height / scale}px`, transformOrigin: 'top left', transform: scale === 1 ? 'none' : `scale(${scale})`,
    color: style.color, background: node.hasAttribute('data-editor-placeholder') ? 'transparent' : style.background, fontSize: `${styleFor(element,device).fontSize / scale}px`, fontWeight: String(style.fontWeight),
    textAlign: style.textAlign, borderRadius: element.type === 'image' ? Object.values(imageCorners(element, device)).map(value => `${value / scale}px`).join(' ') : `${radius / scale}px` });
  if (element.type === 'form') Object.assign(node.style,{width:`${Math.max(box.width,minimum.width)/scale}px`,height:element.content.design?.version===1?'auto':`${Math.max(box.height,minimum.height)/scale}px`,overflow:element.content.design?.version===1?'visible':'',minHeight:element.content.flow?`${Math.max(box.height,minimum.height)/scale}px`:''});
  if (element.type === 'button') Object.assign(node.style, { width: `${Math.max(box.width, minimum.width) / scale}px`, height: `${Math.max(box.height, minimum.height) / scale}px`, display: 'flex', alignItems: 'center', justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[style.textAlign], padding: `${BUTTON_PADDING / scale}px` });
}
function accessibleName(element) {
  return actionAccessibleName(element) || ({ shape: 'Фігура', button: 'Кнопка' }[element.type] || '');
}

function createCloseButton(options) {
  const close = create('button', 'kk-close'); close.type = 'button'; close.setAttribute('aria-label', 'Закрити поп-ап'); close.textContent = '×';
  if (options.mode === 'editor') {
    close.tabIndex = -1; close.setAttribute('aria-disabled', 'true'); close.setAttribute('aria-hidden', 'true');
    for (const type of ['pointerdown', 'click', 'dblclick', 'contextmenu']) close.addEventListener(type, event => { event.preventDefault(); event.stopPropagation(); });
  } else close.addEventListener('click', () => options.onClose?.());
  return close;
}

/** Creates actual content nodes. `mode=editor` makes every element inert and selectable. */
export function mountPopupArtboard(target, documentModel, options = {}) {
  setTextFontBase(options.apiBase);
  const style = create('style'); style.textContent = css; target.append(style);
  const artboard = create('div', 'kk-artboard'); artboard.setAttribute('data-kk-artboard', '');
  if (options.mode === 'editor') { artboard.setAttribute('data-editor', ''); artboard.addEventListener('dragstart', event => event.preventDefault()); }
  const status = create('div', 'kk-status'); status.setAttribute('role', 'status'); status.hidden = true;
  const close = options.mode === 'editor' ? createCloseButton(options) : null;
  let currentProducts=options.products||{};
  let sourceElements=documentModel.elements||[];
  let resolvedElements=sourceElements.map(element=>structuredClone(resolveProductElement(element,currentProducts[documentModel.productId])));
  const nodes = new Map(); const fields = new Map(); const forms = new Map(); const shapes = new Map();const images=new Map(),texts=new Map(),buttons=new Map(),promos=new Map(),products=new Map(),timers=new Map();
  const elementsById=new Map(),layoutKeys=new Map(),contentKeys=new Map(),selectable=new WeakSet();
  let currentDevice=options.device||'desktop',currentScale=options.scale||1,boardKey='';
  const contentMode=element=>element.type+':'+(element.type==='text'?!!(element.content.typography||element.content.richText):element.type==='button'?element.content.button?.version||0:element.type==='shape'?element.content.shape?.version||0:element.type==='promo'?element.content.promo?.version||0:element.type==='form'?element.content.design?.version||0:'');
  function tell(message) { status.textContent = message; status.hidden = !message; }
  function runAction(element, event) {
    event?.preventDefault();
    const action = element.action;
    if (!action || options.mode === 'editor') return;
    if (action.type === 'navigate') {
      if (options.mode === 'preview') return tell('У прев’ю перехід вимкнено');
      if (action.target === 'new_tab') window.open(action.url, '_blank', 'noopener,noreferrer');
      else window.location.assign(action.url);
    } else if (action.type === 'close') options.onClose?.();
    else if (action.type === 'copy_promo') {
      const promo = documentModel.elements.find((item) => item.id === action.promoElementId && item.type === 'promo');
      if (!promo) return tell('Промокод недоступний');
      void copyPromoValue(promo.content.value,{mode:options.mode,onNotice:tell,onActionSuccess:options.onActionSuccess}).then(result=>{if(result==='success')promos.get(promo.id)?.copied();});
    } else if (action.type === 'submit') {
      if (forms.has(action.formId)) return void forms.get(action.formId).submit();
      if (options.mode === 'preview') return tell('Прев’ю не надсилає заявки');
      const values = {};
      for (const item of documentModel.elements) if (item.type === 'field' && item.content.formId === action.formId) {
        const control = fields.get(item.id);
        if (!control?.reportValidity()) return;
        values[item.id] = control.value;
      }
      tell('Надсилаємо заявку…');
      if (!options.onSubmit) return tell('Заявку не прийнято. Спробуйте ще раз.');
      Promise.resolve(options.onSubmit(action.formId, values)).then(() => { tell('Заявку прийнято'); }, (error) => { tell(error?.message || 'Заявку не прийнято. Спробуйте ще раз.'); });
    }
  }
  function mountElement(element,node=create('div','kk-element')){
    node.dataset.elementId=element.id;node.dataset.type=element.type;
    if(options.mode==='editor'&&!selectable.has(node)){selectable.add(node);node.addEventListener('pointerdown',event=>{event.stopPropagation();options.onSelect?.(node.dataset.elementId,event);});}
    paint(element, node, options.device || 'desktop');
    if(element.type==='product'){
      const product=options.products?.[element.content.productId];
      if(product)products.set(element.id,mountProductContent(node,element,{...options,product,onNotice:tell}));
      else if(options.mode==='editor'||options.mode==='preview')options.renderPlaceholder?.(node,'product');
    } else if(element.type==='timer'){
      timers.set(element.id,mountTimerContent(node,element,{...options,shopId:documentModel.shopId,widgetId:documentModel.widgetId}));
    } else if (element.type === 'form') {
      forms.set(element.content.formId,mountFormContent(node,element.content,{ ...options, name: documentModel.forms?.find(item=>item.id===element.content.formId)?.name || 'Форма' }));
    } else if(element.type==='image'){
      images.set(element.id,mountImageContent(node,element,{...options,product:currentProducts[documentModel.productId]}));
    } else if (options.mode === 'editor') {
      node.textContent = element.type === 'field' || element.type === 'image' || element.type === 'product' || element.type === 'shape' ? '' : element.type === 'promo' ? [element.content.label, element.content.value].filter(Boolean).join(': ') : element.content.text;
      if ((element.type === 'image' && !element.content.resourceId) || element.type === 'product') options.renderPlaceholder?.(node, element.type);
      if (element.type === 'field') {
        node.textContent = '';
        const label = create('span','kk-legacy-label'); label.textContent = element.content.label; label.style.cssText = 'display:block;font-size:.65em;margin-bottom:3px';
        const field = create('div', 'kk-field'); field.textContent = element.content.placeholder || ''; field.setAttribute('aria-hidden', 'true');
        if (element.content.label) node.append(label); node.append(field);
      }
    } else if (element.type === 'field') {
      const label = create('label'); label.textContent = element.content.label; label.style.cssText = 'display:block;font-size:.65em;margin-bottom:3px';
      const input = create(element.content.fieldType === 'textarea' ? 'textarea' : 'input', 'kk-field');
      if (input.tagName === 'INPUT') input.type = element.content.fieldType;
      input.required = element.content.required; input.placeholder = element.content.placeholder || ''; input.setAttribute('aria-label', element.content.label || 'Поле форми');
      input.maxLength = { text: 500, email: 254, tel: 40, textarea: 2000 }[element.content.fieldType] || 500;
      if (element.content.label) node.append(label); node.append(input); fields.set(element.id, input);
    } else if (element.type === 'promo') node.textContent = [element.content.label, element.content.value].filter(Boolean).join(': ');
    else if (element.type === 'product') { if (options.mode === 'preview') options.renderPlaceholder?.(node, 'product'); }
    else if (element.type === 'shape') { /* the styled box is the content */ }
    else node.textContent = element.content.text;

    if(element.type==='shape'&&element.content.shape?.version===1){node.replaceChildren();shapes.set(element.id,mountShapeContent(node,element,options));}
    if(element.type==='text'&&(element.content.typography||element.content.richText))texts.set(element.id,mountTextContent(node,element,{...options,onNotice:tell}));
    if(element.type==='button'&&element.content.button?.version===1)buttons.set(element.id,mountButtonContent(node,element,options));
    if(element.type==='promo'&&element.content.promo?.version===1){Object.assign(node.style,{width:`${Math.max(geo(element,options.device||'desktop').width,measurePromoContent(element,options.device||'desktop').width)}px`});promos.set(element.id,mountPromoContent(node,element,{...options,onNotice:tell}));}
    if (options.mode !== 'editor' && (element.role === 'button' || element.role === 'link')) {
      const action = element.action;
      const control = create(action?.type === 'navigate' ? 'a' : 'button', 'kk-action');
      if (control.tagName === 'BUTTON') control.type = 'button';
      else { control.href = action.url; if (action.target === 'new_tab') { control.target = '_blank'; control.rel = 'noopener noreferrer'; } if(element.type==='shape'&&element.content.shape?.link?.nofollow||element.type==='text'&&element.content.typography?.nofollow||element.type==='button'&&element.content.button?.nofollow)control.rel=[control.rel,'nofollow'].filter(Boolean).join(' '); }
      control.setAttribute('aria-label', accessibleName(element));
      while (node.firstChild) control.append(node.firstChild);
      if (!control.childNodes.length && element.type !== 'shape') control.textContent = accessibleName(element);
      if (options.mode === 'preview' || control.tagName === 'BUTTON') control.addEventListener('click', (event) => runAction(element, event));
      node.append(control);
    }
    if(node.parentNode!==artboard)artboard.insertBefore(node,status.parentNode===artboard?status:null);
    nodes.set(element.id,node);elementsById.set(element.id,element);contentKeys.set(element.id,JSON.stringify(element.content));
  }
  for(const element of resolvedElements)mountElement(element);
  artboard.append(status);if(close)artboard.append(close);target.append(artboard);
  function layoutElement(element,device){
    const node=nodes.get(element.id),box=geo(element,device),withoutPosition=box=>box?{...box,x:0,y:0}:null;
    const product=currentProducts[element.type==='product'?element.content.productId:documentModel.productId],name=documentModel.forms?.find(item=>item.id===element.content.formId)?.name||'Форма',view=options.formSteps?.[element.content.formId];
    const key=JSON.stringify([device,{...element,desktop:withoutPosition(element.desktop),mobile:withoutPosition(element.mobile),laptop:withoutPosition(element.laptop),tablet:withoutPosition(element.tablet),mobileLandscape:withoutPosition(element.mobileLandscape)},['image','product'].includes(element.type)?product:null,name,view]);
    if(layoutKeys.get(element.id)===key){node.style.left=`${box.x}px`;node.style.top=`${box.y}px`;return;}
    layoutKeys.set(element.id,key);paint(element,node,device);
    images.get(element.id)?.update(element,product);images.get(element.id)?.layout(device);
    const form=forms.get(element.content.formId),contentKey=JSON.stringify(element.content),contentChanged=contentKeys.get(element.id)!==contentKey;
    if(form){
      if(contentChanged&&!form.update(element.content,{name,formSteps:options.formSteps})){form.destroy();forms.set(element.content.formId,mountFormContent(node,element.content,{...options,name}));}
      const current=forms.get(element.content.formId);current.form.setAttribute('aria-label',name);current.layout(device);if(view!==undefined)current.setStep(view);
    }
    shapes.get(element.id)?.update(element);shapes.get(element.id)?.layout(device);
    texts.get(element.id)?.layout(device);buttons.get(element.id)?.layout(device,element);
    promos.get(element.id)?.update(element);promos.get(element.id)?.layout(device);
    timers.get(element.id)?.update(element);timers.get(element.id)?.layout(device);
    if(element.type==='product'){
      if(products.has(element.id))products.get(element.id).update(element,product||null);
      else if(product){delete node.dataset.editorPlaceholder;products.set(element.id,mountProductContent(node,element,{...options,product,onNotice:tell}));}products.get(element.id)?.layout(device);
    }
    if(contentChanged&&!['image','form','shape','product','timer'].includes(element.type)&&!texts.has(element.id)&&!buttons.has(element.id)&&!promos.has(element.id)){
      const value=element.type==='promo'?[element.content.label,element.content.value].filter(Boolean).join(': '):element.type==='field'?element.content.placeholder||'':element.content.text;
      if(element.type==='field'){
        const field=node.querySelector('.kk-field');if(field&&field.textContent!==value)field.textContent=value;
        let label=node.querySelector('.kk-legacy-label');
        if(element.content.label){if(!label){label=create('span','kk-legacy-label');label.style.cssText='display:block;font-size:.65em;margin-bottom:3px';node.prepend(label);}if(label.textContent!==element.content.label)label.textContent=element.content.label;}else label?.remove();
      }else if(node.textContent!==value)node.textContent=value;
    }
    contentKeys.set(element.id,contentKey);
    if(!['image','form','text','button','shape','promo','product','timer'].includes(element.type)||element.type==='text'&&!element.content.typography&&!element.content.richText)paintForeground(node,element.style.color);
  }
  function paintBoard(device,scale){
    const board=compositionFor(documentModel,device),key=JSON.stringify([device,scale,board,documentModel.showCloseButton]);if(key===boardKey)return;boardKey=key;artboard.dataset.device=device;
    if(close)close.hidden=documentModel.showCloseButton===false;
    artboard.style.width=`${board.width}px`;artboard.style.height=`${board.height}px`;artboard.style.background=board.background;artboard.style.transform=`scale(${scale})`;
    const corners=board.corners;artboard.style.borderRadius=corners?`${corners.topLeft}px ${corners.topRight}px ${corners.bottomRight}px ${corners.bottomLeft}px`:'0px';
    const shadow=board.shadow;artboard.style.boxShadow=shadow?shadow.enabled&&!isGradient(shadow.color)?`${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${shadow.color}`:'none':'0 18px 54px rgba(0,0,0,.25)';paintShadows(artboard,shadow?.enabled?[{...shadow}]:[]);
  }
  function layout(device,scale=1){currentDevice=device;currentScale=scale;paintBoard(device,scale);for(const element of resolvedElements)layoutElement(element,device);const board=compositionFor(documentModel,device);return {width:board.width*scale,height:board.height*scale};}
  function clearElement(element,remove=true){
    const node=nodes.get(element.id);images.get(element.id)?.destroy();images.delete(element.id);texts.get(element.id)?.destroy();texts.delete(element.id);buttons.get(element.id)?.destroy();buttons.delete(element.id);shapes.get(element.id)?.destroy();shapes.delete(element.id);promos.get(element.id)?.destroy();promos.delete(element.id);products.get(element.id)?.destroy();products.delete(element.id);timers.get(element.id)?.destroy();timers.delete(element.id);
    if(element.type==='form'){forms.get(element.content.formId)?.destroy();forms.delete(element.content.formId);}fields.delete(element.id);disposePaints(node);layoutKeys.delete(element.id);contentKeys.delete(element.id);elementsById.delete(element.id);
    if(remove){node.remove();nodes.delete(element.id);}else{node.replaceChildren();node.className='kk-element';node.style.cssText='';delete node.dataset.editorPlaceholder;}
  }
  function updateDocument(next,nextOptions={}){
    if(options.mode!=='editor'||next.widgetId!==documentModel.widgetId||next.shopId!==documentModel.shopId)return false;
    Object.assign(options,nextOptions);currentProducts=options.products||{};documentModel=next;sourceElements=next.elements||[];
    const ids=new Set(sourceElements.map(element=>element.id));for(const old of [...elementsById.values()])if(!ids.has(old.id))clearElement(old);
    resolvedElements=sourceElements.map(source=>{
      const incoming=structuredClone(resolveProductElement(source,currentProducts[next.productId])),old=elementsById.get(source.id);
      if(!old){mountElement(incoming);return incoming;}
      if(contentMode(old)!==contentMode(incoming)){const node=nodes.get(old.id);clearElement(old,false);mountElement(incoming,node);return incoming;}
      for(const key of Object.keys(old))if(!Object.hasOwn(incoming,key))delete old[key];Object.assign(old,incoming);return old;
    });
    currentDevice=options.device||currentDevice;paintBoard(currentDevice,currentScale);for(const element of resolvedElements)layoutElement(element,currentDevice);
    let before=artboard.firstChild;for(const element of resolvedElements){
      const node=nodes.get(element.id),block=[node];let cursor=node.nextSibling;
      while(cursor?.nodeType===1&&cursor.hasAttribute('data-kk-paint-decoration')){block.push(cursor);cursor=cursor.nextSibling;}
      if(node!==before)for(const part of block)placeNode(artboard,part,before);
      before=block.at(-1).nextSibling;
    }
    for(const [id,node]of nodes)node.style.visibility=id===options.hiddenElementId?'hidden':'';
    return true;
  }
  layout(options.device||'desktop',options.scale||1);
  return {artboard,nodes,fields,forms,layout,tell,setTimerExpired(value){for(const timer of timers.values())timer.setExpired(value);},updateDocument,updateGeometry:next=>updateDocument(next),updateProducts(next){
    next||={};if(JSON.stringify(next)===JSON.stringify(currentProducts))return;currentProducts=next;
    for(const [index,source]of sourceElements.entries()){
      const element=resolvedElements[index];Object.assign(element,resolveProductElement(source,next[documentModel.productId]));
      if(source.type==='product')products.get(source.id)?.updateProduct(next[source.content.productId]||null);
      if(source.type==='text'&&source.content.richText?.blocks.some(block=>block.runs.some(run=>run.productField))){layoutKeys.delete(source.id);texts.get(source.id)?.layout(currentDevice);}
      const node=nodes.get(source.id),control=node.querySelector('.kk-action');if(control){control.setAttribute('aria-label',accessibleName(element));if(source.action?.type==='product'){const url=element.action?.url;if(url)control.setAttribute('href',url);else control.removeAttribute('href');}}
      if(source.type==='image')images.get(source.id)?.updateProduct(next[documentModel.productId]);
    }
  },destroy(){for(const element of [...elementsById.values()])clearElement(element);disposePaints(artboard);}};
}

export function mountPopupOverlay(host, documentModel, options = {}) {
  const contained = options.mode === 'preview' && options.contained === true;
  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' }); shadow.replaceChildren();
  const backdrop = create('div', 'kk-backdrop');
  let suspended = options.suspended === true;
  if (suspended) backdrop.style.visibility = 'hidden';
  if (contained) backdrop.setAttribute('data-contained', '');
  const frame = create('section', 'kk-frame'); frame.setAttribute('aria-label', documentModel.name || 'Поп-ап'); frame.tabIndex = -1;
  backdrop.append(frame); shadow.append(backdrop);
  const mounted = mountPopupArtboard(frame, documentModel, { ...options, mode: options.mode || 'storefront' });
  const close = createCloseButton(options); close.hidden = documentModel.showCloseButton === false; frame.append(close);
  let previousFocus = document.activeElement;
  let previousOverflow,previousPriority,locked=false,modal=false,backdropPointer=null;
  function releaseScroll(){if(!locked)return;locked=false;if(document.body.style.overflow==='hidden'){if(previousOverflow)document.body.style.setProperty('overflow',previousOverflow,previousPriority);else document.body.style.removeProperty('overflow');}}
  backdrop.addEventListener('pointerdown',event=>{backdropPointer=modal&&event.target===backdrop&&event.button===0?event.pointerId:null;if(backdropPointer!==null)event.preventDefault();});
  backdrop.addEventListener('pointerup',event=>{const dismiss=modal&&backdropPointer===event.pointerId&&event.target===backdrop;backdropPointer=null;if(dismiss)options.onClose?.();});
  backdrop.addEventListener('pointercancel',()=>{backdropPointer=null;});
  function resize() {
    const viewport=window.visualViewport,width=contained?host.clientWidth:viewport?.width||innerWidth,height=contained?host.clientHeight:viewport?.height||innerHeight;
    if(width<=0||height<=0)return;
    const device=options.device||popupDevice(documentModel,innerWidth,innerHeight),board=compositionFor(documentModel,device),placement=placementFor(board),plan=placementLayout(board,width,height,placement),wasModal=modal;
    modal=placement.overlay;
    backdrop.style.background=modal?'rgba(0,0,0,.48)':'transparent';backdrop.style.pointerEvents=modal?'auto':'none';
    if(!contained){backdrop.style.left=`${viewport?.offsetLeft||0}px`;backdrop.style.top=`${viewport?.offsetTop||0}px`;backdrop.style.width=`${width}px`;backdrop.style.height=`${height}px`;}
    frame.setAttribute('role',contained?'group':modal?'dialog':'region');
    if(modal&&!contained)frame.setAttribute('aria-modal','true');else frame.removeAttribute('aria-modal');
    if(!suspended&&!contained&&modal&&!locked){previousOverflow=document.body.style.getPropertyValue('overflow');previousPriority=document.body.style.getPropertyPriority('overflow');document.body.style.setProperty('overflow','hidden');locked=true;}
    if(!modal)releaseScroll();
    mounted.layout(device,plan.scale);
    Object.assign(frame.style,{left:`${plan.x}px`,top:`${plan.y}px`,width:`${plan.width}px`,height:`${plan.height}px`});
    if(!suspended&&!contained&&modal&&!wasModal&&!shadow.activeElement){
      previousFocus=document.activeElement;
      const custom=documentModel.elements.find(item=>item.role==='button'&&item.action?.type==='close');
      const focusTarget=close.hidden?(mounted.nodes.get(custom?.id)?.querySelector('.kk-action')||frame):close;
      focusTarget.focus({preventScroll:true});
    }
  }
  function keydown(event) {
    if(suspended||event.defaultPrevented)return;
    if (event.key === 'Escape') { event.preventDefault(); options.onClose?.(); }
    if (event.key === 'Tab'&&modal&&event.composedPath().includes(host)) {
      const focusable = [...shadow.querySelectorAll('button,a,input,textarea,select')].filter((item) => !item.disabled && !item.closest('[hidden],[inert]'));
      if (!focusable.length) return;
      const index = focusable.indexOf(shadow.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
    }
  }
  const observer = contained ? new ResizeObserver(resize) : null; observer?.observe(host);
  window.addEventListener('resize',resize);if(!contained){window.addEventListener('keydown',keydown);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);}
  resize();
  return { activate() {if(!suspended)return;suspended=false;modal=false;backdrop.style.visibility='';resize();},
    setTimerExpired:mounted.setTimerExpired,setDevice(device){options.device=device;resize();}, updateProducts:mounted.updateProducts, destroy() { const ownedFocus=!suspended&&(!!shadow.activeElement||modal&&(document.activeElement===host||document.activeElement===document.body));mounted.destroy();observer?.disconnect();window.removeEventListener('resize',resize);window.removeEventListener('keydown',keydown);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);releaseScroll();if(!contained&&ownedFocus&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});if(options.removeHost===false)shadow.replaceChildren();else host.remove(); } };
}
