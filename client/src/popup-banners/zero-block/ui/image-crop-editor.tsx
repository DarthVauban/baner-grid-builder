'use client';
import {useLayoutEffect,useRef,useState,type Dispatch,type SetStateAction,type CSSProperties} from 'react';
import {Button,Dialog,Select,Slider} from './components';
import {ShapeNumber,ShapeUnitInput} from './shape-fill-editor';
import {shapeImageCss,SHAPE_POSITION_DEFAULTS} from '@zero/shape.mjs';
import type {ShapeImagePosition} from '@zero/shape-types';
import './shape-style-editor.css';

export function ImageCropEditor({open,onOpenChange,value,size,src,onApply}:{open:boolean;onOpenChange:(open:boolean)=>void;value:ShapeImagePosition;size:{width:number;height:number};src:string;onApply:(value:ShapeImagePosition)=>void}){
 const [draft,setDraft]=useState(value),[ready,setReady]=useState(false),[wasOpen,setWasOpen]=useState(open);
 if(wasOpen!==open){setWasOpen(open);if(open){setDraft(value);setReady(false);}}
 return <Dialog open={open} onOpenChange={onOpenChange} size="wide" title="Кадрування зображення" description="Перетягніть зображення або скористайтеся стрілками. Зміни застосуються після підтвердження." footer={<div className="ui-shape-crop-actions"><Button variant="secondary" onClick={()=>setDraft({...SHAPE_POSITION_DEFAULTS,attachment:draft.attachment} as ShapeImagePosition)}>Скинути кадрування</Button><Button variant="secondary" onClick={()=>onOpenChange(false)}>Скасувати</Button><Button disabled={!ready} onClick={()=>{onApply(draft);onOpenChange(false);}}>Застосувати</Button></div>}>{open?<CropDraft draft={draft} setDraft={setDraft} setReady={setReady} size={size} src={src}/>:null}</Dialog>;
}
function CropDraft({draft,setDraft,setReady,size,src}:{draft:ShapeImagePosition;setDraft:Dispatch<SetStateAction<ShapeImagePosition>>;setReady:(value:boolean)=>void;size:{width:number;height:number};src:string}){
 const [natural,setNatural]=useState<{width:number;height:number}|null>(null),[error,setError]=useState(false);
 const surface=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;draft:ShapeImagePosition;scale:number}|null>(null);
 const initialScale=Math.min(1,480/size.width,280/size.height),[scale,setScale]=useState(initialScale),width=size.width*initialScale;
 useLayoutEffect(()=>{if(!surface.current)return;const observer=new ResizeObserver(()=>setScale(surface.current!.getBoundingClientRect().width/size.width));observer.observe(surface.current);return()=>observer.disconnect();},[size.width]);
 function patch(patch:Partial<ShapeImagePosition>){setDraft(current=>({...current,...patch}));}
 function pixels(position:ShapeImagePosition){
  if(!natural)return position;
  const ratio=position.fit==='contain'?Math.min(size.width/natural.width,size.height/natural.height):Math.max(size.width/natural.width,size.height/natural.height);
  let w=position.fit==='custom'?(position.width?position.width*(position.widthUnit==='%'?size.width/100:1):0):natural.width*ratio;
  let h=position.fit==='custom'?(position.height?position.height*(position.heightUnit==='%'?size.height/100:1):0):natural.height*ratio;
  if(!w&&!h){w=natural.width;h=natural.height;}else if(!w)w=h*natural.width/natural.height;else if(!h)h=w*natural.height/natural.width;
  return {...position,fit:'custom' as const,width:w,height:h,widthUnit:'px' as const,heightUnit:'px' as const,x:position.x*(position.xUnit==='%'?(size.width-w)/100:1),y:position.y*(position.yUnit==='%'?(size.height-h)/100:1),xUnit:'px' as const,yUnit:'px' as const};
 }
 function pan(dx:number,dy:number){const p=pixels(draft);patch({...p,x:Math.max(-3000,Math.min(3000,p.x+dx)),y:Math.max(-3000,Math.min(3000,p.y+dy))});}
 return <div className="ui-shape-stack">
  <div className="ui-shape-crop-wrap"><div ref={surface} className="ui-shape-crop" role="application" aria-label="Позиція зображення: перетягування або стрілки" tabIndex={0} style={{width,aspectRatio:`${size.width}/${size.height}`,...shapeImageCss(draft,scale),backgroundAttachment:'scroll',backgroundImage:`url("${src}")`} as CSSProperties}
   onPointerDown={event=>{if(!natural||error||event.button!==0)return;event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);const p=pixels(draft);drag.current={x:event.clientX,y:event.clientY,draft:p,scale:event.currentTarget.getBoundingClientRect().width/size.width};}}
   onPointerMove={event=>{const state=drag.current;if(!state)return;setDraft({...state.draft,x:Math.max(-3000,Math.min(3000,state.draft.x+(event.clientX-state.x)/state.scale)),y:Math.max(-3000,Math.min(3000,state.draft.y+(event.clientY-state.y)/state.scale))});}}
   onPointerUp={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onPointerCancel={()=>{if(drag.current)setDraft(drag.current.draft);drag.current=null;}}
   onKeyDown={event=>{if(!natural||error)return;const key=event.key,step=event.shiftKey?10:1;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)){event.preventDefault();pan(key==='ArrowRight'?step:key==='ArrowLeft'?-step:0,key==='ArrowDown'?step:key==='ArrowUp'?-step:0);}}}>
   {/* This image only measures intrinsic dimensions; the visible image is the crop surface background. */}
   <img src={src} alt="" aria-hidden="true" onLoad={event=>{setNatural({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight});setError(false);setReady(true);}} onError={()=>{setError(true);setReady(false);}}/>
  </div></div>
  {error?<p role="alert" className="ui-shape-error">Не вдалося завантажити зображення.</p>:null}
  <Slider label="Масштаб зображення, % від ширини фігури" min={10} max={500} value={natural?Math.max(10,Math.min(500,Math.round(pixels(draft).width/size.width*1000)/10)):100} onValueChange={width=>{const before=pixels(draft),ratio=width*size.width/100/(before.width||size.width);patch({fit:'custom',width,height:0,widthUnit:'%',heightUnit:'%',x:Math.max(-3000,Math.min(3000,before.x*ratio+size.width/2*(1-ratio))),y:Math.max(-3000,Math.min(3000,before.y*ratio+size.height/2*(1-ratio))),xUnit:'px',yUnit:'px'});}}/>
  <Select label="Вписування" value={draft.fit} options={[{value:'cover',label:'Заповнити'},{value:'contain',label:'Повністю'},{value:'custom',label:'Власний розмір'}]} onValueChange={fit=>patch({fit:fit as ShapeImagePosition['fit']})}/>
  <div className="ui-shape-grid">{(['x','y'] as const).map(axis=><div className="ui-shape-stack" key={axis}><ShapeNumber label={`Позиція ${axis.toUpperCase()}`} value={draft[axis]} min={-3000} onChange={n=>patch({[axis]:n})}/><ShapeUnitInput label={`Одиниці ${axis.toUpperCase()}`} value={draft[`${axis}Unit`]} onChange={unit=>patch({[`${axis}Unit`]:unit})}/></div>)}</div>
  {draft.fit==='custom'?<div className="ui-shape-grid">{(['width','height'] as const).map(axis=><div className="ui-shape-stack" key={axis}><ShapeNumber label={axis==='width'?'Ширина зображення (0 — авто)':'Висота зображення (0 — авто)'} value={draft[axis]} max={10000} onChange={n=>patch({[axis]:n})}/><ShapeUnitInput label={`Одиниці ${axis==='width'?'ширини':'висоти'}`} value={draft[`${axis}Unit`]} onChange={unit=>patch({[`${axis}Unit`]:unit})}/></div>)}</div>:null}

 </div>;
}
