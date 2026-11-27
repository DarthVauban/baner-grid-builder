import {boxFor,styleFor} from './responsive.mjs';
import {paintBorder,paintShadows,bindPaintStates,disposePaints} from './paint-runtime.mjs';
import {shapeData,shapeImage,shapeLink,shapeValues,shapeFillCss,shapeShadowCss,shapeImageCss} from './shape.mjs';
const css=`
.kk-shape{position:absolute;inset:0;box-sizing:border-box;background-repeat:no-repeat;box-shadow:var(--kk-shape-shadow);transition:box-shadow var(--kk-shape-duration);pointer-events:none}
.kk-element[data-type=shape]:is(:hover,:focus-within) .kk-shape{box-shadow:var(--kk-shape-hover-shadow)}
.kk-shape-zoom{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:inherit;background:transparent;cursor:zoom-in;color:inherit}
.kk-shape-zoom:focus-visible{outline:3px solid #826324;outline-offset:3px}
.kk-shape-lightbox{position:fixed;inset:0;z-index:2147483500;display:grid;place-items:center;padding:48px 24px;box-sizing:border-box;background:rgb(28 25 23 / 92%);font:13px/1.5 'Segoe UI',Arial,sans-serif}
.kk-shape-lightbox>img{display:block;max-width:100%;max-height:calc(100dvh - 96px);width:auto;height:auto;object-fit:contain}
.kk-shape-lightbox>button{position:absolute;right:16px;top:16px;width:40px;height:40px;border:1px solid #e7e4df;border-radius:999px;background:#fff;color:#25231f;display:grid;place-items:center;font:26px/1 Arial,sans-serif;cursor:pointer}
.kk-shape-lightbox>button:focus-visible{outline:3px solid #eaddbc;outline-offset:3px}
@media(prefers-reduced-motion:reduce){.kk-shape{transition:none}}
`;
const create=(tag,className)=>{const node=document.createElement(tag);if(className)node.className=className;return node;};
/** The same isolated shape content is painted in authoring, preview and storefront. */
export function mountShapeContent(target,element,options={}){
 const style=create('style');style.textContent=css;const visual=create('div','kk-shape');visual.setAttribute('aria-hidden','true');target.append(style,visual);
 let config=shapeData(element.content),image=shapeImage(element.content),link=shapeLink(element.content);
 if(image.resourceId&&image.alt&&config.kind!=='line'){visual.removeAttribute('aria-hidden');visual.setAttribute('role','img');visual.setAttribute('aria-label',image.alt);}
 let source=image.resourceId?`${options.apiBase||''}/api/public/popup-banners/zero-block/media/${encodeURIComponent(image.resourceId)}`:'';
 let device=options.device||'desktop',currentSource='',observer,pending,disposed=false,lightbox=null;
 const fallback=()=>({background:element.style.background,radius:(styleFor(element,device).radius)/((boxFor(element,device)).scale||1)});
 function effects(){const v=shapeValues(element.content,device,fallback()),scale=(boxFor(element,device)).scale||1;paintBorder(visual,v.border.color);paintShadows(visual,target.matches(':hover,:focus-within')?v.hoverShadows??v.shadows:v.shadows,scale,target.matches(':hover,:focus-within')?'var(--kk-shape-hover-shadow)':'var(--kk-shape-shadow)');}
 const stopPaint=bindPaintStates(target,effects);
 function draw(){
  const values=shapeValues(element.content,device,fallback()),box=boxFor(element,device),scale=box.scale||1;
  const cornerScale=scale;
  const radius=config.kind==='circle'?'99999px':['topLeft','topRight','bottomRight','bottomLeft'].map(key=>`${values.corners[key]*cornerScale}px`).join(' ');
  target.style.borderRadius=radius;target.style.opacity=String(values.opacity/100);
  target.style.transformOrigin='center';target.style.transform=`rotate(${values.rotation}deg)`;
  target.style.width=`${box.width}px`;target.style.height=`${box.height}px`;target.style.background='transparent';
  visual.style.borderRadius=radius;visual.style.transform=`scale(${values.flipX?-1:1},${values.flipY?-1:1})`;
  visual.style.borderStyle=values.border.style;visual.style.borderColor=values.border.color;visual.style.borderWidth=['top','right','bottom','left'].map(side=>`${values.border.widths[side]*scale}px`).join(' ');
  visual.style.setProperty('--kk-shape-shadow',shapeShadowCss(values.shadows,scale));visual.style.setProperty('--kk-shape-hover-shadow',shapeShadowCss(values.hoverShadows??values.shadows,scale));visual.style.setProperty('--kk-shape-duration',`${values.hoverDuration}s`);
  const fill=shapeFillCss(values.fill,scale),position=shapeImageCss(values.imagePosition,scale),hasImage=currentSource&&config.kind!=='line';
  visual.style.backgroundImage=[hasImage?`url("${currentSource}")`:'',fill==='none'?'':fill].filter(Boolean).join(',')||'none';
  const count=values.fill.length,repeat=value=>Array(count).fill(value).join(',');
  visual.style.backgroundSize=[hasImage?position.backgroundSize:'',repeat('100% 100%')].filter(Boolean).join(',');
  visual.style.backgroundPosition=[hasImage?position.backgroundPosition:'',repeat('0% 0%')].filter(Boolean).join(',');
  visual.style.backgroundAttachment=[hasImage?position.backgroundAttachment:'',repeat('scroll')].filter(Boolean).join(',');effects();
 }
 function fullImage(){
  observer?.disconnect();observer=null;if(disposed||!source)return;
  pending=new Image();pending.onload=()=>{if(!disposed){currentSource=source;draw();}};pending.onerror=()=>{};pending.src=source;
 }
 if(source&&config.kind!=='line'){
  if(options.mode==='editor'||image.lazy==='off')currentSource=source;
  else{
   if(image.lazy==='on')currentSource=source+'?preview=1';
   if(typeof IntersectionObserver==='function'){observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))fullImage();},{rootMargin:'200px'});observer.observe(target);}else fullImage();
  }
 }
 let zoomButton;
 function closeLightbox(){if(!lightbox)return;const previous=lightbox.previous;lightbox.node.remove();lightbox=null;previous?.focus?.({preventScroll:true});}
 function openLightbox(){
  if(lightbox||!source||disposed)return;
  const root=target.getRootNode(),previous=root.activeElement||document.activeElement,overlay=create('div','kk-shape-lightbox'),picture=create('img'),close=create('button');
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',image.alt||'Зображення фігури');
  picture.src=source;picture.alt=image.alt;close.type='button';close.textContent='×';close.setAttribute('aria-label','Закрити зображення');
  close.addEventListener('click',closeLightbox);overlay.addEventListener('click',event=>{if(event.target===overlay)closeLightbox();});
  overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeLightbox();}if(event.key==='Tab'){event.preventDefault();event.stopPropagation();close.focus();}});
  overlay.append(picture,close);(root instanceof ShadowRoot?root:document.body).append(overlay);lightbox={node:overlay,previous};close.focus({preventScroll:true});
 }
 if(options.mode!=='editor'&&source&&config.kind!=='line'&&image.zoom&&element.role==='decorative'&&!element.action){zoomButton=create('button','kk-shape-zoom');zoomButton.type='button';zoomButton.setAttribute('aria-label',image.alt?`Збільшити: ${image.alt}`:'Збільшити зображення фігури');zoomButton.addEventListener('click',openLightbox);target.append(zoomButton);}
 const track=()=>{if(options.mode!=='storefront'||!link.track||!element.action&&!zoomButton)return;const detail={event:link.eventName,elementId:element.id};window.dispatchEvent(new CustomEvent('kramkin:shape-click',{detail}));if(Array.isArray(window.dataLayer))window.dataLayer.push({...detail});};
 target.addEventListener('click',track);
 draw();
 return {layout(nextDevice){device=nextDevice;draw();},update(next){element=next;config=shapeData(element.content);image=shapeImage(element.content);link=shapeLink(element.content);const nextSource=image.resourceId?`${options.apiBase||''}/api/public/popup-banners/zero-block/media/${encodeURIComponent(image.resourceId)}`:'';if(nextSource!==source){observer?.disconnect();if(pending)pending.onload=pending.onerror=null;source=nextSource;currentSource=source;}visual.toggleAttribute('aria-hidden',!source||!image.alt||config.kind==='line');if(source&&image.alt&&config.kind!=='line'){visual.setAttribute('role','img');visual.setAttribute('aria-label',image.alt);}else{visual.removeAttribute('role');visual.removeAttribute('aria-label');}draw();},destroy(){stopPaint();disposePaints(visual);disposed=true;observer?.disconnect();if(pending){pending.onload=pending.onerror=null;pending.removeAttribute('src');}closeLightbox();target.removeEventListener('click',track);}};
}
