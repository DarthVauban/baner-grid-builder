import {isGradient,paintFallback,paintAlpha,parsePaint} from './paint.mjs';
export const paintAccessibilityCss=`@media(forced-colors:active){[data-kk-foreground-gradient]{-webkit-text-fill-color:CanvasText!important;background-image:none!important}[data-kk-gradient-border]{border-color:CanvasText!important}[data-kk-gradient-outline]{outline-color:Highlight!important}[data-kk-paint-decoration]{display:none!important}svg[data-kk-gradient-stroke],svg [data-kk-gradient-stroke]{stroke:CanvasText!important}svg[data-kk-gradient-fill],svg [data-kk-gradient-fill]{fill:CanvasText!important}}`;

// Gradients are images in CSS: never assign them to color, border-color or box-shadow.
export function foregroundCss(value){return isGradient(value)?`color:${paintFallback(value)};background-image:${value};background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent`:`color:${value};-webkit-text-fill-color:currentColor`;}
const paintedText=new WeakMap(),decorations=new WeakMap();
const decorationBase='position:absolute;display:block;pointer-events:none;box-sizing:border-box;z-index:auto;';
const image=svg=>`url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
function clearText(node){const old=paintedText.get(node);if(!old)return;for(const [key,value]of Object.entries(old))node.style[key]=value;paintedText.delete(node);delete node.dataset.kkForegroundGradient;}
export const resetForeground=node=>clearText(node);
/** Leaf text gets its own paint surface, leaving the button/card background intact. */
export function paintForeground(node,value){
 if(!node)return;clearText(node);const gradient=isGradient(value);node.style.color=paintFallback(value);
 if(node.namespaceURI==='http://www.w3.org/2000/svg'){
  node.querySelector('[data-kk-paint-defs]')?.remove();if(!gradient){node.style.color=value;for(const key of ['stroke','fill'])for(const n of [node,...node.querySelectorAll(`[data-kk-gradient-${key}]`)])if(n.hasAttribute(`data-kk-gradient-${key}`)){n.setAttribute(key,'currentColor');n.removeAttribute(`data-kk-gradient-${key}`);}return;}
  const ns=node.namespaceURI,defs=document.createElementNS(ns,'defs'),g=document.createElementNS(ns,'pattern'),id='kk-paint-'+crypto.randomUUID(),box=node.viewBox?.baseVal,w=box?.width||24,h=box?.height||24;defs.dataset.kkPaintDefs='';g.id=id;g.setAttribute('patternUnits','userSpaceOnUse');g.setAttribute('width',String(w));g.setAttribute('height',String(h));const bitmap=document.createElementNS(ns,'image');bitmap.setAttribute('href',gradientBitmap(value,w,h));bitmap.setAttribute('width',String(w));bitmap.setAttribute('height',String(h));g.append(bitmap);defs.append(g);node.prepend(defs);
  for(const key of ['stroke','fill'])for(const n of [node,...node.querySelectorAll(`[${key}="currentColor"],[data-kk-gradient-${key}]`)])if(n.getAttribute(key)==='currentColor'||n.hasAttribute(`data-kk-gradient-${key}`)){n.setAttribute(key,`url(#${id})`);n.setAttribute(`data-kk-gradient-${key}`,'');}return;
 }
 const children=[...node.children].filter(n=>!n.matches('style,[data-kk-paint-decoration]'));
 if(children.length){
  for(const child of [...node.childNodes])if(child.nodeType===3&&child.textContent?.trim()){const span=document.createElement('span');span.dataset.kkPaintText='';child.replaceWith(span);span.append(child);children.push(span);}
  for(const child of children)if(!child.dataset.richPaintColor){child.dataset.kkInheritedPaint='true';paintForeground(child,value);}
  return;
 }
 if(!node.textContent&&!node.matches('input,textarea'))return;
 if(node.dataset.richPaintHighlight||node.dataset.richPaintLineColor){
  const keys=['backgroundImage','backgroundColor','backgroundClip','webkitBackgroundClip','webkitTextFillColor','backgroundSize','backgroundPosition','backgroundRepeat'];paintedText.set(node,Object.fromEntries(keys.map(key=>[key,node.style[key]])));
  const explicit=node.dataset.richPaintColor;paintInline(node,{color:value,highlight:node.dataset.richPaintHighlight,lineColor:node.dataset.richPaintLineColor,lineWidth:parseFloat(node.style.textDecorationThickness)||1});if(!explicit)delete node.dataset.richPaintColor;return;
 }
 if(!gradient){node.style.color=value;delete node.dataset.kkForegroundGradient;return;}
 node.dataset.kkForegroundGradient='';
 const keys=['backgroundImage','backgroundColor','backgroundClip','webkitBackgroundClip','webkitTextFillColor'];paintedText.set(node,Object.fromEntries(keys.map(key=>[key,node.style[key]])));
 // A separate background layer keeps an input's own solid/gradient surface visible.
 const computed=getComputedStyle(node),background=computed.backgroundImage;
 const surface=background&&background!=='none'?background:`linear-gradient(${computed.backgroundColor},${computed.backgroundColor})`;node.style.backgroundImage=value+','+surface;node.style.backgroundClip='text,padding-box';node.style.webkitBackgroundClip=node.style.backgroundClip;node.style.webkitTextFillColor='transparent';
}
export function paintDecoration(node,key,draw){
 let map=decorations.get(node);if(!map){map=new Map();decorations.set(node,map);}let entry=map.get(key);
 if(!draw){entry?.observer.disconnect();entry?.layer.remove();map.delete(key);return;}
 if(!entry){const layer=document.createElement('span');layer.dataset.kkPaintDecoration=key;layer.setAttribute('aria-hidden','true');layer.style.cssText='position:absolute;display:block;pointer-events:none;box-sizing:border-box;z-index:1';const observer=new ResizeObserver(()=>update());entry={layer,observer,draw};map.set(key,entry);observer.observe(node);}
 entry.draw=draw;
 function update(){if(!node.parentNode)return;const {layer}=entry,offset=node.offsetParent,parent=offset&&offset.getRootNode()===node.getRootNode()?offset:node.parentNode;let anchor=node;while(anchor.parentNode&&anchor.parentNode!==parent)anchor=anchor.parentElement;if(layer.parentNode!==parent){if(anchor.parentNode===parent)parent.insertBefore(layer,anchor.nextSibling);else parent.append(layer);}entry.draw(layer,node.offsetWidth,node.offsetHeight,getComputedStyle(node));let opacity=1,ancestor=node;while(ancestor&&ancestor!==parent){opacity*=Number(getComputedStyle(ancestor).opacity);ancestor=ancestor.parentElement;}layer.style.opacity=String(opacity);}
 update();
}
const radii=(style,w,h)=>{const raw=['TopLeft','TopRight','BottomRight','BottomLeft'].map(key=>Math.max(0,parseFloat(style['border'+key+'Radius'])||0)),[a,b,c,d]=raw,f=Math.min(1,w/(a+b||1),w/(c+d||1),h/(a+d||1),h/(b+c||1));return raw.map(n=>n*f);};
function rounded(w,h,r,inset=0){const [[ax,ay],[bx,by],[cx,cy],[dx,dy]]=r.map(n=>(Array.isArray(n)?n:[n,n]).map(v=>Math.max(0,v-inset))),x=inset,y=inset,R=w-inset,B=h-inset;return `M${x+ax} ${y}H${R-bx}A${bx} ${by} 0 0 1 ${R} ${y+by}V${B-cy}A${cx} ${cy} 0 0 1 ${R-cx} ${B}H${x+dx}A${dx} ${dy} 0 0 1 ${x} ${B-dy}V${y+ay}A${ax} ${ay} 0 0 1 ${x+ax} ${y}Z`;}
/** Masked decoration preserves rounded corners, sparse side widths and control hit areas. */
export function paintBorder(node,value){
 const gradient=isGradient(value);node.style.setProperty('border-color',gradient?'transparent':value);
 if(gradient)node.dataset.kkGradientBorder='';else delete node.dataset.kkGradientBorder;
 paintDecoration(node,'border',gradient?(layer,w,h,style)=>{
  const widths=['Top','Right','Bottom','Left'].map(side=>parseFloat(style['border'+side+'Width'])||0),r=radii(style,w,h),[t,R,b,l]=widths;if(!widths.some(Boolean)){layer.style.display='none';return;}
  layer.style.cssText=decorationBase+`;left:${node.offsetLeft}px;top:${node.offsetTop}px;width:${w}px;height:${h}px;background:${value};border-radius:${style.borderRadius};transform:${node.style.transform||'none'};transform-origin:${style.transformOrigin}`;
  const innerW=Math.max(0,w-l-R),innerH=Math.max(0,h-t-b),innerR=[[r[0]-l,r[0]-t],[r[1]-R,r[1]-t],[r[2]-R,r[2]-b],[r[3]-l,r[3]-b]].map(pair=>pair.map(v=>Math.max(0,v)));
  const path=rounded(w,h,r),inner=rounded(innerW,innerH,innerR),ring=`<path d="${path}" fill="white"/><path d="${inner}" transform="translate(${l} ${t})" fill="black"/>`,m=Math.max(...widths),dashed=['dotted','dashed'].includes(style.borderTopStyle),mask=dashed?`<defs><mask id="ring">${ring}</mask></defs><path d="${rounded(w,h,r,m/2)}" fill="none" stroke="white" stroke-width="${m}" stroke-linecap="${style.borderTopStyle==='dotted'?'round':'butt'}" stroke-dasharray="${style.borderTopStyle==='dotted'?`0 ${m*2}`:`${m*3} ${m*2}`}" mask="url(#ring)"/>`:ring;
  layer.style.maskImage=image(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${mask}</svg>`);layer.style.maskMode='luminance';
 }:null);
}
/** Native shadows remain native; image-coloured shadows get the same rounded-box mask. */
export function paintShadows(node,shadows=[],scale=1,native){
 const hasGradient=shadows.some(s=>isGradient(s.color)),gradients=hasGradient?shadows.filter(s=>s.opacity!==0&&[s.x,s.y,s.blur,s.spread].some(Boolean)):[];if(hasGradient)node.style.boxShadow='none';else if(native!==undefined)node.style.boxShadow=native;
 for(const key of decorations.get(node)?.keys()||[])if(key.startsWith('shadow'))paintDecoration(node,key,null);
 gradients.forEach((shadow,index)=>paintDecoration(node,'shadow'+index,(layer,w,h,style)=>{
  const x=shadow.x*scale,y=shadow.y*scale,blur=shadow.blur*scale/2,spread=(shadow.spread||0)*scale,pad=Math.ceil(Math.max(Math.abs(x),Math.abs(y))+blur*4+Math.abs(spread)+2),W=w+pad*2,H=h+pad*2,r=radii(style,w,h);
  layer.style.cssText=decorationBase+`;left:${node.offsetLeft-pad}px;top:${node.offsetTop-pad}px;width:${W}px;height:${H}px;transform:${node.style.transform||'none'};transform-origin:${pad+(parseFloat(style.transformOrigin.split(' ')[0])||0)}px ${pad+(parseFloat(style.transformOrigin.split(' ')[1])||0)}px`;
  layer.style.maskImage=image(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="0" y="0" width="${W}" height="${H}" fill="white"/><path d="${rounded(w,h,r)}" transform="translate(${pad} ${pad})" fill="black"/></svg>`);layer.style.maskMode='luminance';
  let body=layer.firstElementChild;if(!body){body=document.createElement('span');layer.append(body);}body.style.cssText=`position:absolute;display:block;left:${pad+x-spread}px;top:${pad+y-spread}px;width:${Math.max(0,w+spread*2)}px;height:${Math.max(0,h+spread*2)}px;background:${paintAlpha(shadow.color,shadow.opacity??100)};border-radius:${r.map(n=>Math.max(0,n+spread)+'px').join(' ')};filter:blur(${blur}px)`;
 }));
}
export function disposePaints(root){for(const node of [root,...root.querySelectorAll('*')]){for(const entry of decorations.get(node)?.values()||[]){entry.observer.disconnect();entry.layer.remove();}decorations.delete(node);}}
export function paintOutline(node,value,width=3,offset=3){
 const gradient=isGradient(value)&&node.matches(':focus-visible');node.style.outlineColor=gradient?'transparent':paintFallback(value);
 if(gradient)node.dataset.kkGradientOutline='';else delete node.dataset.kkGradientOutline;
 paintDecoration(node,'focus',gradient?(layer,w,h,style)=>{const pad=offset+width,r=radii(style,w,h).map(n=>n+pad);layer.style.cssText=decorationBase+`;left:${node.offsetLeft-pad}px;top:${node.offsetTop-pad}px;width:${w+pad*2}px;height:${h+pad*2}px;background:${value}`;layer.style.maskImage=image(`<svg xmlns="http://www.w3.org/2000/svg" width="${w+pad*2}" height="${h+pad*2}"><path fill="white" d="${rounded(w+pad*2,h+pad*2,r)}"/><path fill="black" d="${rounded(w+pad*2,h+pad*2,r,width)}"/></svg>`);layer.style.maskMode='luminance';}:null);
}
export function bindPaintStates(node,paint){for(const event of ['pointerenter','pointerleave','focusin','focusout'])node.addEventListener(event,paint);return ()=>{for(const event of ['pointerenter','pointerleave','focusin','focusout'])node.removeEventListener(event,paint);disposePaints(node);};}

/** Rich marks have independent foreground, highlight and underline image layers. */
export function paintInline(node,values){
 const layers=[],clips=[],sizes=[],positions=[];
 for(const key of ['color','highlight','lineColor']){
  const value=values[key];if(value===undefined)continue;if(!isGradient(value)&&!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value))continue;
  node.dataset['richPaint'+key[0].toUpperCase()+key.slice(1)]=value;
  if(key==='color'){node.style.color=paintFallback(value);node.style.webkitTextFillColor=isGradient(value)?'transparent':'currentColor';if(isGradient(value))node.dataset.kkForegroundGradient='';else delete node.dataset.kkForegroundGradient;if(!isGradient(value))continue;}
  if(key==='lineColor'&&!isGradient(value)){node.style.textDecorationColor=value;continue;}
  if(key==='lineColor')node.style.textDecorationColor='transparent';
  layers.push(isGradient(value)?value:`linear-gradient(${value},${value})`);clips.push(key==='color'?'text':'border-box');sizes.push(key==='lineColor'?`100% ${values.lineWidth??1}px`:'100% 100%');positions.push(key==='lineColor'?'left bottom':'left top');
 }
 if(layers.length){node.style.backgroundImage=layers.join(',');node.style.backgroundClip=clips.join(',');node.style.webkitBackgroundClip=clips.join(',');node.style.backgroundSize=sizes.join(',');node.style.backgroundPosition=positions.join(',');node.style.backgroundRepeat='no-repeat';node.style.boxDecorationBreak='clone';}
}

// Glyph effects use the browser's actual text/layout as the alpha mask, so rich
// runs, fonts and wrapping do not need a second text-measurement implementation.
function gradientBitmap(value,w,h){
 const p=parsePaint(value),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(w));canvas.height=Math.max(1,Math.ceil(h));const ctx=canvas.getContext('2d');let g;
 if(p.type==='linear'){const a=(p.angle||0)*Math.PI/180,dx=Math.sin(a),dy=-Math.cos(a),length=Math.abs(w*dx)+Math.abs(h*dy);g=ctx.createLinearGradient(w/2-dx*length/2,h/2-dy*length/2,w/2+dx*length/2,h/2+dy*length/2);}
 else if(p.type==='conic')g=ctx.createConicGradient((p.angle||0)*Math.PI/180-Math.PI/2,(p.x??50)*w/100,(p.y??50)*h/100);
 else{const x=(p.x??50)*(p.xUnit==='px'?1:w/100),y=(p.y??50)*(p.yUnit==='px'?1:h/100),near=(p.radialSize||'farthest-corner').startsWith('closest'),side=(p.radialSize||'farthest-corner').endsWith('side');let rx,ry;if(p.radialSize==='custom'){rx=(p.radiusX??100)*(p.radialShape==='circle'||p.radiusUnit==='px'?1:w/100);ry=p.radialShape==='circle'?rx:(p.radiusY??100)*(p.radiusUnit==='px'?1:h/100);}else{const pick=near?Math.min:Math.max;rx=pick(Math.abs(x),Math.abs(w-x));ry=pick(Math.abs(y),Math.abs(h-y));if(p.radialShape==='ellipse'){if(!side){rx*=Math.SQRT2;ry*=Math.SQRT2;}}else{rx=ry=side?pick(rx,ry):pick(...[Math.hypot(x,y),Math.hypot(w-x,y),Math.hypot(x,h-y),Math.hypot(w-x,h-y)]);}}ctx.translate(x,y);ctx.scale(Math.max(.001,rx),Math.max(.001,ry));g=ctx.createRadialGradient(0,0,0,0,0,1);ctx.resetTransform();for(const s of [...p.stops].sort((a,b)=>a.position-b.position))g.addColorStop(s.position/100,s.color);ctx.translate(x,y);ctx.scale(Math.max(.001,rx),Math.max(.001,ry));ctx.fillStyle=g;ctx.fillRect(-x/Math.max(.001,rx),-y/Math.max(.001,ry),w/Math.max(.001,rx),h/Math.max(.001,ry));return canvas.toDataURL();}
 for(const s of [...p.stops].sort((a,b)=>a.position-b.position))g.addColorStop(s.position/100,s.color);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);return canvas.toDataURL();
}
export function paintGlyphEffects(node,{stroke,textShadows=[]},scale=1){
 const effects=[...(stroke?.width&&isGradient(stroke.color)?[{...stroke,key:'stroke',blur:0,x:0,y:0}]:[]),...textShadows.filter(s=>isGradient(s.color)).map((s,i)=>({...s,key:'text-shadow'+i}))];
 for(const key of decorations.get(node)?.keys()||[])if(key==='stroke'||key.startsWith('text-shadow'))paintDecoration(node,key,null);
 for(const effect of effects)paintDecoration(node,effect.key,(layer,w,h,style)=>{
  node.style.position='relative';node.style.zIndex='1';const clone=node.cloneNode(true),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),filter=document.createElementNS(ns,'filter'),id='kk-glyph-'+crypto.randomUUID(),bitmap=gradientBitmap(paintAlpha(effect.color,effect.opacity??100),w,h);
  clone.removeAttribute('id');clone.removeAttribute('contenteditable');clone.setAttribute('aria-hidden','true');clone.inert=true;clone.style.cssText=Array.from(style).map(key=>`${key}:${style.getPropertyValue(key)}`).join(';');clone.style.position='absolute';clone.style.inset='auto';clone.style.left=((effect.x||0)*scale)+'px';clone.style.top=((effect.y||0)*scale)+'px';clone.style.width=w+'px';clone.style.height=h+'px';clone.style.margin='0';clone.style.transform='none';clone.style.textShadow='none';clone.style.background='none';clone.style.webkitTextStroke=effect.key==='stroke'?`${effect.width*scale}px white`:'0';
  for(const child of [clone,...clone.querySelectorAll('*')]){child.style?.setProperty('color','white','important');child.style?.setProperty('-webkit-text-fill-color','white','important');child.style?.setProperty('background','none','important');child.style?.setProperty('-webkit-text-stroke-color','white','important');}
  svg.style.cssText='position:absolute;width:0;height:0;overflow:hidden';svg.setAttribute('aria-hidden','true');filter.id=id;filter.setAttribute('x','0');filter.setAttribute('y','0');filter.setAttribute('width','100%');filter.setAttribute('height','100%');filter.setAttribute('color-interpolation-filters','sRGB');
  const im=document.createElementNS(ns,'feImage');im.setAttribute('href',bitmap);im.setAttribute('width','100%');im.setAttribute('height','100%');im.setAttribute('preserveAspectRatio','none');im.setAttribute('result','paint');const composite=document.createElementNS(ns,'feComposite');composite.setAttribute('in','paint');composite.setAttribute('in2','SourceAlpha');composite.setAttribute('operator','in');filter.append(im,composite);svg.append(filter);clone.style.filter=`url(#${id}) blur(${(effect.blur||0)*scale/2}px)`;
  layer.replaceChildren(svg,clone);layer.style.cssText=decorationBase+`;left:${node.offsetLeft}px;top:${node.offsetTop}px;width:${w}px;height:${h}px;z-index:0;overflow:visible;transform:${node.style.transform||'none'};transform-origin:${style.transformOrigin}`;
 });
}
