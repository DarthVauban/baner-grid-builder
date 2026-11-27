import {styleLayer,responsiveValues} from './responsive.mjs';
import {isGradient,isPaint} from './paint.mjs';
export const SHAPE_KINDS=[['rectangle','Прямокутник'],['circle','Коло'],['line','Лінія']];
export const SHAPE_GROUPS=['Фігура','Заливка','Фонове зображення','Контур','Тіні','Посилання'];
export const SHAPE_IMAGE_POSITIONS=[['0 0','Ліворуч угорі'],['50 0','По центру вгорі'],['100 0','Праворуч угорі'],['0 50','Ліворуч по центру'],['50 50','По центру'],['100 50','Праворуч по центру'],['0 100','Ліворуч унизу'],['50 100','По центру внизу'],['100 100','Праворуч унизу']];
const HEX=/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i,ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const keys=(value,allowed)=>Object.keys(value).every(key=>allowed.includes(key));
const number=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const fail=message=>{throw new Error(message||'Некоректні налаштування фігури');};
const corners=value=>({topLeft:value,topRight:value,bottomRight:value,bottomLeft:value});
export const SHAPE_IMAGE_DEFAULTS={resourceId:null,alt:'',zoom:false,lazy:'on'};
export const SHAPE_POSITION_DEFAULTS={fit:'cover',x:50,y:50,xUnit:'%',yUnit:'%',width:100,height:0,widthUnit:'%',heightUnit:'%',attachment:'scroll'};
export const SHAPE_BORDER_DEFAULTS={color:'#25231F',style:'solid',widths:{top:0,right:0,bottom:0,left:0}};
export function shapeData(content){return {version:1,kind:'rectangle',base:{},...content.shape};}
export function shapeImage(content){return {...SHAPE_IMAGE_DEFAULTS,...content.shape?.image};}
export function shapeLink(content){return {nofollow:false,track:false,eventName:'shape_click',...content.shape?.link};}
export function shapeValues(content,device='desktop',fallback={}){
 const shape=shapeData(content),values={opacity:100,rotation:0,flipX:false,flipY:false,fill:[{type:'solid',color:fallback.background||'#EADDBC'}],corners:corners(fallback.radius??16),border:structuredClone(SHAPE_BORDER_DEFAULTS),shadows:[],hoverDuration:.2,imagePosition:{...SHAPE_POSITION_DEFAULTS},...responsiveValues(shape,device)};
 return values;
}
export function shapeGroups(content,device='desktop'){return SHAPE_GROUPS.filter(name=>(name!=='Фонове зображення'||shapeData(content).kind!=='line'&&(device==='desktop'||shapeImage(content).resourceId))&&(name!=='Посилання'||device==='desktop'));}
export function shapeMediaIds(content){const id=content.shape?.image?.resourceId;return id?[id]:[];}
export function validateShapeContent(content){
 if(!object(content)||!keys(content,['accessibleName','shape'])||(typeof content.accessibleName!=='string'||content.accessibleName.length>300))fail('Некоректна назва фігури');
 if(content.shape===undefined)return;
 const shape=content.shape;
 if(!object(shape)||!keys(shape,['version','kind','image','link','base','mobile','laptop','tablet','mobileLandscape'])||shape.version!==1||!SHAPE_KINDS.some(([key])=>key===shape.kind))fail();
 if(shape.image!==undefined){const value=shape.image;if(!object(value)||!keys(value,['resourceId','alt','zoom','lazy'])||value.resourceId!==undefined&&value.resourceId!==null&&!ID.test(value.resourceId)||value.alt!==undefined&&!text(value.alt,300)||value.zoom!==undefined&&typeof value.zoom!=='boolean'||value.lazy!==undefined&&!['on','no-thumbnail','off'].includes(value.lazy))fail('Некоректне фонове зображення');}
 if(shape.link!==undefined){const value=shape.link;if(!object(value)||!keys(value,['nofollow','track','eventName'])||['nofollow','track'].some(key=>value[key]!==undefined&&typeof value[key]!=='boolean')||value.eventName!==undefined&&(typeof value.eventName!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value.eventName)))fail('Некоректні параметри посилання');}
 for(const layer of ['base','mobile','laptop','tablet','mobileLandscape']){
  const value=shape[layer];if(value===undefined)continue;
  if(!object(value)||!keys(value,['opacity','rotation','flipX','flipY','fill','corners','border','shadows','hoverShadows','hoverDuration','imagePosition']))fail('Невідомий параметр оформлення фігури');
  for(const [key,min,max]of [['opacity',0,100],['rotation',-360,360],['hoverDuration',0,10]])if(value[key]!==undefined&&!number(value[key],min,max))fail();
  for(const key of ['flipX','flipY'])if(value[key]!==undefined&&typeof value[key]!=='boolean')fail();
  if(value.corners!==undefined&&(!object(value.corners)||!keys(value.corners,Object.keys(corners(0)))||!Object.keys(corners(0)).every(key=>number(value.corners[key],0,999))))fail('Некоректні кути фігури');
  if(value.fill!==undefined)validateShapeFill(value.fill);
  if(value.border!==undefined){const border=value.border;if(!object(border)||!keys(border,['color','style','widths'])||!isPaint(border.color)||!['solid','dotted','dashed','none'].includes(border.style)||!object(border.widths)||!keys(border.widths,['top','right','bottom','left'])||!['top','right','bottom','left'].every(key=>number(border.widths[key],0,100)))fail('Некоректний контур фігури');}
  for(const key of ['shadows','hoverShadows'])if(value[key]!==undefined){if(!Array.isArray(value[key])||value[key].length>8)fail('До 8 шарів тіні');for(const item of value[key])if(!object(item)||!keys(item,['color','opacity','x','y','blur','spread'])||!isPaint(item.color)||!number(item.opacity,0,100)||!number(item.x,-300,300)||!number(item.y,-300,300)||!number(item.blur,0,300)||!number(item.spread,-200,200))fail('Некоректний шар тіні');}
  if(value.imagePosition!==undefined)validateShapePosition(value.imagePosition);
 }
}
export function validateShapeFill(fill){
 if(!Array.isArray(fill)||fill.length>8)fail('До 8 шарів заливки');
 for(const item of fill){
  if(!object(item)||!keys(item,['type','color','stops','angle','x','y','xUnit','yUnit','radialShape','radialSize','radiusX','radiusY','radiusUnit'])||!['solid','linear','radial','conic'].includes(item.type))fail('Некоректний шар заливки');
  if(item.color!==undefined&&!HEX.test(item.color)||item.type==='solid'&&!HEX.test(item.color))fail('Некоректний колір заливки');
  if(item.stops!==undefined||item.type!=='solid'){if(!Array.isArray(item.stops)||item.stops.length<2||item.stops.length>12)fail('Градієнт має від 2 до 12 кольорів');for(const stop of item.stops)if(!object(stop)||!keys(stop,['color','position'])||!HEX.test(stop.color)||!number(stop.position,0,100))fail('Некоректний колір градієнта');}
  for(const [key,min,max]of [['angle',-360,360],['x',-3000,3000],['y',-3000,3000],['radiusX',0,10000],['radiusY',0,10000]])if(item[key]!==undefined&&!number(item[key],min,max))fail();
  for(const key of ['xUnit','yUnit','radiusUnit'])if(item[key]!==undefined&&!['%','px'].includes(item[key]))fail();
  if(item.radialShape!==undefined&&!['circle','ellipse'].includes(item.radialShape)||item.radialSize!==undefined&&!['closest-side','closest-corner','farthest-side','farthest-corner','custom'].includes(item.radialSize))fail();
 }
}
export function validateShapePosition(value){
 if(!object(value)||!keys(value,Object.keys(SHAPE_POSITION_DEFAULTS))||!['cover','contain','custom'].includes(value.fit)||!number(value.x,-3000,3000)||!number(value.y,-3000,3000)||!number(value.width,0,10000)||!number(value.height,0,10000)||!['xUnit','yUnit','widthUnit','heightUnit'].every(key=>['%','px'].includes(value[key]))||!['scroll','fixed'].includes(value.attachment))fail('Некоректне кадрування зображення');
}
export function updateShapeStyle(content,device,patch){const next=structuredClone(content);next.shape=shapeData(next);const layer=styleLayer(device);next.shape[layer]||={};for(const [key,value]of Object.entries(patch)){if(value===undefined)delete next.shape[layer][key];else next.shape[layer][key]=value;}validateShapeContent(next);return next;}
export function updateShapeGlobal(content,patch){const next=structuredClone(content);next.shape={...shapeData(next),...patch};validateShapeContent(next);return next;}
export function shapeFillCss(fill,scale=1){return fill.map(layer=>{
 if(layer.type==='solid')return isGradient(layer.color)?layer.color:`linear-gradient(${layer.color},${layer.color})`;
 const stops=[...layer.stops].sort((a,b)=>a.position-b.position).map(stop=>`${stop.color} ${stop.position}%`).join(',');
 const unit=(value=50,type='%')=>`${value*(type==='px'?scale:1)}${type}`;
 const center=`${unit(layer.x,layer.xUnit)} ${unit(layer.y,layer.yUnit)}`;
 if(layer.type==='linear')return `linear-gradient(${layer.angle||0}deg,${stops})`;
 if(layer.type==='conic')return `conic-gradient(from ${layer.angle||0}deg at ${center},${stops})`;
 const kind=layer.radialShape||'circle',size=layer.radialSize||'farthest-corner';
 const radius=size==='custom'?kind==='circle'?`${(layer.radiusX??100)*scale}px`:`${unit(layer.radiusX??100,layer.radiusUnit)} ${unit(layer.radiusY??100,layer.radiusUnit)}`:size;
 return `radial-gradient(${kind} ${radius} at ${center},${stops})`;
}).join(',')||'none';}
export function shapeShadowCss(shadows,scale=1){return shadows.filter(shadow=>!isGradient(shadow.color)).map(shadow=>{const alpha=shadow.opacity/100*(shadow.color.length===9?parseInt(shadow.color.slice(7,9),16)/255:1),rgb=[1,3,5].map(at=>parseInt(shadow.color.slice(at,at+2),16));return `${shadow.x*scale}px ${shadow.y*scale}px ${shadow.blur*scale}px ${shadow.spread*scale}px rgba(${rgb.join(',')},${alpha})`;}).join(',')||'none';}
export function shapeImageCss(position,scale=1){const value=(n,unit)=>`${n*(unit==='px'?scale:1)}${unit}`;return {backgroundPosition:`${value(position.x,position.xUnit)} ${value(position.y,position.yUnit)}`,backgroundSize:position.fit==='custom'?`${position.width?value(position.width,position.widthUnit):'auto'} ${position.height?value(position.height,position.heightUnit):'auto'}`:position.fit,backgroundAttachment:position.attachment};}
export function safeShapeUrl(value){
 if(typeof value!=='string'||!value||value.length>2048||value!==value.trim()||/[\s\u0000-\u001f\u007f\\]/.test(value))return false;
 if(value.startsWith('#'))return value.length>1;
 if(/^\/(?!\/)|^\.\.?\//.test(value)){try{return new URL(value,'https://kramkin.invalid').origin==='https://kramkin.invalid';}catch{return false;}}
 if(/^mailto:/i.test(value))return /^mailto:[^@?]+@[^@?]+(?:\?[^\u0000-\u001f]*)?$/i.test(value);
 if(/^tel:/i.test(value))return /^tel:\+?[0-9().-]{3,40}$/i.test(value);
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}
}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const round=n=>Math.round(n*10000)/10000;
export function rotatedShapeBounds(box,rotation=0){const angle=rotation*Math.PI/180,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle)),width=box.width*c+box.height*s,height=box.width*s+box.height*c;return {x:box.x+(box.width-width)/2,y:box.y+(box.height-height)/2,width,height};}
/** Resize in the rotated local axes while keeping the opposite world-space corner fixed. */
export function resizeShapeBox(box,handle,dx,dy,rotation=0,proportional=false){
 const angle=rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),localX=c*dx+s*dy,localY=-s*dx+c*dy;
 const horizontal=handle.includes('e')?1:handle.includes('w')?-1:0,vertical=handle.includes('s')?1:handle.includes('n')?-1:0;
 let width=clamp(box.width+horizontal*localX,1,3000),height=clamp(box.height+vertical*localY,1,3000);
 if(proportional&&horizontal&&vertical){const factor=clamp(1+(horizontal*localX*box.width+vertical*localY*box.height)/(box.width**2+box.height**2),Math.max(1/box.width,1/box.height),Math.min(3000/box.width,3000/box.height));width=box.width*factor;height=box.height*factor;}
 const ax=-horizontal/2,ay=-vertical/2,anchorX=box.x+box.width/2+c*ax*box.width-s*ay*box.height,anchorY=box.y+box.height/2+s*ax*box.width+c*ay*box.height;
 const centerX=anchorX-c*ax*width+s*ay*height,centerY=anchorY-s*ax*width-c*ay*height;
 return {...box,x:round(clamp(centerX-width/2,-1000,3000)),y:round(clamp(centerY-height/2,-1000,3000)),width:round(width),height:round(height)};
}
