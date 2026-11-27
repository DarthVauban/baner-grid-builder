'use client';
import {createElement,useRef,useState} from 'react';
import {ImageIcon,Smile,X} from 'lucide-react';
import {Button,Dialog,Field,IconButton,SearchInput,TextInput} from './components';
import {EditorSegments} from './editor-controls';
import {FileInput} from './file-input';
import {ZERO_ICON_GLYPHS,ZERO_ICON_VECTORS,ZERO_ICON_LABELS} from '@zero/zero-form.mjs';
import {parseSvgIcon,validateSvgIcon} from '@zero/svg-icon.mjs';
import type {SvgIcon,SvgIconNode} from '@zero/svg-icon-types';
import './button-icon-picker.css';

export type ButtonIconValue={kind:'none'|'glyph'|'icon'|'emoji'|'image'|'svg';glyph:string;emoji:string;resourceId:string;svg?:SvgIcon};
const svgProps=(attrs:Record<string,string>)=>Object.fromEntries(Object.entries(attrs).map(([key,value])=>[key.replace(/-([a-z])/g,(_,letter:string)=>letter.toUpperCase()),value]));
function svgNodes(nodes:SvgIconNode[]):React.ReactNode[]{return nodes.map((node,index)=>createElement(node.tag,{...svgProps(node.attrs),key:index},node.children?svgNodes(node.children):undefined));}
export function ButtonIconPreview({value}:{value:ButtonIconValue}){
  let validSvg=false;if(value.kind==='svg'&&value.svg){try{validateSvgIcon(value.svg);validSvg=true;}catch{validSvg=false;}}
  if(validSvg&&value.svg)return <svg {...svgProps(value.svg.attrs)} aria-hidden="true" viewBox={value.svg.viewBox.join(' ')} width={20} height={20}>{svgNodes(value.svg.children)}</svg>;
  // Local authenticated media UUID, no remote optimization or arbitrary URL.
  if(value.kind==='image'&&value.resourceId)return <img src={`/api/public/popup-banners/zero-block/media/${encodeURIComponent(value.resourceId)}`} alt="" width={20} height={20}/>;
  if(value.kind==='emoji')return <span aria-hidden="true">{value.emoji}</span>;
  const paths=(ZERO_ICON_VECTORS as Record<string,string[]>)[value.glyph];
  if(value.kind==='icon'&&paths)return <svg aria-hidden="true" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{paths.map((d,index)=><path key={index} d={d}/>)}</svg>;
  if(value.kind==='glyph')return <span aria-hidden="true">{(ZERO_ICON_GLYPHS as Record<string,string>)[value.glyph]||'→'}</span>;
  return <ImageIcon size={20} aria-hidden="true"/>;
}
type Props={label:string;value:ButtonIconValue;onChange:(value:ButtonIconValue,expected?:boolean)=>string|void;onUpload?:(file:File)=>Promise<string>;disabled?:boolean;onBusyChange?:(busy:boolean)=>void;allowSvg?:boolean};
export function ButtonIconPicker({label,value,onChange,onUpload,disabled,onBusyChange,allowSvg=false}:Props){
  const [open,setOpen]=useState(false),[tab,setTab]=useState('glyph'),[query,setQuery]=useState(''),[emoji,setEmoji]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),trigger=useRef<HTMLButtonElement>(null);
  function close(){setOpen(false);requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}));}
  function choose(next:ButtonIconValue){const failure=onChange(next);if(failure)setError(failure);else close();}
  async function upload(file:File|null){if(!file)return;setBusy(true);onBusyChange?.(true);setError('');try{let next:ButtonIconValue;if(allowSvg&&(file.type==='image/svg+xml'||/\.svg$/i.test(file.name))){if(file.size>32768)throw new Error('SVG — до 32 КіБ.');next={...value,kind:'svg',svg:parseSvgIcon(await file.text()) as SvgIcon};}else{if(!onUpload)throw new Error('Завантаження зображень недоступне в цій демонстрації.');next={...value,kind:'image',resourceId:await onUpload(file)};}const failure=onChange(next,true);if(failure)setError(failure);else{setOpen(false);requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}));}}catch(failure){setError(failure instanceof Error?failure.message:'Не вдалося завантажити іконку');}finally{setBusy(false);onBusyChange?.(false);}}
  const catalogue=tab==='icon'?Object.keys(ZERO_ICON_VECTORS):Object.keys(ZERO_ICON_GLYPHS),labels=ZERO_ICON_LABELS as Record<string,string>;
  const shown=catalogue.filter(key=>`${labels[key]} ${key}`.toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk')));
  return <div className="ui-button-icon-picker"><span className="ui-button-icon-label">{label}</span><Button ref={trigger} variant="secondary" size="sm" disabled={disabled} icon={<ButtonIconPreview value={value}/>} onClick={()=>{setTab(value.kind==='none'?'glyph':value.kind==='svg'?'image':value.kind);setQuery('');setEmoji(value.emoji);setError('');setOpen(true);}}>{value.kind==='none'?'Вибрати іконку':value.kind==='emoji'?value.emoji:value.kind==='svg'?'Власний SVG':value.kind==='image'?'Власне зображення':labels[value.glyph]||'Іконка'}</Button>{open?<Dialog open title={label} size="wide" onOpenChange={next=>{if(!next)close();}} footer={<><Button variant="secondary" onClick={close}>Закрити</Button><Button variant="ghost" disabled={busy} icon={<X size={16}/>} onClick={()=>choose({...value,kind:'none'})}>Без іконки</Button></>}>
    <div className="ui-button-icon-content" aria-busy={busy}><EditorSegments label="Каталог іконок" surface="light" value={tab} onValueChange={value=>setTab(value)} items={[{value:'glyph',label:'Стрілки'},{value:'icon',label:'Іконки'},{value:'emoji',label:'Emoji'},{value:'image',label:'Файл'}]}/>
      {tab==='glyph'||tab==='icon'?<><SearchInput aria-label="Пошук іконки" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Назва іконки"/><div className="ui-button-icon-options" role="group" aria-label={tab==='glyph'?'Стрілки й символи':'Бібліотека іконок'}>{shown.map(glyph=><IconButton key={glyph} label={labels[glyph]} icon={<ButtonIconPreview value={{...value,kind:tab as 'glyph'|'icon',glyph}}/>} variant={value.kind===tab&&value.glyph===glyph?'primary':'secondary'} aria-pressed={value.kind===tab&&value.glyph===glyph} disabled={busy} onClick={()=>choose({...value,kind:tab as 'glyph'|'icon',glyph})}/>)}</div>{!shown.length?<p>Іконок не знайдено.</p>:null}</>:null}
      {tab==='emoji'?<><div className="ui-button-icon-options" role="group" aria-label="Emoji">{['🎁','🛒','✉️','☎️','❤️','✅','👍','📩','🚀','🔥','💬','👤','⭐','➡️','📞','✨'].map(emoji=><IconButton key={emoji} label={`Emoji ${emoji}`} icon={<span aria-hidden="true">{emoji}</span>} variant={value.kind==='emoji'&&value.emoji===emoji?'primary':'secondary'} aria-pressed={value.kind==='emoji'&&value.emoji===emoji} disabled={busy} onClick={()=>choose({...value,kind:'emoji',emoji})}/>)}</div><Field label="Власний emoji"><TextInput value={emoji} maxLength={32} onChange={event=>setEmoji(event.target.value)} disabled={busy}/></Field><Button size="sm" icon={<Smile size={16}/>} disabled={busy||!emoji.trim()} onClick={()=>choose({...value,kind:'emoji',emoji:emoji.trim()})}>Вибрати emoji</Button></>:null}
      {tab==='image'?<FileInput label="Зображення іконки" value={null} accept={allowSvg?onUpload?'image/svg+xml,image/png,image/jpeg,image/webp':'image/svg+xml':'image/png,image/jpeg,image/webp'} maxSizeBytes={5*1024*1024} disabled={busy||!onUpload&&!allowSvg} hint={allowSvg?`Простий SVG до 32 КіБ без стилів і зовнішніх ресурсів.${onUpload?' PNG, JPEG або WebP до 5 МіБ.':' У демо доступний SVG; зображення завантажуються в конструкторі.'}`:onUpload?'PNG, JPEG або WebP до 5 МіБ.':'Завантаження недоступне в цій демонстрації.'} onFileChange={file=>void upload(file)}/>:null}
      {busy?<p role="status">Завантажуємо іконку…</p>:null}{error?<p className="ui-button-icon-error" role="alert">{error}</p>:null}
    </div>
  </Dialog>:null}</div>;
}
