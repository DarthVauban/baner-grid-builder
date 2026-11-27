'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {RotateCcw} from 'lucide-react';
import {Accordion,Button,ColorInput,Dialog,Field,IconButton,NumberInput,SearchInput,Select,Switch,TextInput} from './components';
import {ButtonIconPicker,type ButtonIconValue} from './button-icon-picker';
import {FormRewardEditor,FormFlowStyleEditor} from './form-flow-editor';
import type {RewardFile} from '@zero/form-types';
import {RichTextEditor} from './rich-text-editor';
import {ZERO_FORM_PROPERTY_MAP,updateZeroDesign,upgradeZeroForm,zeroFormGroups,zeroFormValues} from '@zero/zero-form.mjs';
import {richTextFromPlain,safeSuccessUrl} from '@zero/rich-text.mjs';
import type {FormContent,FormStyleValue} from '@zero/form-types';
import './form-style-editor.css';
type Property={key:string;label:string;kind:string;group:string;default:FormStyleValue;min?:number;max?:number;step?:number;responsive:boolean;options?:string[][]};
type Props={appearanceOnly?:boolean;content:FormContent;device:'desktop'|'mobile';onChange:(value:FormContent,expected?:FormContent)=>string|void;colorInteraction?:{onInteractionStart:()=>void;onInteractionEnd:()=>void};onUploadMedia?:(file:File)=>Promise<string>;onBusyChange?:(busy:boolean)=>void;onUploadFile?:(file:File)=>Promise<RewardFile>;stepView?:number|'success';onStepViewChange?:(view:number|'success')=>void};
function StyleNumber({property,value,onChange}:{property:Property;value:number;onChange:(value:number)=>void}){
 const [draft,setDraft]=useState(String(value)),focused=useRef(false);
 useLayoutEffect(()=>{if(!focused.current)setDraft(String(value));},[value]);
 return <Field label={property.label}><NumberInput value={draft} min={property.min} max={property.max} step={property.step} onFocus={()=>{focused.current=true;}} onBlur={()=>{focused.current=false;setDraft(String(value));}} onChange={event=>{setDraft(event.target.value);const n=Number(event.target.value);if(event.target.value!==''&&Number.isFinite(n)&&n>=(property.min??-Infinity)&&n<=(property.max??Infinity))onChange(n);}}/></Field>;
}
export function FormStyleEditor({content,device,onChange,colorInteraction,onUploadMedia,onBusyChange,onUploadFile,stepView=0,onStepViewChange,appearanceOnly=false}:Props){
 const [query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[shadow,setShadow]=useState<{prefix:string;values:Record<string,FormStyleValue>}|null>(null);
 const values=zeroFormValues(content,device),groups=zeroFormGroups(content,device,query).filter((g:{name:string})=>!appearanceOnly||!['Винагорода','Поведінка й повідомлення'].includes(g.name)) as {name:string;properties:Property[]}[];
 function commit(next:FormContent,expected?:FormContent){const failure=onChange(next,expected);setError(failure||'');return failure;}
 function change(patch:Record<string,FormStyleValue|undefined>){try{commit(updateZeroDesign(content,device,patch));}catch(e){setError(e instanceof Error?e.message:'Перевірте значення');}}
 function behavior(patch:Partial<NonNullable<FormContent['behavior']>>){const next=upgradeZeroForm(content) as FormContent;next.behavior={...next.behavior,...patch};commit(next);}
 function control(p:Property,temporary?:Record<string,FormStyleValue>,setTemporary?:(value:Record<string,FormStyleValue>)=>void){
  const value=temporary?.[p.key]??values[p.key],set=(v:FormStyleValue)=>setTemporary?setTemporary({...temporary,[p.key]:v}):change({[p.key]:v});
  const property=p.key==='fieldGap'&&values.orientation==='horizontal'?{...p,label:'Правий відступ полів'}:p;
  const input=p.kind==='number'?<StyleNumber property={property} value={Number(value)} onChange={set}/>:p.kind==='select'?<Select label={p.label} value={String(value)} options={p.options!.map(([value,label])=>({value,label}))} onValueChange={set}/>:p.kind==='boolean'?<Switch label={p.label} checked={!!value} onCheckedChange={set}/>:p.kind==='color'?<ColorInput {...(!temporary?colorInteraction:{})} label={p.label} value={String(value)||'#000000'} onValueChange={set}/>:null;
  const layer=device==='mobile'&&p.responsive?'mobile':'base',own=content.design?.[layer]?.[p.key]!==undefined;
  return <div className="ui-form-style-control" key={p.key}>{input}{!temporary&&own?<IconButton label={`Скинути: ${p.label}`} variant="ghost" size="sm" icon={<RotateCcw size={15}/>} onClick={()=>change({[p.key]:undefined})}/>:null}</div>;
 }
 function icon(prefix:string){const value:ButtonIconValue={kind:values[prefix+'Kind'] as ButtonIconValue['kind'],glyph:String(values[prefix+'Glyph']),emoji:String(values[prefix+'Emoji']),resourceId:String(values[prefix+'ResourceId'])};return <ButtonIconPicker label={prefix==='buttonIcon'?'Іконка кнопки':'Іконка при наведенні'} value={value} disabled={busy} onUpload={onUploadMedia} onBusyChange={value=>{setBusy(value);onBusyChange?.(value);}} onChange={(value,asyncResult)=>{const patch=Object.fromEntries(Object.entries(value).map(([key,value])=>[prefix+key[0].toUpperCase()+key.slice(1),value]));return commit(updateZeroDesign(content,device,patch),asyncResult?content:undefined);}}/>;}
 function shadowButton(prefix:string){return <Button variant="secondary" onClick={()=>setShadow({prefix,values:{}})}>{prefix==='button'?'Тінь кнопки':'Тінь при наведенні'}</Button>;}

 function renderSection(page:string){const selected=groups.find(group=>group.name===page),buttonProperties=selected?.properties.filter(p=>p.group==='Кнопка')||[];return <div className="ui-form-style-properties" inert={busy||undefined}>
   {page==='Винагорода'?<FormRewardEditor content={content} onChange={commit} onUploadFile={onUploadFile}/>:page==='Покрокова форма'?<FormFlowStyleEditor content={content} device={device} onChange={commit} colorInteraction={colorInteraction}/>:page==='Поведінка й повідомлення'?<>
    <Field label="Назва форми" hint="Внутрішня назва форми."><TextInput value={content.behavior?.name||''} maxLength={100} onChange={event=>behavior({name:event.target.value})}/></Field>
    {!content.flow?<><RichTextEditor label="Повідомлення успішного надсилання" presentation="dialog" value={content.behavior?.success||richTextFromPlain('Дякуємо! Заявку надіслано.')} maxLength={2000} onChange={success=>behavior({success})}/>
    <Field label="URL після успішного надсилання" hint="Адреса http(s), шлях або якір." error={content.behavior?.successUrl&&!safeSuccessUrl(content.behavior.successUrl)?'Перевірте адресу':undefined}><TextInput value={content.behavior?.successUrl||''} maxLength={2048} onChange={event=>behavior({successUrl:event.target.value})}/></Field></>:<p className="ui-form-style-inherit">Після заповнення відкривається налаштована винагорода.</p>}
    <RichTextEditor label="Текст під формою" presentation="dialog" value={content.behavior?.footer||richTextFromPlain('')} onChange={footer=>behavior({footer})}/>
    <h4>Тексти помилок</h4>{([['required','Обов’язкове поле'],['email','Некоректний email'],['phone','Некоректний телефон'],['name','Некоректне ім’я']] as const).map(([key,label])=><Field key={key} label={label}><TextInput value={content.behavior?.errors?.[key]||''} maxLength={300} onChange={event=>behavior({errors:{...content.behavior?.errors,[key]:event.target.value}})}/></Field>)}
   </>:page==='Кнопка'?<>
    {device==='desktop'?<><Field label="Текст кнопки надсилання"><TextInput value={content.submitText} maxLength={200} onChange={event=>commit({...content,submitText:event.target.value})}/></Field>{icon('buttonIcon')}{values.buttonIconKind!=='none'?['buttonIconPosition','buttonIconSize','buttonIconGap','buttonIconAnimation'].map(key=>control(ZERO_FORM_PROPERTY_MAP[key])):null}</>:null}
    {buttonProperties.filter(p=>!(values.orientation==='horizontal'&&['buttonAlign','buttonStretch','buttonGap'].includes(p.key))&&!(values.buttonStretch&&p.key==='buttonWidth')).map(p=>control(p))}
    {shadowButton('button')}<section className="ui-form-style-section"><h4>При наведенні</h4>{selected?.properties.filter(p=>p.group==='Наведення кнопки').map(p=>control(p))}{device==='desktop'?icon('hoverIcon'):null}{shadowButton('hover')}</section>
   </>:selected?.properties.map(p=>control(p))}
  </div>;}
 return <div className="ui-form-style-editor" role="region" aria-label="Оформлення форми">
  <SearchInput aria-label="Знайти налаштування форми" value={query} onChange={event=>setQuery(event.target.value)}/>
  {content.flow&&onStepViewChange?<Select label="Крок на полотні" value={String(stepView==='success'?stepView:Math.min(stepView,content.flow.steps.length-1))} options={[...content.flow.steps.map((s,i)=>({value:String(i),label:`${i+1}. ${s.title}`})),{value:'success',label:'Екран винагороди'}]} onValueChange={v=>onStepViewChange(v==='success'?'success':Number(v))}/>:null}
  <div className="ui-form-style-properties" role="group" aria-label="Розділи стилів форми"><Accordion multiple items={groups.map(group=>({value:group.name,title:group.name,content:renderSection(group.name)}))}/>{!groups.length?<p className="ui-form-style-inherit">Нічого не знайдено.</p>:null}</div>
  {busy?<p role="status" className="ui-form-style-inherit">Завантаження іконки…</p>:null}{error?<p role="alert" className="ui-form-builder-error">{error}</p>:null}
  <Dialog open={!!shadow} onOpenChange={open=>{if(!open)setShadow(null);}} title={shadow?.prefix==='button'?'Тінь кнопки':'Тінь при наведенні'} footer={<><Button variant="secondary" onClick={()=>setShadow(null)}>Скасувати</Button><Button onClick={()=>{if(shadow)change(shadow.values);setShadow(null);}}>Застосувати</Button></>}>
   {shadow?<div className="ui-form-style-properties">{['Color','Opacity','X','Y','Blur','Spread'].map(suffix=>ZERO_FORM_PROPERTY_MAP[shadow.prefix+'Shadow'+suffix] as Property).filter(p=>device!=='mobile'||p.responsive).map(p=>control(p,shadow.values,values=>setShadow({...shadow,values})))}</div>:null}
  </Dialog>
 </div>;
}
