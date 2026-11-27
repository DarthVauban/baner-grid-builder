'use client';
import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {ChevronRight,FlipHorizontal2,FlipVertical2,Plus,RotateCcw,Trash2} from 'lucide-react';
import {Accordion,Button,ColorInput,Dialog,Field,IconButton,SearchInput,Select,Switch,TextInput} from './components';
import {FileInput} from './file-input';
import {ImageCropEditor} from './image-crop-editor';
import {ShapeFillEditor,ShapeNumber,type ShapeColorInteraction} from './shape-fill-editor';
import {SHAPE_IMAGE_POSITIONS,SHAPE_KINDS,shapeData,shapeGroups,shapeImage,shapeLink,shapeValues,updateShapeGlobal,updateShapeStyle} from '@zero/shape.mjs';
import type {ShapeContent,ShapeImage,ShapeImagePosition,ShapeLink,ShapeShadow,ShapeStyles} from '@zero/shape-types';
import './shape-style-editor.css';

type Props={content:ShapeContent;device:'desktop'|'mobile';onChange:(value:ShapeContent,expected?:ShapeContent)=>string|void;fallback?:{background?:string;radius?:number};size:{width:number;height:number};colorInteraction?:ShapeColorInteraction;onUploadMedia?:(file:File)=>Promise<string>;linkSettings?:ReactNode;hasLink?:boolean};
const defaultShadow=():ShapeShadow=>({color:'#25231F',opacity:20,x:0,y:12,blur:30,spread:-8});
const sideLabels=[['top','Верхня сторона'],['right','Права сторона'],['bottom','Нижня сторона'],['left','Ліва сторона']] as const;
export function ShapeStyleEditor({content,device,onChange,fallback,size,colorInteraction,onUploadMedia,linkSettings,hasLink=false}:Props){
 const [query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[crop,setCrop]=useState(false),[customSides,setCustomSides]=useState(false),[shadow,setShadow]=useState<{key:'shadows'|'hoverShadows';index:number;value:ShapeShadow}|null>(null);
 const alive=useRef(true);
 useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const config=shapeData(content),values=shapeValues(content,device,fallback) as ShapeStyles,image=shapeImage(content) as ShapeImage,link=shapeLink(content) as ShapeLink;
 const groups=(shapeGroups(content,device) as string[]).filter(name=>name.toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk')));
 function commit(next:ShapeContent,expected?:ShapeContent){const failure=onChange(next,expected);setError(failure||'');}
 function style(patch:Partial<{[K in keyof ShapeStyles]:ShapeStyles[K]|undefined}>){try{commit(updateShapeStyle(content,device,patch));}catch(e){setError(e instanceof Error?e.message:'Перевірте значення');}}
 function global(patch:Partial<NonNullable<ShapeContent['shape']>>){try{commit(updateShapeGlobal(content,patch));}catch(e){setError(e instanceof Error?e.message:'Перевірте значення');}}
 function imagePatch(patch:Partial<ShapeImage>){global({image:{...image,...patch}});}
 function linkPatch(patch:Partial<ShapeLink>){global({link:{...link,...patch}});}
 async function upload(file:File|null){if(!file||!onUploadMedia)return;const expected=content;setBusy(true);setError('');try{const id=await onUploadMedia(file);if(alive.current)commit(updateShapeGlobal(expected,{image:{...image,resourceId:id}}),expected);}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Не вдалося завантажити зображення');}finally{if(alive.current)setBusy(false);}}
 const own=config[device==='mobile'?'mobile':'base']||{};
 function reset(key:keyof ShapeStyles,label:string){return own[key]!==undefined?<IconButton label={`Скинути: ${label}`} icon={<RotateCcw size={15}/>} variant="ghost" size="sm" onClick={()=>style({[key]:undefined})}/>:null;}
 function shadowList(key:'shadows'|'hoverShadows',title:string){const list=values[key]||[];return <section className="ui-shape-section"><div className="ui-shape-row"><h4>{title}</h4>{reset(key,title)}</div>{list.map((value,index)=><div className="ui-shape-row" key={index}><Button variant="secondary" layout="navigation" icon={<ChevronRight size={16}/>} onClick={()=>setShadow({key,index,value})}>Тінь {index+1}</Button><IconButton label={`Видалити: ${title} ${index+1}`} icon={<Trash2 size={16}/>} variant="ghost" onClick={()=>style({[key]:list.filter((_,at)=>at!==index)})}/></div>)}<Button variant="secondary" icon={<Plus size={16}/>} disabled={list.length>=8} onClick={()=>setShadow({key,index:list.length,value:defaultShadow()})}>Додати тінь</Button></section>;}
 const border=values.border,widths=border.widths,nonzero=sideLabels.filter(([key])=>widths[key]>0).map(([key])=>key),same=sideLabels.every(([key])=>widths[key]===widths.top),side=customSides?'custom':same?'all':nonzero.length===1?nonzero[0]:'custom';
 const preset=values.imagePosition.xUnit==='%'&&values.imagePosition.yUnit==='%'&&values.imagePosition.fit!=='custom'?`${values.imagePosition.x} ${values.imagePosition.y}`:'custom';
 function renderSection(page:string){return <div className="ui-shape-stack" inert={busy||undefined}>
   {page==='Фігура'?<>
    {device==='desktop'?<Select label="Тип фігури" value={config.kind} options={SHAPE_KINDS.map(([value,label]:string[])=>({value,label}))} onValueChange={kind=>global({kind:kind as NonNullable<ShapeContent['shape']>['kind']})}/>:null}
    <div className="ui-shape-control"><ShapeNumber label="Непрозорість, %" value={values.opacity} max={100} onChange={opacity=>style({opacity})}/>{reset('opacity','Непрозорість')}</div>
    <div className="ui-shape-control"><ShapeNumber label="Поворот, °" value={values.rotation} min={-360} max={360} onChange={rotation=>style({rotation})}/>{reset('rotation','Поворот')}</div>
    <div className="ui-shape-row"><Button variant="secondary" aria-pressed={values.flipX} icon={<FlipHorizontal2 size={17}/>} onClick={()=>style({flipX:!values.flipX})}>Віддзеркалити по X</Button>{reset('flipX','Віддзеркалення по X')}<Button variant="secondary" aria-pressed={values.flipY} icon={<FlipVertical2 size={17}/>} onClick={()=>style({flipY:!values.flipY})}>Віддзеркалити по Y</Button>{reset('flipY','Віддзеркалення по Y')}</div>
    {config.kind!=='circle'?<section className="ui-shape-section"><div className="ui-shape-row"><h4>Заокруглення кутів</h4>{reset('corners','Заокруглення кутів')}</div><div className="ui-shape-grid">{([['topLeft','Верхній лівий'],['topRight','Верхній правий'],['bottomLeft','Нижній лівий'],['bottomRight','Нижній правий']] as const).map(([key,label])=><ShapeNumber key={key} label={label} value={values.corners[key]} max={999} onChange={value=>style({corners:{...values.corners,[key]:value}})}/>)}</div></section>:null}
   </>:null}
   {page==='Заливка'?<>{reset('fill','Заливка')}<ShapeFillEditor value={values.fill} onChange={fill=>style({fill})} colorInteraction={colorInteraction}/></>:null}
   {page==='Фонове зображення'&&config.kind!=='line'?<>
    {device==='desktop'?<FileInput label="Зображення фігури" disabled={!onUploadMedia||busy} accept="image/png,image/jpeg,image/webp" maxSizeBytes={5*1024*1024} hint="PNG, JPEG або WebP до 5 МіБ." onFileChange={upload}/>:null}
    {image.resourceId?<>
     {device==='desktop'?<><Button variant="secondary" onClick={()=>imagePatch({resourceId:null})}>Видалити зображення</Button><Field label="Опис зображення (ALT)"><TextInput value={image.alt} maxLength={300} onChange={event=>imagePatch({alt:event.target.value})}/></Field><Switch label="Збільшувати зображення при натисканні" checked={image.zoom} onCheckedChange={zoom=>imagePatch({zoom})}/><p className="ui-shape-hint">Збільшення працює для фігури без іншої дії.</p><Select label="Відкладене завантаження" value={image.lazy} options={[{value:'on',label:'Увімкнено'},{value:'no-thumbnail',label:'Увімкнено без мініатюри'},{value:'off',label:'Вимкнено'}]} onValueChange={lazy=>imagePatch({lazy:lazy as ShapeImage['lazy']})}/></>:null}
     <Select label="Положення зображення" value={SHAPE_IMAGE_POSITIONS.some(([key]:string[])=>key===preset)?preset:'custom'} options={[...SHAPE_IMAGE_POSITIONS.map(([value,label]:string[])=>({value,label})),{value:'custom',label:'Власне кадрування'}]} onValueChange={value=>{if(value==='custom'){setCrop(true);return;}const [x,y]=value.split(' ').map(Number);style({imagePosition:{...values.imagePosition,x,y,xUnit:'%',yUnit:'%',fit:values.imagePosition.fit==='custom'?'cover':values.imagePosition.fit}});}}/>
     <Button variant="secondary" onClick={()=>setCrop(true)}>Кадрувати зображення</Button>
     <Select label="Рух фону" value={values.imagePosition.attachment} options={[{value:'scroll',label:'За замовчуванням'},{value:'fixed',label:'Фіксований'}]} onValueChange={attachment=>style({imagePosition:{...values.imagePosition,attachment:attachment as ShapeImagePosition['attachment']}})}/>{reset('imagePosition','Положення зображення')}
    </>:<p className="ui-shape-hint">Додайте зображення, щоб налаштувати його положення.</p>}
   </>:null}
   {page==='Контур'?<>
    {reset('border','Контур')}<ColorInput {...colorInteraction} label="Колір контуру" value={border.color} onValueChange={color=>style({border:{...border,color}})}/>
    <Select label="Стиль контуру" value={border.style} options={[['solid','Суцільний'],['dotted','Крапки'],['dashed','Штрихи'],['none','Без контуру']].map(([value,label])=>({value,label}))} onValueChange={value=>style({border:{...border,style:value as typeof border.style}})}/>
    {border.style!=='none'?<><Select label="Сторони контуру" value={side} options={[{value:'all',label:'Усі сторони'},...sideLabels.map(([value,label])=>({value,label})),{value:'custom',label:'Кожна окремо'}]} onValueChange={side=>{setCustomSides(side==='custom');if(side==='custom')return;const width=Math.max(...Object.values(widths),1);style({border:{...border,widths:Object.fromEntries(sideLabels.map(([key])=>[key,side==='all'||key===side?width:0])) as typeof widths}});}}/>
    {same&&!customSides?<ShapeNumber label="Товщина контуру, px" value={widths.top} max={100} onChange={n=>style({border:{...border,widths:{top:n,right:n,bottom:n,left:n}}})}/>:<div className="ui-shape-grid">{sideLabels.map(([key,label])=><ShapeNumber key={key} label={`${label}, px`} value={widths[key]} max={100} onChange={n=>style({border:{...border,widths:{...widths,[key]:n}}})}/>)}</div>}</>:null}
   </>:null}
   {page==='Тіні'?<>{shadowList('shadows','Звичайні тіні')}<Switch label="Окремі тіні при наведенні" checked={values.hoverShadows!==undefined} onCheckedChange={checked=>style({hoverShadows:checked?[...values.shadows]:undefined})}/>{values.hoverShadows!==undefined?shadowList('hoverShadows','Тіні при наведенні'):null}<ShapeNumber label="Тривалість переходу, с" value={values.hoverDuration} step={.1} max={10} onChange={hoverDuration=>style({hoverDuration})}/>{reset('hoverDuration','Тривалість переходу')}</>:null}
   {page==='Посилання'&&device==='desktop'?<>
    {linkSettings}<Field label="Доступна назва фігури-кнопки"><TextInput value={content.accessibleName} maxLength={300} onChange={event=>commit({...content,accessibleName:event.target.value})}/></Field>
    {hasLink?<><Switch label="Не передавати вагу посилання (nofollow)" checked={link.nofollow} onCheckedChange={nofollow=>linkPatch({nofollow})}/><Switch label="Передавати натискання в аналітику" checked={link.track} onCheckedChange={track=>linkPatch({track})}/>{link.track?<Field label="Назва події" hint="Латинські літери, цифри та _. Почніть з літери." error={!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(link.eventName)?'Перевірте назву':undefined}><TextInput value={link.eventName} maxLength={80} onChange={event=>linkPatch({eventName:event.target.value})}/></Field>:null}</>:null}
   </>:null}
  </div>;}
 return <div className="ui-shape-stack" role="region" aria-label="Оформлення фігури">
  <SearchInput aria-label="Знайти налаштування фігури" value={query} onChange={event=>setQuery(event.target.value)}/>
  <div className="ui-shape-stack" role="group" aria-label="Розділи стилів фігури"><Accordion multiple items={groups.map(name=>({value:name,title:name,content:renderSection(name)}))}/>{!groups.length?<p className="ui-shape-hint">Нічого не знайдено.</p>:null}</div>
  {busy?<p role="status" className="ui-shape-hint">Завантаження зображення…</p>:null}{error?<p role="alert" className="ui-shape-error">{error}</p>:null}
  {image.resourceId?<ImageCropEditor open={crop} onOpenChange={setCrop} src={`/api/public/popup-banners/zero-block/media/${image.resourceId}`} size={size} value={values.imagePosition} onApply={imagePosition=>style({imagePosition})}/>:null}
  <Dialog open={!!shadow} onOpenChange={open=>{if(!open)setShadow(null);}} title={shadow?.key==='hoverShadows'?'Тінь при наведенні':'Тінь фігури'} footer={<><Button variant="secondary" onClick={()=>setShadow(null)}>Скасувати</Button><Button onClick={()=>{if(shadow){const list=[...(values[shadow.key]||[])];list[shadow.index]=shadow.value;style({[shadow.key]:list});}setShadow(null);}}>Застосувати</Button></>}>
   {shadow?<div className="ui-shape-stack"><ColorInput label="Колір тіні" value={shadow.value.color} onValueChange={color=>setShadow({...shadow,value:{...shadow.value,color}})}/>{([['opacity','Непрозорість тіні, %',0,100],['x','Зміщення X',-300,300],['y','Зміщення Y',-300,300],['blur','Розмиття',0,300],['spread','Поширення',-200,200]] as const).map(([key,label,min,max])=><ShapeNumber key={key} label={label} min={min} max={max} value={shadow.value[key]} onChange={n=>setShadow({...shadow,value:{...shadow.value,[key]:n}})}/>)}</div>:null}
  </Dialog>
 </div>;
}
