'use client';
import {useState,type ReactNode} from 'react';
import {ChevronRight,FlipHorizontal2,FlipVertical2,Plus,RotateCcw,Trash2} from 'lucide-react';
import {Accordion,Button,ColorInput,Dialog,IconButton,SearchInput,Select,Switch} from './components';
import {ShapeNumber,type ShapeColorInteraction} from './shape-fill-editor';
import {StyleEdgeInput} from './style-edge-input';
import {RICH_FONTS} from '@zero/rich-text.mjs';
import {TEXT_FITS,textData,textGroups,textValues,updateTextGlobal,updateTextStyle} from '@zero/text.mjs';
import type {TextContent,TextStyles} from '@zero/text-types';
import type {ShapeShadow} from '@zero/shape-types';
import './text-editor.css';
import './form-style-editor.css';

type Props={content:TextContent;device:'desktop'|'mobile';fallback?:Record<string,unknown>;onChange:(content:TextContent)=>string|void;colorInteraction?:ShapeColorInteraction;linkSettings?:ReactNode;hasAction?:boolean};
const sides=['top','right','bottom','left'] as const,corners=['topLeft','topRight','bottomRight','bottomLeft'] as const;
const weights=[['100','Тонкий'],['200','Дуже легкий'],['300','Легкий'],['400','Звичайний'],['500','Середній'],['600','Напівжирний'],['700','Жирний'],['800','Дуже жирний'],['900','Чорний']].map(([value,label])=>({value,label:`${label} · ${value}`}));
export const TEXT_WEIGHT_OPTIONS=weights;
export function TextStyleEditor({content,device,fallback,onChange,colorInteraction,linkSettings,hasAction}:Props){
 const [query,setQuery]=useState(''),[variable,setVariable]=useState(false),[error,setError]=useState(''),[shadow,setShadow]=useState<{key:'shadows'|'textShadows';index:number;value:ShapeShadow}|null>(null);
 const v=textValues(content,device,fallback) as TextStyles,own=textData(content)[device==='mobile'?'mobile':'base']||{};
 function style(patch:Partial<{[K in keyof TextStyles]:TextStyles[K]|undefined}>){try{setError(onChange(updateTextStyle(content,device,patch))||'');}catch(e){setError(e instanceof Error?e.message:'Перевірте значення');}}
 function reset(key:keyof TextStyles,label:string){return own[key]!==undefined?<IconButton label={`Скинути: ${label}`} variant="ghost" size="sm" icon={<RotateCcw size={15}/>} onClick={()=>style({[key]:undefined})}/>:null;}
 function control(key:keyof TextStyles,label:string,child:ReactNode){return <div className="ui-text-control">{child}{reset(key,label)}</div>;}
 function shadows(key:'shadows'|'textShadows',label:string){return <section className="ui-text-stack"><div className="ui-text-row"><h4>{label}</h4>{reset(key,label)}</div>{v[key].map((value,index)=><div className="ui-text-row" key={index}><Button variant="secondary" layout="navigation" icon={<ChevronRight size={16}/>} onClick={()=>setShadow({key,index,value})}>Тінь {index+1}</Button><IconButton label={`Видалити: ${label} ${index+1}`} icon={<Trash2 size={16}/>} variant="ghost" onClick={()=>style({[key]:v[key].filter((_,at)=>at!==index)})}/></div>)}<Button variant="secondary" icon={<Plus size={16}/>} disabled={v[key].length>=8} onClick={()=>setShadow({key,index:v[key].length,value:{color:'#25231F',opacity:25,x:0,y:4,blur:12,spread:0}})}>Додати {key==='textShadows'?'тінь літер':'зовнішню тінь'}</Button></section>;}
 const groups=(textGroups(device) as string[]).filter(name=>name.toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk')));
 function renderSection(page:string){return <div className="ui-text-stack">
   {page==='Типографіка'?<>
    {control('fontFamily','Шрифт',<Select label="Шрифт" value={v.fontFamily} options={RICH_FONTS.filter(name=>name!=='inherit').map(value=>({value,label:value}))} onValueChange={fontFamily=>style({fontFamily})}/>)}<p className="ui-text-hint">Roboto, Montserrat та Inter постачаються з платформою. Для решти сімейств, якщо шрифт не встановлено, використовується системний запасний варіант.</p>
    {control('fontSize','Розмір шрифту',<ShapeNumber label="Розмір шрифту, px" value={v.fontSize} min={8} max={300} onChange={fontSize=>style({fontSize})}/>)}
    {control('fontWeight','Насиченість',<Select label="Насиченість шрифту" value={variable||v.fontWeight%100!==0?'variable':String(v.fontWeight)} options={[...weights,{value:'variable',label:'Змінна насиченість'}]} onValueChange={value=>{setVariable(value==='variable');if(value!=='variable')style({fontWeight:Number(value)});}}/>)}
    {variable||v.fontWeight%100!==0?<ShapeNumber label="Змінна насиченість" value={v.fontWeight} min={100} max={900} onChange={fontWeight=>style({fontWeight:Math.round(fontWeight)})}/>:null}
    {control('color','Колір тексту',<ColorInput {...colorInteraction} label="Колір тексту" value={v.color} onValueChange={color=>style({color})}/>)}
    {control('align','Вирівнювання',<Select label="Вирівнювання тексту" value={v.align} options={[['left','Ліворуч'],['center','По центру'],['right','Праворуч'],['justify','По ширині']].map(([value,label])=>({value,label}))} onValueChange={value=>style({align:value as TextStyles['align']})}/>)}
    <div className="ui-text-grid">{control('lineHeight','Міжрядковий інтервал',<ShapeNumber label="Міжрядковий інтервал" value={v.lineHeight} min={.5} max={500} step={.05} onChange={lineHeight=>style({lineHeight})}/>)}<Select label="Одиниці міжрядкового інтервалу" value={v.lineHeightUnit} options={[{value:'em',label:'Множник'},{value:'px',label:'px'}]} onValueChange={value=>style({lineHeightUnit:value as TextStyles['lineHeightUnit'],lineHeight:value==='px'?Math.min(500,v.lineHeight*v.fontSize):Math.max(.5,v.lineHeight/v.fontSize)})}/></div>
    {control('letterSpacing','Міжбуквений інтервал',<ShapeNumber label="Міжбуквений інтервал, px" value={v.letterSpacing} min={-10} max={100} step={.1} onChange={letterSpacing=>style({letterSpacing})}/>)}
    {control('letterCase','Регістр',<Select label="Регістр літер" value={v.letterCase} options={[['none','Без змін'],['uppercase','ВЕЛИКІ'],['capitalize','Кожне Слово'],['lowercase','малі']].map(([value,label])=>({value,label}))} onValueChange={value=>style({letterCase:value as TextStyles['letterCase']})}/>)}
   </>:null}
   {page==='Розмір і розміщення'?<>
    {control('fit','Режим розміру',<Select label="Режим розміру тексту" value={v.fit} options={TEXT_FITS.map(([value,label]:string[])=>({value,label}))} onValueChange={value=>style({fit:value as TextStyles['fit']})}/>)}
    <p className="ui-text-hint">Автоматичні розміри визначає вміст. Режим «Один рядок» скорочує текст багатокрапкою.</p>
    {v.fit==='fixed'?control('verticalAlign','Вертикальне вирівнювання',<Select label="Вертикальне вирівнювання" value={v.verticalAlign} options={[['top','Зверху'],['middle','Посередині'],['bottom','Знизу']].map(([value,label])=>({value,label}))} onValueChange={value=>style({verticalAlign:value as TextStyles['verticalAlign']})}/>):null}
    {control('opacity','Непрозорість',<ShapeNumber label="Непрозорість, %" value={v.opacity} max={100} onChange={opacity=>style({opacity})}/>)}
    {control('rotation','Поворот',<ShapeNumber label="Поворот, °" value={v.rotation} min={-360} max={360} onChange={rotation=>style({rotation})}/>)}
    <div className="ui-text-row"><Button variant="secondary" aria-pressed={v.flipX} icon={<FlipHorizontal2 size={17}/>} onClick={()=>style({flipX:!v.flipX})}>Віддзеркалити по X</Button>{reset('flipX','Віддзеркалення по X')}<Button variant="secondary" aria-pressed={v.flipY} icon={<FlipVertical2 size={17}/>} onClick={()=>style({flipY:!v.flipY})}>Віддзеркалити по Y</Button>{reset('flipY','Віддзеркалення по Y')}</div>
   </>:null}
   {page==='Оформлення літер'?<>
    {shadows('textShadows','Тіні літер')}
    {control('stroke','Обведення літер',<ShapeNumber label="Товщина обведення літер, px" value={v.stroke.width} max={10} step={.1} onChange={width=>style({stroke:{...v.stroke,width}})}/>)}{v.stroke.width?<ColorInput {...colorInteraction} label="Колір обведення літер" value={v.stroke.color} onValueChange={color=>style({stroke:{...v.stroke,color}})}/>:null}
    {control('truncate','Обмеження тексту',<Select label="Обмеження тексту" value={v.truncate.type} options={[['none','Без обмеження'],['lines','Рядки'],['characters','Символи']].map(([value,label])=>({value,label}))} onValueChange={value=>style({truncate:{type:value as TextStyles['truncate']['type'],value:value==='characters'?100:1}})}/>)}
    {v.truncate.type!=='none'?<ShapeNumber label={v.truncate.type==='lines'?'Кількість рядків':'Кількість символів'} value={v.truncate.value} min={1} max={5000} onChange={value=>style({truncate:{...v.truncate,value:Math.round(value)}})}/>:null}
   </>:null}
   {page==='Фон і відступи'?<>
    {control('background','Колір фону',<ColorInput {...colorInteraction} label="Колір фону тексту" value={v.background} onValueChange={background=>style({background})}/>)}
    <StyleEdgeInput label="Відступ, px" values={sides.map(key=>v.padding[key])} max={500} onChange={values=>style({padding:Object.fromEntries(sides.map((key,i)=>[key,values[i]??0])) as TextStyles['padding']})}/>{reset('padding','Відступи')}
    <StyleEdgeInput corners label="Кути, px" values={corners.map(key=>v.corners[key])} max={999} onChange={values=>style({corners:Object.fromEntries(corners.map((key,i)=>[key,values[i]??0])) as TextStyles['corners']})}/>{reset('corners','Кути')}
   </>:null}
   {page==='Контур'?<>
    <p className="ui-text-hint">Контур стосується контейнера. Обведення літер налаштовується окремо.</p>{reset('border','Контур')}
    <ColorInput {...colorInteraction} label="Колір контуру" value={v.border.color} onValueChange={color=>style({border:{...v.border,color}})}/>
    <Select label="Стиль контуру" value={v.border.style} options={[['solid','Суцільний'],['dotted','Крапки'],['dashed','Штрихи'],['none','Без контуру']].map(([value,label])=>({value,label}))} onValueChange={value=>style({border:{...v.border,style:value as TextStyles['border']['style']}})}/>
    {v.border.style!=='none'?<StyleEdgeInput label="Контур, px" max={100} values={sides.map(key=>v.border.widths[key])} onChange={values=>style({border:{...v.border,widths:Object.fromEntries(sides.map((key,i)=>[key,values[i]??0])) as TextStyles['border']['widths']}})}/>:null}
   </>:null}
   {page==='Тіні'?shadows('shadows','Зовнішні тіні'):null}
   {page==='Посилання'?<>{linkSettings}{hasAction?<Switch label="Не передавати вагу посилання (nofollow)" checked={content.typography?.nofollow||false} onCheckedChange={nofollow=>{try{setError(onChange(updateTextGlobal(content,{nofollow}))||'');}catch(e){setError(String(e));}}}/>:null}<p className="ui-text-hint">Посилання окремих фрагментів доступні під час редагування декоративного тексту.</p></>:null}
  </div>;}
 return <div className="ui-text-stack" role="region" aria-label="Оформлення тексту">
  <SearchInput aria-label="Знайти налаштування тексту" value={query} onChange={e=>setQuery(e.target.value)}/>
  <div className="ui-text-stack" role="group" aria-label="Розділи стилів тексту"><Accordion multiple items={groups.map(name=>({value:name,title:name,content:renderSection(name)}))}/>{!groups.length?<p className="ui-text-hint">Нічого не знайдено.</p>:null}</div>
  {error?<p role="alert" className="ui-text-error">{error}</p>:null}
  <Dialog open={!!shadow} onOpenChange={open=>{if(!open)setShadow(null);}} title={shadow?.key==='textShadows'?'Тінь літер':'Зовнішня тінь тексту'} footer={<><Button variant="secondary" onClick={()=>setShadow(null)}>Скасувати</Button><Button onClick={()=>{if(shadow){const list=[...v[shadow.key]];list[shadow.index]=shadow.value;style({[shadow.key]:list});}setShadow(null);}}>Застосувати</Button></>}>
   {shadow?<div className="ui-text-stack"><ColorInput label="Колір тіні" value={shadow.value.color} onValueChange={color=>setShadow({...shadow,value:{...shadow.value,color}})}/>{([['opacity','Непрозорість тіні, %',0,100],['x','Зміщення X',-300,300],['y','Зміщення Y',-300,300],['blur','Розмиття',0,300],...(shadow.key==='shadows'?[['spread','Поширення',-200,200]]:[])] as [keyof ShapeShadow,string,number,number][]).map(([key,label,min,max])=><ShapeNumber key={key} label={label} min={min} max={max} value={Number(shadow.value[key])} onChange={n=>setShadow({...shadow,value:{...shadow.value,[key]:n}})}/>)}</div>:null}
  </Dialog>
 </div>;
}
