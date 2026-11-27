/** Viewport coordinates are CSS pixels, independent of the editor camera. */
export const PLACEMENT_ANCHORS = [
  {value:'top-left',label:'Ліворуч угорі',x:0,y:0}, {value:'top-center',label:'Угорі по центру',x:.5,y:0}, {value:'top-right',label:'Праворуч угорі',x:1,y:0},
  {value:'center-left',label:'Ліворуч по центру',x:0,y:.5}, {value:'center',label:'По центру',x:.5,y:.5}, {value:'center-right',label:'Праворуч по центру',x:1,y:.5},
  {value:'bottom-left',label:'Ліворуч унизу',x:0,y:1}, {value:'bottom-center',label:'Унизу по центру',x:.5,y:1}, {value:'bottom-right',label:'Праворуч унизу',x:1,y:1},
];
/** @returns {import('./placement-types').PopupPlacement} */
export function defaultPlacement(){return {overlay:true,anchor:'center',offsetX:0,offsetY:0};}
export function validatePlacement(value){
  const anchor=PLACEMENT_ANCHORS.find(item=>item.value===value?.anchor);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['overlay','anchor','offsetX','offsetY'].includes(key))||typeof value.overlay!=='boolean'||!anchor||
    !['offsetX','offsetY'].every(key=>typeof value[key]==='number'&&Number.isFinite(value[key])&&Math.abs(value[key])<=3000)||anchor.x!==.5&&value.offsetX<0||anchor.y!==.5&&value.offsetY<0)throw new Error('Некоректне розміщення банера');
  return value;
}
/** @returns {import('./placement-types').PopupPlacement} */
export function placementFor(composition){return composition.placement===undefined?defaultPlacement():validatePlacement(composition.placement);}
export function presetPlacement(current,anchor){
  const point=PLACEMENT_ANCHORS.find(item=>item.value===anchor);if(!point)throw new Error('Невідома опорна точка');
  return {...current,anchor,offsetX:point.x===.5?0:24,offsetY:point.y===.5?0:24};
}
export function placementLayout(composition,width,height,placement=placementFor(composition)){
  validatePlacement(placement);
  if(![width,height,composition.width,composition.height].every(value=>Number.isFinite(value)&&value>0))throw new Error('Некоректний розмір екрана');
  const gap=Math.min(12,width/4,height/4),scale=Math.min(1,(width-2*gap)/composition.width,(height-2*gap)/composition.height);
  const w=composition.width*scale,h=composition.height*scale,anchor=PLACEMENT_ANCHORS.find(item=>item.value===placement.anchor);
  const position=(available,factor,offset)=>available*factor+(factor===1?-offset:offset);
  const clamp=(value,max)=>Math.min(Math.max(value,gap),Math.max(gap,max-gap));
  return {x:clamp(position(width-w,anchor.x,placement.offsetX),width-w),y:clamp(position(height-h,anchor.y,placement.offsetY),height-h),width:w,height:h,scale,gap};
}
/** Convert a clamped drag position back to the same anchor, never changing the document's viewport. */
export function movePlacement(composition,width,height,placement,x,y){
  const layout=placementLayout(composition,width,height,placement),point=PLACEMENT_ANCHORS.find(item=>item.value===placement.anchor);
  const offset=(position,available,factor)=>{const actual=Math.min(Math.max(position,layout.gap),Math.max(layout.gap,available-layout.gap));return Math.round(Math.max(-3000,Math.min(3000,factor===1?available-actual:actual-available*factor))*100)/100;};
  return {...placement,offsetX:offset(x,width-layout.width,point.x),offsetY:offset(y,height-layout.height,point.y)};
}
export const hasPlacement=document=>['desktop','laptop','tablet','mobileLandscape','mobile'].some(device=>document[device]?.placement!==undefined);
