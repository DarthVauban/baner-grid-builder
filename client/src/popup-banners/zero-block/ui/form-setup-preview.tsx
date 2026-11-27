'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {RotateCcw} from 'lucide-react';
import {Button,Select} from './components';
import {mountFormContent} from '@zero/element-runtime.mjs';
import type {FormContent} from '@zero/form-types';
import './form-setup.css';

export function FormSetupPreview({content,device,view=0,interactive=false}:{content:FormContent;device:'desktop'|'mobile';view?:number|'success';interactive?:boolean}){
 const host=useRef<HTMLDivElement>(null),[reset,setReset]=useState(0),[chosen,setChosen]=useState<number|'success'>(view);const current=interactive?0:chosen;
 useLayoutEffect(()=>{if(!host.current)return;const node=host.current,shadow=node.shadowRoot||node.attachShadow({mode:'open'});shadow.replaceChildren();const mount=mountFormContent(shadow,content,{mode:interactive?'preview':'editor',device,name:'Перегляд форми'});if(content.flow)mount.setStep(current==='success'?'success':Math.min(current,content.flow.steps.length-1));mount.layout(device);return()=>mount.destroy();},[content,device,current,reset,interactive]);
 return <section className="ui-form-setup-preview" aria-label="Попередній перегляд форми"><div className="ui-form-setup-heading"><h3>{interactive?'Спробуйте як покупець':'Так виглядатиме форма'}</h3>{interactive?<Button variant="secondary" size="sm" icon={<RotateCcw size={15}/>} onClick={()=>setReset(v=>v+1)}>Почати заново</Button>:null}</div><p className="ui-flow-hint">{interactive?'Заповніть поля й перейдіть до подарунка. Це тест: заявка не надсилається, винагорода не видається.':'Зміни видно одразу. Нічого не потрібно зберігати, щоб побачити результат.'}</p>{!interactive&&content.flow?<Select label="Показати у перегляді" value={String(chosen)} options={[...content.flow.steps.map((s,i)=>({value:String(i),label:`Крок ${i+1}: ${s.title}`})),{value:'success',label:'Екран винагороди'}]} onValueChange={v=>setChosen(v==='success'?'success':Number(v))}/>:null}<div className="ui-form-setup-preview-surface"><div ref={host} className="ui-form-setup-preview-host" data-device={device}/></div></section>;
}
