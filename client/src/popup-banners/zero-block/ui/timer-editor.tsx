'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {RotateCcw} from 'lucide-react';
import {Accordion,ColorInput,Field,IconButton,NumberInput,Select,Switch,TextInput} from './components';
import {DatePicker} from './date-picker';
import {ShapeNumber,type ShapeColorInteraction} from './shape-fill-editor';
import {RICH_FONTS} from '@zero/rich-text.mjs';
import {TIMER_PROPERTIES,TIMER_UNITS,TIMER_LABELS,TIMER_MAX_DURATION,createTimerSession,timerInstant,timerLocalParts,timerValues,updateTimer,updateTimerStyle} from '@zero/timer.mjs';
import {mountTimerContent,timerCss} from '@zero/timer-runtime.mjs';
import type {TimerContent,TimerStyleValue,TimerUnit} from '@zero/timer-types';
import './timer-editor.css';

export function TimerPreview({content,device='desktop',mode='editor',expired=false,session}:{content:TimerContent;device?:'desktop'|'mobile';mode?:'editor'|'preview';expired?:boolean;session?:ReturnType<typeof createTimerSession>}){
 const host=useRef<HTMLDivElement>(null),mounted=useRef<ReturnType<typeof mountTimerContent>|null>(null),latest=useRef({content,device,expired}),localSession=useRef(createTimerSession());
 useLayoutEffect(()=>{latest.current={content,device,expired};});
 useLayoutEffect(()=>{
  const root=host.current;if(!root)return;const shadow=root.shadowRoot||root.attachShadow({mode:'open'}),style=document.createElement('style'),target=document.createElement('div');style.textContent=timerCss;shadow.replaceChildren(style,target);
  const element=()=>({id:'timer-preview',content:latest.current.content,desktop:{x:0,y:0,width:Math.max(16,root.clientWidth),height:144},mobile:null});
  const runtime=mountTimerContent(target,element(),{mode,device:latest.current.device,timerExpired:latest.current.expired,timerSession:session||localSession.current});mounted.current=runtime;
  const resize=()=>{runtime.update(element());runtime.layout(latest.current.device);};const observer=new ResizeObserver(resize);observer.observe(root);
  return()=>{observer.disconnect();runtime.destroy();if(mounted.current===runtime)mounted.current=null;};
 },[mode,session]);
 useLayoutEffect(()=>{if(host.current&&mounted.current){mounted.current.update({id:'timer-preview',content,desktop:{x:0,y:0,width:Math.max(16,host.current.clientWidth),height:144},mobile:null});mounted.current.layout(device);mounted.current.setExpired(expired);}},[content,device,expired]);
 return <div ref={host} className="ui-timer-preview" role="group" aria-label={mode==='editor'?'Приклад таймера':'Живий таймер'}/>;
}

const durationParts=(seconds:number)=>({days:Math.floor(seconds/86400),hours:Math.floor(seconds%86400/3600),minutes:Math.floor(seconds%3600/60),seconds:seconds%60});
const durationMultipliers={days:86400,hours:3600,minutes:60,seconds:1};
export function TimerStyleEditor({content,device,timezone,onChange,colorInteraction,disabled=false}:{content:TimerContent;device:'desktop'|'mobile';timezone?:string;onChange:(content:TimerContent)=>void;colorInteraction?:ShapeColorInteraction;disabled?:boolean}){
 const t=content.timer,values=timerValues(content,device),own=t[device==='mobile'?'mobile':'base']||{},zone=t.timezone||timezone||'Europe/Kyiv';
 const initial=t.endAt===null?{date:'',hour:'23',minute:'59'}:timerLocalParts(t.endAt,zone);
 const dateSource=JSON.stringify([t.endAt,zone]);
 const [dateDraft,setDateDraft]=useState({...initial,source:dateSource}),[durationDraft,setDurationDraft]=useState({parts:durationParts(t.durationSeconds),source:t.durationSeconds}),[error,setError]=useState('');
 const {date,hour,minute}=dateDraft.source===dateSource?dateDraft:initial,duration=durationDraft.source===t.durationSeconds?durationDraft.parts:durationParts(t.durationSeconds);
 function commit(patch:Partial<TimerContent['timer']>){try{onChange(updateTimer(content,patch));setError('');}catch(e){setError((e instanceof Error?e.message:'Перевірте значення')+' Зміни не застосовано.');}}
 function deadline(nextDate:string,nextHour=hour,nextMinute=minute){setDateDraft({date:nextDate,hour:nextHour,minute:nextMinute,source:dateSource});if(!nextDate){commit({endAt:null});return;}try{commit({endAt:timerInstant(nextDate,nextHour,nextMinute,zone),timezone:zone});}catch(e){setError((e instanceof Error?e.message:'Перевірте дату')+' Зміни не застосовано.');}}
 function durationChange(unit:TimerUnit,value:string){const next={...duration,[unit]:Number(value)};setDurationDraft({parts:next,source:t.durationSeconds});const total=TIMER_UNITS.reduce((sum,u)=>sum+next[u as TimerUnit]*durationMultipliers[u as TimerUnit],0);commit({durationSeconds:total});}
 function style(key:string,value:TimerStyleValue|undefined){try{onChange(updateTimerStyle(content,device,{[key]:value}));setError('');}catch(e){setError((e instanceof Error?e.message:'Перевірте значення')+' Зміни не застосовано.');}}
 function property(p:{key:string;label:string;kind:string;min?:number;max?:number}){
  const value=values[p.key],input=p.kind==='number'?<ShapeNumber label={p.label} value={Number(value)} min={p.min} max={p.max} onChange={v=>style(p.key,v)}/>:p.kind==='color'?<ColorInput {...colorInteraction} label={p.label} value={String(value)} onValueChange={v=>style(p.key,v)}/>:<Select label={p.label} value={String(value)} options={p.kind==='appearance'?[{value:'plain',label:'Звичайні цифри'},{value:'cards',label:'Окремі картки'}]:(p.kind==='font'?RICH_FONTS.filter((font:string)=>font!=='inherit'):[400,500,600,700]).map((value:string|number)=>({value:String(value),label:String(value)}))} onValueChange={v=>style(p.key,p.kind==='weight'?Number(v):v)}/>;
  return <div className="ui-timer-control" key={p.key}>{input}{own[p.key]!==undefined?<IconButton label={`Скинути: ${p.label}`} variant="ghost" icon={<RotateCcw size={15}/>} onClick={()=>style(p.key,undefined)}/>:null}</div>;
 }
 return <fieldset className="ui-timer-fields" disabled={disabled}><div className="ui-timer-stack" role="region" aria-label="Налаштування таймера">
  <p className="ui-timer-hint">Відлік і формат спільні. Оформлення — для {device==='desktop'?'комп’ютера':'телефона'}. На полотні показано нерухомий приклад.</p>
  <Accordion multiple items={[
   {value:'countdown',title:'Відлік',content:<div className="ui-timer-stack"><Select label="Режим відліку" value={t.mode} options={[{value:'deadline',label:'До дати й часу'},{value:'duration',label:'Персональний відлік'}]} onValueChange={mode=>commit({mode:mode as TimerContent['timer']['mode']})}/>{t.mode==='deadline'?<><DatePicker label="Дата завершення" value={date} min="2020-01-01" max="2100-12-31" onValueChange={value=>deadline(value)}/><div className="ui-timer-grid"><Select label="Година завершення" value={hour} options={Array.from({length:24},(_,i)=>({value:String(i).padStart(2,'0'),label:String(i).padStart(2,'0')}))} onValueChange={value=>deadline(date,value)}/><Select label="Хвилина завершення" value={minute} options={Array.from({length:60},(_,i)=>({value:String(i).padStart(2,'0'),label:String(i).padStart(2,'0')}))} onValueChange={value=>deadline(date,hour,value)}/></div><p className="ui-timer-hint">Часовий пояс: {zone}. При повторюваній годині використовується перший момент.</p>{t.endAt===null?<p className="ui-timer-hint">Оберіть дату й час, щоб опублікувати банер.</p>:null}</>:<><div className="ui-timer-grid">{(TIMER_UNITS as TimerUnit[]).map(unit=><Field key={unit} label={`Тривалість: ${TIMER_LABELS[unit]}`}><NumberInput min={0} max={unit==='days'?365:unit==='hours'?23:59} value={String(duration[unit])} onChange={event=>durationChange(unit,event.target.value)}/></Field>)}</div><p className="ui-timer-hint">Від 1 секунди до {TIMER_MAX_DURATION/86400} днів. Від першого показу банера; повторне відкриття й перезавантаження продовжують відлік у цьому браузері.</p></>}</div>},
   {value:'format',title:'Формат',content:<div className="ui-timer-stack">{(TIMER_UNITS as TimerUnit[]).map(unit=><div className="ui-timer-stack" key={unit}><Switch label={`Показувати: ${TIMER_LABELS[unit]}`} checked={t.units.includes(unit)} disabled={t.units.length===1&&t.units.includes(unit)} onCheckedChange={checked=>commit({units:(TIMER_UNITS as TimerUnit[]).filter(value=>value===unit?checked:t.units.includes(value))})}/><Field label={`Підпис: ${TIMER_LABELS[unit]}`}><TextInput value={t.labels[unit]} maxLength={24} onChange={event=>commit({labels:{...t.labels,[unit]:event.target.value}})}/></Field></div>)}<Switch label="Показувати підписи" checked={t.showLabels} onCheckedChange={showLabels=>commit({showLabels})}/><Field label="Роздільник"><TextInput value={t.separator} maxLength={3} onChange={event=>commit({separator:event.target.value})}/></Field></div>},
   ...['Типографіка','Оформлення'].map(group=>({value:group,title:group,content:<div className="ui-timer-stack">{TIMER_PROPERTIES.filter(p=>p.group===group).map(property)}</div>})),
   {value:'finish',title:'Після завершення',content:<div className="ui-timer-stack"><Select label="Коли час вичерпано" value={t.finish} options={[{value:'message',label:'Залишити нулі й повідомлення'},{value:'hide',label:'Приховати таймер'},{value:'close',label:'Закрити банер'}]} onValueChange={finish=>commit({finish:finish as TimerContent['timer']['finish']})}/>{t.finish==='message'?<Field label="Текст після завершення"><TextInput value={t.finishText} maxLength={300} onChange={event=>commit({finishText:event.target.value})}/></Field>:null}<p className="ui-timer-hint">Ціни, промокоди та умови показу налаштовуються окремо.</p></div>},
  ]}/>{error?<p className="ui-timer-error" role="alert">{error}</p>:null}
 </div></fieldset>;
}
