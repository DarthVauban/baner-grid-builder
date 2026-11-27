import {boxFor} from './responsive.mjs';
import {imageBox,imageDimensions,imageFit,imageSource} from './images.mjs';

/** One image body, inside the existing action wrapper; no background surface. */
export function mountImageContent(target,element,options={}){
 const body=document.createElement('div'),img=document.createElement('img'),fallback=document.createElement('span');
 body.className='kk-image-body';body.style.cssText='width:100%;height:100%;overflow:hidden;border-radius:inherit;background:transparent';
 img.alt=element.content.alt;img.referrerPolicy='no-referrer';img.style.cssText='display:block;width:100%;height:100%;border-radius:inherit';
 fallback.className='kk-image-fallback';fallback.setAttribute('role','img');fallback.setAttribute('aria-label','Фото недоступне');fallback.style.cssText='display:none;place-items:center;width:100%;height:100%;color:#6d6962;font:14px Arial';
 target.replaceChildren(body);let device=options.device||'desktop',product=options.product||null,source=undefined,size=null,failed=false,ready=false,destroyed=false;
 function layout(next=device){
  device=next;const box=boxFor(element,device),scale=box.scale||1;
  let fitted=box,incompatible=false;
  if(imageFit(element,device)==='contain'&&size){try{fitted=imageBox(box,size);}catch{incompatible=true;}}
  Object.assign(target.style,{width:`${fitted.width/scale}px`,height:`${fitted.height/scale}px`,background:'transparent',overflow:'hidden'});
  img.style.objectFit=imageFit(element,device);body.style.borderRadius='inherit';
  if(source){img.style.display=!ready||failed||incompatible?'none':'block';fallback.textContent=failed||incompatible?'Фото недоступне':'';fallback.style.display=failed||incompatible?'grid':'none';body.setAttribute('aria-busy',String(!ready&&!failed));}
 }
 function updateSource(){
  const next=imageSource(element,product);if(next===source)return;
  const retained=ready&&img.parentNode===body;source=next;size=imageDimensions(element,product);failed=false;ready=retained;delete target.dataset.imageError;
  delete body.dataset.editorPlaceholder;
  if(source){if(img.parentNode!==body)body.replaceChildren(img,fallback);img.src=element.content.resourceId?`${options.apiBase||''}/api/public/popup-banners/zero-block/media/${encodeURIComponent(element.content.resourceId)}`:source;}
  else{ready=false;img.removeAttribute('src');body.replaceChildren();if(options.mode==='editor'||options.mode==='preview')options.renderPlaceholder?.(body,'image');}
  layout();
 }
 function loaded(){if(destroyed||!source)return;size={width:img.naturalWidth,height:img.naturalHeight};failed=false;ready=true;delete target.dataset.imageError;layout();if(!failed)options.onImageSize?.(element.id,source,size.width,size.height);}
 function error(){if(destroyed||!source)return;failed=true;target.dataset.imageError='true';layout();}
 img.addEventListener('load',loaded);img.addEventListener('error',error);
 updateSource();layout();
 return {layout,update(next,nextProduct=product){element=next;product=nextProduct;img.alt=element.content.alt;updateSource();layout();},updateProduct(next){product=next;updateSource();layout();},destroy(){destroyed=true;img.removeEventListener('load',loaded);img.removeEventListener('error',error);}};
}
