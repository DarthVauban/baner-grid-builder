'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {Check,Plus,Trash2} from 'lucide-react';
import {Button,IconButton} from './components';
import {canonicalPresetPaint,PAINT_PRESET_LIMIT} from '@zero/paint-presets.mjs';

export type PaintPreset={id:string;paint:string};
export type PaintLibraryAdapter={list:()=>Promise<PaintPreset[]>;save:(paint:string)=>Promise<PaintPreset>;remove:(id:string)=>Promise<void>};
type Library={presets:PaintPreset[];loading:boolean;pending:boolean;error:string;refresh:()=>void;save:(paint:string)=>void;remove:(id:string)=>void};
const Context=createContext<Library|null>(null);
export function PaintLibraryProvider({adapter,children}:{adapter:PaintLibraryAdapter;children:ReactNode}){
 const [presets,setPresets]=useState<PaintPreset[]>([]),[loading,setLoading]=useState(true),[pending,setPending]=useState(false),[error,setError]=useState('');
 const epoch=useRef(0),locked=useRef(false),reading=useRef(false);
 const invalidate=useCallback(()=>{epoch.current++;},[]);
 const refresh=useCallback(()=>{
  if(locked.current||reading.current)return;
  reading.current=true;const version=epoch.current;setLoading(true);
  void adapter.list().then(items=>{if(version===epoch.current){setPresets(items.filter(item=>canonicalPresetPaint(item.paint)));setError('');}}).catch(failure=>{if(version===epoch.current){setPresets([]);setError(failure instanceof Error?failure.message:'Не вдалося завантажити зразки.');}}).finally(()=>{if(version===epoch.current){reading.current=false;setLoading(false);}});
 },[adapter]);
 useEffect(()=>{const version=++epoch.current;reading.current=false;locked.current=false;queueMicrotask(()=>{if(epoch.current===version){setPresets([]);setError('');setPending(false);refresh();}});const onFocus=()=>{if(!document.hidden)refresh();};window.addEventListener('focus',onFocus);window.addEventListener('online',onFocus);document.addEventListener('visibilitychange',onFocus);return()=>{invalidate();window.removeEventListener('focus',onFocus);window.removeEventListener('online',onFocus);document.removeEventListener('visibilitychange',onFocus);};},[refresh,invalidate]);
 function mutate(action:()=>Promise<PaintPreset|void>,removeId?:string){
  if(locked.current||reading.current||loading)return;locked.current=true;setPending(true);setError('');const version=++epoch.current;
  void action().then(preset=>{if(version===epoch.current)setPresets(old=>removeId?old.filter(item=>item.id!==removeId):preset?[...old.filter(item=>item.id!==preset.id&&item.paint!==preset.paint),preset]:old);}).catch(failure=>{if(version===epoch.current){setPresets([]);setError(failure instanceof Error?failure.message:'Дію не завершено. Спробуйте ще раз.');}}).finally(()=>{if(version===epoch.current){locked.current=false;setPending(false);}});
 }
 return <Context.Provider value={{presets,loading,pending,error,refresh,save:paint=>mutate(()=>adapter.save(paint)),remove:id=>mutate(()=>adapter.remove(id),id)}}>{children}</Context.Provider>;
}

export function SavedPaintSwatches({value,onApply,disabled=false,invalid=false,solidOnly=false}:{value:string;onApply:(paint:string)=>void;disabled?:boolean;invalid?:boolean;solidOnly?:boolean}){
 const library=useContext(Context),canonical=canonicalPresetPaint(value),selected=library?.presets.find(item=>item.paint===canonical);
 const samples=library?.presets.filter(item=>!solidOnly||item.paint.startsWith('#'))||[];
 const unavailable=disabled||!library||library.loading||library.pending||!!library.error;
 const full=(library?.presets.length||0)>=PAINT_PRESET_LIMIT;
 const addLabel=selected?'Цей зразок уже збережено':full?'Бібліотека заповнена: видаліть зайвий зразок':'Зберегти поточний колір або градієнт';
 const status=library?.loading?'Завантаження зразків…':library?.pending?'Збереження змін…':selected?'Поточна заливка вже у ваших зразках.':full?`Збережено ${PAINT_PRESET_LIMIT} зразків. Видаліть зайвий, щоб додати новий.`:!library?'Збереження зразків недоступне в цьому прикладі.':'Натисніть +, щоб зберегти поточну заливку.';
 return <section className="ui-paint-library" aria-label="Мої зразки">
  <div className="ui-paint-stops-heading"><span className="ui-label">Мої зразки</span><IconButton size="sm" variant="ghost" label="Видалити збережений зразок" icon={<Trash2 size={15}/>} disabled={unavailable||!selected} onClick={()=>{if(selected)library?.remove(selected.id);}}/></div>
  <div className="ui-color-palette" role="group" aria-label="Збережені кольори та градієнти" aria-busy={library?.loading||library?.pending}>
   {samples.map((item,index)=><button key={item.id} type="button" className="ui-color-palette-button" aria-label={`Застосувати зразок ${index+1}: ${item.paint}`} title={item.paint} aria-pressed={item.paint===canonical} disabled={unavailable} onClick={()=>{if(item.paint!==canonical)onApply(item.paint);}}><span className="ui-color-swatch"><span style={{background:item.paint}}/></span>{item.paint===canonical?<span className="ui-paint-saved-check"><Check size={12} aria-hidden="true"/></span>:null}</button>)}
   <button type="button" className="ui-color-palette-button ui-paint-save" data-save-paint="" aria-label={addLabel} title={addLabel} disabled={unavailable||invalid||!canonical||!!selected||full} onClick={()=>{if(canonical)library?.save(canonical);}}><span className="ui-color-swatch"><Plus size={16} aria-hidden="true"/></span></button>
  </div>
  {library?.error?<div className="ui-paint-library-error"><p className="ui-field-description ui-text-danger" role="alert">{library.error}</p><Button size="sm" variant="secondary" disabled={library.pending||library.loading} onClick={library.refresh}>Оновити зразки</Button></div>:<p className="ui-field-description" role="status" aria-label="Стан бібліотеки зразків">{status}</p>}
 </section>;
}
