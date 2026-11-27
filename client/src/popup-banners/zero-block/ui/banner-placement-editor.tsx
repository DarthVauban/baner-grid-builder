'use client';

import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {Monitor,Smartphone,Move,RotateCcw,Check} from 'lucide-react';
import {Button,Field,NumberInput} from './components';
import {mountPopupArtboard} from '@zero/renderer.mjs';
import {renderEditorPlaceholder} from './editor-placeholder-dom.mjs';
import {PLACEMENT_ANCHORS,placementFor,placementLayout,movePlacement,presetPlacement} from '@zero/placement.mjs';
import type {PopupPlacement,PlacementAnchor} from '@zero/placement-types';
import type {PopupDocument} from '../types';
import type {ProductMap} from '@zero/product-types';
import './banner-placement-editor.css';

type Device='desktop'|'mobile';
type Props={document:PopupDocument;products?:ProductMap;disabled?:boolean;onChange:(device:Device,placement:PopupPlacement|undefined)=>void;onInteractionStart?:()=>void;onInteractionEnd?:()=>void};
const screens={desktop:{width:1440,height:900,label:'Комп’ютер',Icon:Monitor},mobile:{width:390,height:844,label:'Телефон',Icon:Smartphone}};

function DevicePlacement({document:model,products,disabled,onChange,onInteractionStart,onInteractionEnd,device}:Props&{device:Device}){
  const {width,height,label,Icon}=screens[device],composition=model[device],placement=placementFor(composition);
  const viewport=useRef<HTMLDivElement>(null),preview=useRef<HTMLDivElement>(null),mounted=useRef<ReturnType<typeof mountPopupArtboard>|null>(null);
  const [screenScale,setScreenScale]=useState(0);
  const plan=placementLayout(composition,width,height,placement),point=PLACEMENT_ANCHORS.find(item=>item.value===placement.anchor)!;
  const current=useRef({composition,placement,onChange,onInteractionStart,onInteractionEnd}),interacting=useRef(false);
  const begin=()=>{if(!interacting.current){interacting.current=true;current.current.onInteractionStart?.();}};
  const end=()=>{if(interacting.current){interacting.current=false;current.current.onInteractionEnd?.();}};
  const same=(a:PopupPlacement,b:PopupPlacement)=>a.overlay===b.overlay&&a.anchor===b.anchor&&a.offsetX===b.offsetX&&a.offsetY===b.offsetY;
  const apply=(value:PopupPlacement)=>{if(!same(value,placement))onChange(device,value);};
  useLayoutEffect(()=>{current.current={composition,placement,onChange,onInteractionStart,onInteractionEnd};});
  useLayoutEffect(()=>{const node=viewport.current;if(!node)return;const measure=()=>setScreenScale(node.clientWidth/width);const observer=new ResizeObserver(measure);observer.observe(node);measure();return()=>observer.disconnect();},[width]);
  useEffect(()=>{
    const host=preview.current;if(!host)return;
    const shadow=host.shadowRoot||host.attachShadow({mode:'open'});
    if(mounted.current&&!mounted.current.updateDocument(model,{device,products})){mounted.current.destroy();shadow.replaceChildren();mounted.current=null;}
    if(!mounted.current)mounted.current=mountPopupArtboard(shadow,model,{mode:'editor',device,products,renderPlaceholder:renderEditorPlaceholder});
    if(screenScale)mounted.current.layout(device,plan.scale*screenScale);
  },[model,products,device,screenScale,plan.scale]);
  useEffect(()=>{const host=preview.current;return()=>{mounted.current?.destroy();mounted.current=null;host?.shadowRoot?.replaceChildren();};},[]);
  const gesture=useRef<{pointer:number;clientX:number;clientY:number;x:number;y:number;before:PopupPlacement;original:PopupPlacement|undefined;scale:number}|null>(null);
  const finish=(cancel=false)=>{const active=gesture.current;if(!active)return;gesture.current=null;if(cancel)current.current.onChange(device,active.original);end();};
  useEffect(()=>()=>{if(gesture.current){current.current.onChange(device,gesture.current.original);gesture.current=null;}if(interacting.current){interacting.current=false;current.current.onInteractionEnd?.();}},[device]);
  function start(event:ReactPointerEvent<HTMLButtonElement>){
    if(disabled||event.button!==0||!event.isPrimary||!screenScale)return;
    event.preventDefault();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);begin();
    gesture.current={pointer:event.pointerId,clientX:event.clientX,clientY:event.clientY,x:plan.x,y:plan.y,before:{...placement},original:composition.placement,scale:screenScale};
  }
  function move(event:ReactPointerEvent<HTMLButtonElement>){const active=gesture.current;if(!active||active.pointer!==event.pointerId)return;const value=movePlacement(composition,width,height,active.before,active.x+(event.clientX-active.clientX)/active.scale,active.y+(event.clientY-active.clientY)/active.scale);if(same(value,active.before))onChange(device,active.original);else apply(value);}
  const offsetField=(axis:'X'|'Y',factor:number)=>{
    const key=axis==='X'?'offsetX':'offsetY',name=factor===.5?`Зміщення по ${axis}`:axis==='X'?`Відступ ${factor===0?'ліворуч':'праворуч'}`:`Відступ ${factor===0?'зверху':'знизу'}`;
    return <Field label={`${name}, px`}><NumberInput aria-label={`${name}, px`} min={factor===.5?-3000:0} max={3000} step={1} value={placement[key]} disabled={disabled} onFocus={begin} onBlur={end} onChange={event=>{const value=event.target.valueAsNumber;if(Number.isFinite(value)&&value>=(factor===.5?-3000:0)&&value<=3000)apply({...placement,[key]:value});}}/></Field>;
  };
  return <section className="ui-placement-card" aria-label={`Розміщення: ${label}`}>
    <div className="ui-placement-card-heading"><Icon size={20}/><h3>{label}</h3><span>{width} × {height}</span></div>
    <div className="ui-placement-scene"><div ref={viewport} className="ui-placement-viewport" data-device={device} data-overlay={placement.overlay}>
      <div className="ui-placement-store" aria-hidden="true"><div/><strong>Дім і деталі</strong><div className="ui-placement-store-hero"/><div className="ui-placement-store-products"><i/><i/><i/></div></div>
      <div className="ui-placement-shade" aria-hidden="true"/>
      <button type="button" className="ui-placement-banner" aria-label={`Перемістити банер: ${label}`} aria-roledescription="перетягуваний банер" title="Перетягніть або використайте стрілки. Shift — 10 px; Escape скасовує перетягування." disabled={disabled}
        style={{left:plan.x*screenScale,top:plan.y*screenScale,width:plan.width*screenScale,height:plan.height*screenScale}}
        onPointerDown={start} onPointerMove={move} onPointerUp={event=>{if(gesture.current?.pointer===event.pointerId)finish();}} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish(true)}
        onKeyDown={event=>{if(event.key==='Escape'&&gesture.current){event.preventDefault();event.stopPropagation();finish(true);return;}const moves:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},delta=moves[event.key];if(!delta)return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?10:1;apply(movePlacement(composition,width,height,placement,plan.x+delta[0]*step,plan.y+delta[1]*step));}}>
        <div ref={preview} className="ui-placement-banner-preview" inert aria-hidden="true"/>
        {!model.elements.length?<span className="ui-placement-empty">Ваш банер</span>:null}<span className="ui-placement-move" aria-hidden="true"><Move size={16}/></span>
      </button>
    </div></div>
    <p className="ui-placement-help">Перетягніть банер на схемі екрана. Стрілки — 1 px, Shift — 10 px.</p>
    <fieldset className="ui-placement-fields" disabled={disabled}><legend>Режим показу</legend><div className="ui-placement-modes">{[true,false].map(overlay=><button type="button" key={String(overlay)} className="ui-placement-mode" aria-pressed={placement.overlay===overlay} onClick={()=>apply({...placement,overlay})}>
      <span className="ui-placement-mode-screen" data-overlay={overlay} aria-hidden="true"><i/></span><span>{overlay?'З оверлеєм':'Без оверлею'}</span>{placement.overlay===overlay?<Check size={16} aria-hidden="true"/>:null}
    </button>)}</div></fieldset>
    <div className="ui-placement-position"><div><p className="ui-placement-label">Опорна точка</p><div className="ui-placement-anchors" role="group" aria-label={`Опорна точка: ${label}`}>{PLACEMENT_ANCHORS.map(anchor=><button key={anchor.value} type="button" title={anchor.label} aria-label={anchor.label} aria-pressed={placement.anchor===anchor.value} disabled={disabled} onClick={()=>apply(presetPlacement(placement,anchor.value as PlacementAnchor))}><span/></button>)}</div></div><div className="ui-placement-offsets">{offsetField('X',point.x)}{offsetField('Y',point.y)}</div></div>
    <p className="ui-placement-help" role="status">{point.label} · {placement.overlay?'Фон затемнений, прокручування заблоковано':'Сторінка залишається доступною'}</p>
    <Button variant="ghost" size="sm" icon={<RotateCcw size={15}/>} disabled={disabled||!composition.placement} onClick={()=>onChange(device,undefined)}>Скинути розміщення: {label}</Button>
  </section>;
}

export function BannerPlacementEditor(props:Props){return <div className="ui-banner-placement"><div className="ui-placement-devices">{(['desktop','mobile'] as const).map(device=><DevicePlacement key={`${props.document.shopId}:${props.document.widgetId}:${device}`} {...props} device={device}/>)}</div><p className="ui-placement-help">Позиції комп’ютера й телефона зберігаються окремо. На меншому екрані банер пропорційно вписується з безпечним відступом.</p></div>;}
