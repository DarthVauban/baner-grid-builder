import {boxFor} from './responsive.mjs';
import {productValues,productPrice,productUrl} from './product.mjs';
import {paintAccessibilityCss,paintForeground,paintBorder,paintShadows,bindPaintStates,disposePaints} from './paint-runtime.mjs';
import {paintFallback} from './paint.mjs';
import {ensureTextFont,runtimeFontFamily} from './text-fonts.mjs';

export const productCss=paintAccessibilityCss+`
.kk-product,.kk-product *{box-sizing:border-box}.kk-product{display:grid;align-items:center;min-width:0;white-space:normal;position:relative;line-height:1.3}.kk-product-photo{display:flex;align-items:center;justify-content:center;min-width:0;overflow:hidden;position:relative}.kk-product-photo img{display:block;width:100%;height:100%;min-width:0}.kk-product-photo svg{width:36px;height:36px;opacity:.4}.kk-product-body,.kk-product-action{display:flex;flex-direction:column;min-width:0}.kk-product-name,.kk-product-article,.kk-product-availability,.kk-product-price{display:block;overflow-wrap:anywhere;white-space:pre-wrap;margin:0}.kk-product-availability{display:flex;align-items:center;gap:6px}.kk-product-dot{width:7px;height:7px;flex:none;border-radius:50%;background:currentColor}.kk-product-button{display:flex;align-items:center;justify-content:center;gap:10px;min-width:0;max-width:100%;width:100%;text-decoration:none;overflow-wrap:anywhere;white-space:normal;cursor:pointer;text-align:center;line-height:1.35;border:0;background:var(--kproduct-button-bg);color:var(--kproduct-button-color);transition:background-color .14s,color .14s}.kk-product-button span{min-width:0}.kk-product-button svg{width:18px;height:18px;flex:none}.kk-product-button:is(:hover,:focus-visible){background:var(--kproduct-button-hover-bg);color:var(--kproduct-button-hover-color)}.kk-product-button:focus-visible{outline:3px solid var(--kproduct-focus);outline-offset:3px}.kk-product [hidden]{display:none!important}.kk-product-empty{color:#6D6962;font:14px/1.4 Arial,sans-serif}.kk-product[data-inert] .kk-product-button{cursor:default}@media(prefers-reduced-motion:reduce){.kk-product-button{transition:none}}@media(forced-colors:active){.kk-product,.kk-product-button{border:1px solid CanvasText!important}.kk-product-button:focus-visible{outline-color:Highlight}}
`;
const node=(tag,name)=>{const n=document.createElement(tag);n.className=name;return n;};
function icon(path){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [key,value]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.7,'aria-hidden':'true'}))svg.setAttribute(key,String(value));const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',path);svg.append(p);return svg;}
const measurements=new Map();
const clearMeasurements=()=>measurements.clear();
globalThis.addEventListener?.('kramkin:text-font-ready',clearMeasurements);
globalThis.document?.fonts?.addEventListener('loadingdone',clearMeasurements);

export function mountProductContent(target,initial,options={}){
 let element=initial,product=options.product||null,device=options.device||'desktop',imageUrl='',dead=false;
 const photo=node('div','kk-product-photo'),body=node('div','kk-product-body'),name=node('div','kk-product-name'),article=node('div','kk-product-article'),availability=node('div','kk-product-availability'),dot=node('span','kk-product-dot'),status=node('span',''),action=node('div','kk-product-action'),price=node('div','kk-product-price'),button=node(options.mode==='editor'||options.measurement?'span':'a','kk-product-button'),caption=node('span','');
 button.append(caption,icon('M4 12h15m-6-6 6 6-6 6'));availability.append(dot,status);body.append(name,article,availability);action.append(price,button);target.classList.add('kk-product');target.replaceChildren(photo,body,action);
 function effects(){const v=productValues(element.content,device),hover=button.matches(':hover,:focus-visible');paintForeground(caption,hover?v.buttonHoverColor:v.buttonColor);paintForeground(button.querySelector('svg'),hover?v.buttonHoverColor:v.buttonColor);}
 const stopPaint=bindPaintStates(button,effects);
 function photoFallback(){const svg=icon('M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M8 8h.01'),scale=(boxFor(element,device)).scale||1;Object.assign(svg.style,{width:`${36*scale}px`,height:`${36*scale}px`});photo.replaceChildren(svg);photo.setAttribute('role','img');photo.setAttribute('aria-label','Фото відсутнє');}
 function draw(){
  if(dead)return;const box=boxFor(element,device),s=box.scale||1,v=productValues(element.content,device),width=box.width,stack=v.layout==='vertical'||width/s<420&&!(device!=='desktop'&&element.content.product?.[device+'Preset']),split=v.layout==='contrast';
  for(const key of ['nameFont','metaFont','priceFont','buttonFont'])ensureTextFont(v[key],false,options.apiBase);
  target.dataset.productPreset=element.content.product?.[device+'Preset']||element.content.product?.preset||'horizontal';target.dataset.productId=element.content.productId||'';target.toggleAttribute('data-inert',options.mode==='editor');
  Object.assign(target.style,{width:`${width}px`,height:'auto',minHeight:'0',transform:'none',padding:`${v.paddingY*s}px ${v.paddingX*s}px`,gap:`${v.gap*s}px`,background:v.background,border:`${v.borderWidth*s}px solid ${paintFallback(v.borderColor)}`,borderRadius:`${v.radius*s}px`,opacity:String(v.opacity/100),overflow:'visible',textAlign:'left',gridTemplateColumns:stack?'minmax(0,1fr)':v.showImage?`minmax(0,${v.imageWidth}fr) minmax(0,${100-v.imageWidth}fr)`:'minmax(0,1fr)'});
  if(!stack&&!split&&v.showImage)target.style.gridTemplateColumns=`minmax(0,${v.imageWidth}fr) minmax(0,${Math.max(1,70-v.imageWidth)}fr) minmax(0,30fr)`;
  if(!stack&&!split&&!v.showImage)target.style.gridTemplateColumns='minmax(0,2fr) minmax(0,1fr)';
  photo.hidden=!v.showImage;Object.assign(photo.style,{width:'100%',height:`${v.imageHeight*s}px`,background:v.imageBackground,borderRadius:`${v.imageRadius*s}px`});
  const nextUrl=options.measurement?'':productUrl(product?.photoUrl)||'';
  if(nextUrl!==imageUrl||!photo.childNodes.length){imageUrl=nextUrl;photo.replaceChildren();photo.removeAttribute('role');photo.removeAttribute('aria-label');if(nextUrl){const img=node('img','');img.alt='';img.referrerPolicy='no-referrer';img.src=nextUrl;img.addEventListener('error',()=>{if(dead||imageUrl!==nextUrl)return;photoFallback();});photo.append(img);}else{photo.append(icon('M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M8 8h.01'));photo.setAttribute('role','img');photo.setAttribute('aria-label','Фото відсутнє');}}
  const image=photo.querySelector('img');if(image)image.style.objectFit=v.imageFit;
  const photoIcon=photo.querySelector('svg'),arrow=button.querySelector('svg');if(photoIcon)Object.assign(photoIcon.style,{width:`${36*s}px`,height:`${36*s}px`});Object.assign(arrow.style,{width:`${18*s}px`,height:`${18*s}px`});Object.assign(dot.style,{width:`${7*s}px`,height:`${7*s}px`});availability.style.gap=`${6*s}px`;button.style.gap=`${10*s}px`;
  body.style.gap=action.style.gap=`${v.textGap*s}px`;body.style.gridColumn=action.style.gridColumn='';
  const actionParent=split||stack?body:target;if(action.parentElement!==actionParent)actionParent.append(action);action.style.marginTop=split||stack?`${v.textGap*s}px`:'0';
  name.textContent=product?.name||'Оберіть товар із каталогу';article.textContent=product?`Артикул: ${product.article}`:'';article.hidden=!v.showArticle||!product;
  status.textContent=product?.availabilityLabel||'Наявність невідома';availability.hidden=!v.showAvailability||!product;
  const availabilityColor=product?.availability==='available'?v.availableColor:product?.availability==='unavailable'?v.unavailableColor:v.unknownColor;
  const typography=(target,font,size,weight,color)=>{Object.assign(target.style,{fontFamily:`"${runtimeFontFamily(font)}",Arial,sans-serif`,fontSize:`${size*s}px`,fontWeight:String(weight),color:paintFallback(color)});paintForeground(target,color);};
  typography(name,v.nameFont,v.nameSize,v.nameWeight,v.nameColor);name.style.lineHeight=String(v.nameLineHeight);typography(article,v.metaFont,v.metaSize,400,v.metaColor);typography(availability,v.metaFont,v.metaSize,400,availabilityColor);
  price.textContent=product?productPrice(product.price)+(element.content.product?.currencyLabel?` ${element.content.product.currencyLabel}`:''):'';price.hidden=!v.showPrice||!product;typography(price,v.priceFont,v.priceSize,v.priceWeight,v.priceColor);
  const url=productUrl(product?.productUrl);button.hidden=!v.showButton||!product;caption.textContent=element.content.product?.buttonText??'Переглянути товар';
  Object.assign(button.style,{padding:`${v.buttonPaddingY*s}px ${v.buttonPaddingX*s}px`,borderRadius:`${v.buttonRadius*s}px`,fontFamily:`"${runtimeFontFamily(v.buttonFont)}",Arial,sans-serif`,fontSize:`${v.buttonSize*s}px`,fontWeight:String(v.buttonWeight)});
  for(const [key,value]of Object.entries({'button-bg':v.buttonBackground,'button-color':paintFallback(v.buttonColor),'button-hover-bg':v.buttonHoverBackground,'button-hover-color':paintFallback(v.buttonHoverColor),'focus':paintFallback(v.buttonFocusColor)}))target.style.setProperty('--kproduct-'+key,value);
  if(button.tagName==='A'){if(url){button.href=url;button.removeAttribute('aria-disabled');button.tabIndex=0;}else{button.removeAttribute('href');button.setAttribute('aria-disabled','true');button.tabIndex=-1;}button.target=element.content.product?.target==='new_tab'?'_blank':'_self';button.rel=button.target==='_blank'?'noopener noreferrer':'';button.setAttribute('aria-label',`${caption.textContent}: ${product?.name||'Товар'}`);}
  action.hidden=price.hidden&&button.hidden;paintBorder(target,v.borderColor);paintShadows(target,v.shadowBlur?[{color:v.shadowColor,x:0,y:v.shadowY,blur:v.shadowBlur,spread:0}]:[],s);effects();
 }
 button.addEventListener('click',event=>{if(options.mode==='preview'||!productUrl(product?.productUrl)){event.preventDefault();options.onNotice?.(options.mode==='preview'?'У прев’ю перехід до товару вимкнено':'У товару немає посилання');}});
 draw();if(!options.measurement)globalThis.addEventListener?.('kramkin:text-font-ready',draw);
 return {layout(nextDevice){device=nextDevice;draw();},update(next,nextProduct=product){element=next;product=nextProduct;draw();},updateProduct(next){if(JSON.stringify(product)===JSON.stringify(next))return;product=next;draw();},destroy(){dead=true;stopPaint();disposePaints(target);if(!options.measurement)globalThis.removeEventListener?.('kramkin:text-font-ready',draw);}};
}
export function measureProductContent(element,device='desktop',product=null){
 const box=boxFor(element,device),s=box.scale||1,minWidth=Math.ceil(160*s),width=Math.max(box.width,minWidth),key=JSON.stringify([width,s,device,element.content,product]);
 const cached=measurements.get(key);if(cached)return cached;
 const host=document.createElement('div');host.style.cssText='all:initial!important;position:fixed!important;left:-100000px!important;top:0!important;visibility:hidden!important;pointer-events:none!important';document.documentElement.append(host);
 const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style'),target=document.createElement('div');style.textContent=productCss;shadow.append(style,target);const measured={...element,desktop:{...box,width},mobile:null,[device]:{...box,width}};
 const mounted=mountProductContent(target,measured,{device,product,mode:'editor',measurement:true}),height=Math.ceil(target.getBoundingClientRect().height);mounted.destroy();host.remove();
 const result=Object.freeze({width,height,minWidth});if(measurements.size>=200)measurements.delete(measurements.keys().next().value);measurements.set(key,result);return result;
}
