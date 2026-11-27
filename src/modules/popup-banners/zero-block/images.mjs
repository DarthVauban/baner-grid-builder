import {boxFor,POPUP_DEVICES} from './responsive.mjs';
import {productImageUrl} from './product-bindings.mjs';
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const imageFit=(element,device='desktop')=>element.content[device+'Fit']||(device==='mobileLandscape'?element.content.mobileFit:undefined)||element.style.fit;
/** Image corners retain legacy uniform radii and inherit mobile per corner. */
export function imageCorners(element, device = 'desktop') {
  const radius = element.style.radius;
  const corners = { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius };
  Object.assign(corners,element.style.corners);
  for(const layer of device==='desktop'?[]:device==='mobileLandscape'?['mobile','mobileLandscape']:[device]){
    const style=element[layer+'Style'];if(!style)continue;
    if(style.radius!==undefined)for(const key of Object.keys(corners))corners[key]=style.radius;
    Object.assign(corners,style.corners);
  }
  return corners;
}
export const imageSource=(element,product)=>element.content.resourceId||productImageUrl(element.content,product)||null;
export function imageDimensions(element,product){const size=element.content.imageSize;return size&&size.source===imageSource(element,product)?size:null;}
export function imageRatio(element,device='desktop',product){const size=imageDimensions(element,product),box=boxFor(element,device);return size?size.width/size.height:box.width/box.height;}

/** A numeric width or height changes its companion dimension, preserving top-left. */
export function imageDimensionBox(box,key,value,ratio=box.width/box.height){
  return imageBox({...box,width:key==='height'?value*ratio:value},{width:ratio,height:1});
}

/** Uniform projection for all eight handles; the opposite anchor stays fixed. */
export function resizeImageBox(box,handle,dx,dy,ratio=box.width/box.height){
  if(!['n','ne','e','se','s','sw','w','nw'].includes(handle)||!Number.isFinite(dx)||!Number.isFinite(dy))return {...box};
  const start=imageBox(box,{width:ratio,height:1}),h=handle.includes('e')?1:handle.includes('w')?-1:0,v=handle.includes('s')?1:handle.includes('n')?-1:0;
  const ax=start.x+start.width*(h<0?1:h>0?0:.5),ay=start.y+start.height*(v<0?1:v>0?0:.5);
  const requested=1+(h&&v?(h*dx*start.width+v*dy*start.height)/(start.width**2+start.height**2):h?h*dx/start.width:v*dy/start.height);
  let lower=Math.max(16/start.width,16/start.height),upper=Math.min(3000/start.width,3000/start.height);
  for(const [anchor,offset]of [[ax,start.x-ax],[ay,start.y-ay]])if(offset){const a=(-1000-anchor)/offset,b=(3000-anchor)/offset;lower=Math.max(lower,Math.min(a,b));upper=Math.min(upper,Math.max(a,b));}
  const scale=Math.max(lower,Math.min(requested,upper));
  return {...start,x:ax+(start.x-ax)*scale,y:ay+(start.y-ay)*scale,width:start.width*scale,height:start.height*scale};
}

/** Correct only contain frames with metadata belonging to the current source. */
export function fitDocumentImages(document,products={}){
  for(const item of document.elements.filter(item=>item.type==='image')){
    const size=imageDimensions(item,products[document.productId]);if(!size)continue;
    for(const device of POPUP_DEVICES)if(imageFit(item,device)==='contain'){
      const prior=boxFor(item,device),next=imageBox(prior,size);
      if(Math.abs(prior.width-next.width)<1e-7&&Math.abs(prior.height-next.height)<1e-7)continue;
      item[device]=next;
    }
  }
  return document;
}

export function imageFileError(files) {
  if (files.length !== 1) return 'Перетягніть лише одне зображення.';
  const file = files[0];
  if (!IMAGE_TYPES.has(file.type)) return 'Підтримуються лише PNG, JPEG і WebP.';
  if (!file.size || file.size > 5 * 1024 * 1024) return 'Зображення має бути непорожнім файлом до 5 МіБ.';
  return null;
}

/**
 * Preserve width, adjusting only at document limits.
 * @param {{x:number,y:number,width:number,height:number,scale?:number}} box
 * @param {{width:number,height:number}} image
 * @param {{width:number,height:number}|null} composition
 */
export function imageBox(box, image, composition = null) {
  if (![image.width, image.height].every(value => Number.isFinite(value) && value > 0)) throw new Error('Не вдалося визначити розміри зображення.');
  const ratio = image.width / image.height;
  const minimum = Math.max(16, 16 * ratio);
  const maximum = Math.min(3000, 3000 * ratio, composition?.width ?? 3000, (composition?.height ?? 3000) * ratio);
  if (minimum > maximum) throw new Error('Пропорції зображення не вміщуються в допустимі розміри компонента.');
  const width = Math.max(minimum, Math.min(box.width, maximum));
  return { ...box, width, height: width / ratio };
}
