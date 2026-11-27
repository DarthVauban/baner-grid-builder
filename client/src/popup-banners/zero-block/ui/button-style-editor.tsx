'use client';
import {useState} from 'react';
import {ChevronRight,FlipHorizontal2,FlipVertical2,Plus,RotateCcw,Trash2} from 'lucide-react';
import {Accordion,Button,ColorInput,Dialog,IconButton,SearchInput,Select,Switch} from './components';
import {ButtonIconPicker,type ButtonIconValue} from './button-icon-picker';
import {ShapeNumber,type ShapeColorInteraction} from './shape-fill-editor';
import {StyleEdgeInput} from './style-edge-input';
import {TEXT_WEIGHT_OPTIONS} from './text-style-editor';
import {RICH_FONTS} from '@zero/rich-text.mjs';
import {BUTTON_FITS,BUTTON_GROUPS,BUTTON_ICON_EFFECTS,buttonData,buttonValues,updateButtonStyle} from '@zero/button.mjs';
import type {ButtonContent,ButtonStyles} from '@zero/button-types';
import type {ShapeShadow} from '@zero/shape-types';
import './text-editor.css';
type Props={content:ButtonContent;device:'desktop'|'mobile';fallback?:Record<string,unknown>;onChange:(content:ButtonContent,expected?:ButtonContent)=>string|void;onUploadMedia?:(file:File)=>Promise<string>;colorInteraction?:ShapeColorInteraction;disabled?:boolean};
const sides=['top','right','bottom','left'] as const,corners=['topLeft','topRight','bottomRight','bottomLeft'] as const;
export function ButtonStyleEditor({content,device,fallback,onChange,onUploadMedia,colorInteraction,disabled=false}:Props){
 const [query,setQuery]=useState(''),[variable,setVariable]=useState(false),[error,setError]=useState(''),[shadow,setShadow]=useState<{index:number;value:ShapeShadow}|null>(null);
 const v=buttonValues(content,device,fallback) as ButtonStyles,own=buttonData(content)[device==='mobile'?'mobile':'base']||{};
 function style(patch:Partial<{[K in keyof ButtonStyles]:ButtonStyles[K]|undefined}>,expected=false){try{const failure=onChange(updateButtonStyle(content,device,patch),expected?content:undefined);setError(failure||'');return failure;}catch(failure){const message=failure instanceof Error?failure.message:'Перевірте значення';setError(message);return message;}}
 function reset(key:keyof ButtonStyles,label:string){return own[key]!==undefined?<IconButton label={`Скинути: ${label}`} variant="ghost" size="sm" icon={<RotateCcw size={15}/>} onClick={()=>style({[key]:undefined})}/>:null;}
 const groups=(BUTTON_GROUPS as string[]).filter(name=>name.toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk')));
 function renderSection(page:string){return <div className="ui-text-stack">
   {page==='Типографіка'?<>
    <Select label="Шрифт кнопки" value={v.fontFamily} options={RICH_FONTS.filter(name=>name!=='inherit').map(value=>({value,label:value}))} onValueChange={fontFamily=>style({fontFamily})}/>{reset('fontFamily','Шрифт')}
    <p className="ui-text-hint">Roboto, Montserrat та Inter постачаються з платформою. Інші сімейства використовують встановлений шрифт або системний запасний варіант.</p>
    <ShapeNumber label="Розмір шрифту кнопки, px" value={v.fontSize} min={8} max={300} onChange={fontSize=>style({fontSize})}/>{reset('fontSize','Розмір шрифту')}
    <Select label="Насиченість шрифту кнопки" value={variable||v.fontWeight%100!==0?'variable':String(v.fontWeight)} options={[...TEXT_WEIGHT_OPTIONS,{value:'variable',label:'Змінна насиченість'}]} onValueChange={value=>{setVariable(value==='variable');if(value!=='variable')style({fontWeight:Number(value)});}}/>{reset('fontWeight','Насиченість')}
    {variable||v.fontWeight%100!==0?<ShapeNumber label="Змінна насиченість кнопки" value={v.fontWeight} min={100} max={900} onChange={fontWeight=>style({fontWeight:Math.round(fontWeight)})}/>:null}
    <ColorInput {...colorInteraction} label="Колір підпису кнопки" value={v.color} onValueChange={color=>style({color})}/>{reset('color','Колір підпису')}
    <Select label="Вирівнювання підпису" value={v.align} options={[['left','Ліворуч'],['center','По центру'],['right','Праворуч']].map(([value,label])=>({value,label}))} onValueChange={align=>style({align:align as ButtonStyles['align']})}/>{reset('align','Вирівнювання')}
    <div className="ui-text-grid"><ShapeNumber label="Міжрядковий інтервал кнопки" value={v.lineHeight} min={.5} max={500} step={.05} onChange={lineHeight=>style({lineHeight})}/><Select label="Одиниці міжрядкового інтервалу кнопки" value={v.lineHeightUnit} options={[{value:'em',label:'Множник'},{value:'px',label:'px'}]} onValueChange={value=>style({lineHeightUnit:value as 'em'|'px',lineHeight:value==='px'?Math.min(500,v.lineHeight*v.fontSize):Math.max(.5,v.lineHeight/v.fontSize)})}/></div>{reset('lineHeight','Міжрядковий інтервал')}
    <ShapeNumber label="Міжбуквений інтервал кнопки, px" value={v.letterSpacing} min={-10} max={100} step={.1} onChange={letterSpacing=>style({letterSpacing})}/>{reset('letterSpacing','Міжбуквений інтервал')}
    <Select label="Регістр підпису" value={v.letterCase} options={[['none','Без змін'],['uppercase','ВЕЛИКІ'],['capitalize','Кожне Слово'],['lowercase','малі']].map(([value,label])=>({value,label}))} onValueChange={letterCase=>style({letterCase:letterCase as ButtonStyles['letterCase']})}/>{reset('letterCase','Регістр')}
   </>:null}
   {page==='Розмір і розміщення'?<>
    <Select label="Режим розміру кнопки" value={v.fit} options={BUTTON_FITS.map(([value,label]:string[])=>({value,label}))} onValueChange={fit=>style({fit:fit as ButtonStyles['fit']})}/>{reset('fit','Режим розміру')}
    <p className="ui-text-hint">Автоматичні розміри враховують підпис, іконку, контур і відступи. Фіксований розмір обрізає вміст, один рядок — скорочує підпис багатокрапкою.</p>
    <ShapeNumber label="Непрозорість кнопки, %" value={v.opacity} max={100} onChange={opacity=>style({opacity})}/>{reset('opacity','Непрозорість')}
    <ShapeNumber label="Поворот кнопки, °" value={v.rotation} min={-360} max={360} onChange={rotation=>style({rotation})}/>{reset('rotation','Поворот')}
    <Button variant="secondary" aria-pressed={v.flipX} icon={<FlipHorizontal2 size={17}/>} onClick={()=>style({flipX:!v.flipX})}>Віддзеркалити кнопку по X</Button>{reset('flipX','Віддзеркалення по X')}
    <Button variant="secondary" aria-pressed={v.flipY} icon={<FlipVertical2 size={17}/>} onClick={()=>style({flipY:!v.flipY})}>Віддзеркалити кнопку по Y</Button>{reset('flipY','Віддзеркалення по Y')}
   </>:null}
   {page==='Фон і відступи'?<>
    <ColorInput {...colorInteraction} label="Колір фону кнопки" value={v.background} onValueChange={background=>style({background})}/>{reset('background','Колір фону')}
    <StyleEdgeInput label="Відступ кнопки, px" values={sides.map(key=>v.padding[key])} max={500} onChange={values=>style({padding:Object.fromEntries(sides.map((key,index)=>[key,values[index]??0])) as ButtonStyles['padding']})}/>{reset('padding','Відступи')}
    <StyleEdgeInput corners label="Кути кнопки, px" values={corners.map(key=>v.corners[key])} max={999} onChange={values=>style({corners:Object.fromEntries(corners.map((key,index)=>[key,values[index]??0])) as ButtonStyles['corners']})}/>{reset('corners','Кути')}
   </>:null}
   {page==='Іконка'?<>
    {(['icon','hoverIcon'] as const).map(key=><div className="ui-text-stack" key={key}><ButtonIconPicker allowSvg label={key==='icon'?'Іконка кнопки':'Іконка при наведенні'} value={v[key]} onUpload={onUploadMedia} onChange={(value:ButtonIconValue,expected)=>style({[key]:value},expected)}/>{reset(key,key==='icon'?'Іконка':'Іконка при наведенні')}</div>)}
    <p className="ui-text-hint">Якщо окрема іконка наведення не задана, зберігається основна. Іконки не змінюють дію кнопки.</p>
    <Select label="Позиція іконки кнопки" value={v.iconPosition} options={[{value:'before',label:'Зліва'},{value:'after',label:'Справа'}]} onValueChange={value=>style({iconPosition:value as 'before'|'after'})}/>{reset('iconPosition','Позиція іконки')}
    <ShapeNumber label="Розмір іконки кнопки, px" value={v.iconSize} min={8} max={120} onChange={iconSize=>style({iconSize})}/>{reset('iconSize','Розмір іконки')}
    <ShapeNumber label="Відступ іконки від підпису, px" value={v.iconGap} max={120} onChange={iconGap=>style({iconGap})}/>{reset('iconGap','Відступ іконки')}
    {[v.icon.kind,v.hoverIcon.kind].some(kind=>['glyph','icon'].includes(kind))?<><Select label="Накреслення іконки" value={v.iconWeight} options={[['light','Легке'],['regular','Звичайне'],['semibold','Напівжирне'],['bold','Жирне']].map(([value,label])=>({value,label}))} onValueChange={value=>style({iconWeight:value as ButtonStyles['iconWeight']})}/>{reset('iconWeight','Накреслення іконки')}</>:null}
    <Select label="Ефект іконки при наведенні" value={v.iconAnimation} options={BUTTON_ICON_EFFECTS.map(([value,label]:string[])=>({value,label}))} onValueChange={iconAnimation=>style({iconAnimation})}/>{reset('iconAnimation','Ефект іконки')}
   </>:null}
   {page==='Контур'?<>
    <ColorInput {...colorInteraction} label="Колір контуру кнопки" value={v.border.color} onValueChange={color=>style({border:{...v.border,color}})}/>
    <Select label="Стиль контуру кнопки" value={v.border.style} options={[['solid','Суцільний'],['dotted','Крапки'],['dashed','Штрихи'],['none','Без контуру']].map(([value,label])=>({value,label}))} onValueChange={value=>style({border:{...v.border,style:value as ButtonStyles['border']['style']}})}/>
    {v.border.style!=='none'?<StyleEdgeInput label="Контур кнопки, px" max={100} values={sides.map(key=>v.border.widths[key])} onChange={values=>style({border:{...v.border,widths:Object.fromEntries(sides.map((key,index)=>[key,values[index]??0])) as ButtonStyles['border']['widths']}})}/>:null}{reset('border','Контур')}
   </>:null}
   {page==='Тіні'?<>
    {v.shadows.map((value,index)=><div className="ui-text-row" key={index}><Button variant="secondary" layout="navigation" icon={<ChevronRight size={16}/>} onClick={()=>setShadow({index,value})}>Тінь {index+1}</Button><IconButton label={`Видалити тінь кнопки ${index+1}`} icon={<Trash2 size={16}/>} variant="ghost" onClick={()=>style({shadows:v.shadows.filter((_,at)=>at!==index)})}/></div>)}
    <Button variant="secondary" icon={<Plus size={16}/>} disabled={v.shadows.length>=8} onClick={()=>setShadow({index:v.shadows.length,value:{color:'#25231F',opacity:25,x:0,y:4,blur:12,spread:0}})}>Додати тінь кнопки</Button>{reset('shadows','Тіні')}
   </>:null}
   {page==='Наведення'?<>
    {([['hoverBackground','Власний фон при наведенні','Колір фону при наведенні',v.background],['hoverColor','Власний колір підпису при наведенні','Колір підпису при наведенні',v.color],['hoverBorderColor','Власний контур при наведенні','Колір контуру при наведенні',v.border.color]] as const).map(([key,label,colorLabel,fallback])=><div className="ui-text-stack" key={key}><Switch label={label} checked={!!v[key]} onCheckedChange={checked=>style({[key]:checked?fallback:''})}/>{v[key]?<ColorInput {...colorInteraction} label={colorLabel} value={v[key]} onValueChange={value=>style({[key]:value})}/>:null}{reset(key,colorLabel)}</div>)}
    <ShapeNumber label="Тривалість наведення, с" value={v.hoverDuration} max={10} step={.05} onChange={hoverDuration=>style({hoverDuration})}/>{reset('hoverDuration','Тривалість наведення')}
    <p className="ui-text-hint">Наведення також доступне з клавіатурним фокусом у перегляді й на вітрині. Системне зменшення руху вимикає переходи та рух іконки.</p>
   </>:null}
  </div>;}
 return <fieldset className="ui-button-style-fields" disabled={disabled}><div className="ui-text-stack" role="region" aria-label="Оформлення кнопки">
  <SearchInput aria-label="Знайти налаштування кнопки" value={query} onChange={event=>setQuery(event.target.value)}/>
  <div className="ui-text-stack" role="group" aria-label="Розділи стилів кнопки"><Accordion multiple items={groups.map(name=>({value:name,title:name,content:renderSection(name)}))}/>{!groups.length?<p className="ui-text-hint">Нічого не знайдено.</p>:null}</div>
  {error?<p role="alert" className="ui-text-error">{error}</p>:null}
  <Dialog open={!!shadow} onOpenChange={open=>{if(!open)setShadow(null);}} title="Тінь кнопки" footer={<><Button variant="secondary" onClick={()=>setShadow(null)}>Скасувати</Button><Button onClick={()=>{if(shadow){const list=[...v.shadows];list[shadow.index]=shadow.value;if(!style({shadows:list}))setShadow(null);}}}>Застосувати</Button></>}>
   {shadow?<div className="ui-text-stack"><ColorInput label="Колір тіні кнопки" value={shadow.value.color} onValueChange={color=>setShadow({...shadow,value:{...shadow.value,color}})}/>{([['opacity','Непрозорість тіні, %',0,100],['x','Зміщення X',-300,300],['y','Зміщення Y',-300,300],['blur','Розмиття',0,300],['spread','Поширення',-200,200]] as const).map(([key,label,min,max])=><ShapeNumber key={key} label={label} min={min} max={max} value={shadow.value[key]} onChange={value=>setShadow({...shadow,value:{...shadow.value,[key]:value}})}/>)}</div>:null}
  </Dialog>
 </div></fieldset>;
}
