'use client';
import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {Popover} from '@base-ui/react/popover';
import {Plus,Minus,X} from 'lucide-react';
import {SavedPaintSwatches} from './paint-library';
import {Field,IconButton,NumberInput,Select,Slider,SolidColorInput,normalizeHexColor,type ColorInputProps} from './components';
import {isPaint,parsePaint,serializePaint} from '@zero/paint.mjs';
import type {ShapeFillLayer} from '@zero/shape-types';

function PaintNumber({label,value,min=0,max=100,onChange,disabled=false}:{label:string;value:number;min?:number;max?:number;disabled?:boolean;onChange:(n:number)=>void}){
 const [draft,setDraft]=useState(String(value)),[source,setSource]=useState(value);
 if(source!==value){setSource(value);setDraft(String(value));}
 return <Field label={label}><NumberInput disabled={disabled} value={draft} min={min} max={max} step={1} onChange={e=>{const raw=e.target.value;setDraft(raw);const n=Number(raw);if(raw!==''&&Number.isFinite(n)&&n>=min&&n<=max)onChange(n);}} onBlur={()=>setDraft(String(value))}/></Field>;
}
const titles={solid:'Суцільний колір',linear:'Лінійний градієнт',radial:'Радіальний градієнт',conic:'Конічний градієнт'};
type Stop = {color:string;position:number};
const opacityOf=(color:string)=>color.length===9?Math.round(parseInt(color.slice(7),16)/255*100):100;
const withOpacity=(color:string,opacity:number)=>color.slice(0,7)+(opacity===100?'':Math.round(opacity/100*255).toString(16).padStart(2,'0').toUpperCase());

function StopNumber({label,value,onChange,integer=false,disabled,onInvalidChange}:{onInvalidChange?:(invalid:boolean)=>void;label:string;value:number;onChange:(value:number)=>void;integer?:boolean;disabled:boolean}){
 const id=useId(),[draft,setDraft]=useState(String(value)),[source,setSource]=useState(value),[echo,setEcho]=useState<number|null>(null);
 if(source!==value){setSource(value);if(value!==echo)setDraft(String(value));setEcho(null);}
 const valid=draft.trim()!==''&&Number.isFinite(Number(draft))&&Number(draft)>=0&&Number(draft)<=100;
 useEffect(()=>{onInvalidChange?.(!valid);},[valid,onInvalidChange]);
 return <label className="ui-paint-stop-number" htmlFor={id}><span className="ui-sr-only">{label}</span><input id={id} aria-label={label} type="number" aria-invalid={!valid||undefined} min={0} max={100} step={integer?1:'any'} disabled={disabled} value={draft} onChange={event=>{const raw=event.target.value;setDraft(raw);const n=Number(raw);if(raw.trim()!==''&&Number.isFinite(n)&&n>=0&&n<=100){const next=integer?Math.round(n):n;setEcho(next);onChange(next);}}} onBlur={()=>setDraft(String(value))} onKeyDown={event=>{if(event.key==='Enter'||(event.key==='Escape'&&draft!==String(value))){event.preventDefault();event.stopPropagation();setDraft(String(value));}}}/><span aria-hidden="true">%</span></label>;
}

function StopRow({stop,index,selected,expanded,disabled,canDelete,onSelect,onColor,onPosition,onOpacity,onOpen,onRemove,onInvalidChange}:{onInvalidChange:(invalid:boolean)=>void;stop:Stop;index:number;selected:boolean;expanded:boolean;disabled:boolean;canDelete:boolean;onSelect:()=>void;onColor:(color:string)=>void;onPosition:(position:number)=>void;onOpacity:(opacity:number)=>void;onOpen:()=>void;onRemove:()=>void}){
 const id=useId(),[draft,setDraft]=useState(stop.color.slice(1,7)),[source,setSource]=useState(stop.color),[echo,setEcho]=useState<string|null>(null);
 if(source!==stop.color){setSource(stop.color);if(stop.color!==echo)setDraft(stop.color.slice(1,7));setEcho(null);}
 const valid=normalizeHexColor(draft.startsWith('#')?draft:`#${draft}`)!==null;
 const [positionInvalid,setPositionInvalid]=useState(false),[opacityInvalid,setOpacityInvalid]=useState(false);
 useEffect(()=>onInvalidChange(!valid||positionInvalid||opacityInvalid),[valid,positionInvalid,opacityInvalid,onInvalidChange]);
 function commit(){const digits=draft.replace(/^#/,'');const color=normalizeHexColor(`#${digits}`);if(!color){setDraft(stop.color.slice(1,7));return;}const next=digits.length===4||digits.length===8?color:color.slice(0,7)+(stop.color.length===9?stop.color.slice(7):'');if(next!==stop.color){setEcho(next);onColor(next);}setDraft(next.slice(1,7));}
 return <div className="ui-paint-stop-row" role="group" aria-label={`Точка ${index+1}`} data-selected={selected||undefined} onFocusCapture={onSelect}>
  <StopNumber label={`Позиція точки ${index+1}, %`} value={stop.position} onInvalidChange={setPositionInvalid} onChange={onPosition} disabled={disabled}/>
  <div className="ui-paint-stop-color" data-invalid={!valid||undefined}>
   <IconButton label={`Обрати колір точки ${index+1}`} size="sm" variant="ghost" disabled={disabled} aria-expanded={expanded} icon={<span className="ui-color-swatch"><span style={{background:stop.color}}/></span>} onClick={onOpen}/>
   <label className="ui-sr-only" htmlFor={id}>HEX точки {index+1}</label><input id={id} value={draft} disabled={disabled} spellCheck={false} autoComplete="off" aria-invalid={!valid||undefined} onChange={event=>{const raw=event.target.value;setDraft(raw);const digits=raw.replace(/^#/,'');const color=normalizeHexColor(`#${digits}`);if(color&&digits.length>=6){const next=digits.length===4||digits.length===8?color:color.slice(0,7)+(stop.color.length===9?stop.color.slice(7):'');setEcho(next);onColor(next);}}} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'||(event.key==='Escape'&&draft!==stop.color.slice(1,7))){event.preventDefault();event.stopPropagation();if(event.key==='Enter')commit();else setDraft(stop.color.slice(1,7));}}}/>
  </div>
  <StopNumber label={`Прозорість точки ${index+1}, %`} value={opacityOf(stop.color)} onInvalidChange={setOpacityInvalid} integer onChange={onOpacity} disabled={disabled}/>
  <IconButton label={`Видалити точку ${index+1}`} size="sm" variant="ghost" icon={<Minus size={16}/>} disabled={disabled||!canDelete} onClick={onRemove}/>
  {!valid?<span className="ui-paint-stop-error ui-field-description ui-text-danger" role="alert">Введіть HEX: 3, 4, 6 або 8 символів.</span>:null}
 </div>;
}

function interpolatedColor(stops:Stop[],position:number){
 const sorted=[...stops].sort((a,b)=>a.position-b.position),left=[...sorted].reverse().find(s=>s.position<=position)||sorted[0],right=sorted.find(s=>s.position>=position)||sorted.at(-1)!;
 const t=right.position===left.position?0:(position-left.position)/(right.position-left.position);
 const rgba=(color:string)=>[1,3,5,7].map(i=>i===7&&color.length!==9?255:parseInt(color.slice(i,i+2),16));
 const a=rgba(left.color),b=rgba(right.color),alpha=a[3]+(b[3]-a[3])*t;
 // CSS gradients interpolate alpha-premultiplied channels; inserting a stop must not add a transparent colour fringe.
 const bytes=[0,1,2,3].map(i=>Math.round(i===3?alpha:alpha===0?a[i]+(b[i]-a[i])*t:(a[i]*a[3]*(1-t)+b[i]*b[3]*t)/alpha).toString(16).padStart(2,'0')).join('').toUpperCase();
 return `#${bytes.endsWith('FF')?bytes.slice(0,6):bytes}`;
}
export function PaintInput({label,value,defaultValue='#403C35',onValueChange,onInteractionStart,onInteractionEnd,disabled=false,error,hint,className}:ColorInputProps){
 const id=useId(),[open,setOpen]=useState(false),[local,setLocal]=useState(defaultValue),[draft,setDraft]=useState(value??defaultValue),[source,setSource]=useState(value),[active,setActive]=useState(0),[allowConic,setAllowConic]=useState(()=>parsePaint(value??defaultValue)?.type==='conic');
 const [solidInvalid,setSolidInvalid]=useState(false),[invalidStops,setInvalidStops]=useState<Record<number,boolean>>({});
 const reportInvalid=useCallback((key:number,invalid:boolean)=>setInvalidStops(old=>old[key]===invalid?old:{...old,[key]:invalid}),[]);
 const memory=useRef<Partial<ShapeFillLayer>>({}),ownEcho=useRef<string|null>(null);
 const [showColorEditor,setShowColorEditor]=useState(false),popup=useRef<HTMLDivElement>(null),drag=useRef<{key:number;pointer:number}|null>(null),restoreFocus=useRef<HTMLElement|null>(null);
 const gesture=useRef(false),endCallback=useRef(onInteractionEnd);
 useEffect(()=>{endCallback.current=onInteractionEnd;},[onInteractionEnd]);
 const finish=useCallback(()=>{drag.current=null;if(gesture.current){gesture.current=false;endCallback.current?.();}},[]);
 useEffect(()=>{if(!open)return;let timer:ReturnType<typeof setTimeout>|undefined;const release=()=>{clearTimeout(timer);timer=setTimeout(finish,0);};const blur=()=>{finish();setOpen(false);};window.addEventListener('pointerup',release,true);window.addEventListener('pointercancel',release,true);window.addEventListener('blur',blur);return()=>{clearTimeout(timer);window.removeEventListener('pointerup',release,true);window.removeEventListener('pointercancel',release,true);window.removeEventListener('blur',blur);finish();};},[open,finish]);
 useEffect(()=>{if(disabled)finish();},[disabled,finish]);
 if(disabled&&open)setOpen(false);
 if(source!==value){setSource(value);if(value!==ownEcho.current)setDraft(value??local);ownEcho.current=null;}
 const current=normalizeHexColor(value??local)??value??local,parsed=parsePaint(current) as ShapeFillLayer|null,paint:ShapeFillLayer=parsed||{type:'solid',color:'#403C35'},gradient=paint.type!=='solid',stops=paint.stops||[],at=Math.min(active,Math.max(0,stops.length-1)),color=gradient?stops[at]?.color||'#403C35':paint.color||'#403C35';
 // Ephemeral keys follow colours across the sorted persisted format; marker DOM order stays fixed during capture.
 const [identity,setIdentity]=useState(()=>({value:current,keys:stops.map((_,i)=>i)}));
 const stopKeys=identity.value===current?identity.keys:stops.map((_,i)=>i);
 if(identity.value!==current)setIdentity({value:current,keys:stopKeys});
 useLayoutEffect(()=>{const target=restoreFocus.current;restoreFocus.current=null;if(target?.isConnected&&document.activeElement!==target)target.focus({preventScroll:true});});
 if(paint.type==='conic'&&!allowConic)setAllowConic(true);
 function change(next:ShapeFillLayer,keys=stopKeys,selectedKey=stopKeys[at]){const raw=serializePaint(next);if(!isPaint(raw)||disabled)return;const focused=document.activeElement;if(focused instanceof HTMLElement&&popup.current?.contains(focused)&&focused.matches('.ui-paint-stop-row input,[data-paint-marker]'))restoreFocus.current=focused;const sorted=next.stops?.map((stop,i)=>({stop,key:keys[i]??i})).sort((a,b)=>a.stop.position-b.stop.position)||[];setActive(Math.max(0,sorted.findIndex(s=>s.key===selectedKey)));setIdentity({value:raw,keys:sorted.map(s=>s.key)});memory.current={...memory.current,...next};setLocal(raw);setDraft(raw);ownEcho.current=raw;onValueChange?.(raw);}
 function patch(next:Partial<ShapeFillLayer>,keys=stopKeys,selectedKey=stopKeys[at]){change({...paint,...next},keys,selectedKey);}
 function editStop(key:number,next:Partial<Stop>){patch({stops:stops.map((s,i)=>stopKeys[i]===key?{...s,...next}:s)},stopKeys,key);}
 function addStop(position?:number){if(disabled||stops.length>=12)return;if(position===undefined){const sorted=[0,...stops.map(s=>s.position),100].sort((a,b)=>a-b);let gap=-1;for(let i=1;i<sorted.length;i++)if(sorted[i]-sorted[i-1]>gap){gap=sorted[i]-sorted[i-1];position=(sorted[i]+sorted[i-1])/2;}}const p=Math.round((position??50)*100)/100,key=Math.max(-1,...stopKeys)+1;patch({stops:[...stops,{position:p,color:interpolatedColor(stops,p)}]},[...stopKeys,key],key);}
 function removeStop(key:number){if(disabled||stops.length<=2)return;const index=stopKeys.indexOf(key),nextKeys=stopKeys.filter(k=>k!==key),nextKey=nextKeys[Math.min(index,nextKeys.length-1)];popup.current?.querySelector<HTMLButtonElement>(`[data-paint-marker="${nextKey}"]`)?.focus({preventScroll:true});patch({stops:stops.filter((_,i)=>stopKeys[i]!==key)},nextKeys,nextKey);}
 function changeColor(color:string){if(gradient)patch({stops:stops.map((s,index)=>index===at?{...s,color}:s)});else patch({color});}
 function type(type:ShapeFillLayer['type']){const remembered={...memory.current,...paint};change({...remembered,type,color,stops:remembered.stops||[{color,position:0},{color:'#FFFFFF',position:100}],angle:remembered.angle??90});setActive(0);setShowColorEditor(false);}
 const validation=error||(!gradient&&!normalizeHexColor(draft)?'Введіть HEX-код або оберіть колір на палітрі.':undefined);
 const interaction={onInteractionStart:()=>{if(!gesture.current){gesture.current=true;onInteractionStart?.();}},onInteractionEnd:finish};
 return <div className={['ui-field','ui-color-field',className].filter(Boolean).join(' ')} data-disabled={disabled||undefined}>
  <label className="ui-label" htmlFor={id}>{label}</label><div className="ui-color-control" data-invalid={!!validation||undefined}>
   <Popover.Root open={open&&!disabled} onOpenChange={next=>{setOpen(next);if(!next)finish();}}>
    <Popover.Trigger render={<IconButton className="ui-color-trigger" label={`Відкрити палітру: ${label}`} variant="ghost" disabled={disabled} icon={<span className="ui-color-swatch"><span style={{background:current}}/></span>}/>}/>
    <Popover.Portal><Popover.Positioner positionMethod="fixed" sticky className="ui-positioner" sideOffset={8} align="start" collisionPadding={12} collisionAvoidance={{side:'shift',align:'shift'}}><Popover.Popup ref={popup} className="ui-popup ui-color-picker ui-paint-picker" data-color-picker="" aria-label={`Палітра: ${label}`}>
     <div className="ui-color-picker-heading"><Popover.Title>Палітра: {label}</Popover.Title><Popover.Close render={<IconButton label="Закрити палітру" icon={<X size={16}/>} variant="ghost"/>}/></div>
     <Popover.Description className="ui-field-description">Колір або градієнт — в одній палітрі.</Popover.Description>
     <Select label="Тип кольору" value={paint.type} disabled={disabled} options={(Object.entries(titles).filter(([key])=>key!=='conic'||allowConic)).map(([value,label])=>({value,label}))} onValueChange={next=>type(next as ShapeFillLayer['type'])}/>
     {gradient?<>
      <div className="ui-paint-track"><div className="ui-paint-track-inner">
       <button type="button" className="ui-paint-preview" style={{background:serializePaint({...paint,type:'linear',angle:90})}} aria-label="Додати колір у позиції на смузі градієнта" disabled={disabled||stops.length>=12} onClick={event=>{const r=event.currentTarget.getBoundingClientRect();addStop(event.detail===0?50:Math.max(0,Math.min(100,(event.clientX-r.left)/r.width*100)));}}/>
       {stops.map((stop,index)=>({stop,index,key:stopKeys[index]})).sort((a,b)=>a.key-b.key).map(({stop,index,key})=><button key={key} type="button" role="slider" aria-label={`Позиція кольору ${index+1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={stop.position} aria-valuetext={`${stop.position}%, ${stop.color}`} data-paint-marker={stopKeys[index]} data-active={index===at||undefined} className="ui-paint-marker" style={{left:`${stop.position}%`}} disabled={disabled} onFocus={()=>setActive(index)} onPointerDown={event=>{if(disabled||(event.pointerType!=='touch'&&event.button!==0))return;event.preventDefault();event.currentTarget.focus({preventScroll:true});setActive(index);drag.current={key:stopKeys[index],pointer:event.pointerId};interaction.onInteractionStart();event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(drag.current?.key!==stopKeys[index]||drag.current.pointer!==event.pointerId)return;const r=event.currentTarget.parentElement!.getBoundingClientRect();editStop(stopKeys[index],{position:Math.round(Math.max(0,Math.min(100,(event.clientX-r.left)/r.width*100))*100)/100});}} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onBlur={finish} onKeyDown={event=>{if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();event.stopPropagation();removeStop(stopKeys[index]);return;}const step=event.shiftKey?10:1,next=event.key==='Home'?0:event.key==='End'?100:['ArrowLeft','ArrowDown'].includes(event.key)?stop.position-step:['ArrowRight','ArrowUp'].includes(event.key)?stop.position+step:null;if(next===null)return;event.preventDefault();event.stopPropagation();interaction.onInteractionStart();editStop(stopKeys[index],{position:Math.max(0,Math.min(100,next))});}} onKeyUp={finish}><span className="ui-color-swatch"><span style={{background:stop.color}}/></span></button>)}
      </div></div>
      <div className="ui-paint-stops" role="group" aria-label="Кольори градієнта">
       <div className="ui-paint-stops-heading"><span className="ui-label">Кольорові точки</span><IconButton label="Додати колір градієнта" size="sm" icon={<Plus size={16}/>} variant="ghost" disabled={disabled||stops.length>=12} onClick={()=>addStop()}/></div>
       <div className="ui-paint-stops-columns" aria-hidden="true"><span>Позиція</span><span>Колір</span><span>Прозорість</span><span/></div>
       {stops.map((stop,index)=><StopRow key={stopKeys[index]} onInvalidChange={invalid=>reportInvalid(stopKeys[index],invalid)} stop={stop} index={index} selected={at===index} expanded={showColorEditor&&at===index} disabled={disabled} canDelete={stops.length>2} onSelect={()=>setActive(index)} onPosition={position=>editStop(stopKeys[index],{position})} onColor={color=>editStop(stopKeys[index],{color})} onOpacity={opacity=>editStop(stopKeys[index],{color:withOpacity(stop.color,opacity)})} onOpen={()=>{setActive(index);setShowColorEditor(true);}} onRemove={()=>removeStop(stopKeys[index])}/>)}
      </div>
      {showColorEditor?<div className="ui-paint-expanded"><div className="ui-paint-stops-heading"><span className="ui-label">Колір точки {at+1}</span><IconButton label="Згорнути палітру точки" size="sm" variant="ghost" icon={<X size={16}/>} onClick={()=>{popup.current?.querySelector<HTMLButtonElement>(`[aria-label="Обрати колір точки ${at+1}"]`)?.focus({preventScroll:true});setShowColorEditor(false);}}/></div><SolidColorInput key={stopKeys[at]} {...interaction} embedded onDraftValidityChange={setSolidInvalid} label={`Колір точки ${at+1}`} value={color} onValueChange={changeColor} disabled={disabled}/></div>:null}
     </>:null}
     {!gradient?<SolidColorInput {...interaction} embedded onDraftValidityChange={setSolidInvalid} label="Колір" value={color} onValueChange={changeColor} disabled={disabled}/>:null}
     <SavedPaintSwatches value={current} disabled={disabled} invalid={!!validation||((!gradient||showColorEditor)&&solidInvalid)||(gradient&&stopKeys.some(key=>invalidStops[key]))} onApply={raw=>{const next=parsePaint(raw) as ShapeFillLayer|null;if(next){change(next,next.stops?.map((_,i)=>i)||[],0);setShowColorEditor(false);setActive(0);}}}/>
     {gradient?<div className="ui-paint-geometry">
      {paint.type!=='radial'?<Slider {...interaction} label="Кут градієнта, °" min={-360} max={360} value={paint.angle||0} disabled={disabled} onValueChange={angle=>patch({angle})}/>:<>
       <div className="ui-paint-grid"><Select disabled={disabled} label="Форма градієнта" value={paint.radialShape||'circle'} options={[{value:'circle',label:'Коло'},{value:'ellipse',label:'Еліпс'}]} onValueChange={radialShape=>patch({radialShape:radialShape as ShapeFillLayer['radialShape']})}/><Select disabled={disabled} label="Розмір градієнта" value={paint.radialSize||'farthest-corner'} options={[['closest-side','Ближня сторона'],['closest-corner','Ближній кут'],['farthest-side','Дальня сторона'],['farthest-corner','Дальній кут'],['custom','Власний']].map(([value,label])=>({value,label}))} onValueChange={radialSize=>patch({radialSize:radialSize as ShapeFillLayer['radialSize']})}/></div>
       {paint.radialSize==='custom'?<div className="ui-paint-grid"><PaintNumber disabled={disabled} label={paint.radialShape==='ellipse'?'Радіус X':'Радіус, px'} value={paint.radiusX??100} max={10000} onChange={radiusX=>patch({radiusX})}/>{paint.radialShape==='ellipse'?<><PaintNumber disabled={disabled} label="Радіус Y" value={paint.radiusY??100} max={10000} onChange={radiusY=>patch({radiusY})}/><Select disabled={disabled} label="Одиниці радіуса" value={paint.radiusUnit||'%'} options={[{value:'%',label:'%'},{value:'px',label:'px'}]} onValueChange={radiusUnit=>patch({radiusUnit:radiusUnit as '%'|'px'})}/></>:null}</div>:null}
      </>}
      {paint.type!=='linear'?<div className="ui-paint-grid">{(['x','y'] as const).map(axis=><div className="ui-paint-axis" key={axis}><PaintNumber disabled={disabled} label={`Центр ${axis.toUpperCase()}`} min={-3000} max={3000} value={paint[axis]??50} onChange={n=>patch({[axis]:n})}/><Select disabled={disabled} label={`Одиниці ${axis.toUpperCase()}`} value={paint[`${axis}Unit`]||'%'} options={[{value:'%',label:'%'},{value:'px',label:'px'}]} onValueChange={unit=>patch({[`${axis}Unit`]:unit})}/></div>)}</div>:null}
     </div>:null}
    </Popover.Popup></Popover.Positioner></Popover.Portal>
   </Popover.Root>
   <input id={id} className="ui-color-text" value={gradient?titles[paint.type]:draft} readOnly={gradient} disabled={disabled} spellCheck={false} autoComplete="off" aria-invalid={!!validation||undefined} aria-describedby={validation||hint?`${id}-description`:undefined} onChange={event=>{const raw=event.target.value;setDraft(raw);const hex=normalizeHexColor(raw);if(hex){setLocal(hex);ownEcho.current=hex;onValueChange?.(hex);}}} onBlur={()=>{if(!validation)setDraft(current);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(!validation)setDraft(current);}}}/>
  </div>{validation||hint?<p id={`${id}-description`} className={`ui-field-description${validation?' ui-text-danger':''}`} role={validation?'alert':undefined}>{validation||hint}</p>:null}
 </div>;
}
